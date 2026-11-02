// @vitest-environment jsdom
// The 3-D Model window's conformer tiers: Search Conformers (many starting points, duplicates
// dropped, populations), Refine with xTB (re-ranked by xtb's energies) and Gaussian/ORCA input.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { Resources } from 'openchemlib';
import { buildModel, searchModel, type Model3d } from '../src/chem/model3d-build';
import { fittedRmsd, withPopulations } from '../src/chem/conformer-rank';
import { refineWithXtb, readXyz, KCAL_PER_HARTREE, type XtbRunner } from '../src/chem/xtb';
import { chargeAndMultiplicity, gaussianInput, orcaInput, xyzFile, type QmOptions } from '../src/chem/qm-input';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
  Resources.registerFromNodejs();
}, 30000);

const molOf = (smiles: string): string => {
  const m = RDKit.get_mol(smiles);
  try { return m.get_molblock(); } finally { m.delete(); }
};

describe('conformer search', () => {
  it('finds distinct conformers within the window, lowest first, with populations', () => {
    const m = searchModel(molOf('CCCCCCO'), { starts: 60, window: 6, rmsd: 0.5 })!;
    expect(m.starts).toBeGreaterThan(10);
    expect(m.method).toBe('MMFF94s+');
    const es = m.conformers.map((c) => c.energy!);
    expect(es).toEqual([...es].sort((a, b) => a - b));
    expect(es[es.length - 1] - es[0]).toBeLessThanOrEqual(6 + 1e-9);
    const pop = m.conformers.reduce((s, c) => s + (c.population ?? 0), 0);
    expect(pop).toBeCloseTo(1, 6);
    // a flexible chain has more than a couple of conformers, and the quick tier finds no more
    expect(m.conformers.length).toBeGreaterThan(2);
    expect(m.conformers.length).toBeGreaterThanOrEqual(Math.min(buildModel(molOf('CCCCCCO'), 12, 1)!.conformers.length, m.conformers.length));
    // no two kept are the same shape at the same energy
    const heavy = m.atoms.map((a, i) => (a.z === 1 ? -1 : i)).filter((i) => i >= 0);
    for (let i = 0; i < m.conformers.length; i++) {
      for (let j = i + 1; j < m.conformers.length; j++) {
        const same = Math.abs(m.conformers[i].energy! - m.conformers[j].energy!) < 0.1 && fittedRmsd(m.conformers[i].xyz, m.conformers[j].xyz, heavy) < 0.5;
        expect(same).toBe(false);
      }
    }
  }, 60000);

  it('keeps the drawn atoms first, so the drawing still matches', () => {
    const quick = buildModel(molOf('C[C@H](N)C(=O)O'), 4, 1)!;
    const search = searchModel(molOf('C[C@H](N)C(=O)O'), { starts: 20, window: 10, rmsd: 0.5 })!;
    expect(search.atoms.map((a) => a.z)).toEqual(quick.atoms.map((a) => a.z));
  }, 60000);

  it('measures RMSD after fitting: a moved and turned copy is the same shape', () => {
    const p = [0, 0, 0, 1.5, 0, 0, 1.5, 1.5, 0, 0, 1.5, 1.2];
    const c = Math.cos(0.7), s = Math.sin(0.7);
    const q: number[] = [];
    for (let i = 0; i < 4; i++) { const [x, y, z] = p.slice(3 * i, 3 * i + 3); q.push(c * x - s * y + 3, s * x + c * y - 1, z + 2); }
    expect(fittedRmsd(p, q, [0, 1, 2, 3])).toBeLessThan(1e-6);
    // a mirror image can't be fitted by turning
    const mirror = p.map((v, i) => (i % 3 === 2 ? -v : v));
    expect(fittedRmsd(p, mirror, [0, 1, 2, 3])).toBeGreaterThan(0.1);
  });

  it('gives Boltzmann populations at 25 °C', () => {
    const cs = withPopulations([{ xyz: [], energy: 0 }, { xyz: [], energy: 1.364 }]);
    // 1.364 kcal/mol is a factor of 10 at 298 K
    expect(cs[0].population! / cs[1].population!).toBeCloseTo(10, 1);
  });
});

