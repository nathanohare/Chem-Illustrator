// @vitest-environment jsdom
//
// PowerPoint cuts a tag's value at 5,242,879 characters when it saves, without a word. Values
// longer than 4,000,000 characters are written in pieces in the same tag list and joined again
// when read; a value cut short by PowerPoint (in a file an older version wrote) is warned about.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { Doc } from '../src/model';
import { defaultMaster, type Master } from '../src/deck/deck';
import { writePptx, tagPieces, joinTagPieces, tagLooksCut, TAG, TAG_CUT, TAG_PIECE, type DeckData, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; } };
const unescape = (v: string) => v.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const escape = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

describe('tag values in pieces', () => {
  it('splits a long value into pieces of at most 4,000,000 characters and joins them again', () => {
    const v = 'ab'.repeat(4_500_001);
    const pieces = tagPieces('NAME', v);
    expect(pieces.map(([k]) => k)).toEqual(['NAME', 'NAME__2', 'NAME__3', 'NAME__PARTS']);
    expect(pieces.every(([, x]) => x.length <= TAG_PIECE)).toBe(true);
    expect(joinTagPieces(Object.fromEntries(pieces))).toEqual({ NAME: v });
    // short values as they are
    expect(tagPieces('NAME', 'short')).toEqual([['NAME', 'short']]);
    // a character written as a surrogate pair is never split between two pieces
    const astral = 'x'.repeat(TAG_PIECE - 1) + '\u{1F600}' + 'y';
    const p2 = tagPieces('N', astral);
    expect(p2[0][1].length).toBe(TAG_PIECE - 1);
    expect(joinTagPieces(Object.fromEntries(p2)).N).toBe(astral);
  });

  it('tells a value PowerPoint cut short', () => {
    expect(tagLooksCut('{"a":"' + 'x'.repeat(TAG_CUT - 6))).toBe(true);
    expect(tagLooksCut('<CDXML>' + 'x'.repeat(TAG_CUT - 7))).toBe(true);
    expect(tagLooksCut('{"a":"' + 'x'.repeat(TAG_CUT - 8) + '"}')).toBe(false);
    expect(tagLooksCut('{"a":1}')).toBe(false);
  });

  it('saves a long tag in pieces PowerPoint keeps whole, and reads it back', async () => {
    const big = 'x'.repeat(6_000_000);
    // (a setting carried only in the master's tag, standing in for a big drawing or picture)
    const master = { ...defaultMaster(), bigNote: big } as Master;
    const bytes = await writePptx({ size: { w: 960, h: 540 }, master, slides: [{ layout: 'blank', doc: new Doc(), notes: '' }] } as DeckData, opts);
    const files = unzipSync(bytes);
    const tagPart = Object.keys(files).find((k) => k.startsWith('ppt/tags/') && strFromU8(files[k]).includes(TAG.master))!;
    const xml = strFromU8(files[tagPart]);
    const vals = [...xml.matchAll(/<p:tag name="([^"]*)" val="([^"]*)"\/>/g)].map((m) => [m[1], unescape(m[2])]);
    expect(vals.every((m) => m[1].length <= TAG_PIECE)).toBe(true);
    expect(vals.map((m) => m[0])).toContain(`${TAG.master}__PARTS`);
    const got = readPptx(bytes);
    expect((got.master as Master & { bigNote?: string }).bigNote?.length).toBe(big.length);
    expect(got.warnings.join(' ')).not.toMatch(/cut short/);

    // the same tag as an older version wrote it, whole: still read
    const joined = joinTagPieces(Object.fromEntries(vals))[TAG.master];
    expect(joined.length).toBeGreaterThan(TAG_CUT);
    const withTag = (val: string, more = '') => {
      const out = { ...files };
      out[tagPart] = new Uint8Array(strToU8(xml.replace(/<p:tag [^>]*\/>/g, '').replace('</p:tagLst>', `<p:tag name="${TAG.master}" val="${escape(val)}"/>${more}</p:tagLst>`)));
      return zipSync(out);
    };
    const old = readPptx(withTag(joined));
    expect((old.master as Master & { bigNote?: string }).bigNote?.length).toBe(big.length);
    expect(old.warnings.join(' ')).not.toMatch(/cut short/);

    // and as PowerPoint cut it: warned about, and the file still opens
    const cut = readPptx(withTag(joined.slice(0, TAG_CUT)));
    expect(cut.warnings.join(' ')).toMatch(/cut short/);
    expect((cut.master as Master & { bigNote?: string }).bigNote).toBeUndefined();

    // a piece gone missing: warned about too
    const lost = readPptx(withTag(joined.slice(0, TAG_PIECE), `<p:tag name="${TAG.master}__PARTS" val="2"/>`));
    expect(lost.warnings.join(' ')).toMatch(/cut short/);
  }, 60_000);
});
