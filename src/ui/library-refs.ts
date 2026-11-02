// Your library in the References window: a group of its own, first, that is kept between
// sessions and shared by every file. Its own controls choose a collection or tag to show, put
// the references picked in collections and give them tags, attach a PDF to one and open it,
// bring your Zotero library in, and choose where the library is kept.

import { preferredStyle, setPreferredStyle } from '../document/cite-styles';
import { findDuplicate, type Reference } from '../document/references';
import {
  applyRefList, collectionAndInside, collectionsOf, newId, parseTags, tagsOf, type LibReference,
} from '../library/library';
import type { Library } from '../library/library-store';
import { syncZotero, zoteroLibrary, type WebGet, type ZoteroLink } from '../library/online';
import type { HolderPanelContext, RefHolder } from './references-dialog';
import { ask } from './ask';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

const button = (label: string, title: string, on: () => void): HTMLButtonElement => {
  const b = el('button', { type: 'button', textContent: label, title });
  b.addEventListener('click', on);
  return b;
};

/** What the library's group needs from the app. */
export interface LibraryRefsHost {
  /** The other groups (open files), to count where each reference is used. */
  files(): RefHolder[];
  /** Choose a PDF; null when cancelled. */
  pickPdf(): Promise<{ name: string; bytes: Uint8Array } | null>;
  /** Open an attachment in its own program (a PDF reader), given its bytes and where it is on disk. */
  openFile(name: string, bytes: Uint8Array, path: string | null): Promise<void>;
  /** Read a web address's text (Zotero). */
  get: WebGet;
  /** This computer's link to Zotero (kept on this computer only). */
  zotero: { read(): Promise<ZoteroLink | null>; write(link: ZoteroLink | null): Promise<void> };
  /** The person's own citation style was changed here (settings.json keeps it). */
  styleChanged(): void;
  /** Library Location… (the window that moves it). */
  location(): Promise<void>;
  flash(msg: string, ms?: number): void;
}

/** Collection picked to show: '' every reference, '-' those in no collection, else a collection's id. */
type Show = { collection: string; tag: string };

export const LIBRARY_KEY = 'library';

/** The library as a group of the References window. */
export function libraryHolder(lib: Library, host: LibraryRefsHost): RefHolder {
  const show: Show = { collection: '', tag: '' };
  const now = () => lib.now;
  const refById = (id: string) => now().references.find((r) => r.id === id);
  const shows = (r: Reference): boolean => {
    const x = refById(r.id);
    if (!x) return true;
    if (show.tag && !x.tags?.includes(show.tag)) return false;
    if (show.collection === '-') return !x.collections?.length;
    if (show.collection) {
      const inside = collectionAndInside(now(), show.collection);
      return !!x.collections?.some((c) => inside.has(c));
    }
    return true;
  };
  return {
    key: LIBRARY_KEY, name: 'My Library', kind: 'Library',
    note: () => 'Your own references, kept between sessions and shared by every file. Copy them into a document or presentation to cite them there.',
    refs: () => now().references,
    setRefs: (_label, refs) => lib.change((l) => applyRefList(l, refs)),
    citeStyle: () => preferredStyle().style,
    citeOptions: () => preferredStyle().options,
    setStyle: (style, options) => { setPreferredStyle(style, options); host.styleChanged(); },
    uses: () => {
      const out = new Map<string, number>();
      const files = host.files();
      for (const r of now().references) {
        const n = files.filter((f) => findDuplicate(f.refs(), r)).length;
        if (n) out.set(r.id, n);
      }
      return out;
    },
    useText: (n) => (n ? `in ${n} open file${n === 1 ? '' : 's'}` : ''),
    deleteNote: () => 'The open files that have copies keep them.',
    shows,
    mark: (r) => {
      const x = refById(r.id);
      return (x?.pdf ? ' 📎' : '') + (x?.tags?.length ? `  #${x.tags.join(' #')}` : '');
    },
    panel: (ctx) => libraryPanel(lib, host, show, ctx),
  };
}

