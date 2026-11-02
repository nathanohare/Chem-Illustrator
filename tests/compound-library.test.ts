// The Compound Library: structures added (one already there is not added twice, but takes a
// number or name it lacked), compound numbers sorted as a reader would, and SD file records.

import { describe, expect, it } from 'vitest';
import { addStructures, compareLabels, compoundSdf, newCompound, type StructureIn } from '../src/ui/compound-library';
import { emptyLibrary } from '../src/library/library';

const MOL = 'ethanol\n  test\n\n  3  2  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0\n    1.0000    0.0000    0.0000 C   0  0\n    2.0000    0.0000    0.0000 O   0  0\n  1  2  1  0\n  2  3  1  0\nM  END\n';
const s = (smiles: string, extra: Partial<StructureIn> = {}): StructureIn => ({ molfile: MOL, smiles, formula: 'C2H6O', mw: 46.07, ...extra });

describe('adding compounds', () => {
  it('adds new structures with the file they came from, and leaves known ones', () => {
    const one = addStructures(emptyLibrary(), [s('CCO', { label: '3' }), s('CC')], '/x/Scheme.cdxml', 5);
    expect(one.added.map((c) => c.smiles)).toEqual(['CCO', 'CC']);
    expect(one.added[0].files).toEqual([{ path: '/x/Scheme.cdxml', seen: 5, label: '3' }]);
    const two = addStructures(one.lib, [s('CCO', { name: 'ethanol' }), s('CC', { label: '4' })], '', 6);
    expect(two.added).toEqual([]);
    expect(two.lib.compounds.map((c) => [c.label, c.name])).toEqual([['3', 'ethanol'], ['4', '']]);
    // nothing new at all: the library is the same object (nothing to save)
    expect(addStructures(two.lib, [s('CCO')], '').lib).toBe(two.lib);
    expect(addStructures(two.lib, [s('')], '').added).toEqual([]);
  });

  it('sorts numbers as a reader would', () => {
    expect(['10', '2', 'S1', '3b', '', '3a'].sort(compareLabels)).toEqual(['2', '3a', '3b', '10', 'S1', '']);
  });

  it('writes an SD record with the number as its title and the rest as data', () => {
    const c = { ...newCompound(s('CCO', { label: '3', name: 'ethanol' }), []), cas: '64-17-5', notes: 'NB 12, p. 4\n\nshelf 2', tags: ['solvent'] };
    const rec = compoundSdf(c);
    expect(rec.split('\n')[0]).toBe('3');
    expect(rec).toContain('M  END\n> <ID>\n3\n\n> <Name>\nethanol\n\n');
    expect(rec).toContain('> <CAS>\n64-17-5\n\n');
    expect(rec).toContain('> <Notes>\nNB 12, p. 4\nshelf 2\n\n');
    expect(rec.endsWith('$$$$\n')).toBe(true);
  });
});
