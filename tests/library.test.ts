// Your own library (references and compounds kept between sessions): reading it back, two
// computers' copies merged, the References window's edits applied, the files a compound
// appears in, and saving merged with what another computer wrote meanwhile.

import { describe, it, expect } from 'vitest';
import {
  applyRefList, cleanCompound, collectionAndInside, collectionPath, emptyLibrary, fileRef, libraryText, mergeLibraries,
  moveMentions, noteMentions, parseLibrary, parseTags, pruneDeleted, tagsOf, toLibRef, type LibCompound, type LibraryData, type LibReference,
} from '../src/library/library';
import { Library, type LibraryPlace } from '../src/library/library-store';
import { blankRef } from '../src/document/references';

const ref = (id: string, title: string, modified = 1, extra: Partial<LibReference> = {}): LibReference => ({ ...blankRef('article', id), title, doi: `10.1/${id}`, added: 1, modified, ...extra });
const cpd = (id: string, smiles: string, modified = 1, extra: Partial<LibCompound> = {}): LibCompound => cleanCompound({ id, smiles, molfile: '', label: '', modified, added: 1, ...extra })!;
const lib = (p: Partial<LibraryData>): LibraryData => ({ ...emptyLibrary(), ...p });

describe('the library file', () => {
  it('reads back what was written, and survives a damaged file', () => {
    const l = lib({ references: [ref('r-1', 'A', 5, { tags: ['ligand'], pdf: 'r-1.pdf', pmid: '123' })], compounds: [cpd('c-1', 'CCO', 3, { label: '4a', name: 'ethanol', files: [{ path: '/a.cdxml', seen: 9, label: '4a' }] })], collections: [{ id: 'k1', name: 'Pd', kind: 'references', modified: 1 }] });
    const back = parseLibrary(libraryText(l));
    expect(back.references[0]).toMatchObject({ id: 'r-1', title: 'A', tags: ['ligand'], pdf: 'r-1.pdf', pmid: '123' });
    expect(back.compounds[0]).toMatchObject({ id: 'c-1', smiles: 'CCO', label: '4a', name: 'ethanol', files: [{ path: '/a.cdxml', label: '4a' }] });
    expect(back.collections).toHaveLength(1);
    expect(parseLibrary('{not json')).toEqual(emptyLibrary());
    expect(parseLibrary(JSON.stringify({ compounds: [{ id: 'x' }, null], references: 'nope' }))).toEqual(emptyLibrary());
  });

  it('keeps one item for each id', () => {
    const text = JSON.stringify({ references: [ref('r-1', 'A'), ref('r-1', 'B')] });
    expect(parseLibrary(text).references.map((r) => r.title)).toEqual(['A']);
  });

  it('tidies tags', () => {
    expect(parseTags('ligand, Pd;  ligand ,, review')).toEqual(['ligand', 'Pd', 'review']);
    expect(tagsOf([{ tags: ['a', 'b'] }, { tags: ['b'] }, {}])).toEqual([['b', 2], ['a', 1]]);
  });
});

describe('two copies merged (a library kept in OneDrive, changed on two computers)', () => {
  it('keeps what either has, the newer change winning', () => {
    const a = lib({ references: [ref('r-1', 'old', 1), ref('r-2', 'only here', 1)] });
    const b = lib({ references: [ref('r-1', 'new', 2), ref('r-3', 'only there', 1)] });
    const m = mergeLibraries(a, b);
    expect(m.references.map((r) => `${r.id}:${r.title}`).sort()).toEqual(['r-1:new', 'r-2:only here', 'r-3:only there']);
    expect(mergeLibraries(b, a).references.find((r) => r.id === 'r-1')!.title).toBe('new');
  });

  it('keeps deleted things deleted, unless changed again after', () => {
    const a = lib({ references: [ref('r-1', 'A', 1), ref('r-2', 'B', 9)], deleted: {} });
    const b = lib({ deleted: { 'r-1': 5, 'r-2': 5 } });
    const m = mergeLibraries(a, b);
    expect(m.references.map((r) => r.id)).toEqual(['r-2']);
    expect(m.deleted).toEqual({ 'r-1': 5, 'r-2': 5 });
  });

  it('puts together the files a compound was seen in on both', () => {
    const a = lib({ compounds: [cpd('c-1', 'CCO', 1, { files: [{ path: '/a', seen: 10 }] })] });
    const b = lib({ compounds: [cpd('c-1', 'CCO', 2, { name: 'ethanol', files: [{ path: '/b', seen: 20 }, { path: '/a', seen: 5 }] })] });
    const c = mergeLibraries(a, b).compounds[0];
    expect(c.name).toBe('ethanol');
    expect(c.files.map((f) => `${f.path}@${f.seen}`)).toEqual(['/b@20', '/a@10']);
  });

  it('lets old deleted marks go', () => {
    const day = 24 * 3600 * 1000;
    const l = lib({ deleted: { old: 0, recent: 100 * day } });
    expect(pruneDeleted(l, 190 * day).deleted).toEqual({ recent: 100 * day });
    expect(pruneDeleted(l, 400 * day).deleted).toEqual({});
  });
});

