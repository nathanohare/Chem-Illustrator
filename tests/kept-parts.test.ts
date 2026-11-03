// @vitest-environment jsdom
//
// Other programs' data in Word files survives a save here: custom XML parts (Chem4Word's CML,
// a template's data), custom document properties, document variables, Office add-ins' settings,
// and content controls round text and paragraphs. Chem4Word's structures open as drawings,
// stay linked to their CML, and the CML is written afresh only when the structure is changed.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { readCml, writeCml, cmlGuid } from '../src/io/cml';
import { relativeTarget } from '../src/io/kept-parts';
import type { Contents } from '../src/model';
import { Doc } from '../src/model';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
import { defaultMaster, WIDE } from '../src/deck/deck';
import { writeXlsx, readXlsx, type XlsxPictures } from '../src/io/xlsx';
import { Workbook } from '../src/sheet/workbook';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1]);
const deps: DocxDeps = {
  async picture() { return { png: PNG, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"/>', w: 80, h: 40 }; },
  async svgToPng() { return PNG; },
};
const readDeps = { cml: (t: string) => readCml(t), drawingSize: () => ({ w: 40, h: 40 }) };

const u8 = (s: string): Uint8Array => { const b = strToU8(s); const o = new Uint8Array(b.length); o.set(b); return o; };
const parts = (bytes: Uint8Array): Record<string, string> => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const DML = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"';
const GUID = '7c1d9e2a5b3f4a6c8d0e1f2a3b4c5d6e';
const CML = `<?xml version="1.0" encoding="utf-8"?><cml:cml xmlns:cml="http://www.xml-cml.org/schema" xmlns:c4w="http://www.chem4word.com/cml"><c4w:customXmlPartGuid>${GUID}</c4w:customXmlPartGuid><cml:molecule id="m1">`
  + '<cml:atomArray><cml:atom id="a1" elementType="C" x2="0" y2="0"/><cml:atom id="a2" elementType="C" x2="17.32" y2="10"/><cml:atom id="a3" elementType="O" x2="34.64" y2="0" formalCharge="-1"/><cml:atom id="a4" elementType="OMe" x2="17.32" y2="30"/></cml:atomArray>'
  + '<cml:bondArray><cml:bond id="b1" atomRefs2="a1 a2" order="S"><cml:bondStereo>W</cml:bondStereo></cml:bond><cml:bond id="b2" atomRefs2="a2 a3" order="D"/><cml:bond id="b3" atomRefs2="a2 a4" order="S"/></cml:bondArray>'
  + '</cml:molecule></cml:cml>';
const OTHER_XML = '<?xml version="1.0"?><p:properties xmlns:p="http://schemas.microsoft.com/office/2006/metadata/properties"><documentManagement><Project>Aldol</Project></documentManagement></p:properties>';
const props = (id: string, ns: string) => `<?xml version="1.0"?><ds:datastoreItem ds:itemID="${id}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${ns}"/></ds:schemaRefs></ds:datastoreItem>`;

/** A Word file as Word with Chem4Word, a document-management system and an add-in would leave it. */
function wordFile(): Uint8Array {
  const chem = `<w:sdt><w:sdtPr><w:alias w:val="Chemistry"/><w:tag w:val="${GUID}"/><w:id w:val="99"/><w:lock w:val="contentLocked"/></w:sdtPr><w:sdtContent><w:r><w:drawing><wp:inline><wp:extent cx="508000" cy="508000"/><wp:docPr id="5" name="Group 5"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"><wpg:wgp/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:sdtContent></w:sdt>`;
  const body = '<w:p><w:r><w:t xml:space="preserve">Prepared by </w:t></w:r>'
    + '<w:sdt><w:sdtPr><w:alias w:val="Author"/><w:tag w:val="author-field"/><w:id w:val="7"/><w:dataBinding w:storeItemID="{11111111-2222-3333-4444-555555555555}" w:xpath="/p:properties/documentManagement/Project"/><w:text/></w:sdtPr><w:sdtContent><w:r><w:t>Nate</w:t></w:r></w:sdtContent></w:sdt>'
    + '<w:r><w:t>.</w:t></w:r></w:p>'
    + `<w:p>${chem}</w:p>`
    + '<w:sdt><w:sdtPr><w:tag w:val="whole-block"/><w:id w:val="8"/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>Locked paragraph</w:t></w:r></w:p></w:sdtContent></w:sdt>'
    + '<w:p><w:r><w:t>After</w:t></w:r></w:p>';
  const files: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Override PartName="/word/webextensions/taskpanes.xml" ContentType="application/vnd.ms-office.webextensiontaskpanes+xml"/><Override PartName="/word/webextensions/webextension1.xml" ContentType="application/vnd.ms-office.webextension+xml"/></Types>',
    '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="${R}custom-properties" Target="docProps/custom.xml"/><Relationship Id="rId3" Type="http://schemas.microsoft.com/office/2011/relationships/webextensiontaskpanes" Target="word/webextensions/taskpanes.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}customXml" Target="../customXml/item1.xml"/><Relationship Id="rId2" Type="${R}customXml" Target="../customXml/item2.xml"/><Relationship Id="rId3" Type="${R}settings" Target="settings.xml"/></Relationships>`,
    'word/document.xml': `<?xml version="1.0"?><w:document ${W} ${DML}><w:body>${body}</w:body></w:document>`,
    'word/settings.xml': `<?xml version="1.0"?><w:settings ${W}><w:docVars><w:docVar w:name="LabNotebook" w:val="NPO-2-114"/></w:docVars></w:settings>`,
    'customXml/item1.xml': OTHER_XML,
    'customXml/_rels/item1.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}customXmlProps" Target="itemProps1.xml"/></Relationships>`,
    'customXml/itemProps1.xml': props('{11111111-2222-3333-4444-555555555555}', 'http://schemas.microsoft.com/office/2006/metadata/properties'),
    'customXml/item2.xml': CML,
    'customXml/_rels/item2.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}customXmlProps" Target="itemProps2.xml"/></Relationships>`,
    'customXml/itemProps2.xml': props('{AAAAAAAA-2222-3333-4444-555555555555}', 'http://www.xml-cml.org/schema'),
    'docProps/custom.xml': '<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="Client"><vt:lpwstr>Auburn</vt:lpwstr></property><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" name="ZOTERO_PREF_1"><vt:lpwstr>&lt;data/&gt;</vt:lpwstr></property></Properties>',
    'word/webextensions/taskpanes.xml': '<?xml version="1.0"?><wetp:taskpanes xmlns:wetp="http://schemas.microsoft.com/office/webextensions/taskpanes/2010/11" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><wetp:taskpane dockstate="right" visibility="0" width="350" row="0"><wetp:webextensionref r:id="rId1"/></wetp:taskpane></wetp:taskpanes>',
    'word/webextensions/_rels/taskpanes.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2011/relationships/webextension" Target="webextension1.xml"/></Relationships>',
    'word/webextensions/webextension1.xml': '<?xml version="1.0"?><we:webextension xmlns:we="http://schemas.microsoft.com/office/webextensions/webextension/2010/11" id="{X}"><we:reference id="wa104382081" version="1.0.0.0" store="en-US" storeType="OMEX"/><we:properties><we:property name="citations" value="&quot;stored&quot;"/></we:properties></we:webextension>',
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, u8(v)])));
}

