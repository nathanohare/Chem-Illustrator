// The purification and technique notes: every source they cite is real and linked, every compound
// has a valid CAS number, and every entry says whether the department has checked it.

import { describe, expect, it } from 'vitest';
import { HANDLING, PURIFICATION_TABLE, REFS, TECHNIQUES, TECHNIQUES_TABLE } from '../src/kb/handling';
import { BUILT_IN_TABLES } from '../src/kb/data';
import { findRows, isCas } from '../src/kb/tables';
import { glossaryEntry } from '../src/kb/glossary';

describe('purification and technique notes', () => {
  it('cites only sources it lists, each a DOI link or a named book', () => {
    for (const e of [...HANDLING, ...TECHNIQUES]) for (const k of e.refs) expect(REFS[k], `${e.name}: ${k}`).toBeTruthy();
    for (const [k, r] of Object.entries(REFS)) {
      expect(r.cite, k).toMatch(/\d{4}/);
      if (r.url) expect(r.url, k).toMatch(/^https:\/\/doi\.org\/10\.\d{4,5}\//);
    }
    // the purification book is further reading only, never a link to a copy
    expect(REFS.armarego2017.url).toBeUndefined();
  });

  it('gives every compound a valid CAS number and a PubChem link', () => {
    for (const r of PURIFICATION_TABLE.rows) {
      expect(isCas(String(r.cas)), `${r.name} ${r.cas}`).toBe(true);
    }
    const [thf] = findRows(PURIFICATION_TABLE, '109-99-9');
    expect(thf.row.name).toBe('Tetrahydrofuran');
    expect(PURIFICATION_TABLE.links!(thf.row).map((l) => l.label)).toEqual(expect.arrayContaining(['PubChem', 'Williams & Lawton 2010']));
  });

  it('marks each entry as a draft until someone checks it', () => {
    for (const t of [PURIFICATION_TABLE, TECHNIQUES_TABLE]) {
      for (const r of t.rows) expect(String(r.checked)).toMatch(/^(Draft, not yet checked|Checked: .+, \d{4}-\d{2}-\d{2})$/);
      expect(findRows(t, '', { checked: 'Draft, not yet checked' }).length).toBe(t.rows.length);
    }
  });

  it('is searchable by what you want to do', () => {
    expect(findRows(TECHNIQUES_TABLE, 'titrat').map((m) => m.row.name)).toEqual(['Titrating alkyllithiums', 'Titrating Grignard and organozinc reagents']);
    expect(findRows(PURIFICATION_TABLE, 'CaH2').length).toBeGreaterThan(5);
    expect(findRows(PURIFICATION_TABLE, '', { kind: 'Organometallic' }).map((m) => m.row.name)).toContain('n-Butyllithium');
    expect(BUILT_IN_TABLES).toContain(PURIFICATION_TABLE);
    expect(BUILT_IN_TABLES).toContain(TECHNIQUES_TABLE);
  });

  it('explains the abbreviations it uses', () => {
    for (const t of ['m-CPBA', 'AIBN', 'TBAT', 'm/v', 'Class D', 'KF']) expect(glossaryEntry(t), t).toBeTruthy();
  });
});
