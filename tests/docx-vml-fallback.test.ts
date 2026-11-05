// @vitest-environment jsdom
//
// Word 2010+ shapes come in mc:AlternateContent with a VML fallback (v:roundrect, v:line, a
// v:group of pictures). Shapes without text are read from the choice; what VML can't give is
// warned about, never dropped silently.

import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readDocx } from '../src/io/docx';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
  + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '
  + 'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1]);

function wordFile(body: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>'),
    '_rels/.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId5" Type="${R}image" Target="media/image1.png"/></Relationships>`),
    'word/media/image1.png': PNG,
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${NS}><w:body>${body}<w:sectPr/></w:body></w:document>`),
  });
}

/** A Word 2010 shape with no text, anchored to the page, and the VML Word writes for older programs. */
const shape = (prst: string, vml: string) => '<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>'
  + '<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="1" behindDoc="0" locked="1" layoutInCell="1" allowOverlap="1">'
  + '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>914400</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>914400</wp:posOffset></wp:positionV>'
  + '<wp:extent cx="1828800" cy="914400"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="1" name="AutoShape 2"/><wp:cNvGraphicFramePr/>'
  + '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr/>'
  + `<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1828800" cy="914400"/></a:xfrm><a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="9525"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln></wps:spPr>`
  + '<wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>'
  + `<mc:Fallback><w:pict>${vml}</w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>`;

describe('Word shapes with a VML fallback', () => {
  it('reads a shape without text from the choice, not the fallback', async () => {
    const { doc, warnings } = await readDocx(wordFile(shape('roundRect', '<v:roundrect style="position:absolute;width:144pt;height:72pt" arcsize="10923f" filled="f"/>')));
    const boxes = Object.values(doc.objects).filter((o) => o.kind === 'textbox');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ geo: 'roundRect' });
    expect(warnings).toEqual([]);
  });

  it('warns about a shape it can\'t draw instead of dropping it silently', async () => {
    const { warnings } = await readDocx(wordFile(shape('bentConnector3', '<v:line from="0,0" to="144pt,0"/>')));
    expect(warnings.join(' ')).toMatch(/shapes were left out/);
  });

  it('warns when a VML group has more pictures than the one read', async () => {
    const pic = (x: number) => `<v:shape style="position:absolute;left:${x};top:0;width:1000;height:1000"><v:imagedata r:id="rId5" o:title=""/></v:shape>`;
    const { doc, warnings } = await readDocx(wordFile(`<w:p><w:r><w:pict><v:group style="width:144pt;height:72pt" coordsize="2000,1000">${pic(0)}${pic(1000)}</v:group></w:pict></w:r></w:p>`));
    expect(Object.values(doc.objects).filter((o) => o.kind === 'picture')).toHaveLength(1);
    expect(warnings.join(' ')).toMatch(/shapes were left out/);
  });
});
