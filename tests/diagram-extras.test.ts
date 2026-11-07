// @vitest-environment jsdom
//
// The diagram layouts that read dates or lanes from their lines (Gantt chart, timeline with dates,
// swimlane flowchart), the ring, honeycomb and circle layouts, and structures held in items.

import { describe, expect, it } from 'vitest';
import { Doc, type Shape } from '../src/model';
import { POINTS } from '../src/editor/arrange';
import { geoDef, HEX_CELL, sectorBox, sectorId } from '../src/design/geo';
import { axisMarks, parseTaskLine, placeOnAxis } from '../src/design/timescale';
import {
  cleanDiagram, diagramContents, diagramParts, laneSplit, newDiagram, putDiagram, refitDiagramStructures, refitDiagrams, textFromShapes,
} from '../src/design/diagrams';

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86400000;
const said = (s: { text?: { runs: { text: string }[] } }) => s.text?.runs.map((r) => r.text).join('') ?? '';
const middle = (s: { x1: number; y1: number; x2: number; y2: number }) => ({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 });

describe('reading dates', () => {
  it('splits what from when at the last colon followed by a date or step', () => {
    expect(parseTaskLine('Grow crystals: 3 – 7 Mar 2026')).toEqual({ name: 'Grow crystals', when: '3 – 7 Mar 2026' });
    expect(parseTaskLine('Mix at 2:1: Day 4')).toEqual({ name: 'Mix at 2:1', when: 'Day 4' });
    expect(parseTaskLine('Remember: order solvent')).toBeNull();
    expect(parseTaskLine('No colon here')).toBeNull();
  });

  it('places months, quarters and days on one axis of days, each covering all of itself', () => {
    const { spans, axis } = placeOnAxis(['Mar – May 2026', '2026-06-04 to 2026-06-08', 'Q4 2026', 'Sept 2026', null, 'soon']);
    expect(spans[0]).toEqual({ from: day(2026, 3, 1), to: day(2026, 6, 1), point: false });
    expect(spans[1]).toEqual({ from: day(2026, 6, 4), to: day(2026, 6, 9), point: false });
    expect(spans[2]).toEqual({ from: (day(2026, 10, 1) + day(2027, 1, 1)) / 2, to: (day(2026, 10, 1) + day(2027, 1, 1)) / 2, point: true });
    expect(spans[3]!.point).toBe(true);
    expect(spans[4]).toBeNull();
    expect(spans[5]).toBeNull();
    expect(axis).toMatchObject({ unit: 'day', showYear: true, lo: day(2026, 3, 1) });
  });

  it('borrows a missing year and lets a backwards range run into the next year', () => {
    const { spans } = placeOnAxis(['Oct 2025', 'Nov – Feb', '14 Mar', 'Dec – Jan 2027']);
    expect(spans[1]).toMatchObject({ from: day(2025, 11, 1), to: day(2026, 3, 1) });
    expect(spans[2]).toMatchObject({ from: day(2026, 3, 14), point: true });
    expect(spans[3]).toMatchObject({ from: day(2026, 12, 1), to: day(2027, 2, 1) });
  });

  it('counts steps on their own axis, the second end of a range taking the first one\'s word', () => {
    const { spans, axis } = placeOnAxis(['Week 2 – 4', 'Week 6', 'Mar 2026']);
    expect(spans[0]).toEqual({ from: 2, to: 5, point: false });
    expect(spans[1]).toEqual({ from: 6.5, to: 6.5, point: true });
    expect(spans[2]).toBeNull();
    expect(axis).toMatchObject({ unit: 'step', stepWord: 'Week' });
    expect(axisMarks(axis!, 10).map((m) => m.text)).toEqual(['Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6']);
    expect(axisMarks(axis!, 3).length).toBeLessThanOrEqual(3);
  });

  it('marks the axis in days, weeks, months, quarters or years, whichever fits', () => {
    const months = placeOnAxis(['Nov 2025 – Feb 2026']).axis!;
    expect(axisMarks(months, 12).map((m) => m.text)).toEqual(['Nov 2025', 'Dec', 'Jan 2026', 'Feb']);
    const weeks = placeOnAxis(['2026-03-02 – 2026-03-29']).axis!;
    expect(axisMarks(weeks, 6).map((m) => m.text)).toEqual(['2 Mar', '9 Mar', '16 Mar', '23 Mar']);
    const quarters = placeOnAxis(['Jan 2026 – Dec 2027']).axis!;
    expect(axisMarks(quarters, 10).map((m) => m.text)).toEqual(['Q1 2026', 'Q2', 'Q3', 'Q4', 'Q1 2027', 'Q2', 'Q3', 'Q4']);
    const years = placeOnAxis(['Jan 2010 – Jan 2030']).axis!;
    expect(axisMarks(years, 6).every((m) => /^\d{4}$/.test(m.text))).toBe(true);
    expect(axisMarks(years, 6).length).toBeLessThanOrEqual(6);
  });
});

