// Your own library, kept between sessions and shared by every file: references (like Zotero or
// EndNote: collections, tags, PDFs) and compounds (each one's number, structure, names, notes and
// the files it appears in). Both live in one small JSON file, so two computers that keep it in
// the same folder (OneDrive, a lab drive) can both change it: each save merges what is on disk
// with what changed here, item by item, the newer change winning (see mergeLibraries).

import { cleanRef, newRefId, type Reference } from '../document/references';
import type { Contents } from '../model';

/** A reference in the library: a file's reference plus what only the library keeps. */
export interface LibReference extends Reference {
  /** When it was added and last changed (milliseconds since 1970). */
  added: number;
  modified: number;
  tags?: string[];
  /** The ids of the collections it is in. */
  collections?: string[];
  /** Its PDF, as a name in the library's Attachments. */
  pdf?: string;
  /** Its PubMed id. */
  pmid?: string;
  abstract?: string;
  /** The Zotero item it came from (Sync with Zotero). */
  zotero?: { key: string; version: number; library: string };
}

/** Where a compound was seen: a file (by its path, or its name when there is no path) and the number it had there. */
export interface FileMention {
  path: string;
  /** Its compound number there ("12a"), when it had one. */
  label?: string;
  /** When the file was last saved or opened with it in (milliseconds). */
  seen: number;
}

export interface LibCompound {
  /** Never changes: "c-1a2b3c". */
  id: string;
  /** Its compound number ("12a", "S3"). */
  label: string;
  /** Its name (common or systematic). */
  name: string;
  /** Other names: trade names, abbreviations, a CAS number written as a name. */
  synonyms: string[];
  /** RDKit's SMILES (the same structure always gives the same text: how it is matched). */
  smiles: string;
  /** The structure as a molfile (for SD files and the chemistry engine). */
  molfile: string;
  /** The structure as it was drawn (abbreviations, layout), to insert it as drawn. */
  drawing?: Contents;
  formula: string;
  /** Molecular weight. */
  mw: number;
  cas: string;
  notes: string;
  tags: string[];
  collections: string[];
  /** The files it appears in, most recent first. */
  files: FileMention[];
  added: number;
  modified: number;
}

export type CollectionKind = 'references' | 'compounds';

/** A named group in the library (Zotero's collections); a collection can sit inside another. */
export interface LibCollection {
  id: string;
  name: string;
  kind: CollectionKind;
  parent?: string;
  modified: number;
}

export interface LibraryData {
  version: 1;
  references: LibReference[];
  compounds: LibCompound[];
  collections: LibCollection[];
  /** What was deleted, and when (so a copy on another computer doesn't bring it back). */
  deleted: Record<string, number>;
}

export const emptyLibrary = (): LibraryData => ({ version: 1, references: [], compounds: [], collections: [], deleted: {} });

/** The most files a compound remembers. */
export const MAX_MENTIONS = 50;

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const num = (v: unknown, or = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : or);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).map((s) => s.trim()).filter(Boolean) : []);
const uniq = (xs: string[]): string[] => [...new Set(xs)];

/** A new id starting with `prefix` that none of `taken` has. */
export function newId(prefix: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  for (;;) {
    const id = `${prefix}-${Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0')}${Math.floor(Math.random() * 0x100).toString(16).padStart(2, '0')}`;
    if (!used.has(id)) return id;
  }
}

/** Tags typed as "a, b; c" (commas or semicolons), tidied: no blanks, no repeats. */
export function parseTags(text: string): string[] {
  return uniq(text.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean));
}

