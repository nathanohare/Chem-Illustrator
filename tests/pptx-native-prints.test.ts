// @vitest-environment jsdom
//
// What Chemweave keeps in its own PowerPoint tags (text boxes, tables, design shapes,
// connectors, charts) is used only while PowerPoint has not changed the slide's own markup under
// it. Each tag carries a print of that markup as written (native-print.ts): text bolded or
// recoloured in PowerPoint with its words unchanged, a shape recoloured or changed to another
// shape, a link taken away, a chart changed to another type, comes back as PowerPoint has it.
// A plain PowerPoint save (attributes in another order, runs split by the spell checker, settings
// at their defaults left out) changes no print.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { Doc, type Arrow, type Shape, type TableData, type TextRun } from '../src/model';
import { Deck, defaultMaster } from '../src/deck/deck';
import { writePptx, TAG, type DeckData, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
import { layoutTable } from '../src/table';
import { arialWidth } from '../src/text-metrics';
import { newChartBox } from '../src/sheet/chart-box';
import { textPrint, spPrPrint, fragment } from '../src/io/native-print';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; } };

type Parts = Record<string, Uint8Array>;
const rezip = (p: Parts) => zipSync(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, new Uint8Array(v)])));
/** The file with one slide's XML edited (as PowerPoint would save it). */
const edited = (p: Parts, slide: string, f: (x: string) => string): Uint8Array => {
  const was = strFromU8(p[slide]);
  const now = f(was);
  expect(now).not.toBe(was);
  return rezip({ ...p, [slide]: new Uint8Array(strToU8(now)) });
};

/** A deck of the slides each made by `fill` on a blank slide. */
async function deckWith(...fill: ((doc: Doc) => void)[]): Promise<Parts> {
  const host = new Doc();
  const d = Deck.blank(host);
  d.attach();
  for (const f of fill) {
    d.addSlide('blank');
    host.edit('x', () => f(host));
  }
  const data: DeckData = { size: d.size, master: d.master, slides: d.slides.map((s, i) => ({ id: i + 1, layout: s.layout, doc: d.docOf(i), notes: s.notes })) };
  return unzipSync(await writePptx(data, opts));
}

const SLIDE2 = 'ppt/slides/slide2.xml';