describe('Chem4Word CML', () => {
  it('reads atoms, bonds, charges, groups and wedges, and writes them back with the id', () => {
    const c = readCml(CML)!;
    expect(c.atoms.map((a) => a.label ?? a.z)).toEqual([6, 6, 8, 'OMe']);
    expect(c.atoms[2].charge).toBe(-1);
    expect(c.bonds.map((b) => [b.order, b.display])).toEqual([[1, 'wedge'], [2, 'solid'], [1, 'solid']]);
    const again = writeCml(c, GUID);
    expect(cmlGuid(again)).toBe(GUID);
    const back = readCml(again)!;
    expect(back.atoms.map((a) => a.label ?? a.z)).toEqual([6, 6, 8, 'OMe']);
    expect(back.bonds.map((b) => [b.order, b.display])).toEqual([[1, 'wedge'], [2, 'solid'], [1, 'solid']]);
    // Chem4Word's scale: bonds of 20
    const [p, q] = [back.atoms[0], back.atoms[1]];
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeCloseTo(20, 1);
  });

  it('keeps two molecules apart when both number their atoms from a1 (found in the 2026-11-03 review)', () => {
    const mol = (id: string, x: number, el: string) => `<cml:molecule id="${id}"><cml:atomArray><cml:atom id="a1" elementType="C" x2="${x}" y2="0"/><cml:atom id="a2" elementType="${el}" x2="${x + 20}" y2="0"/></cml:atomArray><cml:bondArray><cml:bond id="b1" atomRefs2="a1 a2" order="S"/></cml:bondArray></cml:molecule>`;
    const two = `<cml:cml xmlns:cml="http://www.xml-cml.org/schema" xmlns:c4w="http://www.chem4word.com/cml"><cml:molecule id="m0">${mol('m1', 0, 'O')}${mol('m2', 100, 'N')}</cml:molecule></cml:cml>`;
    const c = readCml(two)!;
    const el = new Map(c.atoms.map((a) => [a.id, a.z]));
    expect(c.bonds.map((b) => [el.get(b.a1), el.get(b.a2)])).toEqual([[6, 8], [6, 7]]);
  });

  it('keeps Chem4Word\'s names and formula for a structure only moved, not for one changed (found in the 2026-11-03 review)', () => {
    const named = CML.replace('<cml:molecule id="m1">', '<cml:molecule id="m1"><cml:name dictRef="chem4word:Synonym">methyl ester anion</cml:name><cml:formula concise="C 3 O 2"/>');
    const c = readCml(named)!;
    const moved = { ...c, atoms: c.atoms.map((a) => ({ ...a, x: a.x + 50, y: a.y + 7 })) };
    const kept = writeCml(moved, GUID, named);
    expect(kept).toContain('<cml:name dictRef="chem4word:Synonym">methyl ester anion</cml:name>');
    expect(kept).toContain('<cml:formula concise="C 3 O 2"/>');
    expect(readCml(kept)!.atoms).toHaveLength(4);
    // a wedge flipped: no longer the same compound, so its name goes
    const flipped = { ...c, bonds: c.bonds.map((b, i) => (i === 0 ? { ...b, display: 'hashWedge' as const } : b)) };
    expect(writeCml(flipped, GUID, named)).not.toContain('methyl ester anion');
  });

  it('writes a label that is just the element with hydrogens as the element', () => {
    const c: Contents = { atoms: [{ id: 1, x: 0, y: 0, z: 7, label: 'NH2', charge: 0, isotope: 0, just: 'auto' }, { id: 2, x: 14, y: 0, z: 6, label: null, charge: 0, isotope: 0, just: 'auto' }], bonds: [{ id: 3, a1: 1, a2: 2, order: 1, display: 'solid', dpos: 'auto' }], captions: [], arrows: [], shapes: [] };
    expect(writeCml(c, 'g')).toContain('elementType="N"');
  });
});

