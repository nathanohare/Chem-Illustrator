// @vitest-environment jsdom
//
// Knowledge Base polish from Nate's review: formulas with subscripts and nuclei with superscripts
// (shown only: the data stays plain text), the NMR solvent the spectrum was taken in (for imported
// tables), ⓘ notes on rated columns, and pictures of the Hammett groups.

import { describe, expect, it } from 'vitest';
import { prettyChem } from '../src/kb/pretty';
import { HAMMETT, HAMMETT_TABLE, groupPicture } from '../src/kb/hammett';
import { SOLVENTS_TABLE } from '../src/kb/solvents';
import { REAGENT_SAFETY } from '../src/kb/safety-tables';
import { findRows, tableTsv } from '../src/kb/tables';
import { matchSolvent } from '../src/ui/knowledge-base';
import { templateIcon } from '../src/ui/template-icons';
import { svgNode } from '../src/ui/svg-node';

describe('chemistry written properly', () => {
  it('subscripts the counts in formulas', () => {
    expect(prettyChem('CDCl3')).toBe('CDCl₃');
    expect(prettyChem('H2O and C5D5N')).toBe('H₂O and C₅D₅N');
    expect(prettyChem('(CD3)2SO')).toBe('(CD₃)₂SO');
    expect(prettyChem('Pd(PPh3)4')).toBe('Pd(PPh₃)₄');
    expect(prettyChem('dry over CaH2, then N2')).toBe('dry over CaH₂, then N₂');
    expect(prettyChem('DMSO-d6, THF-d8')).toBe('DMSO-d₆, THF-d₈');
    expect(prettyChem('oral LD50')).toBe('oral LD₅₀');
  });

  it('leaves labels, hazard codes and mechanisms alone', () => {
    for (const s of ['H225', 'C2a', 'H3', 'SN2', 'E1', 'Class 2', 'Table 1', '2,6-lutidine', 'pH 7']) expect(prettyChem(s)).toBe(s);
  });

  it('superscripts a nucleus before NMR, and anywhere in a heading', () => {
    expect(prettyChem('1H NMR and 13C NMR')).toBe('¹H NMR and ¹³C NMR');
    expect(prettyChem('2H')).toBe('2H');
    expect(prettyChem('1H (ppm)', true)).toBe('¹H (ppm)');
    expect(prettyChem('13C', true)).toBe('¹³C');
    expect(prettyChem('2H', true)).toBe('²H');
  });
});

describe('the solvent the NMR was taken in', () => {
  it('matches a solvent under its other names', () => {
    const values = ['Acetone-d6', 'CD3CN', 'CDCl3', 'DMSO-d6', 'CD3OD', 'THF-d8', 'Toluene-d8', 'D2O'];
    expect(matchSolvent(values, 'Chloroform-d')).toBe('CDCl3');
    expect(matchSolvent(values, 'cdcl3')).toBe('CDCl3');
    expect(matchSolvent(values, 'Methanol-d4')).toBe('CD3OD');
    expect(matchSolvent(values, 'Dimethyl sulfoxide-d6')).toBe('DMSO-d6');
    expect(matchSolvent(values, 'Benzene-d6')).toBe(null);
  });
});

describe('ⓘ notes on rated columns', () => {
  it('says what each rating means and that it is not a green ranking', () => {
    const ich = SOLVENTS_TABLE.columns.find((c) => c.key === 'ich')!;
    expect(ich.info).toMatch(/residual-solvent/);
    expect(ich.info).toMatch(/not a green/);
    const tier = REAGENT_SAFETY.columns.find((c) => c.key === 'tier')!;
    expect(tier.info).toMatch(/not how green/i);
    expect(HAMMETT_TABLE.columns.filter((c) => c.info).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Hammett group pictures', () => {
  it('draws every group with a structure, attached by a wavy line', () => {
    const missing = HAMMETT.filter((x) => x.smiles && !groupPicture(x.group)).map((x) => x.group);
    // ferrocenyl is a sandwich RDKit can't lay out flat
    expect(missing.filter((g) => g !== 'Fc')).toEqual([]);
    const cf3 = groupPicture('CF3')!;
    expect(cf3.atoms.filter((a) => a[2] === 'F')).toHaveLength(3);
    expect(cf3.stubs).toHaveLength(1);
    const svg = templateIcon(cf3, 48, 14);
    expect(svg).toContain('<svg');
    expect(svg).toMatch(/<path[^>]*d="M/);
    // built with DOM calls in the window (no innerHTML): the wavy line and the F labels survive
    const node = svgNode(svg)!;
    expect(node.querySelector('path')?.getAttribute('d')).toMatch(/^M/);
    expect([...node.querySelectorAll('text')].map((t) => t.textContent)).toContain('F');
  });

  it('shows the picture first, and leaves it out of a copied table', () => {
    expect(HAMMETT_TABLE.columns[0].picture).toBe(true);
    expect(HAMMETT_TABLE.picture?.(HAMMETT_TABLE.rows[0])).not.toBeNull();
    expect(tableTsv(HAMMETT_TABLE, []).split('\t')[0]).toBe('Group');
  });
});
