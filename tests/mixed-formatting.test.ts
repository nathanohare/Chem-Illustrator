// @vitest-environment jsdom
//
// Part of a text in bold, italics or underlined: atom labels (the i of i-Pr in italics, picked in
// the label box), the Smart Scheme pane's rows, the Outline View and the spreadsheet's cell box,
// and the files they go to (CDXML for canvases and PowerPoint, our own part in Word and Excel).

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { Deck } from '../src/deck/deck';
import { labelPieces, styleLabel } from '../src/chem/labels';
import { anyMarks, readMark, toggleMarks, toggledMark, writeMark } from '../src/chem/label-marks';
import { writeCdxml, labelRuns } from '../src/io/cdxml-write';
import { readCdxml, labelLookOf } from '../src/io/cdxml';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
import { boxOf } from '../src/objects';
import { retextRuns } from '../src/richtext';
import { partsRuns } from '../src/chem/smart-scheme';
import { applyOutline, slideOutline } from '../src/deck/outline';
import { RichInput } from '../src/ui/rich-input';
import { RichField } from '../src/ui/rich-field';

function labelled(doc: Doc, label: string, labelMarks?: string): number {
  let id = 0;
  doc.edit('build', () => { const a = doc.addAtom(100, 100, 6, { label, ...(labelMarks ? { labelMarks } : {}) }); id = a.id; doc.addBond(id, doc.addAtom(114, 100, 6).id, 1); });
  return id;
}

describe('label marks', () => {
  it('keep the meaning of the marks older drawings have', () => {
    expect(readMark('.')).toEqual({ pos: 'auto', italic: false, bold: false, underline: false });
    expect(readMark('^').pos).toBe('up');
    expect(readMark('_').pos).toBe('down');
    expect(readMark('=').pos).toBe('line');
    expect(readMark('/')).toMatchObject({ pos: 'auto', italic: true });
    expect(readMark('*')).toMatchObject({ pos: 'up', italic: true });
    expect(readMark(',')).toMatchObject({ pos: 'down', italic: true });
    expect(readMark('!')).toMatchObject({ pos: 'line', bold: true, italic: false });
    expect(writeMark({ italic: true })).toBe('/');
    expect(writeMark({ pos: 'line', bold: true })).toBe('!');
  });

  it('hold every mix of where a character sits and bold, italic and underline', () => {
    const seen = new Set<string>();
    for (const pos of ['auto', 'up', 'down', 'line'] as const) for (const italic of [false, true]) for (const bold of [false, true]) for (const underline of [false, true]) {
      const m = writeMark({ pos, italic, bold, underline });
      expect(m).toHaveLength(1);
      expect(readMark(m)).toEqual({ pos, italic, bold, underline });
      seen.add(m);
    }
    expect(seen.size).toBe(32);
    expect(anyMarks('...')).toBe(false);
    expect(anyMarks('.B.')).toBe(true);
  });

  it('toggle on the selected characters, keeping their other looks', () => {
    // Ctrl+I on the i of iPr
    expect(toggleMarks('...', 0, 1, 'italic')).toBe('/..');
    // and off again
    expect(toggleMarks('/..', 0, 1, 'italic')).toBe('...');
    // on for all when only some have it
    expect(toggleMarks('/..', 0, 2, 'italic')).toBe('//.');
    // a lowered character made italic stays lowered; lowering an italic one keeps it italic
    expect(readMark(toggleMarks('_', 0, 1, 'italic'))).toMatchObject({ pos: 'down', italic: true });
    expect(readMark(toggleMarks('/', 0, 1, 'sub'))).toMatchObject({ pos: 'down', italic: true });
    expect(readMark(toggleMarks(',', 0, 1, 'sub'))).toMatchObject({ pos: 'auto', italic: true });
    expect(readMark(toggleMarks('/', 0, 1, 'bold'))).toMatchObject({ italic: true, bold: true });
    expect(toggledMark(readMark('.'), 'underline').underline).toBe(true);
  });

  it('show as italic, bold and underlined pieces', () => {
    const p = labelPieces('iPr', false, writeMark({ italic: true, bold: true }) + '.' + writeMark({ underline: true }));
    expect(p).toEqual([
      { text: 'i', at: 0, italic: true, bold: true },
      { text: 'P', at: 1 },
      { text: 'r', at: 2, underline: true },
    ]);
  });

  it('keep a bold or underlined prefix when the alkyl look makes it italic', () => {
    const r = styleLabel('tBu', writeMark({ bold: true }) + '..', 'italic');
    expect(readMark(r.marks![0])).toMatchObject({ italic: true, bold: true });
  });
});