describe('text boxes formatted in PowerPoint', () => {
  // a text box with a setting PowerPoint has no place for (read as chemistry, set by hand)
  const box = (doc: Doc) => { doc.addCaption({ x: 300, y: 100, runs: [{ text: 'Plain words here' }], justify: 'left', chem: false }); };

  it('keeps its own copy while PowerPoint has only saved it again', async () => {
    const p = await deckWith(box);
    // PowerPoint's own way of saving the same text: attributes in another order, the end mark
    // dropped, a run split where its spell checker marked a word
    const back = readPptx(edited(p, SLIDE2, (x) => x
      .replace(/<a:pPr algn="l" marL="0" indent="0">/, '<a:pPr marL="0" indent="0" algn="l">')
      .replace(/<a:endParaRPr[^>]*\/>/, '')
      .replace(/<a:r>(<a:rPr (?:(?!<a:r>)[\s\S])*?<\/a:rPr>)<a:t>Plain words here<\/a:t><\/a:r>/, (_m, pr: string) =>
        `<a:r>${pr}<a:t>Plain </a:t></a:r><a:r>${pr.replace('<a:rPr ', '<a:rPr err="1" ')}<a:t>words</a:t></a:r><a:r>${pr}<a:t> here</a:t></a:r>`)));
    const c = back.slides[1].contents.captions[0];
    expect(c.runs.map((r) => r.text).join('')).toBe('Plain words here');
    expect(c.chem).toBe(false);
  });

  it('comes back bold and red when made so in PowerPoint, its words unchanged', async () => {
    const p = await deckWith(box);
    const back = readPptx(edited(p, SLIDE2, (x) => x.replace(/<a:rPr ([^>]*?)>(?:(?!<a:rPr)[\s\S])*?<\/a:rPr>(<a:t>Plain words here)/, '<a:rPr $1 b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:latin typeface="Arial"/></a:rPr>$2')));
    const c = back.slides[1].contents.captions[0];
    expect(c.runs.map((r) => r.text).join('')).toBe('Plain words here');
    expect(c.runs.every((r) => r.bold)).toBe(true);
    expect(c.runs[0].color?.toLowerCase()).toBe('#ff0000');
    // what PowerPoint has no place for is still kept
    expect(c.chem).toBe(false);
  });

  it('keeps a link to a slide deleted in PowerPoint no more (PowerPoint took it away)', async () => {
    // slide 2 links to slide 3 (by its id here, 3)
    const link = (doc: Doc) => { doc.addCaption({ x: 100, y: 100, runs: [{ text: 'Go to the ring', link: '#slide=3' }], justify: 'left' }); };
    const p = await deckWith(link, (doc) => box(doc), (doc) => { doc.addCaption({ x: 100, y: 100, runs: [{ text: 'Third' }], justify: 'left' }); });
    const pres = strFromU8(p['ppt/presentation.xml']);
    const ids = [...pres.matchAll(/<p:sldId id="\d+" r:id="[^"]+"\/>/g)].map((m) => m[0]);
    const links = (bytes: Uint8Array) => readPptx(bytes).slides[1].contents.captions[0].runs.map((r) => r.link).filter(Boolean);
    expect(links(rezip(p))).toEqual(['#slide-n=2']);
    // slide 3 deleted: PowerPoint drops it from the list and takes the link to it off slide 2's text
    const gone = { ...p, 'ppt/presentation.xml': new Uint8Array(strToU8(pres.replace(ids[2], ''))) };
    const back = edited(gone, SLIDE2, (x) => x.replace(/<a:hlinkClick[^>]*>[\s\S]*?<\/a:hlinkClick>|<a:hlinkClick[^>]*\/>/, ''));
    expect(readPptx(back).slides).toHaveLength(3);
    // (the slide that is third now was given id 3 when the deck was read: the old link would go there)
    expect(links(back)).toEqual([]);
  });
});

describe('tables formatted in PowerPoint', () => {
  const R = (text: string): { runs: TextRun[] } => ({ runs: [{ text }] });
  const table = (doc: Doc) => {
    const t: TableData = { cols: [60, 60], rows: [[R('entry'), R('yield')], [R('1'), R('45')]], head: 1, lines: 'acs', size: 14 };
    const lay = layoutTable(t, doc.style.captionSize, (s, z, _f, st) => arialWidth(s, z, /bold/.test(st)));
    doc.addShape({ kind: 'table', x1: 100, y1: 120, x2: 100 + lay.width, y2: 120 + lay.height, table: t });
  };

  it('keeps a cell made bold there', async () => {
    const p = await deckWith(table);
    const cell = (bytes: Uint8Array) => readPptx(bytes).slides[1].contents.shapes.find((s) => s.kind === 'table')!.table!.rows[1][1];
    expect(cell(rezip(p)).runs.some((r) => r.bold)).toBe(false);
    const bold = edited(p, SLIDE2, (x) => x.replace(/<a:rPr ([^>]*?)(\/>|>(?:(?!<a:rPr)[\s\S])*?<\/a:rPr>)(<a:t>45<\/a:t>)/, '<a:rPr $1 b="1"$2$3'));
    expect(cell(bold).runs.map((r) => r.text).join('')).toBe('45');
    expect(cell(bold).runs.every((r) => r.bold)).toBe(true);
  });
});

describe('design shapes changed in PowerPoint', () => {
  const geo = (doc: Doc) => {
    doc.addShape({ kind: 'geo', geo: 'roundRect', x1: 100, y1: 100, x2: 300, y2: 200, color: '#000000', filled: true, fillColor: '#4472c4', link: 'https://example.org/a', text: { runs: [{ text: 'Box' }] } } as Omit<Shape, 'id'>);
  };
  const read = (bytes: Uint8Array) => readPptx(bytes).slides[1].contents.shapes.find((s) => s.kind === 'geo')!;

  it('come back as saved when unchanged', async () => {
    const s = read(rezip(await deckWith(geo)));
    expect(s.geo).toBe('roundRect');
    expect(s.fillColor?.toLowerCase()).toBe('#4472c4');
    expect(s.link).toBe('https://example.org/a');
  });

  it('take a new fill, a new shape and a removed link from PowerPoint', async () => {
    const p = await deckWith(geo);
    expect(read(edited(p, SLIDE2, (x) => x.replace(/<a:srgbClr val="4472C4"(\/>|><\/a:srgbClr>)/, '<a:srgbClr val="FF0000"/>'))).fillColor?.toLowerCase()).toBe('#ff0000');
    expect(read(edited(p, SLIDE2, (x) => x.replace('prst="roundRect"', 'prst="ellipse"'))).geo).toBe('ellipse');
    const unlinked = read(edited(p, SLIDE2, (x) => x.replace(/<a:hlinkClick[^>]*\/>/, '').replace(/<p:cNvPr ([^>]*)><\/p:cNvPr>/, '<p:cNvPr $1/>')));
    expect(unlinked.link).toBeUndefined();
    // the rest of the shape as saved
    expect(unlinked.fillColor?.toLowerCase()).toBe('#4472c4');
  });

  it('see a PowerPoint save that leaves out settings at their defaults as unchanged', () => {
    const spPr = (bevel: string) => fragment(`<p:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="4472c4"/></a:solidFill><a:effectLst><a:reflection stA="50000" stPos="0" endA="0" endPos="55000" dist="0" dir="5400000" sy="-100000" algn="bl" rotWithShape="0"/></a:effectLst><a:sp3d>${bevel}</a:sp3d></p:spPr>`);
    const ppt = fragment('<p:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="4472C4"/></a:solidFill><a:effectLst><a:reflection stA="50000" endPos="55000" dir="5400000" sy="-100000" algn="bl" rotWithShape="0"/></a:effectLst><a:sp3d><a:bevelT/></a:sp3d></p:spPr>');
    expect(spPrPrint(ppt, 'look')).toBe(spPrPrint(spPr('<a:bevelT w="76200" h="76200" prst="circle"/>'), 'look'));
    expect(spPrPrint(ppt, 'look')).not.toBe(spPrPrint(spPr('<a:bevelT w="38100" h="76200" prst="circle"/>'), 'look'));
    // and text whose words have no look of their own prints the same split or not
    const one = fragment('<p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" b="1"/><a:t>ab</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody>');
    const two = fragment('<p:txBody><a:bodyPr/><a:p><a:r><a:rPr b="1" lang="en-GB" err="1"/><a:t>a</a:t></a:r><a:r><a:rPr b="1"/><a:t>b</a:t></a:r></a:p></p:txBody>');
    expect(textPrint(one)).toBe(textPrint(two));
  });
});

describe('connectors changed in PowerPoint', () => {
  it('take the line colour PowerPoint gave them', async () => {
    const p = await deckWith((doc) => {
      doc.addArrow({ tail: { x: 100, y: 100 }, head: { x: 300, y: 100 }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 10, headWidth: 4, elbow: true } as Omit<Arrow, 'id'>);
    });
    const arrow = (bytes: Uint8Array) => readPptx(bytes).slides[1].contents.arrows[0];
    expect(arrow(rezip(p)).color ?? '#000000').toBe('#000000');
    const red = edited(p, SLIDE2, (x) => x.replace(/(<a:ln [^>]*>)<a:solidFill><a:srgbClr val="000000"\/><\/a:solidFill>/, '$1<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>'));
    expect(arrow(red).color?.toLowerCase()).toBe('#ff0000');
    expect(arrow(red).elbow).toBe(true);
  });
});

describe('charts changed in PowerPoint', () => {
  it('come back as the type PowerPoint has', async () => {
    const d = Deck.design(new Doc(), { w: 960, h: 540 });
    const sd = d.docOf(0);
    sd.edit('chart', () => sd.addShape({ kind: 'picture', x1: 100, y1: 80, x2: 460, y2: 296, src: 'data:image/png;base64,AA==', chart: newChartBox('column') }));
    const p = unzipSync(await writePptx({ size: d.size, master: defaultMaster(), slides: [{ layout: 'blank', doc: sd, notes: '' }] }, opts));
    const path = Object.keys(p).find((n) => /ppt\/charts\/chart\d+\.xml$/.test(n))!;
    const tag = Object.keys(p).filter((n) => /ppt\/tags\//.test(n)).map((n) => strFromU8(p[n])).find((x) => x.includes(TAG.chart));
    expect(tag).toContain('&quot;pr&quot;');
    const kind = (bytes: Uint8Array) => readPptx(bytes).slides[0].contents.shapes.find((s) => s.chart)!.chart!.chart.kind;
    expect(kind(rezip(p))).toBe('column');
    const toLine = (x: string) => x.replace(/<c:barChart>[\s\S]*?<c:grouping val="[^"]*"\/>/, (m) => m.replace('<c:barChart>', '<c:lineChart>').replace(/<c:barDir[^>]*\/>/, '')).replace('</c:barChart>', '</c:lineChart>').replace(/<c:gapWidth[^>]*\/>|<c:overlap[^>]*\/>/g, '');
    expect(kind(edited(p, path, toLine))).toBe('line');
  });
});

describe('a deck saved by a program that drops every tag (LibreOffice)', () => {
  it('reads its structures from their pictures, and says so', async () => {
    const drawing: PptxOptions = {
      ...opts,
      async picture() { return { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', png: PNG, box: { x1: 90, y1: 90, x2: 210, y2: 210 } }; },
    };
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    d.addSlide('blank');
    host.edit('x', () => {
      const ids = Array.from({ length: 6 }, (_, i) => host.addAtom(150 + 30 * Math.cos((i * Math.PI) / 3), 150 + 30 * Math.sin((i * Math.PI) / 3)).id);
      ids.forEach((a, i) => host.addBond(a, ids[(i + 1) % 6], 1));
    });
    const p = unzipSync(await writePptx({ size: d.size, master: d.master, slides: d.slides.map((s, i) => ({ id: i + 1, layout: s.layout, doc: d.docOf(i), notes: s.notes })) }, drawing));
    expect(readPptx(rezip(p)).warnings.join(' ')).not.toMatch(/leaves out Chemweave/);
    // every tag gone, the pictures and their names kept (as LibreOffice 24.2 saves a deck)
    const lost: Parts = {};
    for (const [k, v] of Object.entries(p)) {
      if (/^ppt\/tags\//.test(k)) continue;
      lost[k] = /\.xml$/.test(k) ? new Uint8Array(strToU8(strFromU8(v).replace(/<p:custDataLst>[\s\S]*?<\/p:custDataLst>/g, ''))) : v;
    }
    expect(strFromU8(lost[SLIDE2])).toMatch(/name="Structure \d+"/);
    // the drawing rides inside each structure's SVG: the structures come back
    const back = readPptx(rezip(lost));
    expect(back.slides[1].contents.atoms).toHaveLength(6);
    expect(back.warnings.join(' ')).toMatch(/leaves out Chemweave's own data.*structures were read from their pictures/);
    // a deck saved by an older version has no drawing in its SVGs: the structures stay pictures
    const older: Parts = {};
    for (const [k, v] of Object.entries(lost)) older[k] = /\.svg$/.test(k) ? new Uint8Array(strToU8(strFromU8(v).replace(/<metadata>[\s\S]*?<\/metadata>/, ''))) : v;
    const old = readPptx(rezip(older));
    expect(old.slides[1].contents.atoms).toHaveLength(0);
    expect(old.warnings.join(' ')).toMatch(/leaves out Chemweave's own data.*structures came in as pictures/);
  });
});
