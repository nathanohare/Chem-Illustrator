// The chemistry a workbook asks for, worked out in the background and kept. A formula that
// needs a structure's properties gets #BUSY! the first time; the question goes to the chemistry
// engine with any others asked at the same moment, and when the answers come back the sheets
// are worked out again. Answers are kept by structure (a structure is never changed in place,
// so its id stands for its drawing), by SMILES text, and by query for substructure searches.

import type { Contents } from '../model';
import { CellError, ERR } from './values';
import type { MolProps } from './properties';
import type { HammettResult } from '../chem/hammett-match';
import type { ChemHost, Structure } from './workbook';

/** The chemistry engine (the worker), or a stand-in for tests. */
export interface ChemEngine {
  readonly ready: boolean;
  props(mols: string[]): Promise<(MolProps | { error: string })[]>;
  substructure(query: string, mols: string[]): Promise<{ results: (boolean | null)[]; error?: string }>;
  /** The Hammett groups at a core's marked positions in each molecule (SMILES). */
  hammett?(core: string, mols: string[]): Promise<HammettResult[]>;
}

type Answer = MolProps | CellError;

/** Answers kept at most (oldest go first; they're worked out again if needed). */
/** How long building inputs may hold the window before letting it paint and take input, in ms. */
const SLICE_MS = 40;
const KEEP = 20000;

export class SheetChem implements ChemHost {
  /** Called when answers have arrived: work the sheets out again. */
  onAnswers: () => void = () => {};
  private byStructure = new Map<number, Answer>();
  private bySmiles = new Map<string, Answer>();
  private matches = new Map<string, boolean | null>();
  private hammetts = new Map<string, HammettResult>();
  /** Hammett questions not sent yet, by reference: the molecules asked about, by key. */
  private wantHammett = new Map<string, Map<string, () => string | null>>();
  private queryIds = new WeakMap<Contents, number>();
  private nextQuery = 1;
  /** Questions not sent yet. */
  private wantProps = new Map<string, { input: () => string | null; store: (a: Answer) => void }>();
  private wantMatch = new Map<number, { query: Contents; items: Map<string, { input: () => string | null; key: string }> }>();
  private scheduled = false;
  private inFlight = 0;
  private waiters: (() => void)[] = [];

  /**
   * @param engine the chemistry engine
   * @param molfile a structure's drawing as a molfile, or null (with the reason) when it has no structure in it
   */
  constructor(private engine: ChemEngine, private molfile: (c: Contents, opts?: { attachKinds?: boolean }) => { molblock: string | null; problem?: string }) {}

  structure(s: Structure): Answer {
    const got = this.byStructure.get(s.id);
    if (got) return got;
    const key = `s${s.id}`;
    if (!this.wantProps.has(key)) {
      this.wantProps.set(key, {
        input: () => {
          const m = this.molfile(s.contents);
          if (!m.molblock) { this.keep(this.byStructure, s.id, ERR.value(m.problem ?? 'There is no structure in this cell')); return null; }
          return m.molblock;
        },
        store: (a) => this.keep(this.byStructure, s.id, a),
      });
      this.schedule();
    }
    return ERR.busy();
  }

  smiles(text: string): Answer {
    const got = this.bySmiles.get(text);
    if (got) return got;
    const key = `t${text}`;
    if (!this.wantProps.has(key)) {
      this.wantProps.set(key, { input: () => text, store: (a) => this.keep(this.bySmiles, text, a) });
      this.schedule();
    }
    return ERR.busy();
  }

  substructure(s: Structure, query: Contents): boolean | null {
    let qid = this.queryIds.get(query);
    if (!qid) { qid = this.nextQuery++; this.queryIds.set(query, qid); }
    const key = `${qid}|${s.id}`;
    const got = this.matches.get(key);
    if (got !== undefined) return got;
    let q = this.wantMatch.get(qid);
    if (!q) { q = { query, items: new Map() }; this.wantMatch.set(qid, q); }
    if (!q.items.has(key)) {
      q.items.set(key, { key, input: () => this.molfile(s.contents).molblock });
      this.schedule();
    }
    return null;
  }

  /**
   * The Hammett groups on a molecule's ring, counted from the reference (an attachment point kind,
   * or a core in SMILES; see src/chem/hammett-match.ts). The molecule is a cell's structure (its
   * attachment points written with their kinds) or SMILES text. #BUSY! while being worked out.
   */
  hammett(mol: Structure | string, ref: string): HammettResult | CellError {
    const id = typeof mol === 'string' ? `t${mol}` : `s${mol.id}`;
    const key = `${ref}\n${id}`;
    const got = this.hammetts.get(key);
    if (got) return got;
    if (!this.engine.hammett) return ERR.na('Hammett constants need the chemistry engine');
    let want = this.wantHammett.get(ref);
    if (!want) { want = new Map(); this.wantHammett.set(ref, want); }
    if (!want.has(id)) {
      want.set(id, typeof mol === 'string' ? () => mol : () => {
        const m = this.molfile(mol.contents, { attachKinds: true });
        if (!m.molblock) { this.keep(this.hammetts, key, { error: m.problem ?? 'There is no structure in this cell' }); return null; }
        return m.molblock;
      });
      this.schedule();
    }
    return ERR.busy();
  }

