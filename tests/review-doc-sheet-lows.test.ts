// @vitest-environment jsdom
//
// Review 2026-11-03, Document and Spreadsheet low findings:
// L1 Hammett inputs built in slices, L2 a figure grown round its structures without asking
// (save, tab switch, close), L3 Format Favorites on a document's shapes and figures, L4 Add to
// Print Area not adding the same cells twice, L6 the Hammett explanation behind an "i".

import { describe, it, expect, vi, afterEach } from 'vitest';
import { SheetChem, type ChemEngine } from '../src/sheet/sheet-chem';
import { makeStructure } from '../src/sheet/workbook';
import { outgrownFrame } from '../src/document/figures';
import { docObjectLook, withObjectLook } from '../src/document/object-look';
import { withPrintBlock } from '../src/ui/sheet-page-ui';
import { askProperties, HAMMETT_REF_INFO } from '../src/ui/property-dialog';
import type { DocObject } from '../src/document/document';
import type { Contents } from '../src/model';

afterEach(() => vi.restoreAllMocks());

describe('L1: Hammett columns on many drawn rows', () => {
  it('builds the molfiles in slices, letting the window paint between them, and still answers every row', async () => {
    const asked: string[][] = [];
    const engine: ChemEngine = {
      ready: true,
      props: async () => [],
      substructure: async () => ({ results: [] }),
      hammett: async (_core, mols) => { asked.push(mols); return mols.map(() => ({ sites: [] }) as never); },
    };
    // each molfile takes 2 ms to build
    const slow = (c: Contents) => { const t = performance.now(); while (performance.now() - t < 2) { /* building */ } return { molblock: `m${c.atoms.length}` }; };
    const chem = new SheetChem(engine, slow);
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const rows = Array.from({ length: 60 }, () => makeStructure({ atoms: [], bonds: [], captions: [], arrows: [], shapes: [] }));
    for (const r of rows) chem.hammett(r, 'star');
    expect(chem.busy).toBe(true);
    await chem.settled();
    // 120 ms of building: let go of the window at least twice (every 40 ms)
    expect(timers.mock.calls.filter((c) => c[1] === 0).length).toBeGreaterThanOrEqual(2);
    expect(asked.flat()).toHaveLength(60);
    for (const r of rows) expect(chem.hammett(r, 'star')).toEqual({ sites: [] });
  });
});

describe('L2: a figure whose structures reach past it', () => {
  const fr = { x: 0, y: 0, w: 100, h: 60 };
  it('stays as it is while they fit (drawn up to the edges counts)', () => {
    expect(outgrownFrame(fr, { x1: 0, y1: 0, x2: 100, y2: 60 }, { x1: -1.5, y1: -1.5, x2: 101.5, y2: 61.5 })).toBeNull();
    expect(outgrownFrame(fr, null, null)).toBeNull();
  });
  it('grows round their picture when they reach past an edge', () => {
    expect(outgrownFrame(fr, { x1: 10, y1: 10, x2: 130, y2: 50 }, { x1: 8.5, y1: 8.5, x2: 131.5, y2: 51.5 })).toEqual({ x: 0, y: 0, w: 131.5, h: 60 });
    expect(outgrownFrame(fr, { x1: -20, y1: -5, x2: 50, y2: 50 }, { x1: -21.5, y1: -6.5, x2: 51.5, y2: 51.5 })).toEqual({ x: -21.5, y: -6.5, w: 121.5, h: 66.5 });
  });
});

describe('L3: Format Favorites on a document page', () => {
  const box: DocObject = { kind: 'textbox', runs: [{ text: 'Key step' }], w: 100, fill: '#ffeeaa', look: { frame: 1.5, frameColor: '#c00000' }, float: { wrap: 'square', x: 0, y: 0 } } as DocObject;
  const figure: DocObject = { kind: 'drawing', contents: { atoms: [], bonds: [], captions: [], arrows: [], shapes: [] } };
  it('a shape or text box gives its fill and outline', () => {
    expect(docObjectLook(box)).toEqual({ shape: { filled: true, fillColor: '#ffeeaa', lineWidth: 1.5, color: '#c00000' } });
    expect(docObjectLook(figure)).toEqual({ shape: { filled: false, lineWidth: 0 } });
    expect(docObjectLook({ kind: 'cite' } as never)).toBeNull();
  });
  it('a figure takes the outline, a text box the fill and outline', () => {
    const look = docObjectLook(box)!;
    const fig = withObjectLook(figure, look) as Extract<DocObject, { kind: 'drawing' }>;
    expect(fig.look).toEqual({ frame: 1.5, frameColor: '#c00000' });
    const plain = withObjectLook(box, { shape: { filled: false, lineWidth: 0 } }) as Extract<DocObject, { kind: 'textbox' }>;
    expect(plain.fill).toBeUndefined();
    expect(plain.look).toBeUndefined();
    // a canvas shape's look (fill and line colour) comes across too
    const fromCanvas = withObjectLook(plain, { shape: { filled: true, fillColor: '#dde8ff', lineWidth: 0.75, color: '#1f4e9b' } }) as Extract<DocObject, { kind: 'textbox' }>;
    expect([fromCanvas.fill, fromCanvas.look]).toEqual(['#dde8ff', { frame: 0.75, frameColor: '#1f4e9b' }]);
    // a text-only favorite has nothing for it
    expect(withObjectLook(box, { text: { run: { bold: true } } as never })).toBeNull();
  });
});

describe('L4: Add to Print Area', () => {
  const A2 = { r1: 0, c1: 0, r2: 1, c2: 0 };
  it('doesn\'t add cells the print area takes in already', () => {
    const list = [A2];
    expect(withPrintBlock(list, A2)).toBe(list);
    expect(withPrintBlock([{ r1: 0, c1: 0, r2: 9, c2: 3 }], { r1: 2, c1: 1, r2: 3, c2: 2 })).toHaveLength(1);
    expect(withPrintBlock(list, { r1: 5, c1: 0, r2: 6, c2: 1 })).toEqual([A2, { r1: 5, c1: 0, r2: 6, c2: 1 }]);
  });
});

describe('L6: Insert Property Columns, Hammett section', () => {
  it('puts how groups are counted behind an "i" by Reference position; the line under it only says what was found', async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
    const { infoTipsOnOpen } = await import('../src/ui/info-tip');
    infoTipsOnOpen();
    void askProperties({
      columns: [{ col: 0, label: 'A: Structure' }], col: 0,
      hammett: { refs: () => [{ value: 'star', label: '* Star' }], look: () => ({ picture: null, note: 'Found in the structure.' }) },
    } as never);
    await new Promise((r) => setTimeout(r, 0));
    const ref = [...document.querySelectorAll('.hm-row span')].find((s) => s.textContent?.startsWith('Reference position'))!;
    expect(ref.querySelector('.info-icon')?.getAttribute('data-tip')).toBe(HAMMETT_REF_INFO);
    expect(document.querySelector('.hm-note')?.textContent).toBe('Found in the structure.');
  });
});
