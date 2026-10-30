// Copies the RDKit chemistry engine (JavaScript loader + WebAssembly) from
// node_modules into public/, where the app loads it at run time; ONNX Runtime's small
// loader for the structure reader (its WebAssembly comes with the reader's model pack); and
// OpenChemLib's torsion and force field tables for 3-D models.
// Runs automatically after `npm install` and before `npm run dev` / `npm run build`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(root, 'node_modules', '@rdkit', 'rdkit', 'dist');
const to = path.join(root, 'public');
fs.mkdirSync(to, { recursive: true });
for (const f of ['RDKit_minimal.js', 'RDKit_minimal.wasm']) {
  const src = path.join(from, f), dst = path.join(to, f);
  if (!fs.existsSync(src)) {
    console.error(`copy-rdkit: ${src} is missing. Run "npm install" first.`);
    process.exit(1);
  }
  const a = fs.statSync(src), b = fs.existsSync(dst) ? fs.statSync(dst) : null;
  if (!b || b.size !== a.size || b.mtimeMs < a.mtimeMs) fs.copyFileSync(src, dst);
}
{
  const src = path.join(root, 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd-threaded.mjs'), dst = path.join(to, 'ort-wasm-simd-threaded.mjs');
  if (!fs.existsSync(src)) {
    console.error(`copy-rdkit: ${src} is missing. Run "npm install" first.`);
    process.exit(1);
  }
  const a = fs.statSync(src), b = fs.existsSync(dst) ? fs.statSync(dst) : null;
  if (!b || b.size !== a.size || b.mtimeMs < a.mtimeMs) fs.copyFileSync(src, dst);
}
{
  const src = path.join(root, 'node_modules', 'openchemlib', 'dist', 'resources.json'), dst = path.join(to, 'ocl-resources.json');
  if (!fs.existsSync(src)) {
    console.error(`copy-rdkit: ${src} is missing. Run "npm install" first.`);
    process.exit(1);
  }
  const a = fs.statSync(src), b = fs.existsSync(dst) ? fs.statSync(dst) : null;
  if (!b || b.size !== a.size || b.mtimeMs < a.mtimeMs) fs.copyFileSync(src, dst);
}
