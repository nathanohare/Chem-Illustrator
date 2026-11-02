// NCI CACTUS, the US National Cancer Institute's free Chemical Identifier Resolver
// (cactus.nci.nih.gov/chemical/structure): a second place to look up a CAS RN's structure when
// PubChem doesn't list the number. Only the CAS RN typed is sent. Requests go one at a time, a
// second apart, to be gentle with a free service. CACTUS warns that it may leave stereochemistry out.

import type { Fetch } from './pubchem';

export const CACTUS_HOST = 'cactus.nci.nih.gov';
const BASE = `https://${CACTUS_HOST}/chemical/structure`;

export class CactusError extends Error {}

const GAP_MS = 1000;
let queue: Promise<void> = Promise.resolve();
function turn(): Promise<void> {
  const go = queue;
  queue = queue.then(() => new Promise<void>((r) => setTimeout(r, GAP_MS)));
  return go;
}

/** The SMILES CACTUS gives for an identifier (a CAS RN), or null when it doesn't know it. */
export async function cactusSmiles(id: string, fetchFn: Fetch = fetch, timeoutMs = 15000): Promise<string | null> {
  await turn();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchFn(`${BASE}/${encodeURIComponent(id.trim())}/smiles`, { signal: ctl.signal });
  } catch {
    throw new CactusError(ctl.signal.aborted ? 'NCI CACTUS did not answer in time.' : 'Could not reach NCI CACTUS: is this computer online?');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new CactusError(`NCI CACTUS answered with an error (${res.status}).`);
  // one SMILES per line when the identifier is ambiguous: the first is used
  const first = (await res.text()).split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  // an HTML page (an error page passed through a proxy) is not a SMILES
  return first && !/^</.test(first) && !/\s/.test(first) ? first : null;
}
