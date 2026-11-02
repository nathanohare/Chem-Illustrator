// @vitest-environment jsdom
//
// Journal figure preflight: a figure is checked at the size it will be printed (a figure too wide
// for the column is shrunk, and its text and lines with it) against the journal's published
// rules, and the fixes make small text, thin lines and other fonts what the journal asks for.

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { recordPicture } from '../src/render/picture';
import { plainMeasure } from '../src/chem/reaction';
import { shapeBox } from '../src/objects';
import { journalById, preflight, pictureDpi, isColour, preflightSummary, type PreflightIssue } from '../src/preflight';
import { enlargeText, thickenLines, useArial } from '../src/preflight-fix';
import type { Item } from '../src/render/vector';

const acs = journalById('acs')!;
const nature = journalById('nature')!;
const elsevier = journalById('elsevier')!;

/** A chain of `n` carbons across the page, with a caption under it. */
function chain(n: number, caption = { size: 10, font: 'Arial' }): Doc {
  const doc = new Doc();
  const L = doc.style.bondLength;
  doc.edit('build', () => {
    let prev = doc.addAtom(0, 0, 6).id;
    for (let i = 1; i < n; i++) {
      const a = doc.addAtom(i * L * 0.866, i % 2 ? L / 2 : 0, 6).id;
      doc.addBond(prev, a, 1);
      prev = a;
    }
    doc.addCaption({ x: 0, y: 40, runs: [{ text: 'Scheme 1', size: caption.size, font: caption.font }], justify: 'left' });
  });
  return doc;
}

const check = (doc: Doc, j = acs, size = 'single', how: 'drawn' | 'fill' = 'drawn') => {
  const pic = recordPicture(doc, 0)!;
  return preflight(pic.items, pic.box, j, size, how);
};
const rules = (r: ReturnType<typeof check>, level?: string) => r.issues.filter((i) => !level || i.level === level).map((i) => i.rule);
const ctx = (doc: Doc) => {
  const m = plainMeasure(doc);
  return { captionBox: (id: number) => m.captionBox(doc.captions.get(id)!), shapeBox: (id: number) => shapeBox(doc.shapes.get(id)!) };
};
const issue = (r: ReturnType<typeof check>, rule: PreflightIssue['rule']) => r.issues.find((i) => i.rule === rule)!;

