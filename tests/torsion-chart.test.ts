// @vitest-environment jsdom
// Torsional energy charts (Newman Projection window ▸ Energy Chart): butane's relaxed scan has
// its minima and maxima where they should be, the chart draws them with projections, names and
// barriers, the data copies as text for a spreadsheet, the chart survives a CDXML file, and the
// window's tab scans, shows and hands back what it settled on.

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { Resources } from 'openchemlib';
import { Doc } from '../src/model';
import { addMolfile, toMolfile } from '../src/chem/molfile';
import { searchModel } from '../src/chem/model3d-build';
import { scanTorsion } from '../src/chem/torsion-scan';
import { extrema, fitProfile } from '../src/chem/torsion-profile';
import { newmanView, norm360, torsion } from '../src/chem/newman';
import { extremumName, idealView, putTorsion, refitTorsion, torsionCsv, torsionFrameOf, type TorsionData } from '../src/design/torsion';
import { NEWMAN_LOOK } from '../src/design/newman';
import { plainMeasure } from '../src/chem/reaction';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import { chartTab, type ChartChoice } from '../src/ui/newman-chart-tab';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
let butane: TorsionData;

beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
  Resources.registerFromNodejs();
  const m = RDKit.get_mol('CCCC');
  const doc = new Doc();
  doc.bulk(() => addMolfile(doc, m.get_molblock(), 200, 200));
  m.delete();
  const ex = toMolfile(doc, doc.atoms.keys());
  const model = searchModel(ex.molblock, { starts: 30, window: 6, rmsd: 0.3 })!;
  const xyz0 = model.conformers[0].xyz;
  const scan = scanTorsion(ex.molblock, xyz0, [0, 1, 2, 3], { step: 15 })!;
  const points = scan.points.map((p) => ({ phi: p.phi, energy: p.energy }));
  const profile = fitProfile(points);
  const view = newmanView(model, xyz0, 1, 2);
  butane = {
    profile, extrema: extrema(profile), front: view.front, back: view.back, phi0: norm360(torsion(xyz0, 0, 1, 2, 3)),
    unit: 'kcal/mol', insets: 'all', names: 'textbook', barriers: true, barrierColor: '#1a56db', digits: 1,
    w: 26 * 14.4, h: 8 * 14.4, method: 'MMFF94s+', look: structuredClone(NEWMAN_LOOK), sawhorse: true, points,
  };
}, 120000);

