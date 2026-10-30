// Structure to name. OpenClatura (in src/worker/namer-worker.ts) proposes an IUPAC name; the name
// is shown only when OPSIN (our name reader) reads it back as the very structure drawn, stereo and
// charges included, so a name it gets wrong is never shown. The namer starts only when first
// asked for (it is about 14 MB).

import type { NamerRequest, NamerResponse } from '../worker/namer-worker';
import type { NamerGraph } from './namer-graph';
import type { TextRun } from '../model';

export class StructureNamer {
  private worker: Worker | null = null;
  private started: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, (name: string) => void>();
  /** How long starting took (download and set-up of Python and the rules), once ready. */
  loadMs = 0;
  /** True once the namer has started this session, so names can come without being asked for. */
  ready = false;

  constructor(private pyodideUrl: string, private wheelUrl: string) {}

  /** Starts the namer if needed; resolves when it is ready, or rejects with a readable reason. */
  start(): Promise<void> {
    if (this.started) return this.started;
    this.started = new Promise<void>((resolve, reject) => {
      try {
        // always a module worker: Pyodide refuses classic ones (the built script runs as either)
        this.worker = new Worker(new URL('../worker/namer-worker.ts', import.meta.url), { type: 'module' });
      } catch (e) {
        reject(new Error('The namer could not start: ' + String(e)));
        return;
      }
      this.worker.onmessage = (e: MessageEvent<NamerResponse>) => {
        const m = e.data;
        if (m.type === 'ready') { this.loadMs = m.ms; this.ready = true; resolve(); }
        else if (m.type === 'error') reject(new Error(m.message));
        else if (m.type === 'name') {
          const cb = this.pending.get(m.id);
          if (cb) { this.pending.delete(m.id); cb(m.name); }
        }
      };
      this.worker.onerror = (e) => reject(new Error('The namer failed: ' + (e.message || 'unknown error')));
      this.send({ type: 'init', pyodide: this.pyodideUrl, wheel: this.wheelUrl });
    });
    // let a later call try again after a failure
    this.started.catch(() => { this.worker?.terminate(); this.worker = null; this.started = null; });
    return this.started;
  }

  private send(m: NamerRequest): void {
    this.worker?.postMessage(m);
  }

  /** OpenClatura's name for a structure graph, unchecked; "" when it has none. Rejects only if the namer can't start. */
  async propose(graph: NamerGraph): Promise<string> {
    await this.start();
    const id = this.nextId++;
    return new Promise<string>((resolve) => {
      this.pending.set(id, resolve);
      this.send({ type: 'name', id, graph });
    });
  }
}

export type NameCheck = { ok: true; name: string } | { ok: false; message: string };

/** What naming needs from the chemistry engine and the name reader. */
export interface NameTools {
  graph(molblock: string): Promise<{ graph: NamerGraph | null; smiles: string | null }>;
  propose(graph: NamerGraph): Promise<string>;
  /** OPSIN's structure for a name, as SMILES, or null when it can't read the name. */
  read(name: string): Promise<string | null>;
  canonical(smiles: string): Promise<string | null>;
}

/** The systematic name of a structure (a molfile), only if OPSIN reads it back as the same structure. */
export async function confirmedName(molblock: string, tools: NameTools): Promise<NameCheck> {
  const { graph, smiles } = await tools.graph(molblock);
  if (!graph || !smiles) return { ok: false, message: 'This structure can\'t be read (check valences).' };
  if (graph.atoms.some((a) => a.el === '*')) return { ok: false, message: 'Structures with R groups or other unknown atoms have no name.' };
  const raw = await tools.propose(graph);
  if (!raw) return { ok: false, message: 'The namer has no rule for this structure yet.' };
  const tidy = iupacEnclosures(raw);
  for (const name of tidy === raw ? [raw] : [tidy, raw]) {
    const back = await tools.read(name);
    const same = back ? await tools.canonical(back) : null;
    if (same && same === smiles) return { ok: true, name };
  }
  return { ok: false, message: 'The namer\'s name didn\'t read back as this exact structure, so it isn\'t shown.' };
}

/**
 * A name with its enclosing marks nested the IUPAC way (P-16.5.4): parentheses inside square
 * brackets inside braces, so 2-(4-(2-methylpropyl)phenyl) becomes 2-[4-(2-methylpropyl)phenyl].
 * OpenClatura writes parentheses at every level. Compound locants such as 1(7) are not enclosing
 * marks and are left alone, as are the brackets of fusion and von Baeyer descriptors.
 */
