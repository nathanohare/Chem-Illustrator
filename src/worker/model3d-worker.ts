// Background worker for 3-D models: OpenChemLib (BSD-3, Idorsia) builds conformers from its
// torsion library and relaxes them with the MMFF94s+ force field. It starts only when a 3-D
// model is first asked for, as its tables are large.

import { Resources } from 'openchemlib';
import { buildModel, type Model3d } from '../chem/model3d-build';

export type Model3dRequest =
  | { type: 'init'; resources: string }
  | { type: 'build'; id: number; molblock: string; count: number; seed: number };

export type Model3dResponse =
  | { type: 'ready'; ms: number }
  | { type: 'error'; id?: number; message: string }
  | { type: 'build'; id: number; model: Model3d | null; message?: string };

const post = (m: Model3dResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (e: MessageEvent<Model3dRequest>) => {
  const m = e.data;
  if (m.type === 'init') {
    const t0 = performance.now();
    try {
      await Resources.registerFromUrl(m.resources);
      post({ type: 'ready', ms: Math.round(performance.now() - t0) });
    } catch (err) {
      post({ type: 'error', message: 'The 3-D model builder failed to start: ' + String((err as Error)?.message ?? err) });
    }
  } else if (m.type === 'build') {
    try {
      const model = buildModel(m.molblock, m.count, m.seed);
      post({ type: 'build', id: m.id, model, message: model ? undefined : 'Could not build a 3-D model of this structure.' });
    } catch (err) {
      post({ type: 'build', id: m.id, model: null, message: 'Could not build a 3-D model: ' + String((err as Error)?.message ?? err) });
    }
  }
};
