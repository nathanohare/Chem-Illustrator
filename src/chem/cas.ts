// CAS Registry Numbers (CAS RN), both ways: a CAS RN typed or pasted anywhere a name is
// accepted gives its structure, and a drawn structure gives its CAS RN. CAS RNs are arbitrary
// numbers given out by CAS, so they can't be worked out from a structure: they are looked up.
//
// Where they come from, in order:
//   1. your Compound Library (the CAS RN you typed for a compound, or one of its other names);
//   2. answers looked up before, kept on this computer, so a number found once works offline;
//   3. PubChem (the US National Library of Medicine's free database), which lists CAS RNs among
//      a compound's names;
//   4. for CAS RN to structure only, NCI CACTUS (the US National Cancer Institute's free Chemical
//      Identifier Resolver), when PubChem doesn't know the number.
// No list of CAS RNs ships with the program: CAS asks for a licence to publish them.

import { isCas, pubchemByCas, pubchemCasOf, PubChemError, type Fetch } from './pubchem';
import { cactusSmiles, CactusError } from './cactus';

/** A CAS RN read from some text, or one with the wrong check digit. */
export type CasRead = { kind: 'cas'; cas: string } | { kind: 'typo'; cas: string; should: number };

/** The check digit of a CAS RN's other digits ("50-78" gives 2). */
export function casCheckDigit(first: string, second: string): number {
  const digits = (first + second).split('').reverse();
  return digits.reduce((s, d, i) => s + Number(d) * (i + 1), 0) % 10;
}

/**
 * A CAS RN in a short text: "50-78-2", "CAS 50-78-2", "CAS RN: 50-78-2", "[50-78-2]",
 * "0000050-78-2" (padded, as some databases write them) or with other kinds of dash. Null
 * when the text isn't shaped like one; a "typo" when it is, but its check digit is wrong.
 */
