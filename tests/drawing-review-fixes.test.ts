// @vitest-environment jsdom
//
// Drawing-core fixes from the code review: the "text is chemistry" marks during a drag, and a
// two-finger pinch on a touch screen leaving the drawing alone, the pen (Sketch tool), common
// inorganic reagents read as chemistry, and zooming a big drawing.

import { describe, expect, it, vi } from 'vitest';
import { Doc } from '../src/model';
import { captionReading, readSpecies, speciesFormula } from '../src/chem/species';
import { plainMeasure } from '../src/chem/reaction';
import { Renderer } from '../src/render/renderer';
import { VecPath } from '../src/render/vector';
import { installPenAndTouch } from '../src/editor/touch';
import { Sketcher, type SketchHost } from '../src/editor/sketch';
import type { Vec } from '../src/geom';

const L = new Doc().style.bondLength;

/** Rows of six rings joined by five arrows with "THF" over each, and a number under each ring. */
function scheme(rows: number) {
  const doc = new Doc();
  let mover = 0;
  const cap = (x: number, y: number, text: string) => doc.addCaption({ x, y, runs: [{ text }], justify: 'left' });
  doc.edit('scheme', () => {
    for (let row = 0; row < rows; row++) for (let col = 0; col < 6; col++) {
      const cx = col * 10 * L, cy = row * 8 * L;
      const ids: number[] = [];
      for (let k = 0; k < 6; k++) ids.push(doc.addAtom(cx + L * Math.cos((k * Math.PI) / 3), cy + L * Math.sin((k * Math.PI) / 3)).id);
      for (let k = 0; k < 6; k++) doc.addBond(ids[k], ids[(k + 1) % 6], k % 2 ? 2 : 1);
      if (!mover) mover = ids[0];
      cap(cx - L / 2, cy + 2.2 * L, `${row + 1}${'abcdef'[col]}`);
      if (col < 5) {
        doc.addArrow({ tail: { x: cx + 2 * L, y: cy }, head: { x: cx + 8 * L, y: cy }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 4, headWidth: 1.5 });
        cap(cx + 4 * L, cy - 0.6 * L, 'THF');
      }
    }
  });
  return { doc, mover };
}

describe('text read as chemistry, during a drag', () => {
  it('does not rescan the whole drawing once per arrow on every move', () => {
    const { doc, mover } = scheme(20); // 120 structures, 100 reaction arrows, 220 text boxes
    const m = plainMeasure(doc);
    const label = [...doc.captions.values()][0];
    let scans = 0;
    const fragments = doc.fragments.bind(doc);
    doc.fragments = () => { scans++; return fragments(); };
    const frag = [...doc.fragmentOf(mover)];
    doc.begin('Move');
    for (let i = 0; i < 10; i++) {
      doc.moveAtoms(frag, 0.3, 0.2);
      captionReading(doc, label, m); // what the renderer's chemistry mark asks for, per paint
    }
    doc.commit();
    expect(scans).toBeLessThanOrEqual(10);
    // once the step is done, worked out again (once) for where the structure is now
    const during = scans;
    captionReading(doc, label, m);
    captionReading(doc, label, m);
    expect(scans).toBe(during + 1);
  });

  it('still sees text moved away from an arrow during the drag, and structures once it ends', () => {
    const { doc, mover } = scheme(1);
    const m = plainMeasure(doc);
    const thf = [...doc.captions.values()].find((c) => c.runs[0].text === 'THF')!;
    expect(captionReading(doc, thf, m)).toMatchObject({ species: null, why: 'arrow' });
    // the THF box dragged far below everything: read as a species straight away
    doc.begin('Move');
    doc.updateCaption(thf.id, { y: thf.y + 40 * L });
    expect(captionReading(doc, doc.captions.get(thf.id)!, m).species).not.toBeNull();
    doc.commit();
    // put back over its arrow, then the arrow's structures moved: worked out again once the step is done
    doc.undo();
    expect(captionReading(doc, doc.captions.get(thf.id)!, m).species).toBeNull();
    const frag = [...doc.fragmentOf(mover)];
    doc.begin('Move');
    doc.moveAtoms(frag, 0, 0.5);
    doc.commit();
    expect(captionReading(doc, doc.captions.get(thf.id)!, m).species).toBeNull();
  });
});

