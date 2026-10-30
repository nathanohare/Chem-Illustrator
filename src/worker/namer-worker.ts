// Background worker for structure to name. OpenClatura (MIT, lamalab-org), a rule-based IUPAC
// namer written in Python, runs here in Pyodide (MPL-2.0, Python compiled to WebAssembly), so it
// works offline on every platform. Both are large, so this starts only when a name is first asked
// for. The structure arrives as a graph made from RDKit (src/chem/namer-graph.ts); the name goes
// back unchecked, and the caller confirms it by reading it back with OPSIN.

import type { PyodideAPI } from 'pyodide';
import bridge from './namer_bridge.py?raw';
import type { NamerGraph } from '../chem/namer-graph';

export type NamerRequest =
  | { type: 'init'; pyodide: string; wheel: string }
  | { type: 'name'; id: number; graph: NamerGraph };

export type NamerResponse =
  | { type: 'ready'; ms: number }
  | { type: 'error'; message: string }
  | { type: 'name'; id: number; name: string };

const post = (m: NamerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let nameGraph: ((json: string) => string) | null = null;

async function init(indexURL: string, wheelUrl: string): Promise<void> {
  const t0 = performance.now();
  const { loadPyodide } = (await import(/* @vite-ignore */ indexURL + 'pyodide.mjs')) as { loadPyodide: (o: { indexURL: string }) => Promise<PyodideAPI> };
  const [py, wheel] = await Promise.all([
    loadPyodide({ indexURL }),
    fetch(wheelUrl).then((r) => {
      if (!r.ok) throw new Error(`could not load its rules (${r.status})`);
      return r.arrayBuffer();
    }),
  ]);
  py.unpackArchive(new Uint8Array(wheel), 'wheel');
  py.runPython(bridge);
  const fn = py.globals.get('name_graph') as (json: string) => string;
  nameGraph = (json) => String(fn(json) ?? '');
  nameGraph('{"atoms":[{"el":"C","q":0,"iso":0,"legacy":null,"cip":null,"tag":null,"arom":false,"xh":0,"h":4,"rad":0,"deg":4}],"bonds":[]}');
  post({ type: 'ready', ms: Math.round(performance.now() - t0) });
}

self.onmessage = (e: MessageEvent<NamerRequest>) => {
  const m = e.data;
  if (m.type === 'init') {
    init(m.pyodide, m.wheel).catch((err) => post({ type: 'error', message: 'The namer failed to start: ' + String((err as Error)?.message ?? err) }));
  } else if (m.type === 'name') {
    let name = '';
    try {
      name = nameGraph ? nameGraph(JSON.stringify(m.graph)) : '';
    } catch {
      name = '';
    }
    post({ type: 'name', id: m.id, name });
  }
};
