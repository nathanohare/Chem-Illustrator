// References from online services into the library: PubMed (by PubMed id, through NCBI's
// public E-utilities) and Zotero (your Zotero library, through Zotero's public web API, read
// with an API key you make at zotero.org/settings/keys). Zotero is read, never written: Sync
// brings in what is new or changed there since the last sync, into collections named as
// Zotero's.

import { cleanRef, type RefType } from '../document/references';
import { cleanLibRef, type LibCollection, type LibraryData, type LibReference } from './library';

/** Read a web address's text (the desktop app reads it itself; a browser where the site allows it). */
export type WebGet = (url: string) => Promise<string>;

type Json = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// ---------------------------------------------------------------- PubMed

export const PUBMED_SUMMARY = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=';

/** PubMed ids in text: "31234567", "PMID: 31234567", a pubmed.ncbi.nlm.nih.gov link, several at once. */
export function parsePmids(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:pubmed\.ncbi\.nlm\.nih\.gov\/|PMID:?\s*)?\b(\d{1,9})\b/gi)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** "Smith JA" (PubMed's way) as "Smith, J. A."; a group's name stays as it is. */
export function pubmedAuthor(name: string): string {
  const m = /^(.+?)\s+([A-Z]{1,4})$/.exec(name.trim());
  if (!m) return name.trim();
  return `${m[1]}, ${m[2].split('').map((c) => `${c}.`).join(' ')}`;
}

/** A reference from PubMed's summary of an article. */
export function fromPubmed(uid: string, d: Json): LibReference {
  const ids = arr(d.articleids) as Json[];
  const doi = str(ids.find((x) => str(x.idtype) === 'doi')?.value);
  const year = /\b(\d{4})\b/.exec(str(d.pubdate) || str(d.epubdate))?.[1] ?? '';
  const authors = (arr(d.authors) as Json[]).filter((a) => str(a.authtype) !== 'CollectiveName' || str(a.name)).map((a) => pubmedAuthor(str(a.name))).filter(Boolean);
  const title = str(d.title).replace(/\.$/, '');
  const r = cleanLibRef({ ...cleanRef({ type: 'article', authors, title, journal: str(d.source), year, volume: str(d.volume), issue: str(d.issue), pages: str(d.pages), doi }), pmid: uid });
  return r;
}

/** Look PubMed ids up (several at once). Throws with a message to show. */
export async function fetchPubmed(pmids: string[], get: WebGet): Promise<LibReference[]> {
  if (!pmids.length) throw new Error('Type a PubMed id (PMID), such as 31234567.');
  let data: Json;
  try {
    data = JSON.parse(await get(PUBMED_SUMMARY + pmids.join(','))) as Json;
  } catch (e) {
    throw new Error(`Could not reach PubMed: ${e instanceof Error ? e.message : String(e)} Are you online?`);
  }
  const result = (data.result ?? {}) as Json;
  const out: LibReference[] = [];
  for (const uid of arr(result.uids).map(str)) {
    const d = result[uid] as Json | undefined;
    if (d && !d.error) out.push(fromPubmed(uid, d));
  }
  if (!out.length) throw new Error(`PubMed has no article with ${pmids.length === 1 ? 'that id' : 'those ids'} (${pmids.join(', ')}).`);
  return out;
}

// ---------------------------------------------------------------- Zotero

export const ZOTERO_API = 'https://api.zotero.org';

/** How this computer reads your Zotero library (kept on this computer only). */
export interface ZoteroLink {
  /** "users/123456" or "groups/98765". */
  library: string;
  key: string;
  /** The highest item version brought in (the next sync asks only for newer ones). */
  version: number;
}

/** "123456", "users/123456" or "groups/98765" as the library's path; null when it isn't one. */
export function zoteroLibrary(text: string): string | null {
  const t = text.trim().replace(/^https?:\/\/(?:www\.)?zotero\.org\//, '').replace(/\/+$/, '');
  if (/^\d+$/.test(t)) return `users/${t}`;
  const m = /^(users|groups)\/(\d+)$/.exec(t);
  return m ? `${m[1]}/${m[2]}` : null;
}

const ZOTERO_TYPES: Record<string, RefType> = { journalArticle: 'article', book: 'book', bookSection: 'chapter', thesis: 'thesis', webpage: 'web', blogPost: 'web' };

/** A Zotero item as a library reference (`known`: the reference it was brought in as before, which keeps its id, PDF and own tags). */
export function fromZotero(item: Json, collections: Map<string, string>, known?: LibReference): LibReference {
  const d = (item.data ?? {}) as Json;
  const type = ZOTERO_TYPES[str(d.itemType)] ?? 'misc';
  const authors = (arr(d.creators) as Json[])
    .filter((c) => ['author', 'editor', 'contributor', 'inventor'].includes(str(c.creatorType)) || !str(c.creatorType))
    .map((c) => (str(c.lastName) ? `${str(c.lastName)}, ${str(c.firstName)}`.replace(/,\s*$/, '') : str(c.name)))
    .filter(Boolean);
  const year = /\b(\d{4})\b/.exec(str(d.date))?.[1] ?? '';
  const journal = type === 'chapter' ? str(d.bookTitle) : str(d.journalAbbreviation) || str(d.publicationTitle) || str(d.websiteTitle);
  const base = cleanRef({
    id: known?.id, type, authors, title: str(d.title), journal, year,
    volume: str(d.volume), issue: str(d.issue), pages: str(d.pages), doi: str(d.DOI) || (/\bDOI:\s*(\S+)/i.exec(str(d.extra))?.[1] ?? ''),
    url: str(d.url), publisher: type === 'thesis' ? str(d.university) : str(d.publisher),
  });
  const zTags = (arr(d.tags) as Json[]).map((t) => str(t.tag)).filter(Boolean);
  const cols = arr(d.collections).map(str).map((k) => collections.get(k)).filter((x): x is string => !!x);
  // tags and collections added here stay; Zotero's are brought up to date
  const keptCols = (known?.collections ?? []).filter((c) => !c.startsWith('z-'));
  return cleanLibRef({
    ...known, ...base,
    tags: [...new Set([...(known?.tags ?? []), ...zTags])],
    collections: [...new Set([...keptCols, ...cols])],
    abstract: str(d.abstractNote) || known?.abstract,
    zotero: { key: str(item.key), version: Number(item.version) || 0, library: '' },
    added: known?.added ?? Date.now(), modified: Date.now(),
  });
}

/** Zotero's collections as library collections ("z-" and Zotero's key, so a second sync finds them). */
export function zoteroCollections(list: Json[], now = Date.now()): LibCollection[] {
  return list.map((c) => {
    const d = (c.data ?? {}) as Json;
    const parent = str(d.parentCollection);
    return { id: `z-${str(c.key)}`, name: str(d.name) || 'Zotero collection', kind: 'references' as const, ...(parent && parent !== 'false' ? { parent: `z-${parent}` } : {}), modified: now };
  });
}

/** Read every page of a Zotero list (it gives at most 100 at a time). */
async function zoteroAll(base: string, link: ZoteroLink, query: string, get: WebGet): Promise<Json[]> {
  const out: Json[] = [];
  for (let start = 0; start < 100000; start += 100) {
    const url = `${ZOTERO_API}/${link.library}/${base}?format=json&limit=100&start=${start}&key=${encodeURIComponent(link.key)}${query}`;
    let page: unknown;
    try {
      page = JSON.parse(await get(url));
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      throw new Error(/\b40[13]\b/.test(why) ? 'Zotero refused the key: check it at zotero.org/settings/keys (it needs "Allow library access") and the library number.' : `Could not reach Zotero: ${why}`);
    }
    const items = arr(page) as Json[];
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

/** What a sync changed. */
export interface ZoteroSync { lib: LibraryData; added: number; updated: number; version: number }

/**
 * Bring in what is new or changed in Zotero since the last sync: items (not notes or the
 * attachments themselves) become references, Zotero's collections become collections. A
 * reference brought in before is updated in place (its PDF and the tags added here stay).
 */
export async function syncZotero(lib: LibraryData, link: ZoteroLink, get: WebGet, now = Date.now()): Promise<ZoteroSync> {
  const cols = zoteroCollections(await zoteroAll('collections', link, '', get), now);
  const items = await zoteroAll('items', link, `&itemType=${encodeURIComponent('-attachment || note || annotation')}${link.version ? `&since=${link.version}` : ''}`, get);
  const colIds = new Map(cols.map((c) => [c.id.slice(2), c.id]));
  const byKey = new Map(lib.references.filter((r) => r.zotero?.key).map((r) => [r.zotero!.key, r]));
  let added = 0, updated = 0, version = link.version;
  const refs = lib.references.slice();
  for (const item of items) {
    version = Math.max(version, Number(item.version) || 0);
    const known = byKey.get(str(item.key));
    const r = fromZotero(item, colIds, known);
    r.zotero = { key: str(item.key), version: Number(item.version) || 0, library: link.library };
    if (known) { refs[refs.indexOf(known)] = r; updated++; }
    else {
      // the same paper already in the library (by DOI): it becomes the Zotero item's
      const same = r.doi ? refs.find((x) => !x.zotero && x.doi.toLowerCase() === r.doi.toLowerCase()) : undefined;
      if (same) { refs[refs.indexOf(same)] = { ...r, id: same.id, pdf: same.pdf, tags: [...new Set([...(same.tags ?? []), ...(r.tags ?? [])])], added: same.added }; updated++; }
      else { refs.push(r); added++; }
    }
  }
  const known = new Map(lib.collections.map((c) => [c.id, c]));
  const collections = lib.collections.filter((c) => !c.id.startsWith('z-') || cols.some((x) => x.id === c.id)).map((c) => cols.find((x) => x.id === c.id) ?? c);
  for (const c of cols) if (!known.has(c.id)) collections.push(c);
  return { lib: { ...lib, references: refs, collections }, added, updated, version };
}