describe('other programs\u2019 data in Word files', () => {
  it('reads the data it keeps, and Chem4Word\u2019s structure as a drawing linked to its CML', async () => {
    const { doc } = await readDocx(wordFile(), readDeps);
    expect(doc.kept?.xml?.map((x) => x.xml)).toEqual([OTHER_XML, CML]);
    expect(doc.kept?.xml?.[0].props).toContain('{11111111-2222-3333-4444-555555555555}');
    expect(doc.kept?.props?.join('')).toContain('Client');
    expect(doc.kept?.props?.join('')).not.toContain('ZOTERO_PREF');
    expect(doc.kept?.vars).toContain('LabNotebook');
    expect(doc.kept?.trees?.[0].parts.map((p) => p.path)).toEqual(['word/webextensions/taskpanes.xml', 'word/webextensions/webextension1.xml']);
    const drawing = Object.values(doc.objects).find((o) => o.kind === 'drawing');
    expect(drawing?.kind === 'drawing' && drawing.c4w?.guid).toBe(GUID);
    expect(drawing?.kind === 'drawing' && drawing.contents.atoms.length).toBe(4);
    // the content controls: round "Nate", round the structure, and round the locked paragraph
    expect(Object.keys(doc.controls ?? {})).toHaveLength(3);
    expect(doc.runs.find((r) => r.text === 'Nate')?.cc).toBeTruthy();
    expect(doc.runs.find((r) => r.text.includes('Prepared'))?.cc).toBeUndefined();
    expect(doc.paras.filter((p) => p.cc)).toHaveLength(1);
  });

  it('writes it all back where Word and the add-ins look for it', async () => {
    const { doc } = await readDocx(wordFile(), readDeps);
    const out = parts(await writeDocx(doc, deps, 't'));
    // our own part first, then the kept ones with their properties (the data binding's store id intact)
    expect(out['customXml/item1.xml']).toContain('chemIllustrator');
    expect(out['customXml/item2.xml']).toBe(OTHER_XML);
    expect(out['customXml/itemProps2.xml']).toContain('{11111111-2222-3333-4444-555555555555}');
    expect(out['customXml/item3.xml']).toBe(CML);
    expect(out['customXml/_rels/item3.xml.rels']).toContain('itemProps3.xml');
    expect(out['word/_rels/document.xml.rels']).toContain('../customXml/item3.xml');
    expect(out['docProps/custom.xml']).toContain('name="Client"');
    expect(out['word/settings.xml']).toMatch(/<\/w:compat><w:docVars[^>]*>.*LabNotebook/);
    expect(out['word/webextensions/webextension1.xml']).toContain('citations');
    expect(out['_rels/.rels']).toContain('word/webextensions/taskpanes.xml');
    expect(out['word/webextensions/_rels/taskpanes.xml.rels']).toContain('webextension1.xml');
    expect(out['[Content_Types].xml']).toContain('application/vnd.ms-office.webextension+xml');
    // the content controls round the same things, with fresh ids and the binding kept
    const body = out['word/document.xml'];
    expect(body).toMatch(/<w:sdt><w:sdtPr><w:alias[^>]*w:val="Author"\/><w:tag[^>]*w:val="author-field"\/><w:id w:val="\d+"\/><w:dataBinding[^>]*\/><w:text[^>]*\/><\/w:sdtPr><w:sdtContent>(?:(?!<\/w:sdtContent>).)*Nate(?:(?!<\/w:sdtContent>).)*<\/w:sdtContent><\/w:sdt>/s);
    expect(body).toMatch(new RegExp(`<w:tag[^>]*w:val="${GUID}"/><w:id w:val="\\d+"/><w:lock[^>]*/></w:sdtPr><w:sdtContent>(?:(?!</w:sdtContent>).)*<w:drawing>`, 's'));
    expect(body).toMatch(/<w:sdt><w:sdtPr><w:tag[^>]*w:val="whole-block"\/><w:id w:val="\d+"\/><\/w:sdtPr><w:sdtContent><w:p>(?:(?!<\/w:sdtContent>).)*Locked paragraph(?:(?!<\/w:sdtContent>).)*<\/w:p><\/w:sdtContent><\/w:sdt>/s);
    expect(body).not.toMatch(/whole-block(?:(?!<\/w:sdt>).)*After/s);
  });

  it('opens its own saved file the same way again', async () => {
    const { doc } = await readDocx(wordFile(), readDeps);
    const { doc: again } = await readDocx(await writeDocx(doc, deps, 't'), readDeps);
    expect(again.kept?.xml?.map((x) => x.xml)).toEqual([OTHER_XML, CML]);
    expect(Object.keys(again.controls ?? {})).toHaveLength(3);
    const drawing = Object.values(again.objects).find((o) => o.kind === 'drawing');
    expect(drawing?.kind === 'drawing' && drawing.c4w?.guid).toBe(GUID);
  });

  it('writes Chem4Word\u2019s CML afresh only when the structure was changed here', async () => {
    const { doc } = await readDocx(wordFile(), readDeps);
    const drawing = Object.values(doc.objects).find((o) => o.kind === 'drawing')!;
    if (drawing.kind !== 'drawing') throw new Error('no drawing');
    drawing.contents = { ...drawing.contents, bonds: drawing.contents.bonds.map((b, i) => (i === 2 ? { ...b, order: 2 } : b)) };
    const out = parts(await writeDocx(doc, deps, 't'));
    const cml = out['customXml/item3.xml'];
    expect(cml).not.toBe(CML);
    expect(cmlGuid(cml)).toBe(GUID);
    expect(readCml(cml)!.bonds.map((b) => b.order)).toEqual([1, 2, 2]);
    expect(out['customXml/item2.xml']).toBe(OTHER_XML);
  });

  it('works out relationship targets between parts', () => {
    expect(relativeTarget('word/document.xml', 'customXml/item2.xml')).toBe('../customXml/item2.xml');
    expect(relativeTarget('customXml/item2.xml', 'customXml/itemProps2.xml')).toBe('itemProps2.xml');
    expect(relativeTarget('word/webextensions/taskpanes.xml', 'word/webextensions/webextension1.xml')).toBe('webextension1.xml');
  });
});