describe('mixed labels in CDXML', () => {
  it('writes each character\'s look as runs and reads it back', () => {
    const marks = writeMark({ italic: true }) + writeMark({ bold: true }) + writeMark({ underline: true }) + writeMark({ pos: 'down', italic: true, bold: true });
    expect(labelRuns('iPrX', { supDigits: false, marks })).toEqual([
      { text: 'i', formula: true, italic: true },
      { text: 'P', formula: true, bold: true },
      { text: 'r', formula: true, underline: true },
      { text: 'X', sub: true, italic: true, bold: true },
    ]);
    const doc = new Doc();
    labelled(doc, 'iPrX', marks);
    const xml = writeCdxml(doc);
    // face bits: bold 1, italic 2, underline 4, formula 96, subscript 32
    expect(xml).toMatch(/face="98">i<\/s><s [^>]*face="97">P<\/s><s [^>]*face="100">r<\/s><s [^>]*face="35">X<\/s>/);
    const back = [...readCdxml(xml).doc.atoms.values()].find((a) => a.label === 'iPrX')!;
    expect(back.labelMarks).toBe(marks);
  });

  it('reads ChemDraw\'s italic i of i-Pr, and a label bold throughout as the label\'s own face', () => {
    expect(labelLookOf([{ text: 'i', formula: true, italic: true }, { text: '-Pr', formula: true }], 'i-Pr').marks).toBe('/...');
    expect(labelLookOf([{ text: 'OMe', formula: true, bold: true }], 'OMe').marks).toBeUndefined();
  });

  it('goes into PowerPoint and back (slides keep each drawing as CDXML)', async () => {
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
    const opts: PptxOptions = {
      async picture(doc) {
        const pts = [...doc.atoms.values()];
        if (!pts.length) return null;
        const b = boxOf(pts);
        return { svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', png: PNG, box: { x1: b.x1 - 5, y1: b.y1 - 5, x2: b.x2 + 5, y2: b.y2 + 5 } };
      },
      async svgToPng() { return PNG; },
    };
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    d.addSlide('blank');
    const marks = '/' + writeMark({ bold: true }) + '.';
    labelled(host, 'iPr', marks);
    const bytes = await writePptx({ size: d.size, master: d.master, slides: d.slides.map((s, i) => ({ layout: s.layout, doc: d.docOf(i), notes: s.notes })) }, opts);
    const back = readPptx(bytes);
    expect(back.slides[1].contents.atoms.find((a) => a.label === 'iPr')?.labelMarks).toBe(marks);
  });

  it('is kept in Word and Excel files (their drawings\' contents are kept as they are)', () => {
    const doc = new Doc();
    const marks = writeMark({ underline: true }) + '..';
    labelled(doc, 'iPr', marks);
    const again = new Doc();
    again.restoreContents(JSON.parse(JSON.stringify(doc.contents())));
    expect([...again.atoms.values()].find((a) => a.label === 'iPr')?.labelMarks).toBe(marks);
  });
});

describe('text retyped in a plain box', () => {
  it('keeps the look of the characters that stayed', () => {
    const runs = [{ text: 'n', italic: true }, { text: '-BuLi, THF' }];
    expect(retextRuns(runs, 'n-BuLi, Et2O')).toEqual([{ text: 'n', italic: true }, { text: '-BuLi, Et2O' }]);
    expect(retextRuns(runs, 'tn-BuLi, THF')[0]).toMatchObject({ text: 'tn', italic: true });
    expect(retextRuns(runs, '')).toEqual([]);
  });

  it('keeps an italic word in a slide title edited in the Outline View', () => {
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    const doc = d.docOf(0);
    const title = [...doc.captions.values()].find((c) => c.ph === 'title' || c.ph === 'ctrTitle');
    if (!title) return;
    doc.edit('t', () => doc.updateCaption(title.id, { runs: [{ text: 'The ' }, { text: 'E', italic: true }, { text: ' isomer' }] }));
    doc.edit('t', () => applyOutline(doc, 'The E isomers', slideOutline(doc).body));
    expect(doc.captions.get(title.id)!.runs).toEqual([{ text: 'The ' }, { text: 'E', italic: true }, { text: ' isomers' }]);
  });
});

describe('the Smart Scheme pane\'s rows', () => {
  it('give each piece its own bold, italic and underline', () => {
    const like = { text: 'x', size: 10, italic: true };
    expect(partsRuns([{ text: 'n', italic: true }, { text: '-BuLi' }], like, true)).toEqual([{ text: 'n', size: 10, italic: true }, { text: '-BuLi', size: 10 }]);
    // retyped by name, the text keeps the first run's look
    expect(partsRuns([{ text: 'BuLi' }], like)).toEqual([{ text: 'BuLi', size: 10, italic: true }]);
  });

  it('set italics on the selected characters with Ctrl+I', () => {
    let got: unknown = null;
    const f = new RichField([{ text: 'nBuLi' }], { placeholder: '', label: 'row', chem: () => false, looks: true, done: (p) => { got = p; } });
    document.body.append(f.el);
    f.el.focus();
    f.select(0, 1);
    f.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, bubbles: true }));
    expect(f.parts()).toEqual([{ text: 'n', italic: true }, { text: 'BuLi' }]);
    expect(f.hasLook('italic')).toBe(true);
    f.commit();
    expect(got).toEqual([{ text: 'n', italic: true }, { text: 'BuLi' }]);
    f.el.remove();
  });
});

describe('the spreadsheet\'s cell box', () => {
  it('makes the selected characters italic even before the browser reports the selection', () => {
    const inp = new RichInput();
    // (jsdom gives the focus only to elements with a tab stop)
    inp.el.tabIndex = 0;
    document.body.append(inp.el);
    inp.setText('pqr');
    inp.focus();
    inp.setSelectionRange(3, 3);
    // the selection moves (Shift+Left) but no selectionchange has come yet
    const node = inp.el.firstChild!.firstChild ?? inp.el.firstChild!;
    getSelection()!.setBaseAndExtent(node, 1, node, 2);
    inp.toggle('italic');
    expect(inp.charLooks.map((l) => !!l.italic)).toEqual([false, true, false]);
    inp.el.remove();
  });
});