/** A library reference from anything (a damaged file, a reference from a document). */
export function cleanLibRef(raw: unknown, now = Date.now()): LibReference {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: LibReference = { ...cleanRef(r as Partial<Reference>), added: num(r.added, now), modified: num(r.modified, now) };
  const tags = uniq(strings(r.tags));
  if (tags.length) out.tags = tags;
  const cols = uniq(strings(r.collections));
  if (cols.length) out.collections = cols;
  if (str(r.pdf)) out.pdf = str(r.pdf);
  if (str(r.pmid)) out.pmid = str(r.pmid).trim();
  if (str(r.abstract)) out.abstract = str(r.abstract);
  const z = r.zotero as Record<string, unknown> | undefined;
  if (z && typeof z === 'object' && str(z.key)) out.zotero = { key: str(z.key), version: num(z.version), library: str(z.library) };
  return out;
}

function cleanMention(raw: unknown): FileMention | null {
  const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const path = str(m.path).trim();
  if (!path) return null;
  const out: FileMention = { path, seen: num(m.seen) };
  if (str(m.label).trim()) out.label = str(m.label).trim();
  return out;
}

/** A compound from anything; null when it has no structure. */
export function cleanCompound(raw: unknown, now = Date.now()): LibCompound | null {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const smiles = str(c.smiles).trim(), molfile = str(c.molfile);
  if (!smiles && !molfile.includes('M  END')) return null;
  const drawing = c.drawing as Contents | undefined;
  const files = (Array.isArray(c.files) ? c.files : []).map(cleanMention).filter((m): m is FileMention => !!m);
  return {
    id: str(c.id) || newId('c'),
    label: str(c.label).trim(), name: str(c.name).trim(), synonyms: uniq(strings(c.synonyms)),
    smiles, molfile,
    ...(drawing && typeof drawing === 'object' && Array.isArray(drawing.atoms) && Array.isArray(drawing.bonds) ? { drawing } : {}),
    formula: str(c.formula).trim(), mw: num(c.mw), cas: str(c.cas).trim(), notes: str(c.notes),
    tags: uniq(strings(c.tags)), collections: uniq(strings(c.collections)),
    files: sortMentions(files),
    added: num(c.added, now), modified: num(c.modified, now),
  };
}

function cleanCollection(raw: unknown, now = Date.now()): LibCollection | null {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = str(c.name).trim();
  if (!str(c.id) || !name) return null;
  const out: LibCollection = { id: str(c.id), name, kind: c.kind === 'compounds' ? 'compounds' : 'references', modified: num(c.modified, now) };
  if (str(c.parent)) out.parent = str(c.parent);
  return out;
}

/** The library from its file's text (an empty library when there is none or it can't be read). */
export function parseLibrary(text: string | null | undefined): LibraryData {
  if (!text) return emptyLibrary();
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return emptyLibrary();
  }
  if (!raw || typeof raw !== 'object') return emptyLibrary();
  const deleted: Record<string, number> = {};
  if (raw.deleted && typeof raw.deleted === 'object') for (const [k, v] of Object.entries(raw.deleted as Record<string, unknown>)) if (typeof v === 'number') deleted[k] = v;
  const byId = <T extends { id: string }>(xs: (T | null)[]): T[] => {
    const seen = new Set<string>();
    return xs.filter((x): x is T => !!x && !seen.has(x.id) && !!seen.add(x.id));
  };
  return {
    version: 1,
    references: byId((Array.isArray(raw.references) ? raw.references : []).map((r) => cleanLibRef(r))),
    compounds: byId((Array.isArray(raw.compounds) ? raw.compounds : []).map((c) => cleanCompound(c))),
    collections: byId((Array.isArray(raw.collections) ? raw.collections : []).map((c) => cleanCollection(c))),
    deleted,
  };
}

/** Whether a library file's text can be read (JSON holding an object), so that saving over it can't lose what it holds. */
export function isLibraryText(text: string): boolean {
  try {
    const raw = JSON.parse(text) as unknown;
    return !!raw && typeof raw === 'object' && !Array.isArray(raw);
  } catch {
    return false;
  }
}

export function libraryText(lib: LibraryData): string {
  return JSON.stringify(lib, null, 1);
}