describe('swimlane flowchart', () => {
  it('reads "Lane: step", and leaves a colon with no space after it alone', () => {
    expect(laneSplit('Facility: Run HRMS')).toEqual({ lane: 'Facility', step: 'Run HRMS' });
    expect(laneSplit('Student:')).toEqual({ lane: 'Student', step: '' });
    expect(laneSplit('Mix 3:1')).toBeNull();
    expect(laneSplit('Just a step')).toBeNull();
  });

  it('puts each step in its lane, left to right, joined by glued arrows that bend between lanes', () => {
    const { shapes, lines } = diagramParts(newDiagram('swimlane', 'Me: Start\nMe: Weigh\nNMR: Clean?\nMe: End'));
    const steps = shapes.filter((s) => s.name);
    expect(steps.map(said)).toEqual(['Start', 'Weigh', 'Clean?', 'End']);
    expect(steps.map((s) => s.geo)).toEqual(['fcTerminator', 'roundRect', 'fcDecision', 'fcTerminator']);
    const xs = steps.map((s) => middle(s).x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(middle(steps[0]).y).toBeCloseTo(middle(steps[1]).y, 6);
    expect(middle(steps[2]).y).toBeGreaterThan(middle(steps[1]).y);
    expect(shapes.filter((s) => !s.name && said(s)).map(said)).toEqual(['Me', 'NMR']);
    expect(lines.map((l) => [l.headStyle, !!l.from, !!l.to, !!l.elbow])).toEqual([['full', true, true, false], ['full', true, true, true], ['full', true, true, true]]);
  });

  it('keeps lanes in the order first named, and makes one unnamed lane when none is', () => {
    const named = diagramParts(newDiagram('swimlane', 'A: x\nC:\nB: y\nC: z')).shapes;
    expect(named.filter((s) => !s.name && said(s)).map(said)).toEqual(['A', 'C', 'B']);
    const plain = diagramParts(newDiagram('swimlane', 'x\ny\nz'));
    expect(plain.shapes.filter((s) => !s.name && said(s))).toEqual([]);
    expect(plain.lines.some((l) => l.elbow)).toBe(false);
  });

  it('a step retyped in its shape keeps its lane', () => {
    const doc = new Doc();
    const frame = doc.edit('d', () => putDiagram(doc, POINTS, newDiagram('swimlane', 'Me: Mix\nNMR: Run'), { x: 0, y: 0 }));
    const step = [...doc.shapes.values()].find((s) => s.name === 'Item 2')!;
    doc.edit('type', () => doc.updateShape(step.id, { text: { runs: [{ ...step.text!.runs[0], text: 'Run 13C' }] } }));
    expect(textFromShapes(doc, doc.shapes.get(frame)!)).toBe('Me: Mix\nNMR: Run 13C');
  });
});

describe('Gantt chart', () => {
  const text = 'Make\n\tLigand: Jan – Mar 2026\n\tComplex: Mar – Apr 2026\nDue: Jun 2026';

  it('draws a row for each line with bars to scale under a scale of months', () => {
    const { shapes, lines } = diagramParts(newDiagram('gantt', text));
    expect(shapes.filter((s) => s.name && s.geo === 'rect' && said(s)).map(said)).toEqual(['Make', 'Ligand', 'Complex', 'Due']);
    const bars = shapes.filter((s) => s.geo === 'roundRect');
    expect(bars.length).toBe(2);
    // three months against two: 90 days to 61
    expect((bars[0].x2 - bars[0].x1) / (bars[1].x2 - bars[1].x1)).toBeCloseTo(90 / 61, 1);
    expect(bars[1].x1).toBeGreaterThan(bars[0].x1);
    expect(shapes.filter((s) => s.geo === 'diamond').length).toBe(1);
    const marks = shapes.filter((s) => !s.name && said(s)).map(said);
    expect(marks[0]).toBe('Jan 2026');
    expect(lines.length).toBe(marks.length);
  });

  it('gives a heading over dated lines a thinner bar across them', () => {
    const { shapes } = diagramParts(newDiagram('gantt', text));
    const bars = shapes.filter((s) => s.geo === 'rect' && !said(s) && s.filled);
    const summary = bars[0], ligand = shapes.find((s) => s.geo === 'roundRect')!;
    expect(summary.x1).toBeCloseTo(ligand.x1, 6);
    expect(summary.y2 - summary.y1).toBeLessThan(ligand.y2 - ligand.y1);
  });

  it('a task retyped in its row keeps its dates', () => {
    const doc = new Doc();
    const frame = doc.edit('d', () => putDiagram(doc, POINTS, newDiagram('gantt', 'Ligand: Jan – Mar 2026\nAssay: Apr 2026'), { x: 0, y: 0 }));
    const row = [...doc.shapes.values()].find((s) => s.name === 'Item 1')!;
    doc.edit('type', () => doc.updateShape(row.id, { text: { runs: [{ ...row.text!.runs[0], text: 'Bisoxazoline' }] } }));
    expect(textFromShapes(doc, doc.shapes.get(frame)!)).toBe('Bisoxazoline: Jan – Mar 2026\nAssay: Apr 2026');
  });
});

describe('timeline with dates', () => {
  it('stacks overlapping spans above the line and sets milestones on it', () => {
    const d = newDiagram('dated-timeline', null);
    const { shapes } = diagramParts(d);
    const bars = shapes.filter((s) => s.geo === 'roundRect');
    expect(bars.map(said)).toEqual(['Course work', 'Route scouting', 'Scale-up']);
    for (let i = 0; i < bars.length; i++) {
      for (let j = i + 1; j < bars.length; j++) {
        const a = bars[i], b = bars[j];
        expect(a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2).toBe(false);
      }
    }
    expect(shapes.filter((s) => s.geo === 'diamond').length).toBe(3);
    expect(shapes.filter((s) => s.name && s.geo === 'rect').map(said)).toEqual(['Start in lab', 'Qualifying exam', 'First paper']);
  });

  it('falls back to the evenly spaced timeline when nothing has a date', () => {
    const d = newDiagram('dated-timeline', 'One\nTwo\nThree');
    const dated = diagramParts(d), plain = diagramParts({ ...d, layout: 'timeline' });
    expect(dated.shapes.map((s) => [s.geo, Math.round(s.x1)])).toEqual(plain.shapes.map((s) => [s.geo, Math.round(s.x1)]));
  });
});

describe('ring, honeycomb and circle layouts', () => {
  it('sizes a ring segment\'s box to the segment, whichever way it turns', () => {
    const top = sectorBox(Math.PI, 2 * Math.PI, 0.5);
    expect([top.x1, top.y1, top.x2, top.y2].map((v) => Math.round(v * 1e3) / 1e3 + 0)).toEqual([-1, -1, 1, 0]);
    const corner = sectorBox(0, Math.PI / 2, 0);
    expect([corner.x1, corner.y1, corner.x2, corner.y2].map((v) => Math.round(v * 1e3) / 1e3 + 0)).toEqual([0, 0, 1, 1]);
    const def = geoDef(sectorId(180, 360, 0.5));
    const [x1, y1, x2, y2] = def.text!;
    expect(x1).toBeGreaterThanOrEqual(0);
    expect(x2).toBeLessThanOrEqual(1);
    expect(y2).toBeGreaterThan(y1);
    // a damaged id still draws something
    expect(geoDef('sector:x:y:z').draw(10, 10).body.length).toBeGreaterThan(2);
  });

  it('draws one segment per item, with the first item in the middle when the rest are under it', () => {
    const flat = diagramParts(newDiagram('ring', 'a\nb\nc\nd')).shapes;
    expect(flat.filter((s) => s.geo?.startsWith('sector:')).length).toBe(4);
    const hub = diagramParts(newDiagram('ring', 'Hub\n\ta\n\tb\n\tc')).shapes;
    expect(hub.filter((s) => s.geo?.startsWith('sector:')).length).toBe(3);
    expect(said(hub.find((s) => s.geo === 'ellipse')!)).toBe('Hub');
  });

  it('packs honeycomb cells without overlaps and puts circles on the bending ribbon and the arrow', () => {
    const cells = diagramParts(newDiagram('honeycomb', 'a\nb\nc\nd\ne\nf\ng')).shapes.filter((s) => s.geo === HEX_CELL);
    expect(cells.length).toBe(7);
    for (const c of cells) expect((c.x2 - c.x1) / (c.y2 - c.y1)).toBeCloseTo(2 / Math.sqrt(3), 6);
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const p = middle(cells[i]), q = middle(cells[j]);
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(0.95 * (cells[i].y2 - cells[i].y1));
      }
    }
    const arch = diagramParts(newDiagram('arch', 'a\n\tone\nb\nc')).shapes;
    expect(arch.filter((s) => s.geo === 'ellipse').length).toBe(3);
    expect(arch.filter((s) => s.geo?.startsWith('sector:')).length).toBe(3);
    const onArrow = diagramParts(newDiagram('arrow-circles', 'a\nb\nc')).shapes;
    expect(onArrow[0].geo).toBe('rightArrow');
    expect(onArrow.filter((s) => s.geo === 'ellipse').length).toBe(3);
  });

  it('an item of just [] keeps its place but shows no words', () => {
    const shapes = diagramParts(newDiagram('arch', 'A\n[]\nC')).shapes.filter((s) => s.geo === 'ellipse');
    expect(shapes.map(said)).toEqual(['A', '', 'C']);
    expect(shapes[1].name).toBe('Item 2');
  });
});

