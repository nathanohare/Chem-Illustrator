// Background worker for predicted 1H spectra: the exact simulation of a large coupled cluster can
// take seconds (Accurate, 12 spins), which would freeze the drawing on the main thread.

import type { JGraph } from '../chem/nmr/coupling';
import type { ProtonJ } from '../chem/nmr/karplus';
import { predictSpectrum, type NmrQuality, type PredictedSpectrum } from '../chem/nmr/spectrum';

export interface SpectrumRequest { id: number; g: JGraph; h1: number[]; codes: string[]; sf: number; quality: NmrQuality; /** 3-D vicinal couplings (Accurate) */ pj?: ProtonJ[] }
export type SpectrumResponse = { id: number; spec: PredictedSpectrum } | { id: number; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (e: MessageEvent<SpectrumRequest>) => {
  const { id, g, h1, codes, sf, quality, pj } = e.data;
  try {
    const spec = predictSpectrum(g, h1, codes, sf, quality, undefined, pj);
    scope.postMessage({ id, spec } satisfies SpectrumResponse, [spec.lines.hz.buffer, spec.lines.intensity.buffer, spec.lines.width.buffer]);
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies SpectrumResponse);
  }
};