/** Most recently seen first, one per file, at most MAX_MENTIONS. */
export function sortMentions(ms: FileMention[]): FileMention[] {
  const best = new Map<string, FileMention>();
  for (const m of ms) {
    const had = best.get(m.path);
    if (!had || m.seen > had.seen) best.set(m.path, m);
  }
  return [...best.values()].sort((a, b) => b.seen - a.seen).slice(0, MAX_MENTIONS);
}

type Stamped = { id: string; modified: number };

function mergeList<T extends Stamped>(a: T[], b: T[], deleted: Record<string, number>, both?: (x: T, y: T) => T): T[] {
  const out = new Map<string, T>();
  for (const x of a) out.set(x.id, x);
  for (const y of b) {
    const x = out.get(y.id);
    if (!x) out.set(y.id, y);
    else {
      const newer = y.modified > x.modified ? y : x;
      out.set(y.id, both ? both(newer, newer === y ? x : y) : newer);
    }
  }
  return [...out.values()].filter((x) => !(deleted[x.id] !== undefined && deleted[x.id] >= x.modified));
}

/**
 * Two copies of the library made one: every item either has, the newer change of each winning;
 * something deleted in one stays deleted unless it was changed again after. A compound's files
 * come from both (seeing a compound in a file is not a change to it).
 */
export function mergeLibraries(a: LibraryData, b: LibraryData): LibraryData {
  const deleted: Record<string, number> = { ...a.deleted };
  for (const [k, v] of Object.entries(b.deleted)) deleted[k] = Math.max(deleted[k] ?? 0, v);
  return {
    version: 1,
    references: mergeList(a.references, b.references, deleted),
    compounds: mergeList(a.compounds, b.compounds, deleted, (newer, older) => ({ ...newer, files: sortMentions([...newer.files, ...older.files]) })),
    collections: mergeList(a.collections, b.collections, deleted),
    deleted,
  };
}

/** Deleted marks older than this are let go (every copy has seen them by then). */
const FORGET_DELETED_MS = 180 * 24 * 3600 * 1000;

/** The library with deleted marks older than half a year let go. */
export function pruneDeleted(lib: LibraryData, now = Date.now()): LibraryData {
  const deleted = Object.fromEntries(Object.entries(lib.deleted).filter(([, t]) => now - t < FORGET_DELETED_MS));
  return { ...lib, deleted };
}

// ---------------------------------------------------------------- references

/** A library reference for one from a file (a copy: the file keeps its own). */
export function toLibRef(r: Reference, taken: Iterable<string>, now = Date.now()): LibReference {
  const ids = new Set(taken);
  const out = cleanLibRef({ ...r, added: now, modified: now }, now);
  if (ids.has(out.id)) out.id = newRefId(ids);
  // the manager link belongs to the file it came from
  delete out.live;
  return out;
}

/** The plain reference a file keeps (what is copied into a document or presentation). */
export function fileRef(r: LibReference): Reference {
  return cleanRef(r);
}

/**
 * The library's references after the References window changed them as plain references: those
 * kept keep their tags, collections and PDF; changed ones are marked as changed now; new ones
 * are added; the rest are deleted.
 */
export function applyRefList(lib: LibraryData, refs: Reference[], now = Date.now()): LibraryData {
  const old = new Map(lib.references.map((r) => [r.id, r]));
  const same = (a: Reference, b: Reference) => JSON.stringify(cleanRef(a)) === JSON.stringify(cleanRef(b));
  const next: LibReference[] = refs.map((r) => {
    const had = old.get(r.id);
    if (!had) return toLibRef(r, old.keys(), now);
    if (same(had, r)) return had;
    return { ...had, ...cleanRef(r), modified: now };
  });
  const kept = new Set(next.map((r) => r.id));
  const deleted = { ...lib.deleted };
  for (const r of lib.references) if (!kept.has(r.id)) deleted[r.id] = now;
  return { ...lib, references: next, deleted };
}

// ---------------------------------------------------------------- compounds

