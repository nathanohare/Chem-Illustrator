import { describe, expect, it } from 'vitest';
import { importedPeaks, knownPeaks } from '../src/chem/nmr/known-peaks';
import { parseUserTable } from '../src/kb/tables';

describe('peaks that are not the compound', () => {
  it('has the residual solvent and water peaks', async () => {
    const k = await knownPeaks('CDCl3', '1H');
    expect(k).toContainEqual({ name: 'Residual CDCl3', shift: 7.26 });
    expect(k).toContainEqual({ name: 'Water', shift: 1.56 });
  });

  it('reads an imported impurity table with a column per solvent', () => {
    const t = parseUserTable('Compound\tProton\t1H CDCl3\t1H DMSO-d6\nEthyl acetate\tCH3CO\t2.05\t1.99\nAcetone\tCH3\t2.17\t2.09', 'My impurities', 'user-1')!;
    const p = importedPeaks(JSON.stringify([t]), 'CDCl3', '1H');
    expect(p).toEqual([{ name: 'Ethyl acetate', shift: 2.05 }, { name: 'Acetone', shift: 2.17 }]);
  });

  it('reads an imported table with a solvent column', () => {
    const t = parseUserTable('Compound,Solvent,1H\nEthyl acetate,CDCl3,2.05\nEthyl acetate,DMSO-d6,1.99', 'Mine', 'user-2')!;
    expect(importedPeaks(JSON.stringify([t]), 'DMSO-d6', '1H')).toEqual([{ name: 'Ethyl acetate', shift: 1.99 }]);
  });
});
