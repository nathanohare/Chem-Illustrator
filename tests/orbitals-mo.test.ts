import { describe, expect, it } from 'vitest';
import { hund, mixOf, MO_PRESETS, moPlain, parseMarkup, sources, toMarkup, toRich } from '../src/design/mo';
import { orbitalShapes } from '../src/chem/orbitals';
import { Doc } from '../src/model';
import { ACS_1996 } from '../src/style';
import { POINTS } from '../src/editor/arrange';
import { newPlate, putPlate } from '../src/design/plates';

describe('orbitals', () => {
  it('draws a p orbital as two lobes meeting at the atom, one each way', () => {
    const [back, front] = orbitalShapes({ kind: 'p', look: 'shaded', angle: 0, size: 20 }, { x: 100, y: 100 });
    expect(front.geo).toBe('orbLobe');
    // the front lobe above the atom, the back one below (turned half round)
    expect((front.y1 + front.y2) / 2).toBeCloseTo(90);
    expect((back.y1 + back.y2) / 2).toBeCloseTo(110);
    expect(back.rot).toBe(180);
    expect(front.fillColor).not.toBe(back.fillColor);
  });

  it('draws hybrids with a small back lobe, d orbitals with four', () => {
    const sp3 = orbitalShapes({ kind: 'sp3', look: 'colour', angle: 90, size: 20 }, { x: 0, y: 0 });
    expect(sp3[0].x2 - sp3[0].x1).toBeLessThan(sp3[1].x2 - sp3[1].x1);
    expect(orbitalShapes({ kind: 'd', look: 'outline', angle: 0, size: 20 }, { x: 0, y: 0 }).length).toBe(4);
    expect(orbitalShapes({ kind: 'dz2', look: 'shaded', angle: 0, size: 20 }, { x: 0, y: 0 })[0].kind).toBe('oval');
  });
});

describe('MO diagrams', () => {
  it('fills levels by Hund\'s rule', () => {
    expect(hund(3, 4)).toEqual([2, 1, 1]);
    expect(hund(2, 2)).toEqual([1, 1]);
    expect(hund(1, 3)).toEqual([2]);
    expect(hund(2, 0)).toEqual([0, 0]);
  });

  it('presets count their electrons the same on both sides', () => {
    for (const p of MO_PRESETS) {
      const atoms = p.spec.levels.filter((l) => l.column !== 'middle').reduce((n, l) => n + l.electrons, 0);
      const mos = p.spec.levels.filter((l) => l.column === 'middle').reduce((n, l) => n + l.electrons, 0);
      expect(mos, p.id).toBe(atoms);
    }
  });

  it('O2 has two unpaired electrons in π*', () => {
    const o2 = MO_PRESETS.find((p) => p.id === 'o2')!.spec;
    const pistar = o2.levels.find((l) => moPlain(l.label).startsWith('π*'))!;
    expect(hund(pistar.n, pistar.electrons)).toEqual([1, 1]);
  });

  it('joins a molecular orbital to the atomic orbitals it is made from', () => {
    const n2 = MO_PRESETS.find((p) => p.id === 'n2')!.spec;
    const sigma = n2.levels.find((l) => moPlain(l.label) === 'σ2s')!;
    expect(sources(n2.levels, sigma).map((l) => l.column)).toEqual(['left', 'right']);
  });

  it('draws one in a frame that keeps its levels', () => {
    const doc = new Doc();
    doc.style = { ...ACS_1996 };
    let id = 0;
    doc.edit('MO', () => { id = putPlate(doc, POINTS, newPlate('mo', doc.style.bondLength), { x: 0, y: 0 }); });
    const f = doc.shapes.get(id)!;
    expect(f.plate?.kind).toBe('mo');
    // H2: four levels (one line each) and four dashed lines
    const lines = f.frame!.shapes.map((s) => doc.shapes.get(s)!).filter((s) => s.kind === 'line');
    expect(lines.filter((s) => s.dashed).length).toBe(4);
    expect(lines.filter((s) => !s.dashed).length).toBe(4);
  });

  it('keeps names as rich text that reads back the same', () => {
    const parts = [{ text: 'σ' }, { text: '*', sup: true }, { text: '2s', sub: true }, { text: ' a_b^c\\' }];
    expect(parseMarkup(toMarkup(parts))).toEqual(parts);
    expect(parseMarkup('σ^*_{2p}')).toEqual([{ text: 'σ' }, { text: '*', sup: true }, { text: '2p', sub: true }]);
    expect(moPlain('φ_{A}')).toBe('φA');
  });

  it('turns an older diagram into rich text that draws the same', () => {
    const old = { titles: ['N', 'N_2', 'H2O'] as [string, string, string], axis: true, levels: [
      { column: 'left' as const, label: 'φ_A', e: 0, n: 1, electrons: 1 },
      { column: 'middle' as const, label: 'σ_{2s}', e: -1, n: 1, electrons: 2, from: 'φ_A' },
    ] };
    const rich = toRich(old);
    expect(rich.rich).toBe(true);
    expect(parseMarkup(rich.titles[1])).toEqual([{ text: 'N' }, { text: '2', sub: true }]);
    expect(parseMarkup(rich.titles[2])).toEqual([{ text: 'H' }, { text: '2', sub: true }, { text: 'O' }]);
    expect(sources(rich.levels, rich.levels[1]).length).toBe(1);
    // the older form still finds its atomic orbitals
    expect(sources(old.levels, old.levels[1]).length).toBe(1);
  });

  it('works out how each molecular orbital mixes', () => {
    const n2 = MO_PRESETS.find((p) => p.id === 'n2')!.spec;
    const mix = (name: string) => mixOf(n2.levels, n2.levels.find((l) => moPlain(l.label) === name)!);
    expect(mix('σ2s')).toEqual({ ao: 's', sym: 'σ', bonding: true });
    expect(mix('σ*2s')).toEqual({ ao: 's', sym: 'σ', bonding: false });
    expect(mix('π2p')).toEqual({ ao: 'p', sym: 'π', bonding: true });
    expect(mix('σ*2p')).toEqual({ ao: 'p', sym: 'σ', bonding: false });
    // no σ or π in the name: above the atomic orbitals is out of phase
    const blank = MO_PRESETS.find((p) => p.id === 'blank')!.spec;
    expect(blank.levels.filter((l) => l.column === 'middle').map((l) => mixOf(blank.levels, l)?.bonding)).toEqual([true, false]);
  });

  it('draws the mixing pictures and sized electrons when asked', () => {
    const doc = new Doc();
    doc.style = { ...ACS_1996 };
    const plate = newPlate('mo', doc.style.bondLength);
    const plain = new Doc();
    plain.style = { ...ACS_1996 };
    let a = 0, b = 0;
    plain.edit('MO', () => { a = putPlate(plain, POINTS, plate, { x: 0, y: 0 }); });
    doc.edit('MO', () => { b = putPlate(doc, POINTS, { ...plate, mo: { ...plate.mo!, pictures: true, arrowSize: 14 } }, { x: 0, y: 0 }); });
    const shapes = (d: Doc, id: number) => d.shapes.get(id)!.frame!.shapes.length;
    // H2: two s spheres, one merged σ and two spheres for σ*
    expect(shapes(doc, b) - shapes(plain, a)).toBe(5);
    const arrows = doc.shapes.get(b)!.frame!.captions.map((c) => doc.captions.get(c)!).filter((c) => /[↑↓]/.test(c.runs[0].text));
    expect(arrows.every((c) => c.runs[0].size === 14)).toBe(true);
  });
});
