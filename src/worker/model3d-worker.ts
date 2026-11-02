// Background worker for 3-D models: OpenChemLib (BSD-3, Idorsia) builds conformers from its
// torsion library and relaxes them with the MMFF94s+ force field. It starts only when a 3-D
// model is first asked for, as its tables are large.

import { Resources } from 'openchemlib';
import { buildModel, searchModel, type Model3d } from '../chem/model3d-build';
import type { SearchOptions } from '../chem/conformer-rank';
import { buildPose, type PoseResult } from '../chem/pose3d';
import type { DepthCues } from '../chem/perspective';
import { bondRotamers, scanTorsion, type ScanResult } from '../chem/torsion-scan';

export type Model3dRequest =
  | { type: 'init'; resources: string }
  | { type: 'build'; id: number; molblock: string; count: number; seed: number }
  | { type: 'search'; id: number; molblock: string; opts: Omit<SearchOptions, 'progress'>; seed: number }
  | { type: 'pose'; id: number; molblock: string; cues: DepthCues; L: number }
  | { type: 'rotamers'; id: number; molblock: string; starts: number[][]; t: [number, number, number, number] }
  | { type: 'scan'; id: number; molblock: string; xyz: number[]; t: [number, number, number, number]; step: number };

export type Model3dResponse =
  | { type: 'ready'; ms: number }
  | { type: 'error'; id?: number; message: string }
  | { type: 'build'; id: number; model: Model3d | null; message?: string }
  | { type: 'progress'; id: number; done: number; total: number }
  | { type: 'pose'; id: number; result: PoseResult }
  | { type: 'rotamers'; id: number; conformers: { xyz: number[]; energy: number }[]; message?: string }
  | { type: 'scan'; id: number; result: ScanResult | null; message?: string };

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
  } else if (m.type === 'search') {
    try {
      const model = searchModel(m.molblock, { ...m.opts, progress: (done, total) => post({ type: 'progress', id: m.id, done, total }) }, m.seed);
      post({ type: 'build', id: m.id, model, message: model ? undefined : 'Could not search the conformers of this structure.' });
    } catch (err) {
      post({ type: 'build', id: m.id, model: null, message: 'Could not search the conformers: ' + String((err as Error)?.message ?? err) });
    }
  } else if (m.type === 'rotamers') {
    try {
      post({ type: 'rotamers', id: m.id, conformers: bondRotamers(m.molblock, m.starts, m.t) });
    } catch (err) {
      post({ type: 'rotamers', id: m.id, conformers: [], message: String((err as Error)?.message ?? err) });
    }
  } else if (m.type === 'scan') {
    try {
      const result = scanTorsion(m.molblock, m.xyz, m.t, { step: m.step, progress: (done, total) => post({ type: 'progress', id: m.id, done, total }) });
      post({ type: 'scan', id: m.id, result, message: result ? undefined : 'This bond can\'t turn (it is in a ring), or no 3-D shape could be built.' });
    } catch (err) {
      post({ type: 'scan', id: m.id, result: null, message: 'The scan failed: ' + String((err as Error)?.message ?? err) });
    }
  } else if (m.type === 'pose') {
    try {
      post({ type: 'pose', id: m.id, result: buildPose(m.molblock, m.cues, m.L) });
    } catch (err) {
      post({ type: 'pose', id: m.id, result: { problem: 'build', message: 'No 3-D shape could be built: ' + String((err as Error)?.message ?? err) } });
    }
  }
};
