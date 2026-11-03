// @vitest-environment jsdom
//
// Find Structure in Files: the structures in each kind of file and where they are, the search
// (exact, or any structure containing the one drawn), and the index that keeps a second search
// of the same folder from reading files that haven't changed. Plus PubMed and Zotero lookups
// for the reference library.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { writeCdxml } from '../src/io/cdxml-write';
import { foundInContents, foundInFile, spotText, structuresIn, colName, type FileReaders } from '../src/library/structures';
import { emptyIndex, freshEntry, indexText, parseIndex, searchFiles, type SearchDeps } from '../src/library/file-index';
import { fetchPubmed, fromZotero, parsePmids, pubmedAuthor, syncZotero, zoteroLibrary } from '../src/library/online';
import { emptyLibrary } from '../src/library/library';
import { writeMolFile, writeKetFile } from '../src/io/chem-formats';
import { readSdf } from '../src/io/sheet-files';

/** Ethane (a bond), with a number under it when `label` is given. */
function drawing(label?: string, x = 0): Doc {
  const doc = new Doc();
  doc.edit('build', () => {
    const a = doc.addAtom(x - 6, 0), b = doc.addAtom(x + 6, 0);
    doc.addBond(a.id, b.id);
    const c = doc.addAtom(x + 60, 0);
    doc.updateAtom(c.id, { z: 8 });
    if (label) doc.addCaption({ x: x - 3, y: 14, runs: [{ text: label, bold: true }], justify: 'left' });
  });
  return doc;
}

const readers: FileReaders = {
  document: async () => { throw new Error('not here'); },
  sheet: async () => { throw new Error('not here'); },
  slides: async () => [drawing().contents(), drawing('5').contents()],
};

describe('the structures in a file', () => {
  it('finds each structure in a drawing with the number under it', () => {
    const doc = drawing('3a');
    const s = structuresIn(doc);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ label: '3a' });
    expect(s[0].atoms).toHaveLength(2);
  });

  it('reads a ChemDraw file and gives each structure a molfile', async () => {
    const text = writeCdxml(drawing('7'), {});
    const got = await foundInFile(new TextEncoder().encode(text), 'Scheme.cdxml', readers);
    expect(got).toHaveLength(2);
    expect(got[0].spot).toEqual({ kind: 'drawing' });
    expect(got[0].label).toBe('7');
    expect(got[0].molblock).toContain('M  END');
  });

  it('says where each one is', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 3, 4]);
    const got = await foundInFile(zip, 'Talk.pptx', readers);
    expect(got.map((f) => spotText(f.spot))).toEqual(['slide 1', 'slide 1', 'slide 2', 'slide 2']);
    expect(got[2].label).toBe('5');
    expect(spotText(foundInContents(drawing().contents(), { kind: 'cell', sheet: 0, sheetName: 'Yields', row: 3, col: 27 })[0].spot)).toBe('Yields!AB4');
    expect(colName(0)).toBe('A');
    expect(await foundInFile(new Uint8Array([1, 2, 3]), 'notes.docx', readers)).toEqual([]);
  });
});

describe('other programs\' chemistry files', () => {
  it('searches molfiles, Ketcher files and SD files too (found in the 2026-11-03 review: they were left out)', async () => {
    const doc = drawing();
    const enc = (t: string) => new TextEncoder().encode(t);
    const mol = await foundInFile(enc(writeMolFile(doc, 'ethane').text), 'ethane.mol', readers);
    expect(mol.map((f) => f.spot)).toEqual([{ kind: 'drawing' }, { kind: 'drawing' }]);
    expect(mol[0].molblock).toContain('M  END');
    expect(await foundInFile(enc(writeKetFile(doc).text), 'ethane.ket', readers)).toHaveLength(2);
    // an SD file: each record a row of the sheet it opens as
    const sd = ['  1  0  0  0  0  0  0  0  0  0999 V2000', '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0', 'M  END'];
    const text = ['methane', '', '', ...sd, '$$$$', 'methane 2', '', '', ...sd, '$$$$', ''].join('\n');
    const got = await foundInFile(enc(text), 'set.sdf', { ...readers, sheet: async (b, n) => readSdf(new TextDecoder().decode(b), n).book });
    expect(got.map((f) => f.spot.kind === 'cell' ? f.spot.row : -1)).toEqual([1, 2]);
    // a JSON file that is no chemistry file has none
    expect(await foundInFile(enc('{"a":1}'), 'settings.json', readers)).toEqual([]);
  });
});

