// Runs predictSpectrum in a background worker; null where workers are unavailable (tests, old
// browsers), in which case callers simulate on the spot.

import type { JGraph } from './coupling';
import type { ProtonJ } from './karplus';
import type { NmrQuality, PredictedSpectrum } from './spectrum';
import type { SpectrumRequest, SpectrumResponse } from '../../worker/nmr-spectrum-worker';

let worker: Worker | null | undefined;
let next = 1;
const waiting = new Map<number, { resolve: (s: PredictedSpectrum) => void; reject: (e: Error) => void }>();

function start(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === 'undefined') return (worker = null);
    worker = import.meta.env.DEV
      ? new Worker(new URL('../../worker/nmr-spectrum-worker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('../../worker/nmr-spectrum-worker.ts', import.meta.url));
    worker.onmessage = (e: MessageEvent<SpectrumResponse>) => {
      const m = e.data, w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      if ('spec' in m) w.resolve(m.spec); else w.reject(new Error(m.error));
    };
    worker.onerror = () => { for (const w of waiting.values()) w.reject(new Error('The spectrum simulation stopped.')); waiting.clear(); worker?.terminate(); worker = null; };
  } catch {
    worker = null;
  }
  return worker;
}

/** The spectrum, simulated in the background; null when no worker can run. */
export function spectrumInBackground(g: JGraph, h1: number[], codes: string[], sf: number, quality: NmrQuality, pj?: ProtonJ[]): Promise<PredictedSpectrum> | null {
  const w = start();
  if (!w) return null;
  const id = next++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ id, g, h1, codes, sf, quality, pj } satisfies SpectrumRequest);
  });
}