  /** Waits until every question asked so far has its answer. */
  settled(): Promise<void> {
    if (!this.busy) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  get busy(): boolean {
    return this.scheduled || this.inFlight > 0 || this.wantProps.size > 0 || this.wantMatch.size > 0 || this.wantHammett.size > 0;
  }

  /** Send what's waiting (call when the engine has just become ready). */
  flush(): void {
    this.scheduled = false;
    if (!this.engine.ready) return;
    void this.send();
  }

  /** Forget everything (when the way properties are worked out changes). */
  clear(): void {
    this.byStructure.clear();
    this.bySmiles.clear();
    this.matches.clear();
    this.hammetts.clear();
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => this.flush());
  }

  private keep<K>(map: Map<K, unknown>, key: K, v: unknown): void {
    map.set(key, v);
    if (map.size > KEEP) map.delete(map.keys().next().value as K);
  }

  /**
   * Each item's input (a molfile built from a drawn structure, or SMILES), in slices of about
   * SLICE_MS with the window free between them: thousands of drawn rows would otherwise hold it
   * for most of a second. A short list is read in one go, as before.
   */
  private async inputs<T>(items: T[], input: (t: T) => string | null): Promise<(string | null)[]> {
    const out: (string | null)[] = [];
    let t0 = performance.now();
    for (const it of items) {
      out.push(input(it));
      if (performance.now() - t0 > SLICE_MS) {
        await new Promise((r) => setTimeout(r, 0));
        t0 = performance.now();
      }
    }
    return out;
  }

  private async send(): Promise<void> {
    const props = [...this.wantProps.values()];
    const matches = [...this.wantMatch.values()];
    const hammetts = [...this.wantHammett.entries()];
    this.wantProps.clear();
    this.wantMatch.clear();
    this.wantHammett.clear();
    // busy (for settled()) from here: the inputs may be built over several tasks
    this.inFlight++;
    const jobs: Promise<void>[] = [];
    try {
      if (props.length) {
        const asked: { store: (a: Answer) => void }[] = [];
        const inputs: string[] = [];
        const got = await this.inputs(props, (p) => p.input());
        props.forEach((p, i) => { const input = got[i]; if (input !== null) { asked.push(p); inputs.push(input); } });
        if (inputs.length) {
          jobs.push(this.engine.props(inputs).then(
            (res) => res.forEach((r, i) => asked[i].store('error' in r ? ERR.value(r.error) : r)),
            (e) => asked.forEach((p) => p.store(ERR.value(`The chemistry engine failed: ${String(e)}`))),
          ));
        }
      }
      for (const q of matches) {
        const qm = this.molfile(q.query).molblock;
        const items = [...q.items.values()];
        if (!qm) { for (const it of items) this.matches.set(it.key, false); continue; }
        const asked: string[] = [];
        const inputs: string[] = [];
        const got = await this.inputs(items, (it) => it.input());
        items.forEach((it, i) => {
          const input = got[i];
          if (input === null) { this.matches.set(it.key, false); return; }
          asked.push(it.key);
          inputs.push(input);
        });
        if (!inputs.length) continue;
        jobs.push(this.engine.substructure(qm, inputs).then(
          (res) => res.results.forEach((r, i) => this.keep(this.matches, asked[i], r ?? false)),
          () => asked.forEach((k) => this.matches.set(k, false)),
        ));
      }
      for (const [ref, want] of hammetts) {
        const ids: string[] = [], inputs: string[] = [];
        const all = [...want];
        const got = await this.inputs(all, ([, input]) => input());
        all.forEach(([id], i) => { const text = got[i]; if (text !== null) { ids.push(id); inputs.push(text); } });
        if (!inputs.length) continue;
        const keep = (i: number, r: HammettResult) => this.keep(this.hammetts, `${ref}\n${ids[i]}`, r);
        jobs.push(this.engine.hammett!(ref, inputs).then(
          (res) => res.forEach((r, i) => keep(i, r)),
          (e) => ids.forEach((_, i) => keep(i, { error: `The chemistry engine failed: ${String(e)}` })),
        ));
      }
      await Promise.all(jobs);
    } finally {
      this.inFlight--;
    }
    this.onAnswers();
    if (!this.busy) {
      const w = this.waiters;
      this.waiters = [];
      for (const f of w) f();
    }
  }
}