/** A package with a custom XML part and a custom property added, as a document-management system would. */
function withOthers(bytes: Uint8Array, main: string): Uint8Array {
  const files = unzipSync(bytes);
  const text = (k: string) => strFromU8(files[k]);
  const relsPath = main.replace(/([^/]+)$/, '_rels/$1.rels');
  files[relsPath] = u8(text(relsPath).replace('</Relationships>', `<Relationship Id="rIdKeep" Type="${R}customXml" Target="../customXml/item9.xml"/></Relationships>`));
  files['customXml/item9.xml'] = u8(OTHER_XML);
  files['customXml/_rels/item9.xml.rels'] = u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}customXmlProps" Target="itemProps9.xml"/></Relationships>`);
  files['customXml/itemProps9.xml'] = u8(props('{11111111-2222-3333-4444-555555555555}', 'http://schemas.microsoft.com/office/2006/metadata/properties'));
  files['_rels/.rels'] = u8(text('_rels/.rels').replace('</Relationships>', `<Relationship Id="rIdCustom" Type="${R}custom-properties" Target="docProps/custom.xml"/></Relationships>`));
  files['docProps/custom.xml'] = u8('<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="Client"><vt:lpwstr>Auburn</vt:lpwstr></property></Properties>');
  return zipSync(files);
}