describe('structures held in items', () => {
  /** A diagram whose drawing runs the editor's refits, with a two-atom structure added at `at`. */
  function withStructure(layout: string, text: string, at: (item: Shape) => { x: number; y: number }, length = 80) {
    const doc = new Doc();
    const frame = doc.edit('d', () => putDiagram(doc, POINTS, newDiagram(layout, text), { x: 50, y: 40 }));
    doc.beforeCommit = (b) => { refitDiagrams(doc, b, POINTS); refitDiagramStructures(doc, b, POINTS); };
    const item = [...doc.shapes.values()].find((s) => s.name === 'Item 2')!;
    const p = at(item);
    let first = 0;
    doc.edit('Draw', () => {
      first = doc.addAtom(p.x - length / 2, p.y, 6).id;
      doc.addBond(first, doc.addAtom(p.x + length / 2, p.y, 6).id, 1);
    });
    return { doc, frame, first };
  }

  it('makes room for a structure dropped in an item, growing the diagram, and centers it there', () => {
    const before = newDiagram('arch', 'A\nB\nC');
    const { doc, frame, first } = withStructure('arch', 'A\nB\nC', middle, 200);
    const s = doc.shapes.get(frame)!;
    expect(s.diagram!.figs?.['2']?.w).toBeGreaterThan(200);
    expect(s.x2 - s.x1).toBeGreaterThan(before.w);
    const item = [...doc.shapes.values()].find((x) => x.name === 'Item 2')!;
    const atoms = [...doc.fragmentOf(first)].map((id) => doc.atoms.get(id)!);
    const cx = (Math.min(...atoms.map((a) => a.x)) + Math.max(...atoms.map((a) => a.x))) / 2;
    expect(cx).toBeCloseTo(middle(item).x, 0);
    expect(s.frame!.atoms).toEqual([Math.min(...doc.fragmentOf(first))]);
    expect(diagramContents(doc, s).sort()).toEqual([...doc.fragmentOf(first)].sort());
  });

  it('lets go of a structure dragged out of the diagram', () => {
    const { doc, frame, first } = withStructure('honeycomb', 'A\nB\nC', middle, 40);
    expect(doc.shapes.get(frame)!.diagram!.figs).toBeDefined();
    doc.edit('Drag', () => doc.moveAtoms(doc.fragmentOf(first), 0, 3000));
    expect(doc.shapes.get(frame)!.diagram!.figs).toBeUndefined();
    expect(doc.shapes.get(frame)!.frame!.atoms).toEqual([]);
  });

  it('keeps its structure when the look changes', () => {
    const { doc, frame, first } = withStructure('ring', 'A\nB\nC\nD', middle, 60);
    const f = doc.shapes.get(frame)!;
    doc.edit('Look', () => putDiagram(doc, POINTS, { ...f.diagram!, colours: 'light' }, { x: f.x1, y: f.y1 }, frame));
    expect(doc.shapes.get(frame)!.diagram!.figs?.['2']).toBeDefined();
    expect(diagramContents(doc, doc.shapes.get(frame)!)).toContain(first);
  });

  it('reads only usable structure spaces from a file', () => {
    expect(cleanDiagram({ layout: 'ring', text: 'a', figs: { 3: { w: 20, h: 10 }, y: { w: 1, h: 1 }, 4: { w: 0, h: 9 }, 5: null } })?.figs).toEqual({ 3: { w: 20, h: 10 } });
    expect(cleanDiagram({ layout: 'ring', text: 'a', figs: 'no' })?.figs).toBeUndefined();
  });
});
