// @vitest-environment jsdom
//
// A stereo label from ChemDraw's file stands, with a warning where the rules work out otherwise
// (Nate, 2026-11-03: ChemDraw can't read his (3,4)-MDP label, so its (S) and our (R) differ).

import { describe, it, expect } from 'vitest';
import { readCdxml } from '../src/io/cdxml';
import { writeCdxml } from '../src/io/cdxml-write';
import { atomStereoText, stereoDisagrees } from '../src/chem/stereo';
import { atomWarnings } from '../src/chem/warnings';
import type { Atom, StereoInfo } from '../src/model';

const file = `<?xml version="1.0" encoding="UTF-8" ?><CDXML BondLength="30" LineWidth="1"><page id="1"><fragment id="2"><n id="10" p="50 50" AS="S" ShowAtomStereo="yes"><objecttag TagType="Unknown" Name="stereo"><t p="55 45"><s size="4.5">(S)</s></t></objecttag></n><n id="11" p="80 50"/><b id="20" B="10" E="11"/></fragment></page></CDXML>`;

/** Rules that work out `d`, having first worked out `first`. */
const rules = (d: string | null | undefined, first = d): StereoInfo => ({ atom: () => d, bond: () => null, asFirst: () => d === undefined || d === first });

describe('a stereo label from the file', () => {
  const a = readCdxml(file).doc.atoms.get(10)!;
  it('is marked as from the file', () => {
    expect(a.stereoLabel?.fromFile).toBe(true);
  });
  it('stands where the rules work out otherwise', () => {
    expect(atomStereoText(a, rules('R'))).toBe('(S)');
    expect(stereoDisagrees('a', a, rules('R'))).toEqual({ file: '(S)', rules: '(R)' });
  });
  it('raises no warning where the rules agree, or have not worked it out', () => {
    expect(stereoDisagrees('a', a, rules('S'))).toBeNull();
    expect(stereoDisagrees('a', a, rules(undefined))).toBeNull();
    expect(stereoDisagrees('a', a, rules(null))).toBeNull();
  });
  it('gives way to the rules once the structure changes', () => {
    expect(atomStereoText(a, rules('R', 'S'))).toBe('(R)');
    expect(stereoDisagrees('a', a, rules('R', 'S'))).toBeNull();
  });
  it('does not change a label typed by hand, or one from here', () => {
    const typed = { ...a, stereoLabel: { ...a.stereoLabel!, manual: true } } as Atom;
    expect(stereoDisagrees('a', typed, rules('R'))).toBeNull();
    const own = { ...a, stereoLabel: { ...a.stereoLabel!, fromFile: undefined } } as Atom;
    expect(atomStereoText(own, rules('R'))).toBe('(R)');
  });
  it('shows as a chemistry warning', () => {
    const { doc } = readCdxml(file);
    doc.stereo = rules('R');
    expect(atomWarnings(doc, doc.atoms.get(10)!).join(' ')).toContain('says (S), but the structure works out to (R)');
    doc.stereo = rules('S');
    expect(atomWarnings(doc, doc.atoms.get(10)!).join(' ')).not.toContain('works out');
  });
  it('leaves an unedited file as it was, whatever the rules say', () => {
    const { doc } = readCdxml(file);
    doc.stereo = rules('R');
    expect(writeCdxml(doc)).toBe(file);
  });
  it('goes out on a fresh save with its own descriptor', () => {
    const { doc } = readCdxml(file);
    doc.stereo = rules('R');
    doc.source = null;
    const out = new DOMParser().parseFromString(writeCdxml(doc), 'application/xml');
    const n = [...out.querySelectorAll('n')].find((e) => e.getAttribute('id') === '10')!;
    expect(n.getAttribute('AS')).toBe('S');
    expect(n.querySelector('objecttag t')!.textContent).toBe('(S)');
  });
});
