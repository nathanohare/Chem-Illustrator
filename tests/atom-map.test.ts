// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readCdxml } from '../src/io/cdxml';
import { writeCdxml } from '../src/io/cdxml-write';
import { Renderer, withMeasure } from '../src/render/renderer';
import { arialWidth } from '../src/text-metrics';
import { mapAtoms, applyAtomMap, clearAtomMap, mapColour, MADE_COLOUR, BROKEN_COLOUR } from '../src/morph/atom-map';
import { toMolfile, addMolfile } from '../src/chem/molfile';
import { Doc } from '../src/model';
import { readMapping } from '../src/morph/numbers';

const noCanvas = { getContext: () => null } as unknown as HTMLCanvasElement;
const arial = (fn: () => void) => () => withMeasure((t, s) => arialWidth(t, s), fn);
const load = (stem: string) => readCdxml(readFileSync(`tests/morph/${stem}.cdxml`, 'utf8')).doc;

describe('atom mapping', () => {
  it('maps a step the way the animation pairs it', arial(() => {
    const doc = load('O6C cyclisation');
    const m = mapAtoms(doc, new Renderer(noCanvas, noCanvas));
    expect(m.steps).toBe(1);
    // cdxmorph's automatic pairing gets 18 of 21, pairing some atoms with atoms of another
    // element; kept to the same element and grown along the bonds, the map pairs 20, as the
    // pairing chosen by hand does (it differs only in two neighbouring carbons)
    expect(Math.max(...m.numbers.values())).toBe(21);
    expect([m.numbers.size, m.unmatched]).toEqual([21 + 20, 2]);
    const zOf = new Map<number, Set<number>>();
    for (const [id, n] of m.numbers) zOf.set(n, new Set([...(zOf.get(n) ?? []), doc.atoms.get(id)!.z]));
    for (const zs of zOf.values()) expect(zs.size).toBe(1);
  }));

  it('uses the pairs chosen by hand in Animate Reaction', arial(() => {
    const doc = load('O6C cyclisation');
    const [morph] = readMapping(doc, readFileSync('tests/morph/O6C cyclisation.mapping.json', 'utf8'), 1);
    const arrow = [...doc.arrows.keys()][0];
    doc.edit('Pairs', () => doc.updateArrow(arrow, { morph }));
    const m = mapAtoms(doc, new Renderer(noCanvas, noCanvas), { arrow });
    // cdxmorph check with the saved mapping: 20 paired, 1 broken, 4 made
    expect(m.numbers.size).toBe(21 + 20);
    expect(m.broken.length).toBe(1);
    expect(m.made.length).toBe(4);
    expect(m.unmatched).toBe(2);
  }));

  it('keeps numbers through a scheme of several steps', arial(() => {
    const doc = load('siccanin sequence');
    const m = mapAtoms(doc, new Renderer(noCanvas, noCanvas));
    expect(m.steps).toBeGreaterThan(1);
    // every number is used once per structure at most
    const perFrag = new Map<string, Set<number>>();
    for (const [id, n] of m.numbers) {
      const key = [...doc.fragmentOf(id)].sort((a, b) => a - b).join(',');
      const s = perFrag.get(key) ?? new Set();
      expect(s.has(n)).toBe(false);
      s.add(n);
      perFrag.set(key, s);
    }
  }));

  it('shows the map as numbers, colours and bond marks, and clears only its own', arial(() => {
    const doc = load('O6C cyclisation');
    const m = mapAtoms(doc, new Renderer(noCanvas, noCanvas));
    const [first, n] = [...m.numbers][0];
    // an atom number typed by hand stays
    const other = [...m.numbers.keys()][1];
    doc.edit('Number', () => doc.updateAtom(other, { atomNumber: '7a', showNumber: true }));
    let kept = { keptNumbers: 0, keptColours: 0 };
    doc.edit('Map', () => { kept = applyAtomMap(doc, m, { numbers: true, colours: true, bonds: true }); });
    expect(kept.keptNumbers).toBe(1);
    const a = doc.atoms.get(first)!;
    expect(a.mapNo).toBe(n);
    expect(a.atomNumber).toBe(String(n));
    expect(a.highlight).toBe(mapColour(n));
    expect(doc.bonds.get(m.made[0])!.highlight).toBe(MADE_COLOUR);
    expect(doc.bonds.get(m.broken[0])!.highlight).toBe(BROKEN_COLOUR);
    // saved and opened again
    const back = readCdxml(writeCdxml(doc)).doc;
    expect([...back.atoms.values()].filter((x) => x.mapNo).length).toBe(m.numbers.size);
    doc.edit('Clear', () => { clearAtomMap(doc); });
    expect(doc.atoms.get(first)!.mapNo).toBeUndefined();
    expect(doc.atoms.get(first)!.atomNumber).toBeUndefined();
    expect(doc.atoms.get(first)!.highlight).toBeUndefined();
    expect(doc.atoms.get(other)!.atomNumber).toBe('7a');
    expect(doc.bonds.get(m.made[0])!.highlight).toBeUndefined();
  }));

  it('writes and reads map numbers in molfiles', () => {
    const d = new Doc();
    d.edit('Draw', () => {
      const a = d.addAtom(0, 0, 6, { mapNo: 3 });
      const b = d.addAtom(14, 0, 8, { mapNo: 12 });
      d.addBond(a.id, b.id, 1);
    });
    expect(toMolfile(d, d.atoms.keys()).molblock).not.toMatch(/ 3  0  0\n/);
    const mb = toMolfile(d, d.atoms.keys(), '', { maps: true }).molblock;
    const lines = mb.split('\n');
    expect(lines[4].slice(60, 63)).toBe('  3');
    expect(lines[5].slice(60, 63)).toBe(' 12');
    const e = new Doc();
    let ids: number[] = [];
    e.edit('Paste', () => { ids = addMolfile(e, mb, 0, 0); });
    expect(ids.map((id) => e.atoms.get(id)!.mapNo)).toEqual([3, 12]);
    expect(e.atoms.get(ids[1])!.atomNumber).toBe('12');
  });
});

