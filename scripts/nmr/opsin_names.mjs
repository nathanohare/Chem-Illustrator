// Names to structures with the app's own OPSIN build (src/vendor/opsin).
// Usage: node scripts/nmr/opsin_names.mjs names.json out.json
// names.json is a JSON list of strings; out.json is a list of {ok, smiles|message}.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { load, parse } = await import(path.join(root, 'src/vendor/opsin/opsin.js'));
const data = zlib.gunzipSync(fs.readFileSync(path.join(root, 'public/opsin/opsin-data.dat')));
const err = load(new Int8Array(data.buffer, data.byteOffset, data.length));
if (err) { console.error(err); process.exit(1); }
const names = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = names.map((n) => {
  if (!n) return { ok: false, message: 'no name' };
  try {
    const r = JSON.parse(parse(n));
    return r.smiles ? { ok: true, smiles: r.smiles } : { ok: false, message: r.message || 'no smiles' };
  } catch (e) {
    return { ok: false, message: String(e).slice(0, 200) };
  }
});
fs.writeFileSync(process.argv[3], JSON.stringify(out));