describe('searching files', () => {
  const files = [{ path: '/f/a.cdxml', size: 10, modified: 1000 }, { path: '/f/b.cdxml', size: 20, modified: 1000 }];
  const structures: Record<string, string[]> = { '/f/a.cdxml': ['CC', 'O'], '/f/b.cdxml': ['CCO'] };
  const deps = (reads: string[]): SearchDeps => ({
    read: async (p) => { reads.push(p); return new TextEncoder().encode(p); },
    found: async (b) => structures[new TextDecoder().decode(b)].map((s) => ({ spot: { kind: 'drawing' as const }, atoms: [1], molblock: s })),
    smiles: async (mbs) => mbs,
    contains: async (q, smiles) => smiles.map((s) => s.includes(q)),
  });

  it('finds the same structure, or any containing it', async () => {
    const ix = emptyIndex();
    const exact = await searchFiles(files, 'CC', 'exact', ix, deps([]));
    expect(exact.hits.map((h) => `${h.path}:${h.structure.smiles}`)).toEqual(['/f/a.cdxml:CC']);
    const inside = await searchFiles(files, 'CC', 'contains', ix, deps([]));
    expect(inside.hits.map((h) => `${h.path}:${h.structure.smiles}:${h.exact}`)).toEqual(['/f/a.cdxml:CC:true', '/f/b.cdxml:CCO:false']);
  });

  it('reads only the files that changed since the last search', async () => {
    const ix = emptyIndex();
    const first: string[] = [];
    expect((await searchFiles(files, 'CC', 'exact', ix, deps(first))).read).toBe(2);
    const again: string[] = [];
    const changed = [files[0], { ...files[1], modified: 99999 }];
    const r = await searchFiles(changed, 'CC', 'exact', parseIndex(indexText(ix)), deps(again));
    expect(again).toEqual(['/f/b.cdxml']);
    expect(r.read).toBe(1);
    expect(freshEntry(ix, { ...files[0], modified: 1500 })).not.toBeNull();
  });

  it('notes files it could not read and goes on', async () => {
    const d = deps([]);
    d.found = async (b) => { if (new TextDecoder().decode(b).includes('a.')) throw new Error('damaged'); return [{ spot: { kind: 'drawing' }, atoms: [1], molblock: 'CC' }]; };
    const r = await searchFiles(files, 'CC', 'exact', emptyIndex(), d);
    expect(r.failed).toEqual([{ path: '/f/a.cdxml', why: 'damaged' }]);
    expect(r.hits).toHaveLength(1);
  });

  it('reads a file that failed again next time (the engine was still loading, the cloud file was not downloaded)', async () => {
    // (found in the 2026-11-03 review: the failure was kept in the index until the file changed)
    let broken = true;
    const reads: string[] = [];
    const d = deps(reads);
    const found = d.found;
    d.found = async (b, p) => { if (broken && p.includes('a.')) throw new Error('The chemistry engine is still loading'); return found(b, p); };
    const ix = emptyIndex();
    expect((await searchFiles(files, 'CC', 'exact', ix, d)).failed).toHaveLength(1);
    broken = false;
    reads.length = 0;
    const r = await searchFiles(files, 'CC', 'exact', parseIndex(indexText(ix)), d);
    expect(reads).toEqual(['/f/a.cdxml']);
    expect(r.failed).toEqual([]);
    expect(r.hits.map((h) => h.path)).toEqual(['/f/a.cdxml']);
  });

  it('stops when asked', async () => {
    let n = 0;
    const r = await searchFiles(files, 'CC', 'exact', emptyIndex(), { ...deps([]), stopped: () => n++ > 0 });
    expect(r.stopped).toBe(true);
    expect(r.read).toBe(1);
  });
});

