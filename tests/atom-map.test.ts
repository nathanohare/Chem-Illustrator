// @vitest-environment jsdom
import { beforeAll, describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
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

  it('saves the map as ChemDraw\'s own atom map on the step, and reads ChemDraw\'s map', arial(() => {
    const doc = load('O6C cyclisation');
    const m = mapAtoms(doc, new Renderer(noCanvas, noCanvas));
    doc.edit('Map', () => { applyAtomMap(doc, m, { numbers: true, colours: false, bonds: false }); });
    const x = new DOMParser().parseFromString(writeCdxml(doc).replace(/<!DOCTYPE[^>]*>/i, ''), 'application/xml');
    const st = x.getElementsByTagName('step')[0];
    const pairs = (st.getAttribute('ReactionStepAtomMap') ?? '').trim().split(/\s+/);
    // a pair for each mapped reactant atom (unmatched atoms have none)
    expect(pairs.length / 2).toBe(20);
    expect(st.getAttribute('ReactionStepAtomMapManual')).toBe(st.getAttribute('ReactionStepAtomMap'));
    // a file mapped in ChemDraw (no numbers of ours): read from the step
    for (const t of [...x.getElementsByTagName('objecttag')]) if (t.getAttribute('Name') === 'Chem Illustrator map') t.parentNode!.removeChild(t);
    const back = readCdxml(new XMLSerializer().serializeToString(x)).doc;
    const mapped = [...back.atoms.values()].filter((a) => a.mapNo);
    expect(mapped.length).toBe(40);
    const byNo = new Map<number, number[]>();
    for (const a of mapped) byNo.set(a.mapNo!, [...(byNo.get(a.mapNo!) ?? []), a.z]);
    for (const zs of byNo.values()) { expect(zs).toHaveLength(2); expect(zs[0]).toBe(zs[1]); }
    // saved again after an edit elsewhere, the step's map is left as ChemDraw wrote it
    const one = [...back.atoms.values()][0];
    back.edit('Move', () => back.moveAtoms(new Set([one.id]), 1, 0));
    const again = new DOMParser().parseFromString(writeCdxml(back).replace(/<!DOCTYPE[^>]*>/i, ''), 'application/xml').getElementsByTagName('step')[0];
    expect(again.getAttribute('ReactionStepAtomMap')).toBe(st.getAttribute('ReactionStepAtomMap'));
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

  // Nate, 2026-11-03: the box look is saved with the drawing, so a figure looks the same on any
  // computer; the program's setting is only the default for drawings with none of their own
  it('saves the box look with the drawing, and keeps it on another computer and through a style change', async () => {
    const { docMapLook, mapLookPrefs, ACS_1996 } = await import('../src/style');
    const { applyStyle } = await import('../src/drawing-styles');
    const before = { look: mapLookPrefs.look, custom: { ...mapLookPrefs.custom } };
    try {
      const doc = new Doc();
      doc.edit('Draw', () => {
        const a = doc.addAtom(0, 0), b = doc.addAtom(30, 0);
        doc.addBond(a.id, b.id);
        doc.updateAtom(a.id, { mapNo: 1, atomNumber: '1', showNumber: true });
      });
      const box = { fill: '#c0ffee', pattern: 'dots' as const, patternColor: '#112233', border: '#445566', borderWidth: 1.2, text: '#778899', bold: true, shadow: true, rounded: false };
      doc.edit('Map Number Format', () => doc.setStyle({ ...doc.style, mapLook: 'custom', mapBox: box }));
      const xml = writeCdxml(doc);
      // another computer, whose own default is the gray outline
      mapLookPrefs.look = 'grey';
      mapLookPrefs.custom = { ...before.custom };
      const back = readCdxml(xml).doc;
      expect(docMapLook(back.style)).toEqual({ look: 'custom', custom: box });
      back.edit('Drawing style', () => applyStyle(back, { ...ACS_1996 }, 'restyle'));
      expect(docMapLook(back.style)).toEqual({ look: 'custom', custom: box });
      // a drawing with map numbers saves the look it shows (here the default), so it is fixed from then on
      const plain = readCdxml(writeCdxml(new Doc())).doc;
      expect(plain.style.mapLook).toBeUndefined();
      const d2 = readCdxml(xml.replace(/<objecttag[^>]*Chem Illustrator map numbers[^>]*\/>/, '')).doc;
      expect(d2.style.mapLook).toBeUndefined();
      expect(docMapLook(d2.style).look).toBe('grey');
      mapLookPrefs.look = 'tint';
      expect(readCdxml(writeCdxml(d2)).doc.style.mapLook).toBe('tint');
    } finally {
      mapLookPrefs.look = before.look;
      mapLookPrefs.custom = before.custom;
    }
  });
});

// Review 2026-11-03: a starting material that falls apart into several products was mapped onto
// one of them only (the rest left without numbers, bonds made and broken miscounted), and a big
// step froze the program for seconds (7 s for 120 atoms each side, 22 s for 390 atoms).
describe('mapping steps that split up, and big steps', () => {
  let RDKit: { get_mol(s: string): { set_new_coords(): void; get_molblock(): string; delete(): void } };
  beforeAll(async () => { RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')(); });
  /** Starting materials, an arrow and the products in a row, joined by + signs, laid out by RDKit. */
  const reaction = (starting: string[], products: string[]) => {
    const doc = new Doc();
    const bl = doc.style.bondLength;
    const ids = { r: [] as number[][], p: [] as number[][] };
    doc.edit('Draw', () => {
      let x = 0;
      const put = (smiles: string, i: number) => {
        if (i) doc.addCaption({ x: x - bl * 1.1, y: 4, runs: [{ text: '+' }], justify: 'left' });
        const m = RDKit.get_mol(smiles);
        m.set_new_coords();
        const got = addMolfile(doc, m.get_molblock(), 0, 0);
        m.delete();
        const xs = got.map((id) => doc.atoms.get(id)!.x), ys = got.map((id) => doc.atoms.get(id)!.y);
        doc.moveAtoms(got, x - Math.min(...xs), -(Math.min(...ys) + Math.max(...ys)) / 2);
        x += Math.max(...xs) - Math.min(...xs) + bl * 2;
        return got;
      };
      starting.forEach((s, i) => ids.r.push(put(s, i)));
      const lw = doc.style.lineWidth;
      doc.addArrow({ tail: { x, y: 0 }, head: { x: x + bl * 4, y: 0 }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: lw * 10, headWidth: lw * 2.5 });
      x += bl * 5.5;
      products.forEach((s, i) => ids.p.push(put(s, i)));
    });
    return { doc, ids };
  };

  it('maps every product of a Boc removal, an ester hydrolysis and a retro-Diels–Alder', arial(() => {
    for (const [starting, products, made, broken] of [
      [['CC(C)(C)OC(=O)NCc1ccccc1'], ['NCc1ccccc1', 'O=C=O', 'C=C(C)C'], 0, 2],
      [['CC(=O)OC1CCC(OC(C)=O)CC1', 'O'], ['OC1CCC(OC(C)=O)CC1', 'CC(=O)O'], 1, 1],
      [['C1=CCCCC1'], ['C=CC=C', 'C=C'], 0, 2],
    ] as [string[], string[], number, number][]) {
      const { doc, ids } = reaction(starting, products);
      const m = mapAtoms(doc, new Renderer(noCanvas, noCanvas));
      expect(m.unmatched, products.join(' + ')).toBe(0);
      for (const p of ids.p) for (const id of p) expect(m.numbers.has(id)).toBe(true);
      expect([m.made.length, m.broken.length], products.join(' + ')).toEqual([made, broken]);
    }
    // the acetate's carbonyl oxygen goes with the acetic acid, the water's oxygen too (acyl–O cleavage)
    const { doc, ids } = reaction(['CC(=O)OC1CCC(OC(C)=O)CC1', 'O'], ['OC1CCC(OC(C)=O)CC1', 'CC(=O)O']);
    const m = mapAtoms(doc, new Renderer(noCanvas, noCanvas));
    const water = m.numbers.get(ids.r[1][0]);
    expect(ids.p[1].map((id) => m.numbers.get(id))).toContain(water);
  }));

  it('maps a big step in well under a second', arial(() => {
    const { doc } = reaction(['C'.repeat(60), 'C'.repeat(60)], ['C'.repeat(120)]);
    const t0 = performance.now();
    const m = mapAtoms(doc, new Renderer(noCanvas, noCanvas));
    expect(performance.now() - t0).toBeLessThan(1000);
    expect([m.unmatched, m.made.length, m.broken.length]).toEqual([0, 1, 0]);
    const ring = 'c1ccc(cc1)'.repeat(16);
    const big = reaction([ring + 'C', ring + 'Br'], [ring + 'C' + ring]);
    const t1 = performance.now();
    const n = mapAtoms(big.doc, new Renderer(noCanvas, noCanvas));
    expect(performance.now() - t1).toBeLessThan(2500);
    expect(n.unmatched).toBe(0);
  }), 30000);
});
