// @vitest-environment jsdom
//
// A reference manager's bibliography and citations kept as Word showed them (chosen when the
// document is opened): their text, numbering and links stay until a citation is changed here.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { bibliography, citationTexts, piecesText } from '../src/document/references';
import { toBase64 } from '../src/document/live-cites';
import type { DocText } from '../src/document/document';
import type { CiteManager } from '../src/document/live-cites';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const deps: DocxDeps = { async picture() { return { png: PNG, w: 10, h: 10 }; }, async svgToPng() { return PNG; } };
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const u8 = (s: string): Uint8Array => new Uint8Array(strToU8(s));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wordFile(body: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': u8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>'),
    '_rels/.rels': u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="${R}hyperlink" Target="https://doi.org/10.1021/om100106e" TargetMode="External"/></Relationships>`),
    'word/document.xml': u8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
  });
}
const parts = (bytes: Uint8Array): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(unzipSync(bytes))) if (/\.(xml|rels)$/.test(k)) out[k] = strFromU8(v);
  return out;
};
const SUP = '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>';
/** A citation field as EndNote writes it: begin, the instruction, separate, what it shows, end. */
const cite = (instr: string, shown: string) =>
  `<w:r>${SUP}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${SUP}<w:instrText xml:space="preserve">${esc(instr)}</w:instrText></w:r><w:r>${SUP}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${SUP}<w:t>${shown}</w:t></w:r><w:r>${SUP}<w:fldChar w:fldCharType="end"/></w:r>`;
const para = (...xs: string[]) => `<w:p>${xs.join('')}</w:p>`;
const text = (t: string, rPr = '') => `<w:r>${rPr}<w:t xml:space="preserve">${t}</w:t></w:r>`;
const I = '<w:rPr><w:i/></w:rPr>', B = '<w:rPr><w:b/></w:rPr>';

const record = (n: number, author: string, title: string, journal: string, year: string, doi = '') =>
  `<EndNote><Cite><Author>${author.split(',')[0]}</Author><Year>${year}</Year><RecNum>${n}</RecNum><DisplayText>${n}</DisplayText><record><rec-number>${n}</rec-number><foreign-keys><key app="EN" db-id="x0d2">${n}</key></foreign-keys><ref-type name="Journal Article">17</ref-type><contributors><authors><author>${author}</author></authors></contributors><titles><title>${title}</title><secondary-title>${journal}</secondary-title></titles><periodical><full-title>${journal}</full-title></periodical><volume>29</volume><dates><year>${year}</year></dates>${doi ? `<electronic-resource-num>${doi}</electronic-resource-num>` : ''}</record></Cite></EndNote>`;
const FULMER = record(12, 'Fulmer, Gregory R.', 'NMR Chemical Shifts of Trace Impurities', 'Organometallics', '2010', '10.1021/om100106e');
const SMITH = record(13, 'Smith, Jane', 'A second paper', 'J. Am. Chem. Soc.', '2021');

/**
 * An EndNote manuscript: two citations (the second shows "2c", EndNote's lettered number), the
 * bibliography with an italic journal, a bold year and a linked DOI, and text after it.
 */
function endNoteDoc(): Uint8Array {
  const reflist = `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ADDIN EN.REFLIST </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>`;
  return wordFile(
    para(text('Impurities were assigned'), cite(` ADDIN EN.CITE ${FULMER}`, '1'), text(' and checked'), cite(` ADDIN EN.CITE ${SMITH}`, '2c'), text('.')) +
    para(text('References')) +
    `<w:p><w:pPr><w:pStyle w:val="EndNoteBibliography"/></w:pPr>${reflist}${text('1.\tFulmer, G. R. ')}${text('Organometallics', I)}${text(' ')}${text('2010', B)}${text(', 29. ')}<w:hyperlink r:id="rId7">${text('https://doi.org/10.1021/om100106e')}</w:hyperlink></w:p>` +
    `<w:p><w:pPr><w:pStyle w:val="EndNoteBibliography"/></w:pPr>${text('2.\tSmith, J. ')}${text('J. Am. Chem. Soc.', I)}${text(' ')}${text('2021', B)}${text(', 143, 1')}${text('H', '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>')}${text(' NMR.')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>` +
    para(text('After the list.')),
  );
}

const keep = (got: CiteManager[]) => ({ keepBibliography: (app: CiteManager) => { got.push(app); return true; } });

describe('keeping a reference manager\'s bibliography as Word had it', () => {
  it('works the bibliography out here when nobody chose to keep it (as before)', async () => {
    const { doc } = await readDocx(endNoteDoc());
    expect([...citationTexts(doc).values()]).toEqual(['1', '2']);
    expect(bibliography(doc).map((e) => piecesText(e.pieces)).join('\n')).not.toMatch(/https:\/\/doi\.org\/10\.1021\/om100106e$/m);
  });

  it('asks once, naming the manager, and keeps the citations\' and entries\' text, looks and links', async () => {
    const asked: CiteManager[] = [];
    const { doc } = await readDocx(endNoteDoc(), keep(asked));
    expect(asked).toEqual(['endnote']);
    expect([...citationTexts(doc).values()]).toEqual(['1', '2c']);
    const entries = bibliography(doc);
    expect(entries.map((e) => e.label)).toEqual(['1.', '2.']);
    expect(piecesText(entries[0].pieces)).toBe('Fulmer, G. R. Organometallics 2010, 29. https://doi.org/10.1021/om100106e');
    expect(entries[0].pieces).toContainEqual({ text: 'Organometallics', italic: true });
    expect(entries[0].pieces).toContainEqual({ text: '2010', bold: true });
    expect(entries[0].pieces).toContainEqual({ text: 'https://doi.org/10.1021/om100106e', link: 'https://doi.org/10.1021/om100106e' });
    expect(entries[1].pieces).toContainEqual({ text: 'H', sup: true });
    // Word's entries are the bibliography's, not text of their own; the text after it stays
    const plain = doc.runs.map((r) => r.text).join('');
    expect(plain).not.toMatch(/Fulmer/);
    expect(plain).toMatch(/After the list\./);
    expect(Object.values(doc.objects).filter((o) => o.kind === 'bib').length).toBe(1);
  });

  it('does not ask for a document without a manager\'s bibliography', async () => {
    const asked: CiteManager[] = [];
    await readDocx(wordFile(para(text('Plain'), cite(` ADDIN EN.CITE ${FULMER}`, '1'))), keep(asked));
    expect(asked).toEqual([]);
  });

  it('works the bibliography out here when the person chose to restyle it', async () => {
    const { doc } = await readDocx(endNoteDoc(), { keepBibliography: () => false });
    expect([...citationTexts(doc).values()]).toEqual(['1', '2']);
  });

  it('saves the kept text back unchanged, with the field round it and the DOI still linked', async () => {
    const { doc } = await readDocx(endNoteDoc(), keep([]));
    const bytes = await writeDocx(doc, deps);
    const p = parts(bytes);
    const body = p['word/document.xml'];
    expect(body).toMatch(/ADDIN EN\.REFLIST/);
    expect(body).toMatch(/<w:t[^>]*>2c<\/w:t>/);
    const link = /<w:hyperlink r:id="(rId\d+)"[^>]*>.*?10\.1021\/om100106e/.exec(body);
    expect(link).not.toBeNull();
    expect(p['word/_rels/document.xml.rels']).toMatch(new RegExp(`Id="${link![1]}"[^>]*Target="https://doi.org/10.1021/om100106e"|Target="https://doi.org/10.1021/om100106e"[^>]*Id="${link![1]}"`));
    // and opened again (kept again) it is the same
    const again = (await readDocx(bytes, keep([]))).doc;
    expect([...citationTexts(again).values()]).toEqual(['1', '2c']);
    expect(bibliography(again).map((e) => [e.label, e.pieces])).toEqual(bibliography(doc).map((e) => [e.label, e.pieces]));
  });

  it('keeps the bibliography while what is cited, in order, is the same', async () => {
    const { doc } = await readDocx(endNoteDoc(), keep([]));
    const ids = Object.keys(doc.objects).map(Number).filter((k) => doc.objects[k].kind === 'cite');
    const second = doc.objects[ids[1]] as Extract<DocText['objects'][number], { kind: 'cite' }>;
    // the second citation now cites both references: that one is worked out here, the rest stays
    const [fulmer, smith] = doc.references!.map((r) => r.id);
    const edited: DocText = { ...doc, objects: { ...doc.objects, [ids[1]]: { ...second, refs: [smith, fulmer] } } };
    expect([...citationTexts(edited).values()]).toEqual(['1', '1,2']);
    expect(piecesText(bibliography(edited)[0].pieces)).toBe('Fulmer, G. R. Organometallics 2010, 29. https://doi.org/10.1021/om100106e');
  });

  it('works everything out here again once what is cited changes', async () => {
    const { doc } = await readDocx(endNoteDoc(), keep([]));
    const ids = Object.keys(doc.objects).map(Number).filter((k) => doc.objects[k].kind === 'cite');
    const first = doc.objects[ids[0]] as Extract<DocText['objects'][number], { kind: 'cite' }>;
    // the first citation now cites Smith instead: Fulmer is no longer cited, Smith is number 1
    const smith = doc.references![1].id;
    const edited: DocText = { ...doc, objects: { ...doc.objects, [ids[0]]: { ...first, refs: [smith] } } };
    expect([...citationTexts(edited).values()]).toEqual(['1', '1']);
    const entries = bibliography(edited);
    expect(entries.length).toBe(1);
    expect(piecesText(entries[0].pieces)).not.toMatch(/1H NMR/);
    expect(piecesText(entries[0].pieces)).toMatch(/Smith/);
  });

  it('keeps a Mendeley Cite bibliography and its citations', async () => {
    const v3 = toBase64(JSON.stringify({ citationID: 'MENDELEY_CITATION_y', properties: { noteIndex: 0 }, isEdited: false, manualOverride: { isManuallyOverridden: false, citeprocText: '(1)', manualOverrideText: '' }, citationItems: [{ id: 'bbbb', itemData: { id: 'bbbb', type: 'article-journal', title: 'A second paper', 'container-title': 'J. Am. Chem. Soc.', author: [{ family: 'Smith', given: 'Jane' }], issued: { 'date-parts': [['2021']] } }, isTemporary: false }] }));
    const sdt = `<w:sdt><w:sdtPr><w:tag w:val="MENDELEY_CITATION_v3_${v3}"/></w:sdtPr><w:sdtContent><w:r><w:t>(1)</w:t></w:r></w:sdtContent></w:sdt>`;
    const bib = `<w:sdt><w:sdtPr><w:tag w:val="MENDELEY_BIBLIOGRAPHY"/></w:sdtPr><w:sdtContent><w:p>${text('(1) \tSmith, J. ')}${text('J. Am. Chem. Soc.', I)}${text(' 2021.')}</w:p></w:sdtContent></w:sdt>`;
    const asked: CiteManager[] = [];
    const { doc } = await readDocx(wordFile(para(text('See'), sdt) + bib + para(text('End.'))), keep(asked));
    expect(asked).toEqual(['mendeley-cite']);
    expect([...citationTexts(doc).values()]).toEqual(['(1)']);
    const entries = bibliography(doc);
    expect(entries.map((e) => e.label)).toEqual(['(1)']);
    expect(entries[0].pieces).toEqual([{ text: 'Smith, J. ' }, { text: 'J. Am. Chem. Soc.', italic: true }, { text: ' 2021.' }]);
    expect(doc.runs.map((r) => r.text).join('')).not.toMatch(/Smith/);
    // saved as Mendeley Cite's tagged bibliography, its entry as it was
    const body = parts(await writeDocx(doc, deps))['word/document.xml'];
    expect(body).toMatch(/MENDELEY_BIBLIOGRAPHY/);
    expect(body).toMatch(/J\. Am\. Chem\. Soc\./);
  });
});