describe('journal figure preflight', () => {
  it('passes a small structure drawn in the ACS style for one ACS column', () => {
    const r = check(chain(5));
    expect(r.scale).toBe(1);
    expect(rules(r, 'error')).toEqual([]);
    expect(rules(r, 'warning')).toEqual([]);
    expect(rules(r, 'ok')).toEqual(expect.arrayContaining(['width', 'height', 'text-min', 'fonts', 'line-min']));
    expect(r.kind).toBe('line');
    expect(r.dpi).toBe(1200);
    expect(preflightSummary(r)).toMatch(/^Ready for ACS journals/);
  });

  it('checks a figure too wide for the column at the size the journal shrinks it to', () => {
    const doc = chain(30);
    const r = check(doc);
    expect(r.w).toBeGreaterThan(240);
    expect(r.scale).toBeCloseTo(240 / r.w, 5);
    const w = issue(r, 'width');
    expect(w.level).toBe('warning');
    expect(w.fix).toBe('fit');
    // 0.6 pt bonds shrunk below 0.5 pt break ACS's thinnest line
    expect(r.issues.some((i) => i.rule === 'line-min' && i.level === 'error')).toBe(true);
    // two columns have room for it as drawn
    const two = check(doc, acs, 'double');
    expect(two.scale).toBe(1);
    expect(issue(two, 'width').level).toBe('ok');
  });

  it('flags text below the smallest size once printed, and Enlarge Text fixes it', () => {
    const doc = chain(5, { size: 3.5, font: 'Arial' });
    const r = check(doc);
    const t = issue(r, 'text-min');
    expect(t.level).toBe('error');
    expect(t.where!.length).toBeGreaterThan(0);
    expect(enlargeText(doc, t, ctx(doc))).toBe(true);
    const cap = [...doc.captions.values()][0];
    expect(cap.runs[0].size).toBeGreaterThanOrEqual(4.5);
    expect(issue(check(doc), 'text-min').level).toBe('ok');
  });

  it('enlarges atom labels through the drawing style', () => {
    const doc = new Doc();
    doc.edit('b', () => {
      doc.setStyle({ ...doc.style, labelSize: 4 }); const a = doc.addAtom(0, 0, 8).id, b = doc.addAtom(20, 0, 6).id; doc.addBond(a, b, 1); });
    const t = issue(check(doc), 'text-min');
    expect(t.level).toBe('error');
    expect(enlargeText(doc, t, ctx(doc))).toBe(true);
    expect(doc.style.labelSize).toBeGreaterThanOrEqual(4.5);
  });

  it('flags lines thinner than the journal allows, and Thicken Lines fixes shapes and bonds', () => {
    const doc = chain(4);
    doc.edit('box', () => { doc.setStyle({ ...doc.style, lineWidth: 0.3 }); doc.addShape({ kind: 'rect', x1: -10, y1: -10, x2: 60, y2: 60, lineWidth: 0.2 }); });
    const r = check(doc);
    const l = issue(r, 'line-min');
    expect(l.level).toBe('error');
    expect(thickenLines(doc, l, ctx(doc))).toBe(true);
    expect([...doc.shapes.values()][0].lineWidth).toBeGreaterThanOrEqual(0.5);
    expect(doc.style.lineWidth).toBeGreaterThanOrEqual(0.5);
    expect(issue(check(doc), 'line-min').level).toBe('ok');
  });

  it('warns about fonts the journal does not ask for, and Use Arial changes them', () => {
    const doc = chain(4, { size: 10, font: 'Comic Sans MS' });
    const f = issue(check(doc), 'fonts');
    expect(f.level).toBe('warning');
    expect(f.fonts).toEqual(['Comic Sans MS']);
    expect(useArial(doc, f.fonts!)).toBe(true);
    expect([...doc.captions.values()][0].runs[0].font).toBe('Arial');
    expect(issue(check(doc), 'fonts').level).toBe('ok');
  });

  it('takes Times for Elsevier but not for Nature', () => {
    const doc = chain(4, { size: 7, font: 'Times New Roman' });
    expect(issue(check(doc, elsevier, 'single'), 'fonts').level).toBe('ok');
    expect(issue(check(doc, nature, 'single'), 'fonts').level).toBe('warning');
  });

  it('warns about text over Nature\'s 7 pt largest size, but not 8 pt bold panel letters', () => {
    const doc = chain(4, { size: 12, font: 'Arial' });
    doc.edit('panel', () => { doc.addCaption({ x: -20, y: -20, runs: [{ text: 'a', size: 8, bold: true, font: 'Arial' }], justify: 'left' }); });
    const big = issue(check(doc, nature, 'single'), 'text-max');
    expect(big.level).toBe('warning');
    // the 12 pt caption and the 10 pt atom labels, not the panel letter
    expect(big.title).toMatch(/largest 12 pt/);
  });

  it('fills the width when asked, bigger or smaller', () => {
    const r = check(chain(5), acs, 'single', 'fill');
    expect(r.scale).toBeGreaterThan(1);
    expect(r.w * r.scale).toBeCloseTo(240, 3);
  });

  it('works out a picture\'s resolution at its printed size', () => {
    const im = { kind: 'image', src: '', x: 0, y: 0, w: 144, h: 72, px: { w: 600, h: 300 } } as Extract<Item, { kind: 'image' }>;
    expect(pictureDpi(im, 1)).toBeCloseTo(300, 5);
    expect(pictureDpi(im, 0.5)).toBeCloseTo(600, 5);
    expect(pictureDpi({ ...im, crop: { l: 0.25, t: 0, r: 0.25, b: 0 } }, 1)).toBeCloseTo(150, 5);
    const r = preflight([im], { x1: 0, y1: 0, x2: 144, y2: 72 }, acs, 'single');
    expect(issue(r, 'pictures').level).toBe('ok');
    const low = preflight([{ ...im, px: { w: 200, h: 100 } }], { x1: 0, y1: 0, x2: 144, y2: 72 }, acs, 'single');
    expect(issue(low, 'pictures').level).toBe('error');
    expect(low.kind).toBe('combination');
  });

  it('tells colour from black, white and greys', () => {
    expect(isColour('#000')).toBe(false);
    expect(isColour('#808080')).toBe(false);
    expect(isColour('rgba(0,0,0,0)')).toBe(false);
    expect(isColour('#d32f2f')).toBe(true);
    expect(isColour('rgb(40, 120, 255)')).toBe(true);
  });

  it('checks a table of contents graphic against its box', () => {
    const r = check(chain(25), acs, 'toc');
    expect(r.w).toBeGreaterThan(3.25 * 72);
    expect(issue(r, 'width').level).toBe('warning');
    expect(r.scale).toBeLessThan(1);
  });
});
