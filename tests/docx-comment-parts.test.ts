// @vitest-environment jsdom
//
// Word's comments keep their formatting (a formula's subscripts, bold) when their text isn't
// changed here, and keep Word 365's lasting ids and UTC times (commentsIds, commentsExtensible)
// and its list of people (people.xml). A file's building blocks (the glossary document, Quick
// Parts saved in the file) are kept whole, with their relationships.

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';
import { Package } from '../src/io/ooxml';
import { writeKeptParts, type KeptParts } from '../src/io/kept-parts';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W = `xmlns:w="${W_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
const W14 = 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1]);
const deps: DocxDeps = { async picture() { return null; } };
const u8 = (s: string) => new Uint8Array(strToU8(s));
const rels = (list: [string, string, string][]) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`;
const CT = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/>'
  + '<Override PartName="/word/glossary/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml"/>'
  + '<Override PartName="/word/people.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml"/></Types>';

function wordFile(): Uint8Array {
  const body = '<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>Dissolve in DCM</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>';
  const comment = `<w:comment w:id="0" w:author="Nate" w:date="2026-10-14T16:00:00Z" w:initials="N"><w:p w14:paraId="1A2B3C4D" w14:textId="77777777"><w:pPr><w:pStyle w:val="CommentText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>`
    + '<w:r><w:t xml:space="preserve">Use </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>CH</w:t></w:r><w:r><w:rPr><w:b/><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Cl</w:t></w:r><w:r><w:rPr><w:b/><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r></w:p></w:comment>';
  return zipSync({
    '[Content_Types].xml': u8(CT),
    '_rels/.rels': u8(rels([['rId1', `${R}officeDocument`, 'word/document.xml']])),
    'word/_rels/document.xml.rels': u8(rels([
      ['rId4', `${R}comments`, 'comments.xml'],
      ['rId5', 'http://schemas.microsoft.com/office/2016/09/relationships/commentsIds', 'commentsIds.xml'],
      ['rId6', 'http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible', 'commentsExtensible.xml'],
      ['rId7', 'http://schemas.microsoft.com/office/2011/relationships/people', 'people.xml'],
      ['rId8', `${R}glossaryDocument`, 'glossary/document.xml'],
    ])),
    'word/document.xml': u8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
    'word/comments.xml': u8(`<?xml version="1.0"?><w:comments ${W} ${W14}>${comment}</w:comments>`),
    'word/commentsIds.xml': u8('<w16cid:commentsIds xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid"><w16cid:commentId w16cid:paraId="1A2B3C4D" w16cid:durableId="5E6F7A8B"/></w16cid:commentsIds>'),
    'word/commentsExtensible.xml': u8('<w16cex:commentsExtensible xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex"><w16cex:commentExtensible w16cex:durableId="5E6F7A8B" w16cex:dateUtc="2026-10-14T21:00:00Z"/></w16cex:commentsExtensible>'),
    'word/people.xml': u8('<w15:people xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w15:person w15:author="Nate"><w15:presenceInfo w15:providerId="None" w15:userId="Nate"/></w15:person></w15:people>'),
    'word/glossary/_rels/document.xml.rels': u8(rels([['rId3', `${R}styles`, 'styles.xml'], ['rId9', `${R}image`, 'media/image1.png']])),
    'word/glossary/document.xml': u8(`<?xml version="1.0"?><w:glossaryDocument ${W}><w:docParts><w:docPart><w:docPartPr><w:name w:val="Lab header"/></w:docPartPr><w:docPartBody><w:p><w:r><w:drawing><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="rId9"/></w:drawing></w:r></w:p></w:docPartBody></w:docPart></w:docParts></w:glossaryDocument>`),
    'word/glossary/styles.xml': u8(`<?xml version="1.0"?><w:styles ${W}/>`),
    'word/glossary/media/image1.png': PNG,
  });
}

describe('Word comments keep what Word wrote', () => {
  it('keeps a comment\'s formatting, lasting id, UTC time and people', async () => {
    const { doc } = await readDocx(wordFile());
    const c = Object.values(doc.comments ?? {})[0];
    expect(c.text).toBe('Use CH2Cl2');
    expect(c.date).toBe('2026-10-14T21:00:00.000Z');
    const files = unzipSync(await writeDocx(doc, deps));
    const comments = strFromU8(files['word/comments.xml']);
    expect(comments).toContain('<w:r><w:rPr><w:b/><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r>');
    const para = /<w:comment [^>]*><w:p w14:paraId="([0-9A-F]{8})"/.exec(comments)?.[1];
    expect(strFromU8(files['word/commentsIds.xml'])).toContain(`w16cid:paraId="${para}" w16cid:durableId="5E6F7A8B"`);
    expect(strFromU8(files['word/commentsExtensible.xml'])).toContain('w16cex:durableId="5E6F7A8B" w16cex:dateUtc="2026-10-14T21:00:00Z"');
    expect(strFromU8(files['word/people.xml'])).toContain('w15:author="Nate"');
    const docRels = strFromU8(files['word/_rels/document.xml.rels']);
    expect(docRels).toContain('relationships/commentsIds" Target="commentsIds.xml"');
    expect(docRels).toContain('relationships/people" Target="people.xml"');
    // the comment opens again the same
    const again = (await readDocx(zipSync(files))).doc;
    expect(Object.values(again.comments ?? {})[0]).toMatchObject({ text: 'Use CH2Cl2', date: '2026-10-14T21:00:00.000Z', word: { id: '5E6F7A8B' } });
  });

  it('writes a comment as plain text once its text is changed here', async () => {
    const { doc } = await readDocx(wordFile());
    const id = Number(Object.keys(doc.comments ?? {})[0]);
    doc.comments![id] = { ...doc.comments![id], text: 'Use toluene' };
    const comments = strFromU8(unzipSync(await writeDocx(doc, deps))['word/comments.xml']);
    expect(comments).toContain('Use toluene');
    expect(comments).not.toContain('subscript');
  });
});

