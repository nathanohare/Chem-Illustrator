// One command for the speed numbers a review starts from: `npm run bench:baseline`.
// Builds the web version, starts `vite preview`, runs the Chromium timings (launch, big drawing,
// the 2,000-structure stress drawing) and the Node timings (bench/core.bench.ts), and writes them
// all to bench/results/<date>-<commit>.json. With a file name after it
// (`npm run bench:baseline -- bench/results/older.json`) it also prints what changed since then.
// SKIP_BUILD=1 uses the dist/ already there. Set CHROMIUM_PATH if Playwright's own Chromium is missing.
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const port = 4173;
const run = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 << 20 });
const lastJson = (out) => JSON.parse(out.trim().split('\n').filter((l) => l.trim().startsWith('{') || /^\S+ \{/.test(l)).pop().replace(/^\S+ (?=\{)/, ''));

if (!process.env.SKIP_BUILD) { console.log('building…'); run('npm', ['run', 'build']); }
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-server.pid); } catch { /* already gone */ } };
process.on('exit', stop);
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch { /* not up yet */ }
  await new Promise((ok) => setTimeout(ok, 200));
}

const commit = run('git', ['rev-parse', '--short', 'HEAD']).trim();
const result = { commit, date: new Date().toISOString(), node: process.version, browser: {}, core: {} };
const env = { APP_URL: `http://localhost:${port}/` };
for (const [name, script, extra] of [['launch', 'bench/launch.mjs', { RUNS: '3' }], ['big', 'bench/big.mjs', {}], ['stress', 'bench/perf.mjs', {}]]) {
  console.log(`browser: ${name}…`);
  try { result.browser[name] = lastJson(run('node', name === 'stress' ? [script, 'stress'] : [script], { ...env, ...extra })); }
  catch (e) { result.browser[name] = { error: String(e.message).slice(0, 500) }; }
}
stop();

console.log('node: bench/core.bench.ts…');
const coreFile = path.join(root, 'bench/results/.core.json');
fs.mkdirSync(path.dirname(coreFile), { recursive: true });
try {
  run('npx', ['vitest', 'bench', '--run', 'bench/core.bench.ts', '--outputJson', coreFile]);
  for (const f of JSON.parse(fs.readFileSync(coreFile, 'utf8')).files)
    for (const g of f.groups) for (const b of g.benchmarks) result.core[`${g.fullName.split(' > ').pop()} / ${b.name}`] = +b.mean.toFixed(2);
} catch (e) { result.core.error = String(e.message).slice(0, 500); }
fs.rmSync(coreFile, { force: true });

const out = path.join(root, `bench/results/${result.date.slice(0, 10)}-${commit}.json`);
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(`wrote ${path.relative(root, out)}`);

// what changed since an older run: every number, side by side
const flat = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? flat(v, `${pre}${k}.`) : [[`${pre}${k}`, Array.isArray(v) ? v[0] : v]]));
const older = process.argv[2];
if (older) {
  const was = Object.fromEntries(flat(JSON.parse(fs.readFileSync(older, 'utf8'))));
  console.log(`\n${'measure'.padEnd(64)} ${'before'.padStart(10)} ${'now'.padStart(10)}  change`);
  for (const [k, v] of flat(result)) {
    if (typeof v !== 'number' || typeof was[k] !== 'number' || k.includes('runs')) continue;
    const pct = was[k] ? ((v - was[k]) / was[k]) * 100 : 0;
    console.log(`${k.padEnd(64)} ${String(was[k]).padStart(10)} ${String(v).padStart(10)}  ${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`);
  }
} else console.log(JSON.stringify(result, null, 2));
