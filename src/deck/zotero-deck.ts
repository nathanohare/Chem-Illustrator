// Citing with Zotero in a presentation: Zotero's citation window picks the references a slide
// shows, and Zotero writes the References slide's list, as zotero-live.ts does for documents.
//
// Each slide that shows references is one of Zotero's citations (the references in the order the
// slide shows them), and the References slide is Zotero's bibliography. The slide lines stay the
// app's own short form (journal, year, volume, page), placed and sized as References on Slide
// sets them; Zotero brings the references (from your library, kept up to date by Refresh) and its
// citation style for the References slide's list. Zotero's preferences are kept with the deck's
// references, in its PowerPoint file.

import { citeText, piecesText, type Reference } from '../document/references';
import { styleFromCsl, zoteroStyleOf, type CiteLive } from '../document/live-cites';
import {
  bibFromHtml, citationFromCode, htmlText, refsKey, writtenCode, ZOTERO_BIBL, ZOTERO_PLACEHOLDER,
  type FieldJson, type ZoteroCommand, type ZoteroStore,
} from '../document/zotero-live';
import { deckFormat, deckNumbers, refsSlideBlock, type DeckRefs, type SlideRefs } from './slide-refs';

/** A slide as citing sees it: its id, what it says of references, and whether it is hidden. */
export interface ZoteroSlide extends SlideRefs { id: number; hidden?: boolean }

/** What citing with Zotero needs of the open presentation (main.ts gives it). */
export interface DeckZoteroHost {
  readonly docId: string;
  /** The deck's references, its slides in order, and the slide being shown (its index). */
  state(): { refs?: DeckRefs; slides: ZoteroSlide[]; current: number };
  /** Put changed references in place: the deck's and, by slide id, the slides' (the first change of a command is a step to undo, the rest join it). */
  change(refs: DeckRefs | undefined, slides: Map<number, SlideRefs>): void;
  /** Add a References slide at the end; its id. */
  addRefsSlide(): number;
  /** Take out a slide this command added. */
  removeSlide(id: number): void;
  /** Show a slide. */
  goTo(id: number): void;
  choose(text: string, labels: string[]): Promise<number>;
  activate(): void;
}

const CITE = 's', BIB = 'b';

/** A presentation as Zotero's fields: slides showing references (citations) and the References slide (bibliography). */
export class DeckStore implements ZoteroStore {
  readonly notes: string[] = [];
  /** References slides this command added (taken out again if Zotero drops them). */
  private added = new Set<number>();
  private bibs = new Set<number>();
  constructor(private host: DeckZoteroHost, private command: ZoteroCommand) {}

  get docId(): string { return this.host.docId; }
  private get st() { return this.host.state(); }

  private slide(fieldId: string): { kind: 'cite' | 'bib'; s: ZoteroSlide } {
    const kind = fieldId.startsWith(BIB) ? 'bib' : 'cite';
    const id = Number(fieldId.slice(1));
    const s = this.st.slides.find((x) => x.id === id);
    if (!s || (kind === 'bib') !== !!s.refList) throw new Error(`The slide for ${fieldId} is no longer in the presentation.`);
    return { kind, s };
  }

  private set(s: ZoteroSlide, next: SlideRefs, refs = this.st.refs): void {
    this.host.change(refs, new Map([[s.id, next]]));
  }

  private own(s: ZoteroSlide): SlideRefs {
    const { id: _i, hidden: _h, ...rest } = s;
    return rest;
  }

  private citeField(s: ZoteroSlide): FieldJson {
    const d = this.st.refs;
    const refs = s.refs ?? [];
    const key = refsKey(refs);
    const z = s.zotero;
    const nums = deckNumbers(d, this.st.slides);
    const text = z?.text !== undefined && z.for === key ? z.text : refs.length ? citeText(refs.map((r) => nums.get(r)).filter((n): n is number => n !== undefined), deckFormat(d)) : ZOTERO_PLACEHOLDER;
    let code: string;
    if (z?.code && z.for === key) code = z.code;
    else {
      const byId = new Map((d?.list ?? []).map((r) => [r.id, r]));
      const list = refs.map((r) => byId.get(r)).filter((r): r is Reference => !!r);
      const live: CiteLive = { app: 'zotero', ...(z?.id ? { id: z.id } : {}), ...(z?.items ? { items: z.items } : {}) };
      code = writtenCode(list, list.length ? live : { ...live, code: z?.code ?? 'TEMP' }, text);
    }
    return { id: CITE + s.id, code, text, noteIndex: 0 };
  }

  private bibField(s: ZoteroSlide): FieldJson {
    const block = s.refList ? refsSlideBlock(this.st.refs, this.st.slides, s.refList) : null;
    const text = (block?.entries ?? []).map((e) => (e.label ? `${e.label}\t` : '') + piecesText(e.pieces)).join('\n');
    return { id: BIB + s.id, code: s.refList?.zotero?.code ?? ZOTERO_BIBL, text, noteIndex: 0 };
  }

  prefs(): string { return this.st.refs?.zoteroPrefs ?? ''; }