/** The library group's own controls. */
function libraryPanel(lib: Library, host: LibraryRefsHost, show: Show, ctx: HolderPanelContext): { el: HTMLElement; update(): void } {
  const colSel = el('select', { title: 'Show the references in one collection (and those inside it)' });
  colSel.setAttribute('aria-label', 'Collection');
  colSel.addEventListener('change', () => { show.collection = colSel.value; ctx.refresh(); });
  const tagSel = el('select', { title: 'Show the references with one tag' });
  tagSel.setAttribute('aria-label', 'Tag');
  tagSel.addEventListener('change', () => { show.tag = tagSel.value; ctx.refresh(); });
  const problem = el('p', { className: 'refs-warning', role: 'status' });
  const picked = (): LibReference[] => ctx.picked().map((r) => lib.now.references.find((x) => x.id === r.id)).filter((x): x is LibReference => !!x);
  const pdfOpen = button('Open PDF', 'Open the PDF of the reference picked', () => void openPdf());
  const pdfAttach = button('Attach PDF…', 'Keep a PDF with the reference picked (in your library\'s folder)', () => void attachPdf());

  const update = () => {
    const data = lib.now;
    const cols = collectionsOf(data, 'references');
    if (show.collection && show.collection !== '-' && !cols.some((c) => c.id === show.collection)) show.collection = '';
    colSel.replaceChildren(new Option('All references', ''), new Option('In no collection', '-'), ...cols.map((c) => new Option(c.path, c.id)));
    colSel.value = show.collection;
    const tags = tagsOf(data.references);
    if (show.tag && !tags.some(([t]) => t === show.tag)) show.tag = '';
    tagSel.replaceChildren(new Option('Any tag', ''), ...tags.map(([t, n]) => new Option(`${t} (${n})`, t)));
    tagSel.value = show.tag;
    tagSel.disabled = !tags.length;
    const p = picked();
    pdfOpen.disabled = !(p.length === 1 && p[0].pdf);
    pdfAttach.disabled = p.length !== 1;
    problem.textContent = lib.problem;
    problem.hidden = !lib.problem;
  };

  const tagAndFile = async () => {
    const p = picked();
    if (!p.length) { ctx.flash('Click the references in your library to tag or put in a collection first.'); return; }
    const data = lib.now;
    const cols = collectionsOf(data, 'references');
    const common = (f: (r: LibReference) => string[] | undefined) => p.map((r) => f(r) ?? []).reduce((a, b) => a.filter((x) => b.includes(x)));
    const fields = [
      { name: 'tags', label: 'Tags', value: common((r) => r.tags).join(', '), placeholder: 'e.g. C–H activation, review', help: 'Separated by commas. Tags only some of them have are kept on those.' },
      ...cols.map((c) => ({ name: `col:${c.id}`, label: c.path, type: 'checkbox' as const, value: String(p.every((r) => r.collections?.includes(c.id))) })),
      { name: 'newcol', label: 'New collection', value: '', placeholder: 'a name, to make one and put them in it' },
    ];
    const got = await ask(p.length === 1 ? 'Tags and Collections' : `Tags and Collections (${p.length} references)`, fields, { ok: 'Apply', note: cols.length ? 'Tick the collections they belong in.' : 'Collections group references (Zotero\'s collections come in as collections too).' });
    if (!got) return;
    const before = common((r) => r.tags);
    const typed = parseTags(got.tags);
    const t = Date.now();
    lib.change((l) => {
      let collections = l.collections;
      let made: string | null = null;
      if (got.newcol?.trim()) {
        made = newId('k', l.collections.map((c) => c.id));
        collections = [...collections, { id: made, name: got.newcol.trim(), kind: 'references', modified: t, ...(show.collection && show.collection !== '-' ? { parent: show.collection } : {}) }];
      }
      const ids = new Set(p.map((r) => r.id));
      const references = l.references.map((r) => {
        if (!ids.has(r.id)) return r;
        const tags = [...(r.tags ?? []).filter((x) => !before.includes(x)), ...typed];
        const inCols = new Set(r.collections ?? []);
        for (const c of cols) { if (got[`col:${c.id}`] === 'true') inCols.add(c.id); else inCols.delete(c.id); }
        if (made) inCols.add(made);
        const next: LibReference = { ...r, modified: t };
        if (tags.length) next.tags = [...new Set(tags)]; else delete next.tags;
        if (inCols.size) next.collections = [...inCols]; else delete next.collections;
        return next;
      });
      return { ...l, references, collections };
    });
    ctx.refresh();
  };

  const manageCollections = async () => {
    const cols = collectionsOf(lib.now, 'references');
    const got = await ask('Collections', [
      { name: 'pick', label: 'Collection', value: show.collection && show.collection !== '-' ? show.collection : cols[0]?.id ?? '', options: [{ value: '', label: '(a new one)' }, ...cols.map((c) => ({ value: c.id, label: c.path }))] },
      { name: 'name', label: 'Name', value: '', placeholder: 'the new name (blank: unchanged)' },
      { name: 'parent', label: 'Inside', value: '', options: [{ value: '', label: '(no collection: at the top)' }, ...cols.map((c) => ({ value: c.id, label: c.path }))] },
      { name: 'delete', label: 'Delete this collection (its references stay in the library)', type: 'checkbox', value: 'false' },
    ], { ok: 'Apply', note: 'Make a collection, rename one, move it inside another, or delete it.' });
    if (!got) return;
    const t = Date.now();
    lib.change((l) => {
      const id = got.pick;
      if (!id) {
        if (!got.name.trim()) return l;
        return { ...l, collections: [...l.collections, { id: newId('k', l.collections.map((c) => c.id)), name: got.name.trim(), kind: 'references', modified: t, ...(got.parent ? { parent: got.parent } : {}) }] };
      }
      if (got.delete === 'true') {
        const gone = collectionAndInside(l, id);
        return {
          ...l,
          collections: l.collections.filter((c) => !gone.has(c.id)),
          references: l.references.map((r) => (r.collections?.some((c) => gone.has(c)) ? { ...r, collections: r.collections.filter((c) => !gone.has(c)), modified: t } : r)),
          deleted: { ...l.deleted, ...Object.fromEntries([...gone].map((g) => [g, t])) },
        };
      }
      // (never inside itself or one of its own)
      const parent = got.parent && !collectionAndInside(l, id).has(got.parent) ? got.parent : undefined;
      return {
        ...l, collections: l.collections.map((c) => {
          if (c.id !== id) return c;
          const next = { ...c, name: got.name.trim() || c.name, modified: t };
          if (parent) next.parent = parent; else delete next.parent;
          return next;
        }),
      };
    });
    ctx.refresh();
  };

  const attachPdf = async () => {
    const [r] = picked();
    if (!r) { ctx.flash('Click a reference in your library first.'); return; }
    const f = await host.pickPdf();
    if (!f) return;
    const name = `${r.id}.pdf`;
    try {
      await lib.place.writeFile(name, f.bytes);
    } catch (e) {
      ctx.flash(`Could not keep the PDF: ${e instanceof Error ? e.message : String(e)}`, 8000);
      return;
    }
    lib.change((l) => ({ ...l, references: l.references.map((x) => (x.id === r.id ? { ...x, pdf: name, modified: Date.now() } : x)) }));
    ctx.refresh();
    ctx.flash(`Kept ${f.name} with the reference. Open PDF opens it.`);
  };

  const openPdf = async () => {
    const [r] = picked();
    if (!r?.pdf) { ctx.flash('The reference picked has no PDF: Attach PDF… keeps one with it.'); return; }
    const bytes = await lib.place.readFile(r.pdf);
    if (!bytes) { ctx.flash('The PDF isn\'t in your library\'s folder any more (moved or deleted?). Attach PDF… keeps it again.', 8000); return; }
    await host.openFile(r.pdf, bytes, await lib.place.filePath(r.pdf));
  };

  const zotero = async () => {
    const had = await host.zotero.read();
    const got = await ask('Sync with Zotero', [
      { name: 'library', label: 'Library', value: had?.library.replace(/^users\//, '') ?? '', placeholder: 'your user ID, or groups/12345', help: 'Your user ID is on zotero.org/settings/keys ("Your userID for use in API calls").' },
      { name: 'key', label: 'API key', value: had?.key ?? '', type: 'password', help: 'Make one at zotero.org/settings/keys, with "Allow library access" (read-only is enough). It is kept on this computer only.' },
      ...(had ? [{ name: 'again', label: 'Bring everything in again (not only what changed)', type: 'checkbox' as const, value: 'false' }, { name: 'forget', label: 'Forget this Zotero link', type: 'checkbox' as const, value: 'false' }] : []),
    ], { ok: 'Sync', note: 'Brings your Zotero references, their tags and collections into your library. Zotero itself is not changed. Each sync brings in only what is new or changed since the last.' });
    if (!got) return;
    if (got.forget === 'true') { await host.zotero.write(null); ctx.flash('This computer no longer reads your Zotero library. The references brought in stay.'); return; }
    const library = zoteroLibrary(got.library);
    if (!library || !got.key.trim()) { ctx.flash('Type your Zotero user ID (a number) and an API key.', 6000); return; }
    const link: ZoteroLink = { library, key: got.key.trim(), version: had && had.library === library && got.again !== 'true' ? had.version : 0 };
    ctx.flash('Reading your Zotero library…', 30000);
    try {
      await lib.load();
      const r = await syncZotero(lib.now, link, host.get);
      lib.change(() => r.lib);
      await host.zotero.write({ ...link, version: r.version });
      ctx.refresh();
      ctx.flash(r.added || r.updated ? `From Zotero: ${r.added} new reference${r.added === 1 ? '' : 's'}, ${r.updated} brought up to date.` : 'Nothing new in Zotero since the last sync.', 6000);
    } catch (e) {
      ctx.flash(e instanceof Error ? e.message : String(e), 9000);
    }
  };

  const panel = el('div', { className: 'refs-library' },
    el('div', { className: 'refs-filter' }, el('span', { textContent: 'Show' }), colSel, tagSel,
      button('Collections…', 'Make, rename, nest or delete collections', () => void manageCollections())),
    el('div', { className: 'refs-library-tools' },
      button('Tags and Collections…', 'Give the references picked tags, and put them in collections', () => void tagAndFile()),
      pdfAttach, pdfOpen,
      button('Sync with Zotero…', 'Bring your Zotero library\'s references, tags and collections in (Zotero\'s web API)', () => void zotero()),
      button('Library Location…', 'Where your library is kept: on this computer, or in a folder such as OneDrive to use it on other computers or share it', () => void host.location())),
    problem);
  update();
  return { el: panel, update };
}
