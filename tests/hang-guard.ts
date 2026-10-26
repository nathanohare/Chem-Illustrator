// Run a reader in a worker thread with a time limit, so a reader that never finishes fails its
// test instead of hanging the test run.
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Bundle `entry` (a path under src/), call its export `fn` on `bytes` in a worker, and say how
 * it ended within `ms` milliseconds: 'done', 'threw: …' or 'still running'.
 */
export async function runWithin(entry: string, fn: string, bytes: Uint8Array, ms: number): Promise<string> {
  const out = await build({ entryPoints: [`${ROOT}/${entry}`], bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'silent' });
  const lib = out.outputFiles[0].text;
  const code = `const { parentPort, workerData } = require('node:worker_threads');
const module = { exports: {} }; const exports = module.exports;
(function (module, exports) { ${lib} })(module, exports);
try { module.exports[${JSON.stringify(fn)}](workerData); parentPort.postMessage('done'); }
catch (e) { parentPort.postMessage('threw: ' + (e && e.message)); }`;
  const w = new Worker(code, { eval: true, workerData: bytes, resourceLimits: { maxOldGenerationSizeMb: 512 } });
  return new Promise((resolve) => {
    const timer = setTimeout(() => { void w.terminate(); resolve('still running'); }, ms);
    w.on('message', (m) => { clearTimeout(timer); void w.terminate(); resolve(String(m)); });
    w.on('error', (e) => { clearTimeout(timer); resolve('threw: ' + e.message); });
  });
}
