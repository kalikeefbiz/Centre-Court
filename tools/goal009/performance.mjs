import { chromium, webkit } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Bounded sequential measurements of the real selected-athlete scene. No asset
// replacement, quality reduction, gameplay hooks or production mutations.
const stage = process.env.CC_STAGE ?? 'candidate';
const baseURL = process.env.CC_URL ?? 'http://127.0.0.1:4173/';
const engine = process.env.CC_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const sampleMs = Math.max(1000, Number(process.env.CC_SAMPLE_MS ?? 8000));
const characters = (process.env.CC_CHARACTERS ?? 'kira,nova').split(',');
const out = resolve(process.env.CC_OUTPUT ?? `public/verification/goal-009/performance/${stage}-${engine}`);
mkdirSync(out, { recursive: true });
const browser = await (engine === 'webkit'
  ? webkit.launch()
  : chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] }));

const output = {
  stage,
  url: baseURL,
  date: new Date().toISOString(),
  browser: `${engine} ${browser.version()}`,
  targetSampleMs: sampleMs,
  viewport: { width: 390, height: 844, deviceScaleFactor: 1 },
  method: 'Fresh browser context per initial selected athlete; same Rico opponent. Menu, close-up, match and moving-player windows run sequentially. First six animation frames after each view change are warmup. Frame timestamps include browser scheduling; no GPU timers.',
  limitations: [
    'Linux headless software rendering is not an iPhone Safari or native GPU benchmark.',
    'No hardware thermal, power, native touch comfort, total CPU memory or driver-resident GPU-memory validation.',
    'PlayCanvas VRAM counters are engine-accounted resource bytes, not driver allocation measurements.',
    'performance.memory, where exposed, is a coarse JS heap estimate, not total process/decoded-image memory.',
    'Loopback asset timings are not mobile network timings; report transfer size separately from runtime allocations.',
    'Single bounded sample per scenario; absolute timings on a shared cloud host may be affected by other work.',
  ],
  results: [],
};