/** Text to find a compound by: its number, names, formula, CAS number, tags and notes. */
export function compoundText(c: LibCompound): string {
  return [c.label, c.name, ...c.synonyms, c.formula, c.cas, ...c.tags, c.notes, c.smiles].join(' ').toLowerCase();
}

/** A compound's name for lists: "12a · ethyl acetate". */
export function compoundTitle(c: LibCompound): string {
  return [c.label, c.name || c.synonyms[0] || c.formula].filter(Boolean).join(' · ') || 'Unnamed compound';
}

/** The compound with this structure (the same SMILES), if the library has one. */
export function compoundBySmiles(lib: LibraryData, smiles: string): LibCompound | null {
  if (!smiles) return null;
  return lib.compounds.find((c) => c.smiles === smiles) ?? null;
}

/**
 * Note that compounds were seen in a file: for each structure found there (by SMILES, with the
 * number it had), each library compound with that structure remembers the file. Gives the
 * library unchanged (the same object) when nothing new was learned.
 */
export function noteMentions(lib: LibraryData, path: string, found: { smiles: string; label?: string }[], now = Date.now()): LibraryData {
  if (!path || !found.length) return lib;
  const bySmiles = new Map<string, string | undefined>();
  for (const f of found) if (f.smiles && (!bySmiles.has(f.smiles) || (!bySmiles.get(f.smiles) && f.label))) bySmiles.set(f.smiles, f.label);
  let changed = false;
  const compounds = lib.compounds.map((c) => {
    if (!bySmiles.has(c.smiles)) return c;
    const label = bySmiles.get(c.smiles);
    const had = c.files.find((m) => m.path === path);
    // seen again within the hour with the same number: nothing to keep
    if (had && had.label === label && now - had.seen < 3600_000) return c;
    changed = true;
    const m: FileMention = { path, seen: now, ...(label ? { label } : {}) };
    return { ...c, files: sortMentions([m, ...c.files.filter((x) => x.path !== path)]) };
  });
  return changed ? { ...lib, compounds } : lib;
}

/** A file that moved or was renamed: its mentions follow it. */
export function moveMentions(lib: LibraryData, from: string, to: string): LibraryData {
  if (from === to) return lib;
  let changed = false;
  const compounds = lib.compounds.map((c) => {
    if (!c.files.some((m) => m.path === from)) return c;
    changed = true;
    return { ...c, files: sortMentions(c.files.map((m) => (m.path === from ? { ...m, path: to } : m))) };
  });
  return changed ? { ...lib, compounds } : lib;
}

// ---------------------------------------------------------------- collections

/** A collection's name with the collections it sits in: "Projects ▸ Total synthesis". */
export function collectionPath(lib: LibraryData, id: string): string {
  const names: string[] = [];
  const seen = new Set<string>();
  for (let c = lib.collections.find((x) => x.id === id); c && !seen.has(c.id); c = c.parent ? lib.collections.find((x) => x.id === c!.parent) : undefined) {
    seen.add(c.id);
    names.unshift(c.name);
  }
  return names.join(' ▸ ');
}

/** The collections of one kind, as their paths, in order. */
export function collectionsOf(lib: LibraryData, kind: CollectionKind): { id: string; path: string }[] {
  return lib.collections.filter((c) => c.kind === kind).map((c) => ({ id: c.id, path: collectionPath(lib, c.id) })).sort((a, b) => a.path.localeCompare(b.path));
}

/** A collection and those inside it (to show an item in a collection's sub-collection under it too). */
export function collectionAndInside(lib: LibraryData, id: string): Set<string> {
  const out = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const c of lib.collections) if (c.parent && out.has(c.parent) && !out.has(c.id)) { out.add(c.id); grew = true; }
  }
  return out;
}

/** Every tag used by items of one kind, with how many use it, most used first. */
export function tagsOf(items: { tags?: string[] }[]): [string, number][] {
  const n = new Map<string, number>();
  for (const it of items) for (const t of it.tags ?? []) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
