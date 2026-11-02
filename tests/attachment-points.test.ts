// @vitest-environment jsdom
//
// Attachment points (right-click > Attachment Point): a wavy bond, a star or a numbered diamond.
// A ring carbon gets a new bond out to the point; an atom at the end of a bond becomes the point.
// A star stops its bond short, as a label does, and every kind keeps its kind through CDXML. The
// Hammett section of Insert Property Columns reads them as reference positions.

import { describe, it, expect, afterEach } from 'vitest';
import { Doc } from '../src/model';
import { Renderer } from '../src/render/renderer';
import { Editor } from '../src/editor/editor';
import { readCdxml } from '../src/io/cdxml';
import { writeCdxml } from '../src/io/cdxml-write';
import { attachRefs, refLabel, refMarks } from '../src/sheet/hammett-refs';

window.requestAnimationFrame = () => 0;
const noop = () => undefined;
const ctx: unknown = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? (s: string) => ({ width: s.length * 5, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
    : k === 'getTransform' ? () => new DOMMatrix()
    : k === 'createLinearGradient' || k === 'createPattern' || k === 'createRadialGradient' ? () => ({ addColorStop: noop })
    : noop),
  set: () => true,
});
(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx;

let last: Editor | null = null;
afterEach(() => { if (last) last.paused = true; });

function setup() {
  document.body.innerHTML = '';
  const scene = document.createElement('canvas'), overlay = document.createElement('canvas');
  const host = document.createElement('div');
  host.append(scene, overlay);
  document.body.append(host);
  const doc = new Doc();
  const r = new Renderer(scene, overlay);
  const ed = new Editor(doc, r, host);
  last = ed;
  ed.setTool('select');
  return { doc, ed, r };
}

/** Anisole: a benzene ring (atoms 0–5 round it) with OMe on ring atom 3. */
function anisole(doc: Doc) {
  return doc.edit('Draw', () => {
    const ring = Array.from({ length: 6 }, (_, i) => doc.addAtom(100 + Math.cos((i * Math.PI) / 3) * 14.4, 100 + Math.sin((i * Math.PI) / 3) * 14.4));
    ring.forEach((a, i) => doc.addBond(a.id, ring[(i + 1) % 6].id, i % 2 ? 2 : 1));
    const o = doc.addAtom(100 - 28.8, 100, 8);
    doc.addBond(ring[3].id, o.id);
    const me = doc.addAtom(100 - 43.2, 100);
    doc.addBond(o.id, me.id);
    return { ring: ring.map((a) => a.id), o: o.id, me: me.id };
  });
}

const attachAtoms = (doc: Doc) => [...doc.atoms.values()].filter((a) => a.attach);

describe('Attachment Point on the right-click menu', () => {
  it('a ring carbon gets a new bond out to a wavy-bond attachment point', () => {
    const { doc, ed } = setup();
    const { ring } = anisole(doc);
    const atoms = doc.atoms.size;
    expect(ed.setAttachPoint(ring[0], 'Wavy')).toBe(true);
    expect(doc.atoms.size).toBe(atoms + 1);
    const [w] = attachAtoms(doc);
    expect(w).toMatchObject({ attach: 'Wavy', z: 0, label: null });
    expect(doc.neighbors(w.id).map((a) => a.id)).toEqual([ring[0]]);
    // pointing away from the ring
    expect(w.x).toBeGreaterThan(doc.atoms.get(ring[0])!.x);
    // and undone in one step
    doc.undo();
    expect(doc.atoms.size).toBe(atoms);
  });

  it('an atom at the end of a bond becomes the point itself', () => {
    const { doc, ed } = setup();
    const { me } = anisole(doc);
    const atoms = doc.atoms.size;
    ed.setAttachPoint(me, 'Star');
    expect(doc.atoms.size).toBe(atoms);
    expect(doc.atoms.get(me)).toMatchObject({ attach: 'Star', z: 0 });
  });

  it('changes kind, numbers diamonds in turn, and Remove gives a plain carbon back', () => {
    const { doc, ed } = setup();
    const { ring } = anisole(doc);
    ed.setAttachPoint(ring[0], 'Numbered');
    ed.setAttachPoint(ring[1], 'Numbered');
    const [p1, p2] = attachAtoms(doc);
    expect([p1.attachNum, p2.attachNum]).toEqual([1, 2]);
    expect(p1.attach).toBe('Unspecified');
    ed.setAttachPoint(p2.id, 'Wavy');
    expect(doc.atoms.get(p2.id)).toMatchObject({ attach: 'Wavy', attachNum: undefined });
    ed.setAttachPoint(p2.id, 'Numbered');
    expect(doc.atoms.get(p2.id)).toMatchObject({ attach: 'Unspecified', attachNum: 2 });
    ed.setAttachPoint(p1.id, null);
    expect(doc.atoms.get(p1.id)).toMatchObject({ attach: undefined, z: 6 });
    expect(ed.setAttachPoint(p1.id, null)).toBe(false);
  });

  it('a star stops its bond short, as a label does; a wavy bond runs to its end', () => {
    const { doc, ed, r } = setup();
    const { ring, me } = anisole(doc);
    ed.setAttachPoint(ring[0], 'Wavy');
    ed.setAttachPoint(me, 'Star');
    const wavy = attachAtoms(doc).find((a) => a.attach === 'Wavy')!;
    expect(r.atomInfo(doc, doc.atoms.get(me)!).boxes).toHaveLength(1);
    expect(r.atomInfo(doc, wavy).boxes).toHaveLength(0);
  });
});

describe('attachment points in CDXML', () => {
  it('keeps each kind: wavy, star and numbered', () => {
    const doc = new Doc();
    const { ring, me } = anisole(doc);
    doc.edit('Draw', () => {
      const w = doc.addAtom(130, 100, 0, { attach: 'Wavy' });
      doc.addBond(ring[0], w.id);
      const d = doc.addAtom(115, 75, 0, { attach: 'Unspecified', attachNum: 3 });
      doc.addBond(ring[1], d.id);
      doc.updateAtom(me, { attach: 'Star', z: 0 });
    });
    const text = writeCdxml(doc);
    expect(text).toMatch(/ExternalConnectionType="Star"/);
    const back = attachAtoms(readCdxml(text).doc).map((a) => [a.attach, a.attachNum]);
    expect(back).toEqual(expect.arrayContaining([['Wavy', undefined], ['Star', undefined], ['Unspecified', 3]]));
  });
});

describe('reference positions for Hammett columns', () => {
  it('names the attachment points and marks o, m and p round the ring', () => {
    const doc = new Doc();
    const { ring } = anisole(doc);
    doc.edit('Draw', () => {
      const w = doc.addAtom(128.8, 100, 0, { attach: 'Wavy' });
      doc.addBond(ring[0], w.id);
    });
    expect([...attachRefs(doc).keys()]).toEqual(['wavy']);
    expect(refLabel('wavy')).toMatch(/Wavy bond/);
    expect(refLabel('2')).toMatch(/Numbered 2/);
    const m = refMarks(doc, 'wavy')!;
    const place = (id: number) => m.places.find((p) => p.atom.id === id)?.place;
    expect([place(ring[1]), place(ring[5]), place(ring[2]), place(ring[4]), place(ring[3])]).toEqual(['o', 'o', 'm', 'm', 'p']);
    expect(refMarks(doc, 'star')).toBeNull();
  });

  it('no marks when the point is not on the ring itself', () => {
    const doc = new Doc();
    const { o } = anisole(doc);
    doc.edit('Draw', () => {
      const n = doc.addAtom(50, 120, 7);
      const w = doc.addAtom(40, 130, 0, { attach: 'Star' });
      doc.addBond(o, n.id);
      doc.addBond(n.id, w.id);
    });
    expect(attachRefs(doc).has('star')).toBe(true);
    expect(refMarks(doc, 'star')).toBeNull();
  });
});