describe('a two-finger pinch whose first finger slid before the second landed', () => {
  it('drops the first finger\'s press in the editor instead of finishing it', () => {
    const el = document.createElement('div');
    document.body.append(el);
    let abandoned = 0;
    installPenAndTouch({ overlay: el, view: { ox: 0, oy: 0, scale: 1 }, requestScene: () => {}, abandonPress: () => { abandoned++; } });
    // the editor's own listeners (after touch.ts's): a cancelled press that had moved is finished, as if let go
    const finished: string[] = [];
    el.addEventListener('pointercancel', (e) => finished.push(e.type));
    el.addEventListener('pointerup', (e) => finished.push(e.type));
    const ev = (type: string, id: number, x: number) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: 100, bubbles: true, cancelable: true }));
    ev('pointerdown', 1, 100);
    for (let i = 1; i <= 4; i++) ev('pointermove', 1, 100 - i);
    ev('pointerdown', 2, 300);
    for (let i = 1; i <= 5; i++) { ev('pointermove', 1, 90 - 10 * i); ev('pointermove', 2, 300 + 10 * i); }
    ev('pointerup', 1, 40); ev('pointerup', 2, 350);
    expect(abandoned).toBe(1);
    expect(finished).toEqual([]);
    el.remove();
  });

  it('puts a move already under way back, with nothing to undo or redo', () => {
    const doc = new Doc();
    let id = 0;
    doc.edit('draw', () => { const a = doc.addAtom(0, 0); const b = doc.addAtom(L, 0); doc.addBond(a.id, b.id); id = a.id; });
    doc.begin('Copy');
    doc.updateAtom(id, { x: 5 });
    doc.addAtom(40, 40);
    doc.abandon();
    expect(doc.atoms.get(id)!.x).toBe(0);
    expect(doc.atoms.size).toBe(2);
    expect(doc.undoLabel).toBe('draw');
    expect(doc.canRedo()).toBe(false);
  });
});

// the host the app gives the sketcher, with a label that is one undoable step (as runAction's is)
function sketchHost(app: { doc: Doc }): SketchHost {
  return {
    get doc() { return app.doc; },
    label: (id, text) => app.doc.edit('Label', () => {
      const z = ({ C: 6, N: 7, O: 8, S: 16, P: 15, F: 9, Cl: 17, Br: 35, I: 53, H: 1, B: 5 } as Record<string, number>)[text] ?? 6;
      app.doc.updateAtom(id, { z });
    }),
    atomKey: () => {}, setHot: () => {}, done: () => {}, repaint: () => {}, say: () => {},
  };
}
// an upright stroke half a bond long: the letter I
const letterI = (x: number, y: number): Vec[] => Array.from({ length: 12 }, (_, i) => ({ x, y: y + (i * 0.5 * L) / 11 }));

describe('pen letters waiting to be read when the tab or slide changes', () => {
  it('do not land in the drawing switched to', () => {
    vi.useFakeTimers();
    try {
      // the app's one document, whose contents the tabs and slides swap in and out (Doc.swap)
      const app = { doc: new Doc() };
      const sk = new Sketcher(sketchHost(app));
      sk.stroke(letterI(600, 600)); // read 650 ms after the last stroke
      const tab1 = new Doc(), tab2 = new Doc();
      app.doc.swap(tab1); // put tab 1 away ...
      app.doc.swap(tab2); // ... and show tab 2, all within those 650 ms
      vi.advanceTimersByTime(1000);
      expect(app.doc.atoms.size).toBe(0);
      expect(sk.pending).toEqual([]);
    } finally { vi.useRealTimers(); }
  });

  it('are read into the drawing they were written in when it is put away (as the tab-leave hook does)', () => {
    const app = { doc: new Doc() };
    const sk = new Sketcher(sketchHost(app));
    sk.stroke(letterI(600, 600));
    sk.flush();
    expect([...app.doc.atoms.values()].map((a) => a.z)).toEqual([53]);
  });
});

