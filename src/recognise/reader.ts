// Reading structures from pictures, the one step File > Import > From PDF and From Picture share.
// Two readers: the one on this computer (MolScribe, in a worker; its model pack downloads once,
// in the desktop app), and the person's own AI model when they linked one (Edit > Settings > AI
// Model). Nothing leaves the computer unless they chose the AI model for this read.

import { invoke, isTauri } from '@tauri-apps/api/core';
import type { RecogniseRequest, RecogniseResponse } from '../worker/recognise-worker';
import type { ReadGraph, Vocab } from './molscribe';
import type { Pixels } from './picture';
import { aiAsk, type AiPrefs } from '../ai/link';

/** The release the model pack is published as (.github/workflows/recognition-model.yml). */
export const PACK = 'recognition-model-1';
/** About how much it downloads, to say before it does. */
export const PACK_MB = 140;

/** Whether this computer can read structures without an AI model (the desktop app). */
export const canReadHere = isTauri();

export async function packReady(): Promise<boolean> {
  return canReadHere && invoke<boolean>('pack_ready', { pack: PACK }).catch(() => false);
}

/** Download the pack, telling `progress` the share done (0 to 1). */
export async function downloadPack(progress: (share: number) => void): Promise<void> {
  const { listen } = await import('@tauri-apps/api/event');
  const stop = await listen<{ done: number; total: number }>('pack-progress', (e) => progress(e.payload.total ? e.payload.done / e.payload.total : 0));
  try {
    await invoke('pack_download', { pack: PACK });
  } finally {
    stop();
  }
}

/** One structure read from a picture: the drawing's atoms and bonds, or SMILES (an AI model's answer). */
export type ReadResult =
  | { kind: 'graph'; graph: ReadGraph; w: number; h: number; ms: number }
  | { kind: 'smiles'; smiles: string; note: string; ms: number };

class LocalReader {
  private worker: Worker | null = null;
  private loading: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, { ok: (r: Extract<RecogniseResponse, { type: 'read' }>) => void; fail: (e: Error) => void }>();

  /** Load the model (it must be downloaded already). */
  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const file = async (name: string) => invoke<ArrayBuffer>('pack_read', { pack: PACK, name });
      const [encoder, step, edges, wasm, vocabBytes] = await Promise.all(['encoder.onnx', 'step.onnx', 'edges.onnx', 'ort-wasm-simd-threaded.wasm', 'vocab.json'].map(file));
      const vocab = JSON.parse(new TextDecoder().decode(vocabBytes)) as Vocab;
      // Vite's development server can only serve workers that use `import` as modules
      const w = import.meta.env.DEV
        ? new Worker(new URL('../worker/recognise-worker.ts', import.meta.url), { type: 'module' })
        : new Worker(new URL('../worker/recognise-worker.ts', import.meta.url));
      this.worker = w;
      await new Promise<void>((resolve, reject) => {
        w.onmessage = (e: MessageEvent<RecogniseResponse>) => {
          const m = e.data;
          if (m.type === 'ready') { w.onmessage = (ev) => this.receive(ev.data); resolve(); }
          else if (m.type === 'error') reject(new Error(m.message));
        };
        w.onerror = (e) => reject(new Error('The structure reader could not start: ' + (e.message || 'unknown error')));
        const msg: RecogniseRequest = { type: 'init', encoder, step, edges, wasm, vocab, loader: new URL('ort-wasm-simd-threaded.mjs', document.baseURI).href };
        w.postMessage(msg, [encoder, step, edges, wasm]);
      });
    })();
    this.loading.catch(() => { this.loading = null; this.worker?.terminate(); this.worker = null; });
    return this.loading;
  }

  private receive(m: RecogniseResponse): void {
    if (m.type === 'ready' || m.id === undefined) return;
    const p = this.pending.get(m.id);
    if (!p) return;
    this.pending.delete(m.id);
    if (m.type === 'read') p.ok(m);
    else p.fail(new Error(m.message));
  }

  async read(pixels: Pixels): Promise<ReadResult> {
    await this.load();
    const id = this.nextId++;
    const r = await new Promise<Extract<RecogniseResponse, { type: 'read' }>>((ok, fail) => {
      this.pending.set(id, { ok, fail });
      const msg: RecogniseRequest = { type: 'read', id, pixels };
      this.worker!.postMessage(msg);
    });
    return { kind: 'graph', graph: r.graph, w: r.w, h: r.h, ms: r.ms };
  }
}

export const localReader = new LocalReader();

const AI_SYSTEM = 'You are an expert synthetic organic chemist transcribing chemical structure drawings exactly as drawn. '
  + 'Work atom by atom: count ring sizes and chain carbons, place every heteroatom, charge and multiple bond, and keep the stereochemistry the wedges and hashes show. '
  + 'Expand abbreviations (Ph, OMe, Boc, Ts, TBS, CO2Et) into atoms. Hand drawings may be messy: read what the chemist meant.';

const AI_ASK = 'Give the structure in this picture as one SMILES string. Answer with JSON only: {"smiles": "...", "note": "anything unclear, or empty"}. '
  + 'If there are several separate molecules, join them with a dot. If there is no chemical structure, give "smiles": "".';

/** Ask the linked AI model for the SMILES of the structure in a picture (a PNG, as base64). */
export async function readWithAi(prefs: AiPrefs, png: string): Promise<ReadResult> {
  const t0 = performance.now();
  const text = await aiAsk(prefs, { system: AI_SYSTEM, text: AI_ASK, images: [{ mime: 'image/png', data: png }], maxTokens: 2000 });
  const { smiles, note } = parseAiAnswer(text);
  return { kind: 'smiles', smiles, note, ms: Math.round(performance.now() - t0) };
}

/** The SMILES and note in a model's answer (JSON, perhaps in a code block or with words round it). */
export function parseAiAnswer(text: string): { smiles: string; note: string } {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (json) {
    try {
      const o = JSON.parse(json) as { smiles?: unknown; note?: unknown };
      return { smiles: typeof o.smiles === 'string' ? o.smiles.trim() : '', note: typeof o.note === 'string' ? o.note.trim() : '' };
    } catch { /* not JSON after all */ }
  }
  const line = text.trim().split(/\s+/).find((w) => /^[A-Za-z0-9@+\-[\]()=#$/\\%.:*]+$/.test(w) && /[A-Z]/i.test(w));
  return { smiles: line ?? '', note: '' };
}
