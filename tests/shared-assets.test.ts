import { it, expect, vi } from 'vitest';
import type * as pc from 'playcanvas';
import { SharedAssets } from '../src/app/assets';
function fixture() {
  vi.stubGlobal('document', { baseURI: 'https://court.test/' });
  const callbacks: ((error: string | null, asset: pc.Asset) => void)[] = [];
  const app = {
    assets: {
      loadFromUrlAndFilename: vi.fn((_u, _f, _t, cb) => callbacks.push(cb)),
      remove: vi.fn(),
    },
  };
  const assets = new SharedAssets(app as unknown as pc.Application);
  const finish = (i: number, error: string | null = null) => {
    const a = { resource: {}, unload: vi.fn() } as unknown as pc.Asset;
    callbacks[i](error, a);
    return a;
  };
  return { assets, app, finish };
}
it('deduplicates concurrent containers, reserves owners, and reuses the registry resource', async () => {
  const { assets, app, finish } = fixture();
  const a = assets.acquire('assets/characters/kira/model.glb'),
    b = assets.acquire('assets/characters/kira/model.glb');
  expect(app.assets.loadFromUrlAndFilename).toHaveBeenCalledOnce();
  const asset = finish(0);
  const r = await a;
  expect(await b).toBe(r);
  assets.release(r);
  expect(asset.unload).not.toHaveBeenCalled();
  assets.release(r);
  const c = await assets.acquire('assets/characters/kira/model.glb');
  expect(c).toBe(r);
  expect(assets.snapshot().containers[0].owners).toBe(1);
  assets.release(c);
});
it('bounds unused characters, releases unused Nova, and never unloads active users', async () => {
  const { assets, finish } = fixture();
  const names = ['kira', 'dante', 'rico', 'nova'];
  const loaded = [];
  for (let i = 0; i < names.length; i++) {
    const p = assets.acquire(`assets/characters/${names[i]}/model.glb`);
    const a = finish(i);
    loaded.push({ a, r: await p });
  }
  for (const { r } of loaded) assets.release(r);
  expect(assets.snapshot().containers.map((e) => e.path)).toEqual([
    'assets/characters/rico/model.glb',
  ]);
  expect(loaded[3].a.unload).toHaveBeenCalledOnce();
});
it('failed requests are removed and can be reacquired; partial acquisition is independently owned', async () => {
  const { assets, finish } = fixture();
  const request = assets.acquire('assets/bad.glb');
  const assertion = expect(request).rejects.toThrow('decode');
  finish(0, 'decode');
  await assertion;
  expect(assets.snapshot().pending).toBe(0);
  const retry = assets.acquire('assets/bad.glb');
  finish(1);
  expect(await retry).toBeDefined();
  vi.unstubAllGlobals();
});
it('a timed-out response cannot unload or satisfy a later retry', async () => {
  vi.useFakeTimers();
  try {
    const { assets, app, finish } = fixture();
    const old = assets.acquire('assets/characters/kira/model.glb');
    const rejected = expect(old).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(120000);
    await rejected;
    const next = assets.acquire('assets/characters/kira/model.glb');
    expect(app.assets.loadFromUrlAndFilename.mock.calls[1][0]).not.toBe(
      app.assets.loadFromUrlAndFilename.mock.calls[0][0],
    );
    const late = finish(0);
    expect(late.unload).toHaveBeenCalledOnce();
    const current = finish(1);
    expect(await next).toBe(current.resource);
    expect(current.unload).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
