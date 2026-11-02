// CAS RNs both ways: reading one from text (check digit), the answers kept on this computer, and
// the lookups in order (Compound Library, kept answers, PubChem, NCI CACTUS). No network: the
// services' answers are hand-made in their own formats.
import { describe, expect, it } from 'vitest';
import { CasMemory, casCheckDigit, casForStructure, casTypoMessage, readCas, structureForCas, type CasDeps, type CasLibCompound, type CasStore } from '../src/chem/cas';
import { casHtml } from '../src/ui/cas-panel';
import type { Fetch } from '../src/chem/pubchem';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function memStore(): CasStore & { text: string | null } {
  const s = { text: null as string | null, read: () => s.text, write: (t: string) => { s.text = t; } };
  return s;
}

/** Pretend PubChem and CACTUS: answers by address; keeps what was asked. */
function fake(routes: [RegExp, unknown | ((url: string) => Response)][]): { fetchFn: Fetch; asked: string[] } {
  const asked: string[] = [];
  const fetchFn = (async (url: string) => {
    asked.push(url);
    for (const [re, body] of routes) if (re.test(url)) return typeof body === 'function' ? (body as (u: string) => Response)(url) : typeof body === 'string' ? new Response(body) : json(body);
    return new Response('not found', { status: 404 });
  }) as unknown as Fetch;
  return { fetchFn, asked };
}

const deps = (fetchFn: Fetch, over: Partial<CasDeps> = {}): CasDeps => ({
  library: async () => [], memory: new CasMemory(memStore()), online: true, canonical: async (s) => s, fetchFn, ...over,
});

const ASPIRIN = 'CC(=O)OC1=CC=CC=C1C(=O)O';

describe('reading a CAS RN', () => {
  it('works out the check digit', () => {
    expect(casCheckDigit('50', '78')).toBe(2);
    expect(casCheckDigit('7732', '18')).toBe(5);
    expect(casCheckDigit('64', '17')).toBe(5);
  });
  it('reads the usual ways of writing one', () => {
    for (const t of ['50-78-2', ' 50-78-2 ', 'CAS 50-78-2', 'CAS RN 50-78-2', 'CAS RN: 50-78-2', 'CAS No. 50-78-2', 'CAS# 50-78-2', 'CAS Registry Number 50-78-2', '[50-78-2]', '50–78–2', '50 - 78 - 2', '0000050-78-2'])
      expect(readCas(t), t).toEqual({ kind: 'cas', cas: '50-78-2' });
    expect(readCas('7732-18-5')).toEqual({ kind: 'cas', cas: '7732-18-5' });
    expect(readCas('1234567-89-4')?.cas).toBe('1234567-89-4');
  });
  it('catches a wrong check digit and says what it should be', () => {
    const r = readCas('50-78-3');
    expect(r).toEqual({ kind: 'typo', cas: '50-78-3', should: 2 });
    expect(casTypoMessage(r as Extract<typeof r, { kind: 'typo' }>)).toContain('should be 2');
  });
  it('leaves names, SMILES, dates and other numbers alone', () => {
    for (const t of ['aspirin', 'CCO', '2024-11-02', '5-78-2', '50-7-2', '50-78', '12345678-90-1', '2-methylpropan-1-ol', 'C1CC1-2-3'])
      expect(readCas(t), t).toBeNull();
  });
});

