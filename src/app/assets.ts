import type * as pc from 'playcanvas';
import { assetTimings } from '../dev/metrics';
interface Entry {
  path: string;
  refs: number;
  request: Promise<pc.ContainerResource>;
  resource?: pc.ContainerResource;
  asset?: pc.Asset;
}
/** Registry-backed container ownership. Acquiring reserves a reference before
 * awaiting; concurrent users cannot unload each other's in-flight request.
 * Keep small common assets and at most one unused character (warm rematch).
 * Nova is released immediately when unused; never lower its supplied fidelity. */
export class SharedAssets {
  private entries = new Map<string, Entry>();
  private resources = new Map<pc.ContainerResource, Entry>();
  private attempts = new Map<string, number>();
  requests = 0;
  reused = 0;
  constructor(private app: pc.Application) {}
  acquire(path: string): Promise<pc.ContainerResource> {
    let entry = this.entries.get(path);
    if (entry) {
      entry.refs++;
      this.reused++;
      return entry.request;
    }
    entry = { path, refs: 1, request: undefined! };
    this.entries.set(path, entry);
    const current = entry;
    const url = new URL(import.meta.env.BASE_URL + path, document.baseURI);
    url.searchParams.set('v', __KIRA_ASSET_REVISION__);
    const attempt = this.attempts.get(path) ?? 0;
    if (attempt) url.searchParams.set('retry', String(attempt));
    const timing = {
      path,
      status: 'loading' as 'loading' | 'ready' | 'error',
      startMs: performance.now(),
    };
    assetTimings.push(timing);
    // The ledger is diagnostic history, not an unbounded resource owner.
    if (assetTimings.length > 200) assetTimings.splice(0, assetTimings.length - 200);
    this.requests++;
    current.request = new Promise((resolve, reject) => {
      const fail = (error: unknown) => {
        Object.assign(timing, { status: 'error', durationMs: performance.now() - timing.startMs });
        if (this.entries.get(path) === current) this.entries.delete(path);
        this.attempts.set(path, attempt + 1);
        reject(new Error(`${path}: ${String(error)}`));
      };
      const timeout = setTimeout(() => fail('Loading timed out'), 120000);
      this.app.assets.loadFromUrlAndFilename(
        url.href,
        path.split('/').pop()!,
        'container',
        (error, asset) => {
          clearTimeout(timeout);
          if (timing.status === 'error') {
            if (asset) {
              asset.unload();
              this.app.assets.remove(asset);
            }
            return;
          }
          if (error || !asset?.resource) {
            if (asset) {
              asset.unload();
              this.app.assets.remove(asset);
            }
            fail(error ?? 'Empty container');
            return;
          }
          current.asset = asset;
          current.resource = asset.resource as pc.ContainerResource;
          this.resources.set(current.resource, current);
          Object.assign(timing, {
            status: 'ready',
            durationMs: performance.now() - timing.startMs,
          });
          resolve(current.resource);
        },
      );
    });
    return current.request;
  }
  release(resource: pc.ContainerResource) {
    const entry = this.resources.get(resource);
    if (!entry || entry.refs <= 0) return;
    entry.refs--;
    if (!entry.refs && entry.path.includes('/nova/')) this.evict(entry);
    this.trim();
  }
  private trim() {
    const idle = [...this.entries.values()].filter(
      (e) => e.resource && !e.refs && e.path.includes('/characters/'),
    );
    while (idle.length > 1) this.evict(idle.shift()!);
  }
  private evict(entry: Entry) {
    if (entry.refs || !entry.asset || !entry.resource) return;
    this.resources.delete(entry.resource);
    this.entries.delete(entry.path);
    entry.asset.unload();
    this.app.assets.remove(entry.asset);
  }
  snapshot() {
    return {
      requests: this.requests,
      reused: this.reused,
      pending: [...this.entries.values()].filter((e) => !e.resource).length,
      containers: [...this.entries.values()].map((e) => ({
        path: e.path,
        owners: e.refs,
        loaded: !!e.resource,
      })),
    };
  }
}
const managers = new WeakMap<pc.Application, SharedAssets>();
export function sharedAssets(app: pc.Application) {
  let assets = managers.get(app);
  if (!assets) {
    assets = new SharedAssets(app);
    managers.set(app, assets);
  }
  return assets;
}
