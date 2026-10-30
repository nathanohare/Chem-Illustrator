// Main-thread side of the 3-D model worker (see src/worker/model3d-worker.ts). It starts only
// when a 3-D model is first asked for.

import type { Model3dRequest, Model3dResponse } from '../worker/model3d-worker';
import type { Model3d } from './model3d-build';

export class Model3dBuilder {
  private worker: Worker | null = null;
  private started: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, (m: Extract<Model3dResponse, { type: 'build' }>) => void>();
  /** How long starting took (download and set-up of the force field tables), once ready. */
  loadMs = 0;

  constructor(private resourcesUrl: string) {}

  /** Starts the worker if needed; resolves when it is ready, or rejects with a readable reason. */
  start(): Promise<void> {
    if (this.started) return this.started;
    this.started = new Promise<void>((resolve, reject) => {
      try {
        this.worker = import.meta.env.DEV
          ? new Worker(new URL('../worker/model3d-worker.ts', import.meta.url), { type: 'module' })
          : new Worker(new URL('../worker/model3d-worker.ts', import.meta.url));
      } catch (e) {
        reject(new Error('The 3-D model builder could not start: ' + String(e)));
        return;
      }
      this.worker.onmessage = (e: MessageEvent<Model3dResponse>) => {
        const m = e.data;
        if (m.type === 'ready') { this.loadMs = m.ms; resolve(); }
        else if (m.type === 'error' && m.id === undefined) reject(new Error(m.message));
        else if (m.type === 'build') {
          const cb = this.pending.get(m.id);
          if (cb) { this.pending.delete(m.id); cb(m); }
        }
      };
      this.worker.onerror = (e) => reject(new Error('The 3-D model builder failed: ' + (e.message || 'unknown error')));
      this.send({ type: 'init', resources: this.resourcesUrl });
    });
    // let a later call try again after a failure
    this.started.catch(() => { this.worker?.terminate(); this.worker = null; this.started = null; });
    return this.started;
  }

  private send(m: Model3dRequest): void {
    this.worker?.postMessage(m);
  }

  /** Up to `count` conformers of a molecule (a molfile), lowest energy first. Rejects with a readable reason. */
  async build(molblock: string, count = 10, seed = 1): Promise<Model3d> {
    await this.start();
    const id = this.nextId++;
    const r = await new Promise<Extract<Model3dResponse, { type: 'build' }>>((resolve) => {
      this.pending.set(id, resolve);
      this.send({ type: 'build', id, molblock, count, seed });
    });
    if (!r.model) throw new Error(r.message ?? 'Could not build a 3-D model of this structure.');
    return r.model;
  }
}