describe('answers kept on this computer', () => {
  it('keeps them between sessions, by number and by structure', () => {
    const store = memStore();
    const a = new CasMemory(store);
    a.remember([{ cas: '50-78-2', smiles: ASPIRIN, key: 'k1', whole: true, name: 'Aspirin', cid: 2244, source: 'PubChem', found: '2026-11-02T00:00:00Z' },
      { cas: '11126-35-5', smiles: ASPIRIN, key: 'k1', whole: true, name: 'Aspirin', cid: 2244, source: 'PubChem', found: '2026-11-02T00:00:00Z' }]);
    const b = new CasMemory(store);
    expect(b.byCas('50-78-2')?.smiles).toBe(ASPIRIN);
    expect(b.byKey('k1')).toEqual({ cas: ['50-78-2', '11126-35-5'], name: 'Aspirin', cid: 2244, source: 'PubChem' });
    expect(b.byKey('other')).toBeNull();
  });
  it('a number looked up on its own does not cut a structure\'s list short', () => {
    const m = new CasMemory(memStore());
    m.remember([{ cas: '50-78-2', smiles: ASPIRIN, key: 'k1', whole: true, source: 'PubChem', found: '2026-11-01T00:00:00Z' },
      { cas: '11126-35-5', smiles: ASPIRIN, key: 'k1', whole: true, source: 'PubChem', found: '2026-11-01T00:00:00Z' }]);
    m.remember([{ cas: '11126-35-5', smiles: ASPIRIN, key: 'k1', source: 'PubChem', found: '2026-11-02T00:00:00Z' }]);
    expect(m.byKey('k1')?.cas).toEqual(['50-78-2', '11126-35-5']);
    expect(m.byCas('11126-35-5')).not.toBeNull();
  });
  it('remembers a structure with no CAS RN, and keeps no more than its limit', () => {
    const m = new CasMemory(memStore(), 3);
    m.rememberNone('k2', 'C', 'PubChem', { cid: 5 });
    expect(m.byKey('k2')).toEqual({ cas: [], name: undefined, cid: 5, source: 'PubChem' });
    for (let i = 0; i < 5; i++) m.remember([{ cas: `${50 + i}-00-${casCheckDigit(String(50 + i), '00')}`, smiles: 'C', source: 'PubChem', found: '' }]);
    expect(m.size).toBe(3);
  });
  it('ignores damaged storage', () => {
    const store = memStore();
    store.text = '{not json';
    expect(new CasMemory(store).byCas('50-78-2')).toBeNull();
    store.text = JSON.stringify({ entries: [{ cas: '50-78-3', smiles: 'C' }, { nonsense: 1 }] });
    expect(new CasMemory(store).size).toBe(0);
  });
});

describe('CAS RN to structure', () => {
  it('finds it in your Compound Library first, offline', async () => {
    const lib: CasLibCompound[] = [{ cas: '', synonyms: ['CAS 64-17-5'], smiles: 'CCO', name: 'ethanol', label: '3' }];
    const { fetchFn, asked } = fake([]);
    const r = await structureForCas('64-17-5', deps(fetchFn, { library: async () => lib, online: false }));
    expect(r).toEqual({ smiles: 'CCO', note: 'CAS RN 64-17-5 is 3 · ethanol in your Compound Library.' });
    expect(asked).toEqual([]);
  });
  it('looks it up on PubChem, says when several compounds share it, and keeps the answer', async () => {
    const { fetchFn, asked } = fake([
      [/\/name\/50-78-2\/cids/, { IdentifierList: { CID: [2244, 517180] } }],
      [/\/cid\/2244\/property/, { PropertyTable: { Properties: [{ CID: 2244, SMILES: ASPIRIN, Title: 'Aspirin' }] } }],
    ]);
    const d = deps(fetchFn);
    const r = await structureForCas('50-78-2', d);
    expect(r).toMatchObject({ smiles: ASPIRIN });
    expect('note' in r && r.note).toContain('Aspirin (CID 2244)');
    expect('note' in r && r.note).toContain('2 compounds');
    expect(asked).toHaveLength(2);
    // the second time, offline, from what was kept
    const again = await structureForCas('50-78-2', { ...d, online: false });
    expect(again).toMatchObject({ smiles: ASPIRIN });
    expect(asked).toHaveLength(2);
  });
  it('asks NCI CACTUS when PubChem doesn\'t know it', async () => {
    const { fetchFn } = fake([[/cactus\.nci\.nih\.gov\/chemical\/structure\/50-78-2\/smiles/, 'CC(=O)Oc1ccccc1C(O)=O\n']]);
    const r = await structureForCas('50-78-2', deps(fetchFn));
    expect(r).toMatchObject({ smiles: 'CC(=O)Oc1ccccc1C(O)=O' });
    expect('note' in r && r.note).toContain('NCI CACTUS');
  });
  it('says plainly when nobody knows it, when offline, and when lookups are off', async () => {
    expect(await structureForCas('50-78-2', deps(fake([]).fetchFn))).toEqual({ error: 'Neither PubChem nor NCI CACTUS knows CAS RN 50-78-2. Check the number, or draw the structure.' });
    const down = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as Fetch;
    const off = await structureForCas('50-78-2', deps(down));
    expect('error' in off && off.error).toContain('Could not reach PubChem');
    const no = await structureForCas('50-78-2', deps(fake([]).fetchFn, { online: false }));
    expect('error' in no && no.error).toContain('turned off in Edit > Settings');
  });
});