describe('butane turned about its middle bond', () => {
  it('is lowest anti, with gauche minima near ±60° and the eclipsed maxima between, highest with the methyls together', () => {
    const mins = butane.extrema.filter((e) => e.kind === 'min'), maxs = butane.extrema.filter((e) => e.kind === 'max');
    expect(mins.length).toBe(3);
    expect(maxs.length).toBe(3);
    const at = (phi: number, list: typeof mins) => list.find((e) => Math.abs(((e.phi - phi + 540) % 360) - 180) < 20);
    expect(at(180, mins)!.energy).toBeLessThan(0.05);
    for (const g of [at(60, mins)!, at(300, mins)!]) { expect(g.energy).toBeGreaterThan(0.4); expect(g.energy).toBeLessThan(1.5); }
    const syn = at(0, maxs)!, ecl = at(120, maxs)!;
    expect(syn.energy).toBeGreaterThan(ecl.energy);
    expect(ecl.energy).toBeGreaterThan(2.5);
    expect(extremumName(syn.phi, 'max', 'textbook')).toBe('synperiplanar');
    expect(extremumName(ecl.phi, 'max', 'textbook')).toBe('eclipsed');
    expect(extremumName(65, 'min', 'textbook')).toBe('gauche');
    expect(extremumName(180, 'min', 'textbook')).toBe('antiperiplanar');
    expect(extremumName(65, 'min', 'klyne')).toBe('synclinal');
  });

  it('draws as a chart in a frame: axes, the curve, a projection at each turning point, names, barriers and the boxed sawhorse', () => {
    const doc = new Doc();
    const m = plainMeasure(doc);
    let id = 0;
    doc.edit('Chart', () => { id = putTorsion(doc, m, butane, { x: 100, y: 200 }); });
    const frame = doc.shapes.get(id)!.frame!;
    const words = frame.captions.map((c) => doc.captions.get(c)!.runs.map((r) => r.text).join(''));
    for (const w of ['synperiplanar', 'eclipsed', 'gauche', 'antiperiplanar', '60°', '360°']) expect(words).toContain(w);
    expect(words.some((w) => /^E \(kcal\/mol\)$/.test(w))).toBe(true);
    // a barrier for each distinct height: gauche, eclipsed and synperiplanar
    const barriers = frame.captions.map((c) => doc.captions.get(c)!).filter((c) => c.runs[0]?.color === '#1a56db');
    expect(barriers.length).toBe(3);
    // seven projections (the one at 0° again at 360°), each a circle, and the sawhorse's box with its eye (pupil and all)
    expect(frame.shapes.filter((s) => doc.shapes.get(s)!.kind === 'oval' && doc.shapes.get(s)!.color === '#000000').length).toBe(7);
    expect(frame.shapes.filter((s) => doc.shapes.get(s)!.kind === 'oval' && doc.shapes.get(s)!.color === '#1a56db').length).toBe(1);
    expect(frame.shapes.filter((s) => doc.shapes.get(s)!.kind === 'rect').length).toBe(1);
    expect(torsionFrameOf(doc, 'caption', frame.captions[0])).toBe(id);
    // a scan's turning point at 0° can land a few degrees off: it is still shown at 0° and 360°
    const off = { ...butane, sawhorse: false, extrema: butane.extrema.map((e) => (e.kind === 'max' && (e.phi < 10 || e.phi > 350) ? { ...e, phi: 6.5 } : e)) };
    let id3 = 0;
    doc.edit('Off', () => { id3 = putTorsion(doc, m, off, { x: 100, y: 800 }); });
    expect(doc.shapes.get(id3)!.frame!.shapes.filter((s) => doc.shapes.get(s)!.kind === 'oval').length).toBe(7);
    expect(off.extrema.some((e) => e.phi === 6.5)).toBe(true);
    // kJ/mol: the same chart in other units
    doc.edit('kJ', () => { putTorsion(doc, m, { ...butane, unit: 'kJ/mol', insets: 'minima', sawhorse: false }, { x: 100, y: 200 }, id); });
    const f2 = doc.shapes.get(id)!.frame!;
    const w2 = f2.captions.map((c) => doc.captions.get(c)!.runs.map((r) => r.text).join(''));
    expect(w2.some((w) => /kJ\/mol/.test(w))).toBe(true);
    expect(f2.shapes.filter((s) => doc.shapes.get(s)!.kind === 'oval').length).toBe(3);
    expect(f2.shapes.filter((s) => doc.shapes.get(s)!.kind === 'rect').length).toBe(0);
  });

  it('copies its scan as tab-separated text', () => {
    const text = torsionCsv(butane).split('\n');
    expect(text[0]).toBe('phi (deg)\tE (kcal/mol)');
    expect(text.length).toBe(1 + 24);
    const kj = torsionCsv({ ...butane, unit: 'kJ/mol' }).split('\n');
    const row = (l: string) => Number(l.split('\t')[1]);
    expect(row(kj[1])).toBeCloseTo(row(text[1]) * 4.184, 2);
  });

  it('keeps its numbers through a CDXML file and is drawn the same', () => {
    const doc = new Doc();
    const m = plainMeasure(doc);
    let id = 0;
    doc.edit('Chart', () => { id = putTorsion(doc, m, butane, { x: 100, y: 200 }); });
    const back = readCdxml(writeCdxml(doc)).doc;
    const s = [...back.shapes.values()].find((x) => x.torsion)!;
    expect(s).toBeTruthy();
    expect(s.torsion!.extrema.length).toBe(butane.extrema.length);
    expect(s.torsion!.points!.length).toBe(24);
    const f0 = doc.shapes.get(id)!.frame!, f1 = s.frame!;
    expect(f1.captions.length).toBe(f0.captions.length);
    expect(f1.arrows.length).toBe(f0.arrows.length);
  });
});