describe('map number boxes', () => {
  it('boxes only a number that is the atom map number, and keeps the box clear of the atom', async () => {
    const { isMapNumber, mapBox, numberBox } = await import('../src/render/atom-marks');
    const { StereoPlacer } = await import('../src/chem/stereo');
    const { parseSettings } = await import('../src/settings');
    const doc = new Doc();
    let id = 0;
    doc.edit('Draw', () => {
      const a = doc.addAtom(0, 0);
      const b = doc.addAtom(30, 0);
      doc.addBond(a.id, b.id);
      doc.updateAtom(a.id, { mapNo: 3, atomNumber: '3', showNumber: true });
      id = a.id;
    });
    const a = doc.atoms.get(id)!;
    expect(isMapNumber(a)).toBe(true);
    expect(isMapNumber({ ...a, atomNumber: '7' })).toBe(false);
    const p = new StereoPlacer(doc, arialWidth).number(a);
    const w = arialWidth('3', p.size);
    const box = mapBox(p, w), inner = numberBox(p, w);
    expect(box.x1).toBeLessThan(inner.x1);
    expect(box.y2).toBeGreaterThan(inner.y2);
    expect(box.x2 < a.x || box.x1 > a.x || box.y2 < a.y || box.y1 > a.y).toBe(true);
    expect(parseSettings(JSON.stringify({ mapLook: 'grey' })).mapLook).toBe('grey');
    expect(parseSettings(JSON.stringify({ mapLook: 'bogus' })).mapLook).toBe('grey');
    // the first version's light peach became the starting custom format
    expect(parseSettings(JSON.stringify({ mapLook: 'peach' })).mapLook).toBe('custom');
    expect(parseSettings('{}').mapBox.fill).toBe('#fbdcc2');
    const own = parseSettings(JSON.stringify({ mapBox: { fill: '', pattern: 'dots', border: 'red', borderWidth: 99, shadow: true } })).mapBox;
    expect(own).toMatchObject({ fill: '', pattern: 'dots', border: '#000000', borderWidth: 5, shadow: true, rounded: true });
  });
});