describe('Word comment threads', () => {
  // a comment with bold text and a link, with the initials Word wrote, a reply under it (by
  // Word 2013's commentsExtended), and another comment further on
  function threadFile(): Uint8Array {
    const body = '<w:p><w:commentRangeStart w:id="0"/><w:commentRangeStart w:id="1"/><w:r><w:t>Dissolve in DCM</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r><w:commentRangeEnd w:id="1"/><w:r><w:commentReference w:id="1"/></w:r>'
      + '<w:r><w:t xml:space="preserve"> and </w:t></w:r><w:commentRangeStart w:id="2"/><w:r><w:t>stir</w:t></w:r><w:commentRangeEnd w:id="2"/><w:r><w:commentReference w:id="2"/></w:r></w:p>';
    // (the first with a run style straight in its paragraph's properties, as some programs write it)
    const para = (id: string, runs: string) => `<w:p w14:paraId="${id}" w14:textId="77777777"><w:pPr><w:pStyle w:val="CommentText"/>${id === '1A2B3C4D' ? '<w:rStyle w:val="Strong"/>' : ''}</w:pPr><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>${runs}</w:p>`;
    const comments = `<w:comment w:id="0" w:author="Nate O'Hare" w:date="2026-10-14T16:00:00Z" w:initials="NOH">${para('1A2B3C4D', '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Dry</w:t></w:r><w:r><w:t xml:space="preserve"> it first, see </w:t></w:r><w:hyperlink r:id="rId3" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>the SOP</w:t></w:r></w:hyperlink>')}</w:comment>`
      + `<w:comment w:id="1" w:author="Ana Lee" w:date="2026-10-14T17:00:00Z" w:initials="AmL">${para('2B3C4D5E', '<w:r><w:t>Done.</w:t></w:r>')}</w:comment>`
      + `<w:comment w:id="2" w:author="Ana Lee" w:date="2026-10-14T18:00:00Z" w:initials="AmL">${para('3C4D5E6F', '<w:r><w:t>How long?</w:t></w:r>')}</w:comment>`;
    return zipSync({
      '[Content_Types].xml': u8(CT),
      '_rels/.rels': u8(rels([['rId1', `${R}officeDocument`, 'word/document.xml']])),
      'word/_rels/document.xml.rels': u8(rels([['rId4', `${R}comments`, 'comments.xml'], ['rId5', 'http://schemas.microsoft.com/office/2011/relationships/commentsExtended', 'commentsExtended.xml']])),
      'word/_rels/comments.xml.rels': u8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="' + R + 'hyperlink" Target="https://example.org/sop.pdf" TargetMode="External"/></Relationships>'),
      'word/document.xml': u8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
      'word/comments.xml': u8(`<?xml version="1.0"?><w:comments ${W} ${W14}>${comments}</w:comments>`),
      'word/commentsExtended.xml': u8('<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w15:commentEx w15:paraId="1A2B3C4D" w15:done="0"/><w15:commentEx w15:paraId="2B3C4D5E" w15:paraIdParent="1A2B3C4D" w15:done="0"/><w15:commentEx w15:paraId="3C4D5E6F" w15:done="0"/></w15:commentsEx>'),
    });
  }

  it('keeps bold text, links and initials in comments, and replies under their comment, as Word writes them', async () => {
    const { doc } = await readDocx(threadFile());
    const files = unzipSync(await writeDocx(doc, deps));
    const comments = strFromU8(files['word/comments.xml']);
    // each comment in the order of the text, its reply right after it, with the initials it came with
    const heads = [...comments.matchAll(/<w:comment w:id="(\d+)" w:author="([^"]+)"[^>]* w:initials="([^"]+)">/g)].map((m) => [m[1], m[2], m[3]]);
    expect(heads).toEqual([['0', "Nate O'Hare", 'NOH'], ['1', 'Ana Lee', 'AmL'], ['2', 'Ana Lee', 'AmL']]);
    // the first comment's bold text and its link, related to the comments part
    const first = /<w:comment w:id="0"[^]*?<\/w:comment>/.exec(comments)![0];
    expect(first).toContain('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Dry</w:t></w:r>');
    expect(first).toContain('<w:pPr><w:pStyle w:val="CommentText"/></w:pPr>');
    const rid = /<w:hyperlink r:id="(rId\d+)" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"\/><\/w:rPr><w:t>the SOP<\/w:t>/.exec(first)?.[1];
    expect(rid).toBeDefined();
    expect(strFromU8(files['word/_rels/comments.xml.rels'])).toContain(`Id="${rid}" Type="${R}hyperlink" Target="https://example.org/sop.pdf" TargetMode="External"`);
    expect(strFromU8(files['word/styles.xml'])).toContain('w:styleId="Hyperlink"');
    // the reply tied to its comment by the paragraph id of each one's last paragraph
    const paraOf = (id: number) => [...new RegExp(`<w:comment w:id="${id}"[^]*?</w:comment>`).exec(comments)![0].matchAll(/w14:paraId="([0-9A-F]{8})"/g)].pop()![1];
    const ex = strFromU8(files['word/commentsExtended.xml']);
    expect(ex).toContain(`<w15:commentEx w15:paraId="${paraOf(1)}" w15:paraIdParent="${paraOf(0)}" w15:done="0"/>`);
    expect(ex).toContain(`<w15:commentEx w15:paraId="${paraOf(2)}" w15:done="0"/>`);
    // and, as Word 365 writes, a lasting id for every comment, with its time in UTC
    const ids = [...strFromU8(files['word/commentsIds.xml']).matchAll(/w16cid:paraId="([0-9A-F]{8})" w16cid:durableId="([0-9A-F]{8})"/g)];
    expect(ids.map((m) => m[1])).toEqual([paraOf(0), paraOf(1), paraOf(2)]);
    expect(new Set(ids.map((m) => m[2])).size).toBe(3);
    expect(strFromU8(files['word/commentsExtensible.xml'])).toContain(`w16cex:durableId="${ids[1][2]}" w16cex:dateUtc="2026-10-14T17:00:00Z"`);
    expect(strFromU8(files['word/_rels/document.xml.rels'])).toContain('relationships/commentsIds" Target="commentsIds.xml"');
    // it opens again the same: the reply under its comment, the link and initials kept
    const again = (await readDocx(zipSync(files))).doc;
    const top = Object.values(again.comments ?? {}).find((c) => c.author === "Nate O'Hare")!;
    expect(top).toMatchObject({ text: 'Dry it first, see the SOP', word: { initials: 'NOH', links: ['https://example.org/sop.pdf'] } });
    expect(top.replies?.map((r) => r.text)).toEqual(['Done.']);
    expect(Object.keys(again.comments ?? {}).length).toBe(2);
  });
});

