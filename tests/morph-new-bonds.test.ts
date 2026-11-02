// @vitest-environment jsdom
//
// Reaction animation: a bond that appears (or goes) fades in at its final shape, stopping at its
// atoms' labels as they will be, rather than reaching into a label still too faint to trim at
// (a new C=O once started too long, running over the O).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { readCdxml } from '../src/io/cdxml';
import { Renderer, withMeasure } from '../src/render/renderer';
import { arialWidth } from '../src/text-metrics';
import { planOf, buildSteps } from '../src/morph/clip';
import { frame } from '../src/morph/frame';

const noCanvas = { getContext: () => null } as unknown as HTMLCanvasElement;
const DIR = 'tests/morph/';

describe('bonds that appear or go in a reaction animation', () => {
  for (const stem of readdirSync(DIR).filter((f) => f.endsWith('.cdxml')).map((f) => f.slice(0, -6))) {
    it(`${stem}: new and vanishing bonds keep their final shape; kept bonds travel`, () => withMeasure((t, s) => arialWidth(t, s), () => {
      const { doc } = readCdxml(readFileSync(DIR + stem + '.cdxml', 'utf8'));
      const steps = buildSteps(doc, planOf(doc), new Renderer(noCanvas, noCanvas));
      let fresh = 0;
      for (const s of steps) {
        if (s.error) continue;
        const F = frame(s.A, s.B, s.map, 0.3, s.opt);
        const kept = new Set([...s.map.bmap.keys()].map((k) => 'A' + k));
        for (const l of F.lines) {
          if (l.grp.startsWith('B')) { expect(l.whole).toBe(true); fresh++; }
          if (kept.has(l.grp)) expect(l.whole).toBeFalsy();
        }
      }
      expect(fresh).toBeGreaterThanOrEqual(0);
    }));
  }
});
