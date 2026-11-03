import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { nameMultiplet, readJcamp, readSpectrumFile, referenceToSolvent, spectrumToList, SpectrumFileError } from '../src/chem/nmr/spectrum-file';

/** A synthetic 1H spectrum (400 MHz, 0..10 ppm): Lorentzian lines, ppm high to low. */
function synth(lines: [number, number][], n = 16384, sf = 400): { ppm: Float64Array; y: Float64Array } {
  const ppm = Float64Array.from({ length: n }, (_, i) => 10 - (10 * i) / (n - 1));
  const hw = 0.5 / sf; // 1 Hz wide lines
  const y = Float64Array.from(ppm, (p) => lines.reduce((t, [c, a]) => t + (a * hw * hw) / (hw * hw + (p - c) ** 2), 0) + 1e-4 * Math.sin(p * 9173));
  return { ppm, y };
}

// ethyl group (q 4.12, t 1.25, J 7) and a singlet at 2.05 (3H), CHCl3 at 7.26
const J = 7 / 400;
const ETHYL: [number, number][] = [
  ...[1, 3, 3, 1].map((a, k) => [4.12 + (k - 1.5) * J, a * 0.5] as [number, number]),
  ...[1.5, 3, 1.5].map((a, k) => [1.25 + (k - 1) * J, a] as [number, number]),
  [2.05, 6], [7.26, 1],
];

function jcampAffn(ppm: Float64Array, y: Float64Array): string {
  const lines = ['##TITLE=test', '##JCAMP-DX=5.01', '##DATA TYPE=NMR SPECTRUM', '##.OBSERVE FREQUENCY=400', '##.OBSERVE NUCLEUS=^1H', '##.SOLVENT NAME=CDCl3', '##XUNITS=PPM', '##YUNITS=ARBITRARY UNITS',
    `##FIRSTX=${ppm[0]}`, `##LASTX=${ppm[ppm.length - 1]}`, '##YFACTOR=0.0001', `##NPOINTS=${ppm.length}`, '##XYDATA=(X++(Y..Y))'];
  for (let i = 0; i < y.length; i += 8) lines.push(`${ppm[i]} ${Array.from(y.slice(i, i + 8), (v) => Math.round(v / 0.0001)).join(' ')}`);
  lines.push('##END=');
  return lines.join('\n');
}

describe('measured spectra for Check Data', () => {
  it('decodes ASDF (SQZ, DIF, DUP) with Y-checks', () => {
    // 1, 2, 3, 3, then -1 six times, then (Y-check -3) +1
    const text = ['##TITLE=t', '##.OBSERVE FREQUENCY=1', '##XUNITS=HZ', '##FIRSTX=10', '##LASTX=0', '##YFACTOR=1', '##NPOINTS=11', '##XYDATA=(X++(Y..Y))',
      '10 AJJ%jX', '0 cJ', '##END='].join('\n');
    const sp = readJcamp(text);
    expect([...sp.y]).toEqual([1, 2, 3, 3, 2, 1, 0, -1, -2, -3, -2]);
    expect(sp.ppm[0]).toBe(10);
    expect(() => readJcamp(text.replace('0 cJ', '0 bJ'))).toThrow(SpectrumFileError);
  });

  it('reads JCAMP-DX AFFN and finds multiplets with integrals', () => {
    const { ppm, y } = synth(ETHYL);
    const sp = readJcamp(jcampAffn(ppm, y));
    expect(sp.nuc).toBe('1H');
    expect(sp.solvent).toBe('CDCl3');
    expect(sp.sf).toBe(400);
    const list = spectrumToList(sp, '1H', 8, [7.26]);
    const byShift = (v: number) => list.peaks.find((p) => Math.abs(p.value - v) < 0.02)!;
    expect(byShift(4.12).mult).toBe('q');
    expect(byShift(4.12).j![0]).toBeCloseTo(7, 0);
    expect(byShift(1.25).mult).toBe('t');
    expect(byShift(2.05).mult).toBe('s');
    expect(byShift(1.25).n! / byShift(4.12).n!).toBeCloseTo(1.5, 1);
    expect(byShift(2.05).n).toBeCloseTo(3, 0);
  });

  it('references the axis to the residual solvent peak', () => {
    const shifted = ETHYL.map(([c, a]) => [c + 0.03, a] as [number, number]);
    const { ppm, y } = synth(shifted);
    const sp = readJcamp(jcampAffn(ppm, y));
    const d = referenceToSolvent(sp, '1H', [7.26]);
    expect(d).toBeCloseTo(-0.03, 2);
  });

  it('reads a zipped Bruker experiment (processed data)', () => {
    const { ppm, y } = synth(ETHYL, 8192);
    const r1 = new Uint8Array(y.length * 4);
    const dv = new DataView(r1.buffer);
    y.forEach((v, i) => dv.setInt32(i * 4, Math.round(v * 1e6), true));
    const swp = (ppm[0] - ppm[ppm.length - 1]) * 400 * (y.length / (y.length - 1));
    const procs = `##$BYTORDP= 0\n##$DTYPP= 0\n##$NC_proc= 0\n##$OFFSET= ${ppm[0]}\n##$SF= 400\n##$SI= ${y.length}\n##$SW_p= ${swp}\n##$AXNUC= <1H>\n`;
    const acqus = '##$NUC1= <1H>\n##$SOLVENT= <CDCl3>\n';
    const enc = new TextEncoder();
    const zip = zipSync({ 'ethyl/10/acqus': enc.encode(acqus), 'ethyl/10/fid': new Uint8Array(8), 'ethyl/10/pdata/1/procs': enc.encode(procs), 'ethyl/10/pdata/1/1r': r1 });
    const sp = readSpectrumFile('ethyl.zip', zip);
    expect(sp.nuc).toBe('1H');
    expect(sp.solvent).toBe('CDCl3');
    expect(sp.ppm[0]).toBeCloseTo(10, 6);
    const list = spectrumToList(sp, '1H', 8, [7.26]);
    expect(list.peaks.some((p) => Math.abs(p.value - 4.12) < 0.01 && p.mult === 'q')).toBe(true);
  });

  it('asks for processed data when a Bruker folder has only the FID', () => {
    const zip = zipSync({ 'x/1/fid': new Uint8Array(8), 'x/1/acqus': new TextEncoder().encode('##$NUC1= <1H>\n') });
    expect(() => readSpectrumFile('x.zip', zip)).toThrow(SpectrumFileError);
  });

  it('names first-order multiplets', () => {
    expect(nameMultiplet([0, 7], [1, 1]).mult).toBe('d');
    expect(nameMultiplet([0, 7, 14], [1, 2, 1])).toEqual({ mult: 't', j: [7] });
    // dd 15.9, 7.1
    const dd = [0, 7.1, 15.9, 23];
    expect(nameMultiplet(dd, [1, 1, 1, 1])).toEqual({ mult: 'dd', j: [15.9, 7.1] });
    // dt 15.9, 7.1
    const dt = [0, 7.1, 14.2, 15.9, 23, 30.1];
    expect(nameMultiplet(dt, [1, 2, 1, 1, 2, 1])).toEqual({ mult: 'dt', j: [15.9, 7.1] });
    expect(nameMultiplet([0, 3, 11], [1, 3, 2]).mult).toBe('m');
  });
});
