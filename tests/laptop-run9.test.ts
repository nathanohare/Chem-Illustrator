// @vitest-environment jsdom
//
// Fixes from the laptop recheck after run 8: ChemDraw objects named for the ChemDraw installed,
// energy diagrams (ions' charges, bonds clear of CH₃, logs in reaction order, no reaction roles
// on the axis).

import { describe, expect, it } from 'vitest';
import { chemdrawObject, chemdrawProg, progIdOf, setInstalledChemdrawProg } from '../src/io/ole-object';
import { cfbStreams } from '../src/io/cfb';
import { reactionOrder } from '../src/ui/energy-dialog';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { plainText } from '../src/richtext';
import { ENERGY_DEFAULTS, energyFrameOf, putEnergy, type EnergyData } from '../src/design/energy';
import type { QmAtom } from '../src/chem/qm-output';

describe('ChemDraw objects saved into Office files', () => {
  it('name the ChemDraw this computer has', () => {
    expect(chemdrawProg()).toBe('ChemDraw.Document.6.0');
    setInstalledChemdrawProg('ChemDraw_x64.Document.6.0');
    try {
      expect(chemdrawProg()).toBe('ChemDraw_x64.Document.6.0');
      expect(progIdOf(chemdrawObject(new Uint8Array([86, 106, 67, 68, 48, 49, 48, 48])))).toBe('ChemDraw_x64.Document.6.0');
      // something that isn't ChemDraw's name is not taken
      setInstalledChemdrawProg('Word.Document.12');
      expect(chemdrawProg()).toBe('ChemDraw.Document.6.0');
    } finally {
      setInstalledChemdrawProg(null);
    }
  });
});

describe('a ChemDraw object\'s picture', () => {
  it('goes in an OlePres000 stream as ChemDraw writes it: an EMF and its size in HIMETRIC', () => {
    const emf = new Uint8Array([1, 0, 0, 0, 9, 9, 9, 9]);
    const streams = cfbStreams(chemdrawObject(new Uint8Array([86, 106, 67, 68]), 'ChemDraw_x64.Document.6.0', { emf, w: 72, h: 36 }));
    const pres = streams.get('\u0002OlePres000')!;
    expect(pres).toBeTruthy();
    const v = new DataView(pres.buffer, pres.byteOffset, pres.byteLength);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => v.getUint32(4 * i, true))).toEqual([0xffffffff, 14, 4, 1, 0xffffffff, 2, 0, 2540, 1270, 8]);
    expect([...pres.slice(40)]).toEqual([...emf]);
    // without a picture there is none
    expect(cfbStreams(chemdrawObject(new Uint8Array([86, 106, 67, 68]))).has('\u0002OlePres000')).toBe(false);
  });
});

describe('Gaussian or ORCA files picked together', () => {
  const names = (l: string[]) => reactionOrder(l.map((name) => ({ name }))).map((f) => f.name);
  it('go in the reaction\'s order when their names say it', () => {
    expect(names(['pc.log', 'rc.log', 'ts.log'])).toEqual(['rc.log', 'ts.log', 'pc.log']);
    expect(names(['p.out', 'int1.out', 'ts2.out', 'sm.out', 'ts1.out'])).toEqual(['sm.out', 'ts1.out', 'int1.out', 'ts2.out', 'p.out']);
    expect(names(['sn2_pc.log', 'sn2_ts.log', 'sn2_rc.log'])).toEqual(['sn2_rc.log', 'sn2_ts.log', 'sn2_pc.log']);
  });
  it('else by name, numbers in order', () => {
    expect(names(['b.log', 'a.log', 'ts.log'])).toEqual(['a.log', 'b.log', 'ts.log']);
    expect(names(['10-ts.log', '2-rc.log'])).toEqual(['2-rc.log', '10-ts.log']);
  });
});

const A = (el: string, x: number, y: number, z = 0): QmAtom => ({ el, x, y, z });
const RC: QmAtom[] = [A('C', 0, 0), A('H', -0.36, 1.03), A('H', -0.36, -0.51, 0.89), A('H', -0.36, -0.51, -0.89), A('Cl', 1.78, 0), A('F', -2.6, 0)];
const TS: QmAtom[] = [A('C', 0, 0), A('H', 0, 1.07), A('H', 0, -0.535, 0.927), A('H', 0, -0.535, -0.927), A('F', -1.95, 0), A('Cl', 2.3, 0)];

const diagram = () => {
  const data: EnergyData = {
    ...ENERGY_DEFAULTS, quantity: 'ΔH', unit: 'kcal/mol', w: 240, h: 150, distances: true, structures: '2d',
    paths: [{ name: '', color: '#000000', points: [{ label: 'R', g: 0 }, { label: 'RC', g: -10, geom: RC }, { label: 'TS‡', g: 5, geom: TS }, { label: 'P', g: -15 }] }],
  };
  const doc = new Doc();
  const m = plainMeasure(doc);
  const id = doc.edit('e', () => putEnergy(doc, m, data, { x: 100, y: 100 }));
  return { doc, m, id };
};

describe('energy diagrams, 2-D', () => {
  it('show a lone halide as an anion, and not an atom with a bond being made', () => {
    const { doc } = diagram();
    const texts = [...doc.captions.values()].map((c) => plainText(c.runs));
    expect(texts).toContain('F−');
    // on the transition state F and Cl have bonds being made and broken: no charge
    expect(texts.filter((t) => t === 'F').length).toBe(1);
    expect(texts).toContain('Cl');
  });

  it('stop a bond being made at the edge of CH₃, its 3 included', () => {
    const { doc, m } = diagram();
    const ch3 = [...doc.captions.values()].find((c) => plainText(c.runs) === 'CH3')!;
    const b = m.captionBox(ch3);
    const dashed = [...doc.shapes.values()].filter((s) => s.kind === 'line' && s.dashed && Math.abs((s.y1! + s.y2!) / 2 - (b.y1 + b.y2) / 2) < 5);
    expect(dashed.length).toBe(2);
    for (const s of dashed) for (const x of [s.x1!, s.x2!]) expect(x < b.x1 || x > b.x2).toBe(true);
  });

  it('keep its axis out of reaction roles', () => {
    const { doc, id } = diagram();
    const axis = [...doc.arrows.keys()][0];
    expect(energyFrameOf(doc, 'arrow', axis)).toBe(id);
  });
});
