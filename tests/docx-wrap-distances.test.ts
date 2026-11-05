// @vitest-environment jsdom
//
// A floating picture's distance from the text on each side (wp:anchor distT, distB, distL and
// distR) is kept: Word's own figures keep 0.13 in at the sides and none above and below, and a
// figure wrapped top and bottom gains no room above and below it when saved.

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';
import { DocLayouter } from '../src/document/doc-layout';
import { floatGaps, type DocText, type Float } from '../src/document/document';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const DML = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
// a 2 × 1 pixel PNG
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
const deps: DocxDeps = { async picture() { return { png: PNG, w: 80, h: 40 }; }, async svgToPng() { return PNG; } };

function wordFile(dist: string, wrap = '<wp:wrapTopAndBottom/>'): Uint8Array {
  const pic = `<w:p><w:r><w:drawing><wp:anchor ${dist} simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="1828800" cy="914400"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${wrap}<wp:docPr id="1" name="Picture 1"/><wp:cNvGraphicFramePr/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="p.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdP"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1828800" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r><w:r><w:t>First</w:t></w:r></w:p>`;
  return zipSync({
    '[Content_Types].xml': new Uint8Array(strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>')),
    '_rels/.rels': new Uint8Array(strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`)),
    'word/_rels/document.xml.rels': new Uint8Array(strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdP" Type="${R}image" Target="media/p.png"/></Relationships>`)),
    'word/media/p.png': PNG,
    'word/document.xml': new Uint8Array(strToU8(`<?xml version="1.0"?><w:document ${W} ${DML}><w:body>${pic}<w:p><w:r><w:t>Second</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`)),
  });
}

const floatIn = (d: DocText): Float => Object.values(d.objects).flatMap((o) => (o.kind === 'picture' && o.float ? [o.float] : []))[0];
const anchorOf = async (d: DocText) => /<wp:anchor ([^>]*)>/.exec(strFromU8(unzipSync(await writeDocx(d, deps))['word/document.xml']))![1];
const dists = (attrs: string) => Object.fromEntries([...attrs.matchAll(/(dist[TBLR])="(\d+)"/g)].map((m) => [m[1], Number(m[2])]));

describe('distance from text on each side of a floating picture (W6)', () => {
  it('reads Word\'s own: 0.13 in at the sides, none above and below', async () => {
    const { doc } = await readDocx(wordFile('distT="0" distB="0" distL="114300" distR="114300"'));
    const fl = floatIn(doc);
    expect(floatGaps(fl)).toEqual({ t: 0, b: 0, l: 9, r: 9 });
  });

  it('saves each side\'s distance as it was, not the sides\' on all four', async () => {
    const { doc } = await readDocx(wordFile('distT="0" distB="0" distL="114300" distR="114300"'));
    expect(dists(await anchorOf(doc))).toEqual({ distT: 0, distB: 0, distL: 114300, distR: 114300 });
    const { doc: other } = await readDocx(wordFile('distT="45720" distB="45720" distL="114300" distR="91440"', '<wp:wrapSquare wrapText="bothSides"/>'));
    expect(floatGaps(floatIn(other))).toEqual({ t: 3.6, b: 3.6, l: 9, r: 7.2 });
    expect(dists(await anchorOf(other))).toEqual({ distT: 45720, distB: 45720, distL: 114300, distR: 91440 });
  });

  it('puts the text under a picture wrapped top and bottom right under it, with no room added', async () => {
    const { doc } = await readDocx(wordFile('distT="0" distB="0" distL="114300" distR="114300"'));
    const { doc: roomy } = await readDocx(wordFile('distT="114300" distB="114300" distL="114300" distR="114300"'));
    const layout = (d: DocText) => new DocLayouter({ measure: (s: string, size: number) => s.length * size * 0.5, drawingSize: () => ({ w: 144, h: 72 }) }).layout(d);
    const firstLine = (d: DocText) => layout(d).text.lines[0].y;
    // the line that goes under the picture is 9 pt higher without room kept below it
    expect(firstLine(roomy) - firstLine(doc)).toBeCloseTo(9, 1);
  });

  it('a figure made here keeps the same room on every side', () => {
    expect(floatGaps({ wrap: 'square', x: 0, y: 0 })).toEqual({ t: 9, b: 9, l: 9, r: 9 });
    expect(floatGaps({ wrap: 'square', x: 0, y: 0, gap: 4 })).toEqual({ t: 4, b: 4, l: 4, r: 4 });
  });
});
