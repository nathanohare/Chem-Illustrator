// The big Reagent Safety table: records read from PubChem with the shared parser, stored compactly
// without CAS numbers, put back whole, and the Not rated tier for compounds with no open data.

import { describe, expect, it } from 'vitest';
import { compactRecord, hasHazardData, safetyRecordFrom, type ViewRecord } from '../src/kb/pubchem-safety';
import { rate, badges, type SafetyRecord } from '../src/kb/safety';
import { safetyRow, sortSafety, SAFETY_RECORDS } from '../src/kb/safety-tables';
import { fullRecord, EXTRA_RECORDS } from '../src/kb/safety-extra';
import { pubchemSafetyRecord } from '../src/chem/pubchem';
import { LATER_ROWS } from '../src/kb/data';

const HSDB = 'Hazardous Substances Data Bank (HSDB)';
const EU = 'Regulation (EC) No 1272/2008 of the European Parliament and of the Council';
const HAZMAP = 'Haz-Map, Information on Hazardous Chemicals and Occupational Diseases';

/** A small PUG View record: an HSDB LD50 and vapour pressure, an EU hazard statement, a Haz-Map value. */
const view = (): ViewRecord => ({
  RecordTitle: 'Testane',
  Reference: [
    { ReferenceNumber: 1, SourceName: HSDB, URL: 'https://pubchem.ncbi.nlm.nih.gov/source/hsdb/1' },
    { ReferenceNumber: 2, SourceName: EU },
    { ReferenceNumber: 3, SourceName: HAZMAP },
  ],
  Section: [{
    TOCHeading: 'Safety and Hazards',
    Section: [
      { TOCHeading: 'Non-Human Toxicity Values', Information: [
        { ReferenceNumber: 1, Value: { StringWithMarkup: [{ String: 'LD50 Rat oral 440 mg/kg' }] } },
        { ReferenceNumber: 1, Value: { StringWithMarkup: [{ String: 'LD50 Rat oral 300 mg/kg' }] } },
        { ReferenceNumber: 1, Value: { StringWithMarkup: [{ String: 'LD50 Rabbit dermal 2 g/kg' }] } },
      ] },
      { TOCHeading: 'Vapor Pressure', Information: [
        { ReferenceNumber: 3, Value: { StringWithMarkup: [{ String: '999 mm Hg' }] } },
        { ReferenceNumber: 1, Value: { StringWithMarkup: [{ String: '12 mm Hg at 25 °C' }] } },
      ] },
      { TOCHeading: 'GHS Classification', Information: [
        { ReferenceNumber: 2, Name: 'GHS Hazard Statements', Value: { StringWithMarkup: [{ String: 'H225: Highly flammable liquid and vapour' }] } },
      ] },
      { TOCHeading: 'CAS', Information: [{ ReferenceNumber: 1, Value: { StringWithMarkup: [{ String: '64-17-5' }] } }] },
    ],
  }],
});

describe('reading a PubChem record', () => {
  it('keeps open sources only and every value\'s source', () => {
    const r = safetyRecordFrom({ name: 'Testane', cid: 9, cas: null, mw: '46.07', view: view() });
    expect(r.vp).toEqual({ text: '12 mm Hg at 25 °C', source: 'HSDB' }); // Haz-Map's value left out
    expect(r.lethal.filter((l) => l.route === 'oral')).toHaveLength(2);
    expect(r.ghs?.codes).toEqual(['H225']);
    expect(r.mw).toBeCloseTo(46.07);
    expect(hasHazardData(r)).toBe(true);
  });

  it('stores a compact record: lowest dose per route, no CAS, no links', () => {
    const r = safetyRecordFrom({ name: 'Testane', cid: 9, cas: '64-17-5', view: view() });
    const c = compactRecord(r);
    expect(c.cas).toBeNull();
    expect(c.lethal.map((l) => [l.route, l.value])).toEqual([['oral', 300], ['dermal', 2]]);
  });

  it('puts the empty fields back', () => {
    const r = fullRecord({ name: 'Sparse', cid: 5 });
    expect(r.lethal).toEqual([]);
    expect(r.alerts).toEqual([]);
    expect(() => safetyRow(r)).not.toThrow();
  });
});

describe('Not rated', () => {
  const empty = (over: Partial<SafetyRecord> = {}): SafetyRecord => fullRecord({ name: 'Unknownium', cid: 123456789, ...over });

  it('never calls a compound without data Tier 3', () => {
    const r = rate(empty());
    expect(r.tier).toBeNull();
    expect(r.why[0]).toMatch(/Not rated/);
    expect(safetyRow(empty()).tier).toBe('Not rated');
  });

  it('rates once any open number is there', () => {
    expect(rate(empty({ ghs: { codes: ['H225'], classes: '' } })).tier).toBe(3);
    expect(rate(empty({ lethal: [{ kind: 'LD50', species: 'rat', route: 'oral', value: 20, unit: 'mg/kg', time: '', source: 'HSDB' }] })).tier).toBe(2);
  });

  it('rates the common reagents the open sources skip', () => {
    const named = (n: string) => SAFETY_RECORDS.find((r) => r.name === n)!;
    expect(SAFETY_RECORDS.filter((r) => rate(r).tier === null).map((r) => r.name)).toEqual([]);
    expect(rate(named('Sodium hydride')).why.join(' ')).toMatch(/DMF/);
    expect(badges(named('Sodium hydride'))).toContain('Water-reactive');
    expect(rate(named('4-Dimethylaminopyridine')).tier).toBe(2);
    expect(rate(named('Di-tert-butyl dicarbonate')).tier).toBe(2);
    expect(rate(named('Oxalyl chloride')).tier).toBe(3);
  });

  it('sorts Not rated after Tier 4', () => {
    const rows = sortSafety([{ name: 'b', tier: 'Not rated' }, { name: 'a', tier: 4 }, { name: 'c', tier: 1 }]);
    expect(rows.map((r) => r.name)).toEqual(['c', 'a', 'b']);
  });
});

describe('the big table', () => {
  it('loads later, without CAS numbers or compounds already in the main list', async () => {
    const core = new Set(SAFETY_RECORDS.map((r) => r.cid));
    expect(EXTRA_RECORDS.every((r) => r.cas === null && !core.has(r.cid))).toBe(true);
    const rows = await LATER_ROWS.find((l) => l.table === 'reagent-safety')!.rows();
    expect(rows.length).toBe(EXTRA_RECORDS.length);
  });
});

describe('rating live from PubChem', () => {
  it('looks a CAS number up and reads the record with the same rules', async () => {
    const asked: string[] = [];
    const fake = (async (url: string) => {
      asked.push(url);
      const body = url.includes('/xref/RN/') ? { IdentifierList: { CID: [702] } }
        : url.includes('/property/') ? { PropertyTable: { Properties: [{ CID: 702, Title: 'Ethanol', MolecularFormula: 'C2H6O', MolecularWeight: '46.07', SMILES: 'CCO', XLogP: -0.1 }] } }
          : { Record: view() };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    const r = await pubchemSafetyRecord({ cas: '64-17-5' }, fake);
    expect(asked[0]).toMatch(/xref\/RN\/64-17-5/);
    expect(r?.cid).toBe(702);
    expect(r?.name).toBe('Ethanol');
    expect(r?.smiles).toBe('CCO');
    expect(rate(r!).tier).toBe(3);
  });

  it('says so when PubChem has no such compound', async () => {
    const fake = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    expect(await pubchemSafetyRecord({ cas: '50-00-0' }, fake)).toBeNull();
  });
});
