// @vitest-environment jsdom
// Brackets drawn as a pair with the bracket tool: a click on one half selects the other, the
// Style panel's Select Partner / Deselect Partner, and the pairing kept through CDXML and paste.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { bracketsAround } from '../src/objects';
import { bracketPartner, newBracketPair, withBracketPartners } from '../src/editor/groups';
import { extractDrawing, insertDrawing } from '../src/io/clipboard';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import type { Selection } from '../src/editor/arrange';

const sel = (shapes: number[]): Selection => ({ atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set(shapes) });

function pair(doc: Doc, x = 0): [number, number] {
  return doc.edit('Brackets', () => {
    const k = newBracketPair(doc);
    const [l, r] = bracketsAround({ x1: x, y1: 0, x2: x + 40, y2: 30 }, 'square');
    return [doc.addShape({ ...l, bracketPair: k }).id, doc.addShape({ ...r, bracketPair: k }).id] as [number, number];
  });
}

describe('bracket pairs', () => {
  it('finds the other half, and adds it to a selection of one', () => {
    const doc = new Doc();
    const [l, r] = pair(doc);
    const [l2, r2] = pair(doc, 100);
    const lone = doc.edit('Bracket', () => doc.addShape(bracketsAround({ x1: 200, y1: 0, x2: 240, y2: 30 }, 'square')[0]).id);
    expect(bracketPartner(doc, l)).toBe(r);
    expect(bracketPartner(doc, r2)).toBe(l2);
    expect(bracketPartner(doc, lone)).toBeUndefined();
    expect([...withBracketPartners(doc, sel([r])).shapes].sort()).toEqual([l, r].sort());
    expect([...withBracketPartners(doc, sel([lone])).shapes]).toEqual([lone]);
  });

  it('keeps the pairing through CDXML, and a second save', () => {
    const doc = new Doc();
    pair(doc);
    const once = readCdxml(writeCdxml(doc)).doc;
    const ids = [...once.shapes.values()].filter((s) => s.kind === 'bracket').map((s) => s.id);
    expect(ids.length).toBe(2);
    expect(bracketPartner(once, ids[0])).toBe(ids[1]);
    const twice = readCdxml(writeCdxml(once)).doc;
    const ids2 = [...twice.shapes.values()].filter((s) => s.kind === 'bracket').map((s) => s.id);
    expect(bracketPartner(twice, ids2[0])).toBe(ids2[1]);
  });

  it("pairs a pasted copy's halves with each other, not with the original's", () => {
    const doc = new Doc();
    const [l, r] = pair(doc);
    const got = insertDrawing(doc, extractDrawing(doc, sel([l, r])), { x: 20, y: 25 });
    const [cl, cr] = [...got.shapes];
    expect(bracketPartner(doc, cl)).toBe(cr);
    expect(bracketPartner(doc, l)).toBe(r);
  });
});