export function readCas(text: string): CasRead | null {
  let t = text.trim()
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/^CAS(?:\s*(?:RN|Registry\s*(?:No\.?|Number)|No\.?|Number|#))?\s*[:#.]?\s*/i, '')
    .replace(/\s*-\s*/g, '-')
    .trim();
  t = t.replace(/^\[(.*)\]$/, '$1');
  const m = /^(\d{2,})-(\d{2})-(\d)$/.exec(t);
  if (!m) return null;
  // padding zeros come off, but a CAS RN's first part has two to seven digits
  const first = m[1].replace(/^0+(?=\d{2})/, '');
  if (first.length > 7) return null;
  const cas = `${first}-${m[2]}-${m[3]}`;
  const should = casCheckDigit(first, m[2]);
  return should === Number(m[3]) ? { kind: 'cas', cas } : { kind: 'typo', cas, should };
}

/** Does this text look like a CAS RN (right or wrong check digit)? */
export const looksLikeCas = (text: string): boolean => readCas(text) !== null;

/** Why a CAS RN with the wrong check digit can't be used. */
export function casTypoMessage(r: Extract<CasRead, { kind: 'typo' }>): string {
  return `${r.cas} isn't a valid CAS RN: its last digit is a check digit, which should be ${r.should} here. One of the digits is probably mistyped.`;
}

// ---------------------------------------------------------------- answers kept on this computer

/** One CAS RN and its structure, as found. */
export interface CasEntry {
  cas: string;
  /** The structure's SMILES as found (PubChem's or CACTUS's). */
  smiles: string;
  /** RDKit's SMILES for it, as the drawing gives it, when known (how a drawn structure is matched). */
  key?: string;
  /** Its common name, if the source gave one. */
  name?: string;
  /** PubChem's compound number, if found there. */
  cid?: number;
  source: 'PubChem' | 'NCI CACTUS';
  /** Part of a structure's whole list of CAS RNs (looked up from the structure), not one number looked up on its own. */
  whole?: boolean;
  /** When it was found (ISO date). */
  found: string;
}

/** Where the kept answers live: the browser's own storage, or a stand-in in tests. */
export interface CasStore { read(): string | null; write(text: string): void }

const STORE_KEY = 'chem-illustrator.cas-lookups';
/** Plenty for one person's chemistry, and still small (about 150 bytes each). */
export const CAS_KEEP = 2000;

export const browserCasStore: CasStore = {
  read: () => { try { return localStorage.getItem(STORE_KEY); } catch { return null; } },
  write: (text) => { try { localStorage.setItem(STORE_KEY, text); } catch { /* not kept: fine, looked up again next time */ } },
};

/** Structures with no CAS RN on PubChem, kept so they aren't asked about again and again. */
const NONE = '';

/**
 * CAS RNs found before, newest last. Looked up by CAS RN or by the structure's RDKit SMILES;
 * a structure PubChem lists no CAS RN for is kept too (with an empty CAS RN).
 */
export class CasMemory {
  private list: CasEntry[] | null = null;
  constructor(private store: CasStore = browserCasStore, private keep = CAS_KEEP) {}

  private all(): CasEntry[] {
    if (this.list) return this.list;
    let got: unknown = null;
    try { got = JSON.parse(this.store.read() ?? 'null'); } catch { got = null; }
    const raw = Array.isArray((got as { entries?: unknown })?.entries) ? (got as { entries: unknown[] }).entries : [];
    this.list = raw.filter((e): e is CasEntry => !!e && typeof (e as CasEntry).cas === 'string' && typeof (e as CasEntry).smiles === 'string'
      && ((e as CasEntry).cas === NONE || isCas((e as CasEntry).cas)));
    return this.list;
  }

  /** The structure kept for a CAS RN. */
  byCas(cas: string): CasEntry | null {
    return [...this.all()].reverse().find((e) => e.cas === cas) ?? null;
  }

  /**
   * What was found for a structure (by its RDKit SMILES): its CAS RNs, main one first; [] when
   * PubChem listed none; null when never asked. A structure looked up by its own CAS RN counts
   * too, when it was never asked about itself.
   */
  byKey(key: string): { cas: string[]; name?: string; cid?: number; source: CasEntry['source'] } | null {
    const asked = this.all().filter((e) => e.key === key && e.whole);
    const mine = asked.length ? asked : this.all().filter((e) => e.key === key && e.cas);
    if (!mine.length) return null;
    const last = mine[mine.length - 1];
    // the newest answer wins: it lists all the numbers found that time
    const same = asked.length ? mine.filter((e) => e.found === last.found) : [last];
    return { cas: same.map((e) => e.cas).filter(Boolean), name: last.name, cid: last.cid, source: last.source };
  }

  /**
   * Keep what was just found. A CAS RN's structure replaces an older one for that number; a
   * structure's whole list of CAS RNs (`whole`) replaces what was kept for that structure.
   */
  remember(found: CasEntry[]): void {
    if (!found.length) return;
    const keys = new Set(found.filter((e) => e.whole && e.key).map((e) => e.key));
    const nums = new Set(found.filter((e) => !e.whole).map((e) => e.cas).filter(Boolean));
    const rest = this.all().filter((e) => !(e.whole && e.key && keys.has(e.key)) && !(!e.whole && nums.has(e.cas)));
    this.list = [...rest, ...found].slice(-this.keep);
    this.store.write(JSON.stringify({ version: 1, entries: this.list }));
  }

  /** Keep that PubChem lists no CAS RN for this structure. */
  rememberNone(key: string, smiles: string, source: CasEntry['source'], extra: { name?: string; cid?: number } = {}): void {
    this.remember([{ cas: NONE, smiles, key, whole: true, source, found: new Date().toISOString(), ...extra }]);
  }

  /** How many answers are kept. */
  get size(): number { return this.all().length; }

  /** Forget every answer kept. */
  clear(): void {
    this.list = [];
    this.store.write(JSON.stringify({ version: 1, entries: [] }));
  }
}

// ---------------------------------------------------------------- looking them up

/** A compound in your Compound Library, as far as CAS RNs go. */
export interface CasLibCompound { cas: string; synonyms: string[]; smiles: string; name: string; label: string }

/** What a lookup needs from the rest of the program. */
export interface CasDeps {
  /** Your Compound Library's compounds (read the first time it is needed). */
  library(): Promise<CasLibCompound[]>;
  memory: CasMemory;
  /** Looking up on PubChem and NCI CACTUS is allowed (Edit > Settings > Online). */
  online: boolean;
  /** RDKit's SMILES for a SMILES from elsewhere, as a drawing of it would give (to match drawn structures later). */
  canonical(smiles: string): Promise<string | null>;
  fetchFn?: Fetch;
}

/** A CAS RN's structure as found, with a note on where it came from (to show the person). */
export type CasStructure = { smiles: string; note: string } | { error: string };

const libTitle = (c: CasLibCompound) => [c.label, c.name].filter(Boolean).join(' · ') || 'a compound';
const day = (iso: string) => iso.slice(0, 10);

/** The structure filed under a CAS RN (already checked by readCas). */
export async function structureForCas(cas: string, deps: CasDeps): Promise<CasStructure> {
  const lib = await deps.library().catch(() => [] as CasLibCompound[]);
  const mine = lib.find((c) => c.smiles && (c.cas.trim() === cas || c.synonyms.some((s) => readCas(s)?.cas === cas)));
  if (mine) return { smiles: mine.smiles, note: `CAS RN ${cas} is ${libTitle(mine)} in your Compound Library.` };
  const kept = deps.memory.byCas(cas);
  if (kept) return { smiles: kept.smiles, note: `Found CAS RN ${cas}${kept.name ? `: ${kept.name}` : ''} (looked up on ${kept.source} on ${day(kept.found)}). Check it is the compound you meant.` };
  if (!deps.online) return { error: `CAS RN ${cas} isn't in your Compound Library. CAS RNs are looked up on PubChem, which is turned off in Edit > Settings > Online.` };
  let problem = '';
  try {
    const pc = await pubchemByCas(cas, deps.fetchFn);
    if (pc) {
      deps.memory.remember([{ cas, smiles: pc.smiles, key: (await deps.canonical(pc.smiles).catch(() => null)) ?? undefined, name: pc.title || undefined, cid: pc.cid, source: 'PubChem', found: new Date().toISOString() }]);
      const more = pc.count > 1 ? ` PubChem files ${pc.count} compounds under this number (often salts or mixtures); this is the first.` : '';
      return { smiles: pc.smiles, note: `Found CAS RN ${cas} on PubChem${pc.title ? `: ${pc.title}` : ''} (CID ${pc.cid}). Check it is the compound you meant.${more}` };
    }
  } catch (e) {
    if (!(e instanceof PubChemError)) throw e;
    problem = e.message;
  }
  try {
    const smiles = await cactusSmiles(cas, deps.fetchFn);
    if (smiles) {
      deps.memory.remember([{ cas, smiles, key: (await deps.canonical(smiles).catch(() => null)) ?? undefined, source: 'NCI CACTUS', found: new Date().toISOString() }]);
      return { smiles, note: `Found CAS RN ${cas} on NCI CACTUS${problem ? '' : ' (PubChem doesn\'t list it)'}. CACTUS sometimes leaves out stereochemistry: check the structure.` };
    }
  } catch (e) {
    if (!(e instanceof CactusError)) throw e;
    if (problem) return { error: `${problem} (CAS RN ${cas} isn't in your Compound Library or among the numbers looked up before.)` };
    problem = e.message;
  }
  return { error: problem ? `PubChem doesn't list CAS RN ${cas}, and ${problem[0].toLowerCase()}${problem.slice(1)}` : `Neither PubChem nor NCI CACTUS knows CAS RN ${cas}. Check the number, or draw the structure.` };
}

/** A drawn structure's CAS RNs (main one first), or why there are none. */
export type CasFound =
  | { kind: 'found'; cas: string[]; name?: string; cid?: number; from: string }
  | { kind: 'none'; message: string; cid?: number }
  | { kind: 'error'; message: string };

/**
 * The CAS RNs of a drawn structure, by its RDKit SMILES. `fresh` skips the answers kept on this
 * computer and asks PubChem again.
 */
export async function casForStructure(smiles: string, deps: CasDeps, fresh = false): Promise<CasFound> {
  const lib = await deps.library().catch(() => [] as CasLibCompound[]);
  const mine = lib.find((c) => c.smiles === smiles && (c.cas.trim() || c.synonyms.some((s) => readCas(s)?.kind === 'cas')));
  if (mine && !fresh) {
    const nums = [mine.cas.trim(), ...mine.synonyms.map((s) => readCas(s)).filter((r): r is Extract<CasRead, { kind: 'cas' }> => r?.kind === 'cas').map((r) => r.cas)].filter(Boolean);
    return { kind: 'found', cas: [...new Set(nums)], name: mine.name || undefined, from: 'your Compound Library' };
  }
  const kept = fresh ? null : deps.memory.byKey(smiles);
  if (kept?.cas.length) return { kind: 'found', cas: kept.cas, name: kept.name, cid: kept.cid, from: kept.source };
  if (kept) return { kind: 'none', message: `PubChem lists no CAS RN for this structure${kept.name ? ` (${kept.name})` : ''}.`, cid: kept.cid };
  if (!deps.online) return { kind: 'error', message: 'CAS RNs are looked up on PubChem, which is turned off in Edit > Settings > Online.' };
  let got: Awaited<ReturnType<typeof pubchemCasOf>>;
  try {
    got = await pubchemCasOf(smiles, deps.fetchFn);
  } catch (e) {
    if (e instanceof PubChemError) return { kind: 'error', message: e.message };
    throw e;
  }
  if (!got) return { kind: 'none', message: 'PubChem has no record of this exact structure (stereochemistry and charges count), so no CAS RN was found.' };
  const now = new Date().toISOString();
  if (!got.cas.length) {
    deps.memory.rememberNone(smiles, smiles, 'PubChem', { name: got.title || undefined, cid: got.cid });
    return { kind: 'none', message: `PubChem lists no CAS RN for this structure${got.title ? ` (${got.title})` : ''}.`, cid: got.cid };
  }
  deps.memory.remember(got.cas.map((cas) => ({ cas, smiles, key: smiles, whole: true, name: got!.title || undefined, cid: got!.cid, source: 'PubChem' as const, found: now })));
  return { kind: 'found', cas: got.cas, name: got.title || undefined, cid: got.cid, from: 'PubChem' };
}
