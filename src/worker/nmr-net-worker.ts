// Background worker for the shift networks: the five wide networks take a few tenths of a second
// per structure, which would freeze the drawing if they ran on the main thread. The network file
// is fetched and unpacked here once; the panel gets the raw network shifts and blends them itself.

import type { EnvGraph } from '../chem/nmr/env';
import { ShiftNet, type NetBlend, type NetShift } from '../chem/nmr/net';

export interface NetRequest { id: number; url: string; g: EnvGraph; solvent: string | null }
export type NetResponse = { id: number; net: NetShift[] | null; blend: NetBlend } | { id: number; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const nets = new Map<string, Promise<ShiftNet | null>>();

function load(url: string): Promise<ShiftNet | null> {
  let p = nets.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? new ShiftNet(b) : null)).catch(() => null);
    nets.set(url, p);
  }
  return p;
}

scope.onmessage = async (e: MessageEvent<NetRequest>) => {
  const { id, url, g, solvent } = e.data;
  try {
    const net = await load(url);
    scope.postMessage({ id, net: net ? net.predict(g, solvent) : null, blend: net ? net.blend : null } satisfies NetResponse);
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies NetResponse);
  }
};
