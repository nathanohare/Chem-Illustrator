// The structure reader, off the main thread: the model pack's three parts in ONNX Runtime's
// WebAssembly build, and readStructure's decoding (src/recognise/molscribe.ts). Pictures come in
// as pixels; what was read goes back as atoms, places and bonds.

import * as ort from 'onnxruntime-web/wasm';
import { imageTensor, readStructure, type ReadGraph, type Runner, type T, type Vocab } from '../recognise/molscribe';
import { cropWhite, resize, type Pixels } from '../recognise/picture';

export type RecogniseRequest =
  | { type: 'init'; encoder: ArrayBuffer; step: ArrayBuffer; edges: ArrayBuffer; wasm: ArrayBuffer; vocab: Vocab; /** The runtime's loader, beside the app (public/). */ loader: string }
  | { type: 'read'; id: number; pixels: Pixels };

export type RecogniseResponse =
  | { type: 'ready'; ms: number }
  | { type: 'read'; id: number; graph: ReadGraph; w: number; h: number; ms: number }
  | { type: 'error'; id?: number; message: string };

const post = (m: RecogniseResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let runner: Runner | null = null;
let vocab: Vocab | null = null;
// one picture at a time: the reader is busy for seconds, and the runtime isn't re-entrant
let queue: Promise<void> = Promise.resolve();

async function init(m: Extract<RecogniseRequest, { type: 'init' }>): Promise<void> {
  const t0 = performance.now();
  ort.env.wasm.wasmBinary = m.wasm;
  ort.env.wasm.wasmPaths = { mjs: m.loader };
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  const opts: ort.InferenceSession.SessionOptions = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  const [E, S, G] = [await ort.InferenceSession.create(new Uint8Array(m.encoder), opts), await ort.InferenceSession.create(new Uint8Array(m.step), opts), await ort.InferenceSession.create(new Uint8Array(m.edges), opts)];
  const v = m.vocab;
  const i64 = (n: number, dims: number[]) => new ort.Tensor('int64', BigInt64Array.from([BigInt(n)]), dims);
  runner = {
    async encode(img) {
      const r = await E.run({ image: new ort.Tensor('float32', img, [1, 3, v.size, v.size]) });
      return { ck: r.ck as unknown as T, cv: r.cv as unknown as T };
    },
    async step(token, pos, pk, pv, ck, cv) {
      const r = await S.run({ token: i64(token, [1]), pos: i64(pos, []), pk: pk as unknown as ort.Tensor, pv: pv as unknown as ort.Tensor, ck: ck as unknown as ort.Tensor, cv: cv as unknown as ort.Tensor });
      return { logp: r.logp.data as Float32Array, hidden: r.hidden.data as Float32Array, nk: r.nk as unknown as T, nv: r.nv as unknown as T };
    },
    async edges(h, k) {
      const r = await G.run({ hidden: new ort.Tensor('float32', h, [k, h.length / k]) });
      return r.probs.data as Float32Array;
    },
    empty() {
      return new ort.Tensor('float32', new Float32Array(0), [v.layers, 1, v.heads, 0, v.dk]) as unknown as T;
    },
  };
  vocab = v;
  post({ type: 'ready', ms: Math.round(performance.now() - t0) });
}

async function read(m: Extract<RecogniseRequest, { type: 'read' }>): Promise<void> {
  if (!runner || !vocab) throw new Error('The structure reader is not loaded yet.');
  const t0 = performance.now();
  const cropped = cropWhite(m.pixels, 5);
  const square = resize(cropped, vocab.size, vocab.size);
  const graph = await readStructure(runner, vocab, imageTensor(square.data, vocab.size));
  post({ type: 'read', id: m.id, graph, w: cropped.width, h: cropped.height, ms: Math.round(performance.now() - t0) });
}

self.onmessage = (e: MessageEvent<RecogniseRequest>) => {
  const m = e.data;
  queue = queue.then(() => (m.type === 'init' ? init(m) : read(m))).catch((err) => {
    post({ type: 'error', id: m.type === 'read' ? m.id : undefined, message: err instanceof Error ? err.message : String(err) });
  });
};