describe('Word building blocks', () => {
  it('keeps the glossary document with its parts and relationship ids', async () => {
    const { doc } = await readDocx(wordFile());
    const files = unzipSync(await writeDocx(doc, deps));
    expect(strFromU8(files['word/glossary/document.xml'])).toContain('<w:name w:val="Lab header"/>');
    expect(files['word/glossary/styles.xml']).toBeDefined();
    expect(files['word/glossary/media/image1.png']).toEqual(PNG);
    const grels = strFromU8(files['word/glossary/_rels/document.xml.rels']);
    expect(grels).toContain('Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"');
    expect(grels).toContain('Id="rId3"');
    expect(strFromU8(files['word/_rels/document.xml.rels'])).toContain('relationships/glossaryDocument" Target="glossary/document.xml"');
    expect(strFromU8(files['[Content_Types].xml'])).toContain('<Override PartName="/word/glossary/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml"/>');
  });

  it('gives a kept part a name of its own when the saved file already uses its name', () => {
    const pkg = new Package();
    pkg.add('word/media/image1.png', new Uint8Array([1]));
    const kept: KeptParts = {
      trees: [{
        from: 'main', type: `${R}glossaryDocument`, path: 'word/glossary/document.xml',
        parts: [{ path: 'word/glossary/document.xml', xml: '<w:glossaryDocument/>' }, { path: 'word/media/image1.png', data: 'data:image/png;base64,AA==' }],
        rels: [{ from: 'word/glossary/document.xml', type: `${R}image`, target: 'word/media/image1.png', id: 'rId7' }],
      }],
    };
    writeKeptParts(pkg, kept, { main: 'word/document.xml', firstItem: 2 });
    const files = unzipSync(pkg.build());
    expect(files['word/media/image1.png']).toEqual(new Uint8Array([1]));
    expect(files['word/media/image1_kept1.png']).toEqual(new Uint8Array([0]));
    expect(strFromU8(files['word/glossary/_rels/document.xml.rels'])).toContain('Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1_kept1.png"');
  });
});