const water: Model3d = {
  atoms: [{ z: 8, charge: 0 }, { z: 1, charge: 0 }, { z: 1, charge: 0 }],
  bonds: [{ a: 0, b: 1, order: 1, aromatic: false }, { a: 0, b: 2, order: 1, aromatic: false }],
  conformers: [{ xyz: [0, 0, 0, 0.96, 0, 0, -0.24, -0.93, 0], energy: 10 }, { xyz: [0, 0, 0, 0.97, 0, 0, -0.25, -0.94, 0.01], energy: 11 }],
};

describe('xTB refining', () => {
  it('reads xtb\'s XYZ back in the model\'s frame', () => {
    const back = readXyz(xyzFile(water, 0), water)!;
    back.forEach((v, i) => expect(v).toBeCloseTo(water.conformers[0].xyz[i], 6));
    expect(readXyz('2\n\nO 0 0 0\nH 1 0 0\n', water)).toBeNull();
  });

  it('runs xtb on the lowest conformers and ranks them again by its energies', async () => {
    const jobs: { charge: number; uhf: number; solvent: string | null; opt: boolean }[] = [];
    // the second conformer comes out lower in xTB
    const run: XtbRunner = async (job) => { jobs.push(job); return { xyz: job.xyz, energy: jobs.length === 1 ? -5.07 : -5.071 }; };
    const r = await refineWithXtb(water, { exe: 'xtb', solvent: 'water', opt: true, count: 5 }, run);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ charge: 0, uhf: 0, solvent: 'water', opt: true });
    expect(r.method).toBe('GFN2-xTB (ALPB water)');
    expect(r.conformers[0].energy).toBeCloseTo(-5.071 * KCAL_PER_HARTREE, 6);
    expect(r.conformers[0].xyz[3]).toBeCloseTo(0.97, 6);
    expect(r.conformers.reduce((s, c) => s + c.population!, 0)).toBeCloseTo(1, 6);
  });
});

describe('Gaussian and ORCA input', () => {
  const o: QmOptions = { program: 'orca', method: 'B3LYP D3BJ def2-SVP', job: 'opt freq', solvent: '', charge: 0, multiplicity: 1, cores: 4, memory: 8, title: 'water' };

  it('works out the charge and lowest multiplicity', () => {
    expect(chargeAndMultiplicity(water)).toEqual({ charge: 0, multiplicity: 1 });
    const hydroxyl: Model3d = { ...water, atoms: water.atoms.slice(0, 2) };
    expect(chargeAndMultiplicity(hydroxyl)).toEqual({ charge: 0, multiplicity: 2 });
    const hydronium: Model3d = { ...water, atoms: [{ z: 8, charge: 1 }, ...water.atoms.slice(1), { z: 1, charge: 0 }] };
    expect(chargeAndMultiplicity(hydronium)).toEqual({ charge: 1, multiplicity: 1 });
  });

  it('writes an ORCA input', () => {
    const t = orcaInput(water, 0, { ...o, solvent: 'water' });
    expect(t).toContain('! B3LYP D3BJ def2-SVP Opt Freq CPCM(water)');
    expect(t).toContain('%pal nprocs 4 end');
    expect(t).toContain('%maxcore 1536');
    expect(t).toMatch(/\* xyz 0 1\nO +0\.000000 +0\.000000 +0\.000000\nH +0\.960000/);
    expect(t.trimEnd().endsWith('*')).toBe(true);
  });

  it('writes a Gaussian input', () => {
    const t = gaussianInput(water, 1, { ...o, program: 'gaussian', method: 'B3LYP/6-31G(d)', job: 'sp', solvent: 'methanol' }, 'water conf2');
    const lines = t.split('\n');
    expect(lines.slice(0, 4)).toEqual(['%nprocshared=4', '%mem=8GB', '%chk=water_conf2.chk', '#p B3LYP/6-31G(d) SP SCRF=(SMD,Solvent=methanol)']);
    expect(lines[4]).toBe('');
    expect(lines[5]).toBe('water');
    expect(lines[7]).toBe('0 1');
    expect(lines.slice(8, 11).map((l) => l.split(/\s+/)[0])).toEqual(['O', 'H', 'H']);
    // ends with a blank line, as Gaussian needs
    expect(t.endsWith('\n\n')).toBe(true);
  });
});
