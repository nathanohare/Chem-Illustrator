// @vitest-environment jsdom
//
// Laptop bench pp-compare-decks: a picture put on a slide was saved below the slide's empty
// placeholders, so in PowerPoint a click on the picture picked the placeholder. Empty
// placeholders go at the back, each keeping its place among the layout's.

import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { Doc } from '../src/model';
import { Deck } from '../src/deck/deck';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';

const DOT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; } };

describe('empty placeholders', () => {
  it('go behind pictures, keeping which of the layout\'s placeholders they are', async () => {
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    d.setLayout('two-content');
    const bodies = [...host.captions.values()].filter((c) => c.ph === 'body').sort((p, q) => p.x - q.x);
    host.edit('Fill', () => {
      host.updateCaption(bodies[0].id, { runs: [{ text: 'Left side' }] });
      host.addShape({ kind: 'picture', x1: 520, y1: 160, x2: 860, y2: 420, src: DOT, px: { w: 1, h: 1 } });
    });
    const bytes = await writePptx({ size: d.size, master: d.master, slides: d.slides.map((s, i) => ({ layout: s.layout, doc: d.docOf(i), notes: s.notes })) }, opts);
    const xml = strFromU8(unzipSync(bytes)['ppt/slides/slide1.xml']);
    const pic = xml.indexOf('<p:pic>');
    const sps = [...xml.matchAll(/<p:sp>.*?<\/p:sp>/g)].map((m) => ({ at: m.index!, ph: /<p:ph[^>]*>/.exec(m[0])?.[0] ?? '', text: /<a:t>([^<]*)/.exec(m[0])?.[1] ?? '' }));
    const empty = sps.find((x) => /idx="2"/.test(x.ph))!;
    const left = sps.find((x) => x.text === 'Left side')!;
    // the empty right one (the layout's second body) behind the picture; the left one, with text, in front
    expect(empty.at).toBeLessThan(pic);
    expect(left.ph).toContain('idx="1"');
    expect(left.at).toBeGreaterThan(pic);
    // and both come back where they were
    const back = readPptx(bytes).slides[0].contents.captions.filter((c) => c.ph === 'body').sort((p, q) => p.x - q.x);
    expect(back.map((c) => c.runs.map((r) => r.text).join(''))).toEqual(['Left side', '']);
  });
});