describe('references from PubMed and Zotero', () => {
  it('reads PubMed ids and authors', () => {
    expect(parsePmids('PMID: 31234567, https://pubmed.ncbi.nlm.nih.gov/29876543/ 31234567')).toEqual(['31234567', '29876543']);
    expect(pubmedAuthor('Smith JA')).toBe('Smith, J. A.');
    expect(pubmedAuthor('ACS Catalysis Group')).toBe('ACS Catalysis Group');
  });

  it('makes a reference from PubMed\'s summary', async () => {
    const answer = { result: { uids: ['123'], 123: { title: 'A cross-coupling.', authors: [{ name: 'Fu GC', authtype: 'Author' }], source: 'J Am Chem Soc', pubdate: '2020 Mar 4', volume: '142', issue: '9', pages: '4000-4010', articleids: [{ idtype: 'doi', value: '10.1021/jacs.0c00001' }] } } };
    const [r] = await fetchPubmed(['123'], async () => JSON.stringify(answer));
    expect(r).toMatchObject({ title: 'A cross-coupling', authors: ['Fu, G. C.'], journal: 'J Am Chem Soc', year: '2020', pages: '4000–4010', doi: '10.1021/jacs.0c00001', pmid: '123' });
    await expect(fetchPubmed(['9'], async () => JSON.stringify({ result: { uids: [] } }))).rejects.toThrow(/no article/);
  });

  it('reads the Zotero library number', () => {
    expect(zoteroLibrary('123456')).toBe('users/123456');
    expect(zoteroLibrary('https://www.zotero.org/groups/98765')).toBe('groups/98765');
    expect(zoteroLibrary('me')).toBeNull();
  });

  it('brings Zotero items and collections in, and a second sync updates them in place', async () => {
    const item = (version: number, title: string) => ({ key: 'ABCD', version, data: { itemType: 'journalArticle', title, creators: [{ creatorType: 'author', firstName: 'Phil', lastName: 'Baran' }], journalAbbreviation: 'Nature', date: '2019-05-01', DOI: '10.1038/x', tags: [{ tag: 'C–H' }], collections: ['COL1'] } });
    const answers = (items: unknown[]) => async (url: string) => (url.includes('/collections') ? JSON.stringify([{ key: 'COL1', data: { name: 'Reviews', parentCollection: false } }]) : JSON.stringify(items));
    const link = { library: 'users/1', key: 'k', version: 0 };
    const first = await syncZotero(emptyLibrary(), link, answers([item(5, 'First')]));
    expect(first).toMatchObject({ added: 1, updated: 0, version: 5 });
    const r = first.lib.references[0];
    expect(r).toMatchObject({ title: 'First', authors: ['Baran, Phil'], journal: 'Nature', year: '2019', doi: '10.1038/x', tags: ['C–H'], collections: ['z-COL1'] });
    expect(first.lib.collections.map((c) => c.name)).toEqual(['Reviews']);
    const withPdf = { ...first.lib, references: [{ ...r, pdf: 'mine.pdf', tags: [...(r.tags ?? []), 'mine'] }] };
    const second = await syncZotero(withPdf, { ...link, version: 5 }, answers([item(8, 'Second')]));
    expect(second).toMatchObject({ added: 0, updated: 1, version: 8 });
    expect(second.lib.references[0]).toMatchObject({ id: r.id, title: 'Second', pdf: 'mine.pdf' });
    expect(second.lib.references[0].tags).toEqual(['C–H', 'mine']);
    expect(fromZotero({ key: 'Z', data: { itemType: 'thesis', title: 'T', university: 'Auburn' } }, new Map()).publisher).toBe('Auburn');
  });

  it('says plainly when Zotero refuses the key', async () => {
    await expect(syncZotero(emptyLibrary(), { library: 'users/1', key: 'bad', version: 0 }, async () => { throw new Error('answered with an error (403 Forbidden).'); })).rejects.toThrow(/refused the key/);
  });
});

describe('the Find Structure in Files window', () => {
  it('lists what it finds, says how many, and opens the one picked', async () => {
    const { FindInFilesWindow } = await import('../src/ui/find-in-files');
    if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    const opened: string[] = [];
    let written = 0;
    const w = new FindInFilesWindow({
      flash: () => {},
      pickFolder: async () => '/f',
      listFolder: async () => ({ files: [{ path: '/f/a.cdxml', size: 1, modified: 1 }, { path: '/f/sub/b.pptx', size: 1, modified: 1 }], complete: true }),
      selected: async () => ({ smiles: 'CC', label: '3' }),
      toSmiles: async (t) => t,
      deps: {
        read: async (p) => new TextEncoder().encode(p),
        found: async (b) => (new TextDecoder().decode(b).endsWith('pptx') ? [{ spot: { kind: 'slide', slide: 2 }, atoms: [4], label: '9', molblock: 'CCO' }] : [{ spot: { kind: 'drawing' }, atoms: [1], molblock: 'CC' }]),
        smiles: async (m) => m,
        contains: async (q, s) => s.map((x) => x.includes(q)),
      },
      index: { read: async () => emptyIndex(), write: async () => { written++; } },
      open: async (h) => { opened.push(`${h.path}@${spotText(h.structure.spot)}`); },
      lastFolder: { get: () => '/f', set: () => {} },
    });
    await w.open();
    const d = document.querySelector('dialog.find-files')!;
    // what it searches is behind the "i" by its title, not a line of its own
    expect(d.querySelector('h2 .info-icon')?.getAttribute('aria-label')).toMatch(/MOL, SDF, RXN, MRV, KET, CML/);
    expect(d.querySelector('p.muted:not([role=status])')).toBeNull();
    expect((d.querySelectorAll('input[type=text]')[1] as HTMLInputElement).value).toBe('3: CC');
    await w.search();
    const rows = [...d.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].slice(0, 4).map((c) => c.textContent));
    expect(rows).toEqual([['a.cdxml', 'the drawing', '', 'the same'], ['b.pptx', 'slide 3', '9', 'containing it']]);
    expect(d.querySelector('[role=status]')!.textContent).toMatch(/Found 2 structures in 2 files \(2 files searched, 2 read/);
    expect(written).toBe(1);
    (d.querySelectorAll('tbody tr')[1] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
    await Promise.resolve();
    expect(opened).toEqual(['/f/sub/b.pptx@slide 3']);
  });
});