const hexagon = (cx: number, cy: number): Vec[] => {
  const out: Vec[] = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) {
    const t = j / 8, a0 = ((-90 + 60 * i) * Math.PI) / 180, a1 = ((-90 + 60 * (i + 1)) * Math.PI) / 180, R = 1.1 * L;
    out.push({ x: cx + R * ((1 - t) * Math.cos(a0) + t * Math.cos(a1)), y: cy + R * ((1 - t) * Math.sin(a0) + t * Math.sin(a1)) });
  }
  out.push(out[0]);
  return out;
};

describe('a ring drawn with the pen in a big drawing', () => {
  it('looks only at the bonds near the stroke to fuse it', () => {
    const doc = new Doc();
    // 40,000 bonds, well away from where the rings are drawn
    doc.bulk(() => { for (let i = 0; i < 40000; i++) { const p = doc.addAtom((i % 200) * 30, Math.floor(i / 200) * 30); const q = doc.addAtom(p.x + L, p.y); doc.addBond(p.id, q.id); } });
    const sk = new Sketcher(sketchHost({ doc }));
    let looked = 0;
    const values = doc.bonds.values.bind(doc.bonds);
    doc.bonds.values = () => { looked++; return values(); };
    for (let i = 0; i < 5; i++) sk.stroke(hexagon(-2000 - i * 100, -2000));
    expect(doc.atoms.size).toBe(80000 + 30);
    expect(looked).toBe(0);
  });

  it('is still fused onto a bond it is drawn over', () => {
    const doc = new Doc();
    // a bond along the hexagon's bottom-left edge
    const R = 1.1 * L, corner = (k: number) => ({ x: 300 + R * Math.cos(((-90 + 60 * k) * Math.PI) / 180), y: 300 + R * Math.sin(((-90 + 60 * k) * Math.PI) / 180) });
    doc.edit('bond', () => { const a = doc.addAtom(corner(2).x, corner(2).y), b = doc.addAtom(corner(3).x, corner(3).y); doc.addBond(a.id, b.id); });
    new Sketcher(sketchHost({ doc })).stroke(hexagon(300, 300));
    expect(doc.atoms.size).toBe(6);
    expect(doc.bonds.size).toBe(6);
  });
});

describe('a pen letter written in empty space', () => {
  it('is one Undo step (no bare carbon left behind)', () => {
    const doc = new Doc();
    const sk = new Sketcher(sketchHost({ doc }));
    sk.stroke(letterI(300, 300));
    sk.flush();
    expect([...doc.atoms.values()].map((a) => a.z)).toEqual([53]);
    expect(doc.undoLabel).toBe('Sketch I');
    doc.undo();
    expect([...doc.atoms.values()].map((a) => a.z)).toEqual([]);
  });
});

