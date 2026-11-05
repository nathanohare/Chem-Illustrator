// File > Find Structure in Files: search a folder of drawings, documents, presentations and
// workbooks for a structure (the same one, or any containing it), and the index that makes a
// second search of the same folder quick. The index keeps, for each file read, its size and
// when it changed and each structure's SMILES and place; a file that hasn't changed since is not
// read again. It is kept on this computer only (in the app's data folder), never in a shared one.

import type { Found, Spot } from './structures';

export interface IndexedStructure {
  spot: Spot;
  /** Its atoms in the file's drawing (to select it when the file is opened there). */
  atoms: number[];
  label?: string;
  /** Null when the chemistry engine couldn't read it (a valence it doesn't allow). */
  smiles: string | null;
}

export interface IndexedFile {
  size: number;
  modified: number;
  structures: IndexedStructure[];
  /** When it was read (to let the oldest go). */
  read: number;
  /** Why it couldn't be read. */
  error?: string;
}

export interface FileIndex {
  version: 1;
  files: Record<string, IndexedFile>;
}

export const emptyIndex = (): FileIndex => ({ version: 1, files: {} });

/** Files the index remembers at most (the least recently read are let go). */
export const INDEX_MAX_FILES = 5000;
/** Atoms remembered for each structure (enough to select it; a polymer drawn huge is cut). */
const MAX_ATOMS = 400;

export function parseIndex(text: string | null): FileIndex {
  if (!text) return emptyIndex();
  try {
    const raw = JSON.parse(text) as FileIndex;
    if (!raw || typeof raw !== 'object' || !raw.files || typeof raw.files !== 'object') return emptyIndex();
    const files: Record<string, IndexedFile> = {};
    for (const [p, f] of Object.entries(raw.files)) {
      if (f && typeof f.size === 'number' && typeof f.modified === 'number' && Array.isArray(f.structures)) files[p] = f;
    }
    return { version: 1, files };
  } catch {
    return emptyIndex();
  }
}

/** The index as text, without the files read longest ago beyond INDEX_MAX_FILES. */
export function indexText(ix: FileIndex): string {
  const entries = Object.entries(ix.files);
  const keep = entries.length > INDEX_MAX_FILES ? entries.sort((a, b) => b[1].read - a[1].read).slice(0, INDEX_MAX_FILES) : entries;
  return JSON.stringify({ version: 1, files: Object.fromEntries(keep) });
}

/**
 * A file's entry, if it hasn't changed since it was read (same size, the same time to within 2 s:
 * network drives round). A file that couldn't be read is read again each time: what stopped it
 * (the chemistry engine still loading, a cloud file not downloaded yet) may have passed.
 */
export function freshEntry(ix: FileIndex, f: { path: string; size: number; modified: number }): IndexedFile | null {
  const e = ix.files[f.path];
  return e && !e.error && e.size === f.size && Math.abs(e.modified - f.modified) < 2000 ? e : null;
}

/** What the index keeps for the structures found in a file, given their SMILES. */
export function indexEntry(f: { size: number; modified: number }, found: Found[], smiles: (string | null)[], now = Date.now()): IndexedFile {
  return {
    size: f.size, modified: f.modified, read: now,
    structures: found.map((s, i) => ({ spot: s.spot, atoms: s.atoms.slice(0, MAX_ATOMS), ...(s.label ? { label: s.label } : {}), smiles: smiles[i] ?? null })),
  };
}

/** A structure found by a search. */
export interface Hit {
  path: string;
  structure: IndexedStructure;
  /** The same structure as the one searched for (not only containing it). */
  exact: boolean;
}

export type SearchMode = 'exact' | 'contains';

export interface SearchDeps {
  /** A file's bytes. */
  read(path: string): Promise<Uint8Array>;
  /** The structures in a file (see foundInFile). */
  found(bytes: Uint8Array, path: string): Promise<Found[]>;
  /** RDKit's SMILES for each molfile (null where it can't be read). */
  smiles(molblocks: string[]): Promise<(string | null)[]>;
  /** Which of these SMILES contain the query (see substructureMatches). */
  contains(query: string, smiles: string[]): Promise<(boolean | null)[]>;
  /** After each file: how many done, of how many, and the file. */
  progress?(done: number, total: number, path: string): void;
  /** Stop when this says so (Stop pressed, the window closed). */
  stopped?(): boolean;
  /** Each hit as it is found. */
  hit?(h: Hit): void;
}

export interface SearchResult {
  hits: Hit[];
  /** Files read this time (the rest came from the index). */
  read: number;
  /** Files that couldn't be read, with why. */
  failed: { path: string; why: string }[];
  stopped: boolean;
}

/**
 * Search the files for a structure (`query`: its SMILES, as RDKit writes it). Files that
 * haven't changed since they were last read come from the index; the others are read and
 * put in it.
 */
export async function searchFiles(files: { path: string; size: number; modified: number }[], query: string, mode: SearchMode, ix: FileIndex, deps: SearchDeps): Promise<SearchResult> {
  const out: SearchResult = { hits: [], read: 0, failed: [], stopped: false };
  let done = 0;
  for (const f of files) {
    if (deps.stopped?.()) { out.stopped = true; break; }
    let entry = freshEntry(ix, f);
    if (!entry) {
      try {
        const found = await deps.found(await deps.read(f.path), f.path);
        const smiles = found.length ? await deps.smiles(found.map((s) => s.molblock)) : [];
        entry = indexEntry(f, found, smiles);
      } catch (e) {
        entry = { size: f.size, modified: f.modified, read: Date.now(), structures: [], error: e instanceof Error ? e.message : String(e) };
      }
      ix.files[f.path] = entry;
      out.read++;
    }
    if (entry.error) out.failed.push({ path: f.path, why: entry.error });
    const withSmiles = entry.structures.filter((s) => s.smiles);
    if (withSmiles.length) {
      const exact = withSmiles.map((s) => s.smiles === query);
      const inside = mode === 'contains' ? await deps.contains(query, withSmiles.map((s) => s.smiles!)) : exact;
      withSmiles.forEach((s, i) => {
        if (!(exact[i] || inside[i])) return;
        const h: Hit = { path: f.path, structure: s, exact: exact[i] };
        out.hits.push(h);
        deps.hit?.(h);
      });
    }
    done++;
    deps.progress?.(done, files.length, f.path);
  }
  return out;
}