describe('the References window changing the library', () => {
  it('keeps tags and PDFs of references kept, adds new ones and marks the rest deleted', () => {
    const l = lib({ references: [ref('r-1', 'A', 1, { tags: ['t'], pdf: 'p.pdf' }), ref('r-2', 'B', 1)] });
    const plain = [fileRef(l.references[0]), { ...fileRef(l.references[0]), id: 'r-new', title: 'C', doi: '10.1/c' }];
    plain[0] = { ...plain[0], title: 'A edited' };
    const next = applyRefList(l, plain, 50);
    expect(next.references.map((r) => r.title)).toEqual(['A edited', 'C']);
    expect(next.references[0]).toMatchObject({ tags: ['t'], pdf: 'p.pdf', modified: 50 });
    expect(next.references[1]).toMatchObject({ added: 50, modified: 50 });
    expect(next.deleted['r-2']).toBe(50);
  });

  it('leaves a reference that did not change as it was', () => {
    const l = lib({ references: [ref('r-1', 'A', 7)] });
    expect(applyRefList(l, [fileRef(l.references[0])], 50).references[0]).toBe(l.references[0]);
  });

  it('copies out plain references (no tags or PDF go into a document)', () => {
    const r = fileRef(ref('r-1', 'A', 1, { tags: ['x'], pdf: 'p.pdf', pmid: '9' }));
    expect(r).not.toHaveProperty('tags');
    expect(r).not.toHaveProperty('pdf');
    expect(r).not.toHaveProperty('pmid');
    const back = toLibRef({ ...r, live: { app: 'zotero', id: '1' } } as never, ['r-1'], 3);
    expect(back.id).not.toBe('r-1');
    expect(back).not.toHaveProperty('live');
  });
});

describe('the files a compound appears in', () => {
  it('remembers each file once, newest first, with the number it had there', () => {
    let l = lib({ compounds: [cpd('c-1', 'CCO'), cpd('c-2', 'CCN')] });
    l = noteMentions(l, '/x/Scheme 1.cdxml', [{ smiles: 'CCO', label: '3' }, { smiles: 'C' }], 1000);
    l = noteMentions(l, '/x/Paper.docx', [{ smiles: 'CCO' }], 2000);
    expect(l.compounds[0].files.map((f) => `${f.path}:${f.label ?? ''}`)).toEqual(['/x/Paper.docx:', '/x/Scheme 1.cdxml:3']);
    expect(l.compounds[1].files).toEqual([]);
    // the same again soon after: nothing new, the library is unchanged
    expect(noteMentions(l, '/x/Paper.docx', [{ smiles: 'CCO' }], 2500)).toBe(l);
    const moved = moveMentions(l, '/x/Paper.docx', '/y/Paper v2.docx');
    expect(moved.compounds[0].files[0].path).toBe('/y/Paper v2.docx');
  });

  it('a compound has no structure: not kept', () => {
    expect(cleanCompound({ id: 'c', name: 'x' })).toBeNull();
  });
});

describe('collections', () => {
  const l = lib({ collections: [{ id: 'a', name: 'Projects', kind: 'references', modified: 1 }, { id: 'b', name: 'Total synthesis', kind: 'references', parent: 'a', modified: 1 }, { id: 'c', name: 'Step 1', kind: 'references', parent: 'b', modified: 1 }] });
  it('names a collection with those it sits in', () => {
    expect(collectionPath(l, 'c')).toBe('Projects ▸ Total synthesis ▸ Step 1');
  });
  it('shows what is in a collection inside it', () => {
    expect([...collectionAndInside(l, 'a')].sort()).toEqual(['a', 'b', 'c']);
  });
});

/** A place in memory that another computer can write to as well. */
function memoryPlace(): LibraryPlace & { text: string | null; writes: number } {
  const p = {
    text: null as string | null, writes: 0,
    async read() { return p.text; },
    async write(t: string) { p.text = t; p.writes++; },
    async readFile() { return null; }, async writeFile() {}, async removeFile() {},
    async where() { return 'memory'; }, async filePath() { return null; },
  };
  return p;
}

describe('keeping the library', () => {
  it('saves a moment after a change, merged with what another computer wrote meanwhile', async () => {
    const place = memoryPlace();
    const a = new Library(place, 0);
    await a.load();
    a.change((l) => ({ ...l, references: [ref('r-1', 'from A')] }));
    await a.flush();
    expect(parseLibrary(place.text).references.map((r) => r.title)).toEqual(['from A']);
    // the other computer adds one
    const other = parseLibrary(place.text);
    place.text = libraryText({ ...other, references: [...other.references, ref('r-2', 'from B')] });
    a.change((l) => ({ ...l, compounds: [cpd('c-1', 'CCO')] }));
    await a.saveNow();
    const saved = parseLibrary(place.text);
    expect(saved.references.map((r) => r.title).sort()).toEqual(['from A', 'from B']);
    expect(saved.compounds).toHaveLength(1);
    // and it shows here too
    expect(a.now.references).toHaveLength(2);
  });

  it('a change that changes nothing is not saved', async () => {
    const place = memoryPlace();
    const a = new Library(place, 0);
    await a.load();
    a.change((l) => l);
    await a.flush();
    expect(place.writes).toBe(0);
  });

  it('says when it could not be saved', async () => {
    const place = memoryPlace();
    place.write = async () => { throw new Error('disk full'); };
    const a = new Library(place, 0);
    await a.load();
    a.change((l) => ({ ...l, references: [ref('r-1', 'x')] }));
    await a.flush();
    expect(a.problem).toMatch(/disk full/);
  });
});