  setPrefs(prefs: string): void {
    const d = this.st.refs ?? { list: [] };
    const style = styleFromCsl(zoteroStyleOf(prefs) ?? '');
    this.host.change({ ...d, zoteroPrefs: prefs, ...(style ? { style } : {}) }, new Map());
  }

  fields(): FieldJson[] {
    const out: FieldJson[] = [];
    for (const s of this.st.slides) {
      if (s.refList) out.push(this.bibField(s));
      else if (s.refs?.length || s.zotero) out.push(this.citeField(s));
    }
    return out;
  }

  cursor(): FieldJson | null {
    // a bibliography goes on a References slide of its own, whichever slide is showing
    if (this.command === 'addEditBibliography') return null;
    const s = this.st.slides[this.st.current];
    if (!s || s.refList || !(s.refs?.length || s.zotero)) return null;
    return this.citeField(s);
  }

  canInsert(): boolean {
    if (this.command === 'addEditBibliography') return true;
    const s = this.st.slides[this.st.current];
    return !!s && !s.refList;
  }

  insert(): FieldJson {
    if (this.command === 'addEditBibliography') {
      const id = this.host.addRefsSlide();
      this.added.add(id);
      this.bibs.add(id);
      const s = this.st.slides.find((x) => x.id === id)!;
      this.set(s, { ...this.own(s), refList: { ...(s.refList ?? { which: 'shown' }), zotero: { code: ZOTERO_BIBL } } });
      return { id: BIB + id, code: 'TEMP', text: '', noteIndex: 0 };
    }
    const s = this.st.slides[this.st.current];
    if (!s || s.refList) throw new Error('Show the slide the references are for first (not the References slide).');
    this.set(s, { ...this.own(s), zotero: { code: 'TEMP', text: ZOTERO_PLACEHOLDER, for: refsKey(s.refs ?? []) } });
    return { id: CITE + s.id, code: 'TEMP', text: ZOTERO_PLACEHOLDER, noteIndex: 0 };
  }

  setCode(fieldId: string, code: string): void {
    code = code.trim();
    const { kind, s } = this.slide(fieldId);
    if (kind === 'bib') {
      if (/^BIBL\b/.test(code)) this.set(s, { ...this.own(s), refList: { ...s.refList!, zotero: { ...(s.refList!.zotero ?? {}), code } } });
      return;
    }
    const d = this.st.refs ?? { list: [] };
    const got = citationFromCode(code, d.list);
    if (!got) { this.set(s, { ...this.own(s), zotero: { ...(s.zotero ?? {}), code } }); return; }
    const zotero = { ...(s.zotero ?? {}), ...(got.id ? { id: got.id } : {}), code, for: refsKey(got.ids), ...(Object.keys(got.items).length ? { items: got.items } : { items: undefined }) };
    if (!zotero.items) delete zotero.items;
    this.set(s, { ...this.own(s), refs: got.ids, zotero }, { ...d, list: got.list });
  }

  setText(fieldId: string, html: string): void {
    const { kind, s } = this.slide(fieldId);
    if (kind === 'bib') {
      this.bibs.add(s.id);
      this.set(s, { ...this.own(s), refList: { ...s.refList!, zotero: { code: s.refList!.zotero?.code ?? ZOTERO_BIBL, entries: bibFromHtml(html) } } });
      return;
    }
    this.set(s, { ...this.own(s), zotero: { ...(s.zotero ?? {}), text: htmlText(html), for: refsKey(s.refs ?? []) } });
  }

  remove(fieldId: string): void {
    const { kind, s } = this.slide(fieldId);
    if (kind === 'bib') {
      if (this.added.has(s.id)) { this.host.removeSlide(s.id); this.added.delete(s.id); return; }
      const { zotero: _z, ...list } = s.refList!;
      this.set(s, { ...this.own(s), refList: list });
      return;
    }
    // the slide's references go (Zotero takes a citation out when its last item is taken out of it)
    const { refs: _r, zotero: _z, ...rest } = this.own(s);
    this.set(s, rest);
  }

  select(fieldId: string): void { this.host.goTo(this.slide(fieldId).s.id); }

  unlink(fieldId: string): void {
    // the lines are the app's own: only Zotero's link goes
    const { kind, s } = this.slide(fieldId);
    if (kind === 'bib') { const { zotero: _z, ...list } = s.refList!; this.set(s, { ...this.own(s), refList: list }); return; }
    const { zotero: _z, ...rest } = this.own(s);
    this.set(s, rest);
  }

  convert(): void { /* slides have no notes */ }

  finish(): void {
    if (!this.bibs.size) return;
    const st = this.st;
    const changed = new Map<number, SlideRefs>();
    for (const s of st.slides) {
      if (!this.bibs.has(s.id) || !s.refList?.zotero?.entries) continue;
      const order = [...deckNumbers(st.refs, st.slides, s.refList.which === 'all').entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
      changed.set(s.id, { ...this.own(s), refList: { ...s.refList, zotero: { ...s.refList.zotero, for: order.join(' ') } } });
    }
    if (changed.size) this.host.change(st.refs, changed);
  }

  choose(text: string, labels: string[]): Promise<number> { return this.host.choose(text, labels); }
  activate(): void { this.host.activate(); }
}