export function iupacEnclosures(name: string): string {
  // already nested by some other rule, or brackets that enclose words: leave it as it is
  if (/[{}]/.test(name) || [...name.matchAll(/\[([^[\]]*)\]/g)].some((m) => /[A-Za-z]{2}/.test(m[1]))) return name;
  const out = [...name];
  const open: { at: number; deepest: number }[] = [];
  for (let i = 0; i < out.length; i++) {
    if (out[i] === '(') open.push({ at: i, deepest: 0 });
    else if (out[i] === ')') {
      const g = open.pop();
      if (!g) return name;
      const inside = name.slice(g.at + 1, i);
      if (/[A-Za-z\d]/.test(name[g.at - 1] ?? '') && /^\d+[a-z]?[′″']*$/.test(inside)) continue; // a compound locant
      const depth = g.deepest + 1;
      if (open.length) open[open.length - 1].deepest = Math.max(open[open.length - 1].deepest, depth);
      const [l, r] = (['()', '[]', '{}'] as const)[(depth - 1) % 3];
      out[g.at] = l;
      out[i] = r;
    }
  }
  return open.length ? name : out.join('');
}

/**
 * A name as caption text, with the italics IUPAC uses (P-16.6, P-93): stereodescriptors (R, S,
 * E, Z, r, s, cis, trans, rel), element-symbol locants (N, O, S, …), indicated hydrogen (1H),
 * tert and sec, and the letters of fusion locants ([b], [2,3-c]).
 */
export function nameRuns(name: string): TextRun[] {
  const italic = new Array<boolean>(name.length).fill(false);
  const mark = (from: number, to: number) => { for (let i = from; i < to; i++) italic[i] = true; };
  let m: RegExpExecArray | null;
  // stereodescriptor sets: (2S), (1R,3aS,7S), (2Z,4E), (R)
  const sets = /\(((?:\d+[a-z]?[′″']*)?[RSEZrs](?:,(?:\d+[a-z]?[′″']*)?[RSEZrs])*)\)/g;
  while ((m = sets.exec(name))) {
    const start = m.index + 1;
    for (let i = 0; i < m[1].length; i++) if (/[RSEZrs]/.test(m[1][i]) && !/[a-z\d]/.test(m[1][i + 1] ?? '')) {
      // a lower-case letter right after digits is a locant (3a), not a descriptor
      if (/[rs]/.test(m[1][i]) && /\d/.test(m[1][i - 1] ?? '')) continue;
      mark(start + i, start + i + 1);
    }
  }
  const words = /(?<![A-Za-z])(cis|trans|rel|tert|sec)(?=-)/g;
  while ((m = words.exec(name))) mark(m.index, m.index + m[1].length);
  // element-symbol locants: N-methyl, N,N-diethyl, N′-, O-acetyl, S-benzyl, N1-
  const atomLocants = /(?<![A-Za-z])(N|O|S|P|Se|Te|B|Si|As)(?=\d*[′″']*[,\-])/g;
  while ((m = atomLocants.exec(name))) mark(m.index, m.index + m[1].length);
  // indicated hydrogen: 1H-, 2H,4H-, 4aH-
  const hydrogen = /(?<=\d[a-z]?)H(?=[,\-\]])/g;
  while ((m = hydrogen.exec(name))) mark(m.index, m.index + 1);
  // fusion locants: the letters inside [b], [2,3-c], [1,2-a:4,5-a′]
  const fusion = /\[([0-9,′″'\-:a-z]+)\]/g;
  const letters = /^(?:[\d,′″']+-)?[a-z][′″']*(?:,[a-z][′″']*)*(?::(?:[\d,′″']+-)?[a-z][′″']*(?:,[a-z][′″']*)*)*$/;
  while ((m = fusion.exec(name))) {
    if (!letters.test(m[1])) continue;
    const start = m.index + 1;
    for (let i = 0; i < m[1].length; i++) if (/[a-z]/.test(m[1][i])) mark(start + i, start + i + 1);
  }
  const runs: TextRun[] = [];
  for (let i = 0; i < name.length; i++) {
    const last = runs[runs.length - 1];
    if (last && !!last.italic === italic[i]) last.text += name[i];
    else runs.push(italic[i] ? { text: name[i], italic: true } : { text: name[i] });
  }
  return runs;
}