describe('other programs\u2019 data in PowerPoint and Excel files', () => {
  it('keeps a presentation\u2019s custom XML and custom properties', async () => {
    const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; } };
    const first = await writePptx({ size: WIDE, master: defaultMaster(), slides: [{ layout: 'blank', doc: new Doc(), notes: '' }] }, opts);
    const got = readPptx(withOthers(first, 'ppt/presentation.xml'));
    expect(got.kept?.xml?.map((x) => x.xml)).toEqual([OTHER_XML]);
    const out = parts(await writePptx({ size: WIDE, master: defaultMaster(), slides: [{ layout: 'blank', doc: new Doc(), notes: '' }], kept: got.kept }, opts));
    expect(out['customXml/item1.xml']).toBe(OTHER_XML);
    expect(out['customXml/itemProps1.xml']).toContain('{11111111-2222-3333-4444-555555555555}');
    expect(out['ppt/_rels/presentation.xml.rels']).toContain('../customXml/item1.xml');
    expect(out['docProps/custom.xml']).toContain('name="Client"');
  });

  it('keeps a workbook\u2019s custom XML and custom properties beside its own', async () => {
    const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), async picture() { return PNG; } };
    const first = await writeXlsx(new Workbook(['Sheet1']), pictures);
    const { book } = await readXlsx(withOthers(first, 'xl/workbook.xml'));
    expect(book.kept?.xml?.map((x) => x.xml)).toEqual([OTHER_XML]);
    const out = parts(await writeXlsx(book, pictures));
    expect(out['customXml/item1.xml']).toContain('chemIllustrator');
    expect(out['customXml/item2.xml']).toBe(OTHER_XML);
    expect(out['xl/_rels/workbook.xml.rels']).toContain('../customXml/item2.xml');
    expect(out['docProps/custom.xml']).toContain('name="Client"');
  });
});
