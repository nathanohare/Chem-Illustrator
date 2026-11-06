// Runs the shift networks in a background worker (src/worker/nmr-net-worker.ts); null where workers
// are unavailable (tests, old browsers), in which case callers run them on the spot.

import type { EnvGraph } from './env';
import type { NetBlend, NetShift } from './net';
import type { NetRequest, NetResponse } from '../../worker/nmr-net-worker';

let worker: Worker | null | undefined;
let next = 1;
const waiting = new Map<number, { resolve: (r: { net: NetShift[] | null; blend: NetBlend }) => void; reject: (e: Error) => void }>();

function start(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === 'undefined') return (worker = null);
    worker = import.meta.env.DEV
      ? new Worker(new URL('../../worker/nmr-net-worker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('../../worker/nmr-net-worker.ts', import.meta.url));
    worker.onmessage = (e: MessageEvent<NetResponse>) => {
      const m = e.data, w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      if ('error' in m) w.reject(new Error(m.error)); else w.resolve({ net: m.net, blend: m.blend });
    };
    worker.onerror = () => { for (const w of waiting.values()) w.reject(new Error('The shift networks stopped.')); waiting.clear(); worker?.terminate(); worker = null; };
  } catch {
    worker = null;
  }
  return worker;
}

/** The networks' shifts for every atom, worked out in the background; null when no worker can run. */
export function netInBackground(url: string, g: EnvGraph, solvent: string | null): Promise<{ net: NetShift[] | null; blend: NetBlend }> | null {
  const w = start();
  if (!w) return null;
  const id = next++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ id, url, g, solvent } satisfies NetRequest);
  });
}
