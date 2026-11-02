// @vitest-environment jsdom
//
// Figures (Insert > Figure): a structure's set area on the page. The page lays it out at its
// area's size (not its structures'), so drawing inside it never moves the text; an empty one
// still takes its room; and it comes back from a Word file as a figure, area and all.

import { describe, it, expect } from 'vitest';
import { strToU8 } from 'fflate';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { drawingOwnSize, emptyContents, newDocument, objectRun, paraFromStyle, runStyleOf, type DocText, type FigureFrame } from '../src/document/document';
import { DocLayouter } from '../src/document/doc-layout';
import * as rt from '../src/richtext';
import type { Contents, TextRun } from '../src/model';

const empty = (): Contents => ({ atoms: [], bonds: [], captions: [], arrows: [], shapes: [] });
const labelled = (label: string): Contents => ({ ...empty(), captions: [{ id: 1, x: 10, y: 10, runs: [{ text: label }], justify: 'left' }] });

/** A document of one drawing (a figure when `frame` is given), floating with text round it or in its line. */
function docOf(c: Contents, frame?: FigureFrame, float = false): DocText {
  const d = newDocument();
  const n = runStyleOf(d.styles.Normal);
  const runs: TextRun[] = [{ ...n, text: 'Before\n' }, objectRun(1, n), { ...n, text: '\nAfter' }];
  const N = paraFromStyle(d.styles.Normal, {});
  return {
    ...d, runs: rt.normalizeRuns(runs), paras: [N, N, N],
    objects: { 1: { kind: 'drawing', contents: c, ...(frame ? { frame } : {}), ...(float ? { float: { wrap: 'square' as const, x: 200, y: 0 } } : {}) } },
  };
}

/** Structures' own size: 10 points a letter, as a stand-in for drawing them. */
const natural = (c: Contents) => ({ w: 10 * (c.captions[0]?.runs[0]?.text.length ?? 2), h: 20 });
const layouter = () => new DocLayouter({ measure: (t: string, size: number) => t.length * size * 0.5, drawingSize: (c) => natural(c) });

describe('figures', () => {
  it('take their area\'s size, whatever is drawn in them', () => {
    const fr = { x: 0, y: 0, w: 216, h: 144 };
    expect(drawingOwnSize({ frame: fr }, () => ({ w: 1, h: 1 }))).toEqual({ w: 216, h: 144 });
    expect(drawingOwnSize({}, () => ({ w: 30, h: 20 }))).toEqual({ w: 30, h: 20 });
    const small = layouter().layout(docOf(labelled('ab'), fr)).objects.find((o) => o.id === 1)!;
    const big = layouter().layout(docOf(labelled('abcdefghij'), fr)).objects.find((o) => o.id === 1)!;
    expect([small.w, small.h]).toEqual([216, 144]);
    expect([big.w, big.h]).toEqual([216, 144]);
    // a plain structure is sized by what is drawn
    const plain = layouter().layout(docOf(labelled('abcdefghij'))).objects.find((o) => o.id === 1)!;
    expect([plain.w, plain.h]).toEqual([100, 20]);
  });

  it('keeps the text round it where it was while its structures change', () => {
    const fr = { x: 0, y: 0, w: 150, h: 100 };
    const lines = (c: Contents) => layouter().layout(docOf(c, fr, true)).text.lines.map((l) => [l.x, l.y, l.width]);
    expect(lines(labelled('a'))).toEqual(lines(labelled('a much longer label')));
    // and an empty figure takes its room too
    expect(emptyContents(empty())).toBe(true);
    expect(lines(empty())).toEqual(lines(labelled('a')));
  });

  it('comes back from a Word file as a figure, its area and its structures as they were', async () => {
    const asked: (FigureFrame | undefined)[] = [];
    const deps: DocxDeps = {
      async picture(c, _s, frame) {
        asked.push(frame);
        const w = frame ? frame.w : natural(c).w, h = frame ? frame.h : 20;
        return { png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...strToU8(`${w}x${h}`)]), w, h };
      },
    };
    for (const c of [labelled('benzene'), empty()]) {
      asked.length = 0;
      const fr = { x: -12, y: -6, w: 216, h: 144 };
      const bytes = await writeDocx(docOf(c, fr, true), deps);
      // Word gets a picture of the whole area
      expect(asked).toEqual([fr]);
      const { doc } = await readDocx(bytes);
      const o = Object.values(doc.objects).find((x) => x.kind === 'drawing');
      expect(o?.kind).toBe('drawing');
      if (o?.kind !== 'drawing') return;
      expect(o.frame).toEqual(fr);
      expect(o.contents.captions.map((x) => x.runs[0]?.text)).toEqual(c.captions.map((x) => x.runs[0]?.text));
      expect(o.float?.wrap).toBe('square');
      expect(o.scale).toBeUndefined();
    }
  });
});