describe('the chart as a textbook draws it', () => {
  it('draws each projection at ideal staggered angles: a gauche minimum at 65° has its bottom bond straight down', () => {
    const gauche = butane.extrema.find((e) => e.kind === 'min' && e.phi > 30 && e.phi < 90)!;
    const v = idealView(butane, gauche.phi);
    const front = v.front.map((g) => g.angle), back = v.back.map((g) => norm360(g.angle + v.turn));
    // 120° apart on each atom, the compared groups 60° apart, and one back bond at 180° (straight down)
    for (const set of [front, back]) for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(Math.abs(((set[i] - set[j] + 540) % 360) - 180) % 120).toBeCloseTo(0, 6);
    expect(back.some((a) => Math.abs(a - 180) < 1e-6)).toBe(true);
    expect(front.some((a) => Math.abs(a) < 1e-6 || Math.abs(a - 360) < 1e-6)).toBe(true);
  });

  it('moves a barrier arrow and its number to the side together, with a dashed grey line back to its level, and keeps the move through a file', () => {
    const doc = new Doc();
    const m = plainMeasure(doc);
    doc.beforeCommit = (before) => refitTorsion(doc, m, before);
    let id = 0;
    doc.edit('Chart', () => { id = putTorsion(doc, m, { ...butane, sawhorse: false }, { x: 100, y: 200 }); });
    const barrier = (d: Doc, frame: number) => {
      const f = d.shapes.get(frame)!.frame!;
      const arrows = f.arrows.map((a) => d.arrows.get(a)!).filter((a) => a.line === 'dashed' && a.color === '#1a56db' && Math.abs(a.tail.x - a.head.x) < 0.5);
      return arrows.sort((p, q) => (p.head.y - p.tail.y) - (q.head.y - q.tail.y))[0]; // the tallest: synperiplanar
    };
    const greyLines = (d: Doc, frame: number) => d.shapes.get(frame)!.frame!.shapes.filter((x) => d.shapes.get(x)!.dashed && d.shapes.get(x)!.color === '#9a9a9a').length;
    const before = barrier(doc, id);
    expect(greyLines(doc, id)).toBe(0);
    // drag it 50 points to the left (and a little down: only the sideways part counts)
    doc.edit('Drag', () => doc.updateArrow(before.id, { tail: { x: before.tail.x - 50, y: before.tail.y + 4 }, head: { x: before.head.x - 50, y: before.head.y + 4 } }));
    const d = doc.shapes.get(id)!.torsion!;
    expect(Object.values(d.shifts ?? {})).toEqual([-50]);
    const after = barrier(doc, id);
    expect(after.tail.x).toBeCloseTo(before.tail.x - 50, 5);
    expect(after.tail.y).toBeCloseTo(before.tail.y, 5);
    expect(greyLines(doc, id)).toBe(1);
    // its number went with it: the 5.x kcal/mol caption sits beside the moved arrow
    const num = doc.shapes.get(id)!.frame!.captions.map((c) => doc.captions.get(c)!).find((c) => c.runs[0]?.color === '#1a56db' && /^5\./.test(c.runs[0].text))!;
    const nb = m.captionBox(num);
    expect(Math.min(Math.abs(nb.x1 - after.tail.x), Math.abs(nb.x2 - after.tail.x))).toBeLessThan(0.5 * doc.style.bondLength);
    // through a file, and dragged again there
    const back = readCdxml(writeCdxml(doc)).doc;
    const s2 = [...back.shapes.values()].find((x) => x.torsion)!;
    expect(s2.torsion!.shifts).toEqual(d.shifts);
    const m2 = plainMeasure(back);
    back.beforeCommit = (b) => refitTorsion(back, m2, b);
    const a2 = barrier(back, s2.id);
    back.edit('Drag', () => back.updateArrow(a2.id, { tail: { x: a2.tail.x + 20, y: a2.tail.y }, head: { x: a2.head.x + 20, y: a2.head.y } }));
    expect(Object.values(back.shapes.get(s2.id)!.torsion!.shifts ?? {})).toEqual([-30]);
  });
});

describe('the Energy Chart tab', () => {
  it('scans when opened, redraws on a look change without scanning again, and hands back its choice', async () => {
    const page = document.createElement('div');
    document.body.append(page);
    let scans = 0, paints = 0, copied = '';
    const tab = chartTab(page, {
      pairs: async () => [{ label: 'CH3 (front) and CH3 (back)', a: 0, d: 3 }],
      scan: async (_rev, c) => { scans++; return { step: c.step }; },
      paint: () => { paints++; },
      copy: (c) => { copied = c.unit; },
    }, { step: 10, insets: 'all', names: 'textbook', unit: 'kcal/mol', barriers: true, sawhorse: true, method: 'mmff' }, () => false, false, () => {});
    expect(tab.result()).toBeNull();
    tab.open();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(scans).toBe(1);
    expect(paints).toBe(1);
    const unit = page.querySelector<HTMLSelectElement>('select[name=unit]')!;
    unit.value = 'kJ/mol';
    unit.dispatchEvent(new Event('change'));
    expect(scans).toBe(1);
    expect(paints).toBe(2);
    page.querySelector<HTMLButtonElement>('[data-act=copy]')!.click();
    expect(copied).toBe('kJ/mol');
    // xTB can't be picked without the desktop app
    expect(page.querySelector<HTMLSelectElement>('select[name=cmethod]')!.options[1].disabled).toBe(true);
    const r = tab.result()!;
    const want: Partial<ChartChoice> = { a: 0, d: 3, unit: 'kJ/mol', step: 10, sawhorse: true };
    expect(r.chart).toMatchObject(want);
    expect(r.scan).toEqual({ step: 10 });
    // a new step scans again
    const step = page.querySelector<HTMLSelectElement>('select[name=step]')!;
    step.value = '30';
    step.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(scans).toBe(2);
    expect(tab.result()!.chart.step).toBe(30);
  });
});
