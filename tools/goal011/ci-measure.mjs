// Temporary diagnostic-branch helper; never merged into production.
import { execFileSync } from 'node:child_process';
import { readFileSync, copyFileSync, symlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const baseline = '6959d6746cdd0eea560b705fedac4c7925163dcb';
const directory = join(mkdtempSync(join(tmpdir(), 'cc-goal011-')), 'baseline');
const root = process.cwd();
execFileSync('git',['fetch','origin',baseline,'--depth=1'],{stdio:'inherit'});
execFileSync('git',['worktree','add','--detach',directory,baseline],{stdio:'inherit'});
symlinkSync(join(root,'node_modules'),join(directory,'node_modules'),'dir');
copyFileSync('tests/goal011-measurement.test.ts',join(directory,'tests/goal011-measurement.test.ts'));
execFileSync(process.execPath,['node_modules/vitest/vitest.mjs','run','--root',directory,
  'tests/goal011-measurement.test.ts','tests/performance.test.ts'],{
  stdio:'inherit',env:{...process.env,CC_ACCESSIBILITY_OUTPUT:'/tmp/cc-goal011-baseline.json',
    CC_PERF_OUTPUT:'/tmp/cc-goal011-perf-baseline.json'}
});
for(const [label,path] of [
 ['GOAL011_BASELINE_CI','/tmp/cc-goal011-baseline.json'],
 ['GOAL011_REVISED_CI','/tmp/cc-goal011-revised.json'],
 ['GOAL011_PERF_BASELINE_CI','/tmp/cc-goal011-perf-baseline.json'],
 ['GOAL011_PERF_REVISED_CI','/tmp/cc-goal011-perf-revised.json']
]) console.log(label,JSON.stringify(JSON.parse(readFileSync(path,'utf8'))));