describe('structure to CAS RN', () => {
  it('gives every CAS RN PubChem lists, main one first, and keeps them', async () => {
    const { fetchFn, asked } = fake([
      [/\/smiles\/cids/, { IdentifierList: { CID: [2244] } }],
      [/\/cid\/2244\/synonyms/, { InformationList: { Information: [{ CID: 2244, Synonym: ['aspirin', 'ACETYLSALICYLIC ACID', '50-78-2', 'Acetysal', '11126-35-5', '50-78-3'] }] } }],
    ]);
    const d = deps(fetchFn);
    const r = await casForStructure('CC(=O)Oc1ccccc1C(=O)O', d);
    expect(r).toEqual({ kind: 'found', cas: ['50-78-2', '11126-35-5'], name: 'aspirin', cid: 2244, from: 'PubChem' });
    const again = await casForStructure('CC(=O)Oc1ccccc1C(=O)O', { ...d, online: false });
    expect(again).toMatchObject({ kind: 'found', cas: ['50-78-2', '11126-35-5'] });
    expect(asked).toHaveLength(2);
  });
  it('uses the CAS RN in your Compound Library', async () => {
    const lib: CasLibCompound[] = [{ cas: '64-17-5', synonyms: [], smiles: 'CCO', name: 'ethanol', label: '' }];
    const r = await casForStructure('CCO', deps(fake([]).fetchFn, { library: async () => lib }));
    expect(r).toEqual({ kind: 'found', cas: ['64-17-5'], name: 'ethanol', from: 'your Compound Library' });
  });
  it('tells a structure PubChem hasn\'t got from one with no CAS RN', async () => {
    expect((await casForStructure('C1CC1N', deps(fake([]).fetchFn))).kind).toBe('none');
    const { fetchFn } = fake([[/\/smiles\/cids/, { IdentifierList: { CID: [99] } }], [/\/cid\/99\/synonyms/, { InformationList: { Information: [{ Synonym: ['thing'] }] } }]]);
    const d = deps(fetchFn);
    const r = await casForStructure('C1CC1N', d);
    expect(r).toMatchObject({ kind: 'none', cid: 99 });
    expect(r.kind === 'none' && r.message).toContain('lists no CAS RN');
    expect((await casForStructure('C1CC1N', { ...d, online: false })).kind).toBe('none');
  });
});

describe('the Analysis panel line', () => {
  it('shows a Find button, then the number with a caption button', () => {
    expect(casHtml({ kind: 'idle' }, 0).row).toContain('data-cas="0"');
    expect(casHtml({ kind: 'idle' }, 0).button).toBe('');
    const f = casHtml({ kind: 'found', cas: ['50-78-2', '11126-35-5'], name: 'Aspirin', from: 'PubChem' }, 1);
    expect(f.row).toContain('50-78-2');
    expect(f.row).toContain('Also listed: 11126-35-5');
    expect(f.button).toContain('data-insert="cas:1"');
    expect(casHtml({ kind: 'error', message: '<b>' }, 0).row).toContain('&lt;b&gt;');
  });
});
