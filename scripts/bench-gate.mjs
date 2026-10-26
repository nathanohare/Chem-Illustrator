// The speed check on pull requests: compares two runs of bench/core.bench.ts (the pull request's
// code and the code it would merge into, timed on the same machine, taking turns) and fails when
// any measure got more than 40% slower (two runs of the same code can differ by up to 30%). Each
// measure's fastest run over all the files for a side is compared, which shakes off most of the
// noise of a shared machine; differences under 10 ms are ignored. node scripts/bench-gate.mjs <base.json>[,<base2.json>…] <head.json>[,<head2.json>…]
import fs from 'node:fs';

const LIMIT = 1.4, FLOOR_MS = 10;
const read = (list) => {
  const out = {};
  for (const f of list.split(','))
    for (const file of JSON.parse(fs.readFileSync(f, 'utf8')).files)
      for (const g of file.groups) for (const b of g.benchmarks) {
        const k = `${g.fullName.split(' > ').pop()} / ${b.name}`;
        out[k] = Math.min(out[k] ?? Infinity, b.min);
      }
  return out;
};
const [baseFile, headFile] = process.argv.slice(2);
const base = read(baseFile), head = read(headFile);
let slower = 0;
console.log(`${'measure'.padEnd(72)} ${'before'.padStart(9)} ${'now'.padStart(9)}  change`);
for (const [k, now] of Object.entries(head)) {
  const was = base[k];
  if (was === undefined) { console.log(`${k.padEnd(72)} ${'new'.padStart(9)} ${now.toFixed(1).padStart(9)}`); continue; }
  const bad = now > was * LIMIT && now - was > FLOOR_MS;
  if (bad) slower++;
  const pct = ((now - was) / was) * 100;
  console.log(`${k.padEnd(72)} ${was.toFixed(1).padStart(9)} ${now.toFixed(1).padStart(9)}  ${pct > 0 ? '+' : ''}${pct.toFixed(0)}%${bad ? '  SLOWER' : ''}`);
}
if (slower) {
  console.log(`\n${slower} measure${slower === 1 ? '' : 's'} more than ${Math.round((LIMIT - 1) * 100)}% slower than the base branch. If that is expected, say why in the pull request.`);
  process.exit(1);
}
console.log('\nNo measure got noticeably slower.');