describe('common inorganic reagents in a text box', () => {
  // formulas in Hill order
  const cases: [string, string][] = [
    ['H2SO4', 'H2O4S'], ['H2SO3', 'H2O3S'], ['HNO3', 'HNO3'], ['HNO2', 'HNO2'], ['HCN', 'CHN'], ['HSCN', 'CHNS'], ['HN3', 'HN3'],
    ['H3PO4', 'H3O4P'], ['H3BO3', 'BH3O3'], ['HClO4', 'ClHO4'], ['HIO4', 'HIO4'], ['H5IO6', 'H5IO6'], ['H2CrO4', 'CrH2O4'],
    ['HBF4', 'BF4H'], ['HPF6', 'F6HP'],
    ['N2O', 'N2O'], ['N2O4', 'N2O4'], ['N2O5', 'N2O5'], ['P2O5', 'O5P2'], ['P4O10', 'O10P4'], ['OsO4', 'O4Os'], ['RuO4', 'O4Ru'],
    ['CrO3', 'CrO3'], ['MoO3', 'MoO3'], ['WO3', 'O3W'], ['V2O5', 'O5V2'], ['Al2O3', 'Al2O3'], ['Fe2O3', 'Fe2O3'], ['Cr2O3', 'Cr2O3'],
    ['Na2O2', 'Na2O2'], ['K2Cr2O7', 'Cr2K2O7'], ['Na2Cr2O7', 'Cr2Na2O7'], ['K2CrO4', 'CrK2O4'], ['K2OsO4', 'K2O4Os'],
    ['NaBO3', 'BNaO3'], ['KHSO5', 'HKO5S'], ['Oxone', 'H3K5O18S4'], ['K2S2O8', 'K2O8S2'], ['(NH4)2S2O8', 'H8N2O8S2'],
    ['NaHSO3', 'HNaO3S'], ['Na2S2O5', 'Na2O5S2'], ['Na2S', 'Na2S'], ['CuSO4', 'CuO4S'], ['FeSO4', 'FeO4S'], ['SnCl2', 'Cl2Sn'],
    ['CuCN', 'CCuN'], ['BrCN', 'CBrN'], ['ClCN', 'CClN'], ['KOCN', 'CKNO'], ['NaOCN', 'CNNaO'],
  ];
  for (const [text, hill] of cases) {
    it(`reads ${text}`, () => {
      const sp = readSpecies(text);
      expect(sp, `${text} is not read as chemistry`).not.toBeNull();
      expect(speciesFormula(sp!)).toBe(hill);
    });
  }
  it('still reads the ones the formula reader puts together, and leaves NO2 to its other readings', () => {
    for (const t of ['SO3', 'SOCl2', 'POCl3', 'KMnO4', 'NaIO4', 'SeO2', 'MnO2']) expect(readSpecies(t), t).not.toBeNull();
    expect(readSpecies('NO2')).toBeNull();
  });
});

describe('zooming a big drawing', () => {
  it('shows the stretched old tiles while zoom steps keep coming, and paints new ones once it rests', () => {
    // a canvas context that draws nothing
    const ctx: Record<string | symbol, unknown> = new Proxy({}, { get: (t: Record<string | symbol, unknown>, k) => (k in t ? t[k] : (t[k] = () => ({ width: 0 }))) });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const doc = new Doc();
      doc.bulk(() => { for (let i = 0; i < 400; i++) { const p = doc.addAtom((i % 20) * 30, Math.floor(i / 20) * 30); const q = doc.addAtom(p.x + L, p.y); doc.addBond(p.id, q.id); } });
      const r = new Renderer(document.createElement('canvas'), document.createElement('canvas'));
      r.makePath = () => new VecPath() as unknown as Path2D;
      r.resize(800, 600, 1);
      r.view.scale = 1;
      r.renderScene(doc);
      let painted = 0;
      const rr = r as unknown as { paintTile: (...a: unknown[]) => unknown };
      const paint = rr.paintTile.bind(r);
      rr.paintTile = (...a) => { painted++; return paint(...a); };
      // a burst of wheel steps, one frame each (10 ms budget, as the editor gives)
      for (let i = 0; i < 4; i++) { now += 30; r.view.scale *= 1.1; r.renderScene(doc, 10); }
      expect(painted).toBe(0);
      expect(r.incomplete).toBe(true);
      // the frames after the last step: new tiles once the zoom has rested
      now += 50; r.renderScene(doc, 10);
      expect(painted).toBe(0);
      now += 100; r.renderScene(doc, 10);
      expect(painted).toBeGreaterThan(0);
      expect(r.incomplete).toBe(false);
      // a full paint (pictures, Fit) never waits
      painted = 0;
      r.view.scale *= 1.1; r.renderScene(doc);
      expect(painted).toBeGreaterThan(0);
    } finally { clock.mockRestore(); getContext.mockRestore(); }
  });
});