const snapshot = (page) => page.evaluate(() => window.centreCourt.snapshot());
const bounded = async (operation, timeoutMs, description) => {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${description} exceeded ${timeoutMs}ms wall time`)), timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
};
const settle = (page, count = 6) => page.evaluate((count) => new Promise((done) => {
  const step = () => --count <= 0 ? done() : requestAnimationFrame(step);
  requestAnimationFrame(step);
}), count);
const record = async (page, name, duration = sampleMs) => {
  await bounded(settle(page), 30000, `${name} warmup`);
  const frames = await bounded(page.evaluate((duration) => new Promise((done) => {
    const intervals = [], phases = {}, draws = [], evaluations = [];
    let start = 0, previous = 0;
    const frame = (now) => {
      if (!start) start = now;
      if (previous) intervals.push(now - previous);
      previous = now;
      // Read the compact snapshot once per visible frame, matching both stages.
      const s = window.centreCourt.snapshot();
      phases[s.phase] = (phases[s.phase] ?? 0) + 1;
      draws.push(s.drawCalls);
      if (Number.isFinite(s.resources?.animationUpdateMs)) evaluations.push(s.resources.animationUpdateMs);
      if (now - start >= duration) {
        const summarize = (values) => {
          const ordered = [...values].sort((a, b) => a - b);
          const percentile = (q) => ordered[Math.max(0, Math.ceil(ordered.length * q) - 1)] ?? null;
          return {
            samples: values.length,
            mean: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
            median: percentile(.5), p95: percentile(.95), max: ordered.at(-1) ?? null,
          };
        };
        done({ durationMs: now - start, intervalsMs: summarize(intervals), over33Ms: intervals.filter((x) => x > 33.33).length, phases, drawCalls: summarize(draws), animationEvaluationMs: summarize(evaluations) });
      } else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }), duration), duration * 4 + 30000, `${name} frame collection`);
  const s = await snapshot(page);
  const image = `${name}.png`;
  await page.screenshot({ path: resolve(out, image) });
  console.log(stage, engine, name, JSON.stringify({ median: frames.intervalsMs.median, p95: frames.intervalsMs.p95, drawCalls: frames.drawCalls.median, athletePixels: s.presentation.athletePixels, resources: s.resources }));
  return { name, image, ...frames, snapshot: s };
};

let activePage;
try {
  for (const character of characters) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await context.addInitScript((character) => {
      localStorage.setItem('centre-court-circuit-v1', JSON.stringify({ version: 1, player: character, stage: 0, wins: 0, losses: 0, completed: false, results: [] }));
    }, character);
    const page = await context.newPage();
    activePage = page;
    const errors = [], requestedCharacters = [], requestedEquipment = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') console.error('browser console:', message.text());
    });
    page.on('request', (request) => {
      if (request.url().includes('/assets/characters/')) requestedCharacters.push(request.url());
      if (request.url().includes('/assets/equipment/')) requestedEquipment.push(request.url());
    });
    const wallStart = performance.now();
    console.log(stage, engine, character, 'loading selected athlete');
    // GLBs/audio/fonts can keep the load event pending on software-rendered
    // runners. Gate on the actual selected-athlete readiness below instead.
    await page.goto(new URL('?debug', baseURL).href, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction((id) => {
      const s = window.centreCourt?.snapshot();
      return s && s.kira.character === id && (s.kira.status === 'error' || (s.kira.status === 'ready' && !document.querySelector('#play').disabled));
    }, character, { timeout: 180000 });
    const readyState = await snapshot(page);
    if (readyState.kira.status === 'error') throw new Error(`Selected athlete load failed: ${readyState.kira.error}`);
    const readyMs = performance.now() - wallStart;
    console.log(stage, engine, character, 'ready', readyMs);
    const initialRequests = [...requestedCharacters];
    const runtime = await page.evaluate(() => {
      const canvas = document.querySelector('#court');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        userAgent: navigator.userAgent,
        cores: navigator.hardwareConcurrency,
        renderer: gl?.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? null,
        vendor: gl?.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR) ?? null,
        gpuTimerExtension: !!gl?.getExtension('EXT_disjoint_timer_query_webgl2'),
        maxTextureSize: gl?.getParameter(gl.MAX_TEXTURE_SIZE) ?? null,
        antialias: gl?.getContextAttributes()?.antialias ?? null,
        jsHeap: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null,
      };
    });
    const result = { character, readyMs, initialRequests, runtime, scenarios: [], errors };
    result.scenarios.push(await record(page, `${character}-menu`));
    await page.locator('#preview-athlete').click();
    result.scenarios.push(await record(page, `${character}-closeup`));
    await page.locator('#preview-close').click();
    if (await page.locator('#racket-equipment-open').count()) {
      const before = await snapshot(page);
      const characterRequestsBefore = requestedCharacters.length;
      const equipmentRequestsBefore = requestedEquipment.length;
      await page.locator('#racket-equipment-open').click();
      await page.waitForFunction(() => !window.centreCourt.snapshot().equipment.pending);
      result.scenarios.push(await record(page, `${character}-equipment-grip`, Math.min(sampleMs, 4000)));
      const models = await page.locator('[data-racket]').count();
      for (let repetition = 0; repetition < 3; repetition++) {
        await page.locator('[data-racket]').first().click();
        await page.waitForFunction(() => !window.centreCourt.snapshot().equipment.pending);
        await page.locator('#equipment-equip').click();
        await page.waitForFunction(() => !window.centreCourt.snapshot().equipment.pending);
      }
      const after = await snapshot(page);
      result.equipmentReselect = {
        models,
        method: 'Three preview/equip operations on the first available model; with one model this is idempotence/resource-retention coverage, not multiple-variant swapping.',
        newCharacterRequests: requestedCharacters.slice(characterRequestsBefore),
        newEquipmentRequests: requestedEquipment.slice(equipmentRequestsBefore),
        resourcesBefore: before.resources,
        resourcesAfter: after.resources,
        equipment: after.equipment,
      };
      await page.locator('#equipment-close').click();
    }
    await page.selectOption('#opponent', 'rico');
    await page.locator('#practice').click();
    await page.waitForFunction(() => window.centreCourt.snapshot().phase === 'serve', undefined, { timeout: 120000 });
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await page.keyboard.down('Space');
    await page.waitForTimeout(550);
    await page.keyboard.up('Space');
    await page.waitForFunction(() => window.centreCourt.snapshot().contacts > 0, undefined, { timeout: 30000 });
    result.scenarios.push(await record(page, `${character}-match`));
    await page.keyboard.down('KeyA');
    try { result.scenarios.push(await record(page, `${character}-movement`, Math.min(sampleMs, 4000))); }
    finally { await page.keyboard.up('KeyA'); }
    await page.locator('#pause-button').click();
    await page.locator('#menu-pause').click();
    result.menuAfterMatch = await snapshot(page);
    result.resourceTimings = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.includes('/assets/characters/') || r.name.includes('/assets/equipment/')).map((r) => ({ url: r.name, durationMs: r.duration, transferBytes: r.transferSize, encodedBytes: r.encodedBodySize, decodedBytes: r.decodedBodySize })));
    result.requestedCharacters = requestedCharacters;
    result.requestedEquipment = requestedEquipment;
    result.finalJSHeap = await page.evaluate(() => performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null);
    output.results.push(result);
    writeFileSync(resolve(out, 'measurements.json'), JSON.stringify(output, null, 2));
    await context.close();
    activePage = undefined;
  }
} catch (error) {
  output.failure = { message: String(error), snapshot: null, screenshot: null };
  if (activePage) {
    output.failure.snapshot = await bounded(snapshot(activePage), 5000, 'Failure snapshot').catch(() => null);
    await activePage.screenshot({ path: resolve(out, 'failure.png'), timeout: 10000 }).then(() => { output.failure.screenshot = 'failure.png'; }).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
  writeFileSync(resolve(out, 'measurements.json'), JSON.stringify(output, null, 2));
}
if (output.results.some((r) => r.errors.length)) throw new Error('Page errors recorded; inspect measurements.json');
