// Editing a ribbon where it is (the gear at the right of its tabs), like building a toolbox:
// drag a group along the tab, or onto another tab's name to move it there, and × hides it (a
// hidden group shows faintly while editing, with a + to bring it back). Single buttons drag too:
// into another group, or off the ribbon to take them away (they show faintly while editing; a
// click brings one back), and Commands lists every command to drag into a group. A bar under the
// tabs offers Reset to Default, Export and Import of the layout, the full Customize window, and
// Done. The changes are the same RibbonPrefs the Customize window makes, kept with the settings.

import { itemKey, parseRibbons, type RibbonInfo, type RibbonPrefs, type RibbonsPrefs } from './ribbon-custom';
import type { Pickable } from './toolboxes';

export interface RibbonLiveHooks {
  ribbons(): RibbonInfo[];
  get(): RibbonsPrefs;
  set(p: RibbonsPrefs): void;
  /** The full Customize the Ribbon window, at this ribbon. */
  customize(id: string): void;
  /** Save the text to a file the person picks; read the text of one they pick. */
  saveText(name: string, text: string): Promise<void>;
  openText(): Promise<string | null>;
  flash(msg: string): void;
  /** The menus' commands, in groups, to drag onto the ribbon. */
  menus(): { name: string; items: Pickable[] }[];
}

/** A single button being dragged: its command, and the group it comes from (null: from the Commands list). */
interface ItemDrag { key: string; from: string | null }

const ITEM_TYPE = 'application/x-ribbon-item';

const GEAR = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor"><circle cx="8" cy="8" r="5.4" stroke-width="2.6" stroke-dasharray="2.1 2.14"/><circle cx="8" cy="8" r="4" stroke-width="1.3"/><circle cx="8" cy="8" r="1.5" stroke-width="1.3"/></svg>';

export class RibbonLive {
  private editing: RibbonInfo | null = null;
  private bar: HTMLElement | null = null;
  private dragKey: string | null = null;
  private dragItem: ItemDrag | null = null;
  private dropped = false;
  private palette: HTMLElement | null = null;

  constructor(private hooks: RibbonLiveHooks) {}

  /** Put a gear at the right of every tabbed ribbon's tabs (once). */
  install(): void {
    for (const info of this.hooks.ribbons()) {
      const strip = info.el.querySelector<HTMLElement>(':scope > .rb-tabs');
      if (!strip || strip.querySelector('.rb-gear')) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rb-gear';
      b.title = 'Edit this ribbon: drag its groups, hide them, reset, or save and load layouts';
      b.setAttribute('aria-label', 'Edit the ribbon');
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = GEAR;
      b.addEventListener('click', () => (this.editing?.id === info.id ? this.stop() : this.start(info.id)));
      const collapse = strip.querySelector('.rb-collapse');
      strip.insertBefore(b, collapse);
    }
  }

  get active(): boolean { return !!this.editing; }

  private prefs(): RibbonPrefs {
    return this.hooks.get()[this.editing!.id] ?? {};
  }

  private save(p: RibbonPrefs): void {
    const all = { ...this.hooks.get() };
    if (Object.keys(p).length) all[this.editing!.id] = p;
    else delete all[this.editing!.id];
    this.hooks.set(all);
    this.decorate();
  }

  start(id: string): void {
    this.stop();
    const info = this.hooks.ribbons().find((r) => r.id === id);
    if (!info) return;
    this.editing = info;
    info.el.classList.add('rb-live');
    info.el.querySelector('.rb-gear')?.setAttribute('aria-pressed', 'true');
    const bar = document.createElement('div');
    bar.className = 'rb-live-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Editing the ribbon');
    const say = document.createElement('span');
    say.className = 'rb-live-say';
    say.textContent = 'Editing the ribbon: drag groups or single buttons to move them (onto a tab name for another tab); drag a button off the ribbon, or click a group\'s ×, to take it away.';
    const btn = (label: string, title: string, f: () => void, primary = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      if (primary) b.className = 'primary';
      b.addEventListener('click', f);
      return b;
    };
    bar.append(say,
      btn('Commands ▾', 'Every command, to drag into a group on the ribbon', () => this.togglePalette()),
      btn('Customize…', 'Every setting: rename tabs and groups, make groups of your own with any command', () => { const i = this.editing!.id; this.stop(); this.hooks.customize(i); }),
      btn('Export…', 'Save this ribbon\'s layout to a file, to load on another computer or share with the group', () => void this.exportLayout()),
      btn('Import…', 'Load a layout saved with Export', () => void this.importLayout()),
      btn('Reset to Default', 'This ribbon as it comes: every group back on its own tab, in order, and shown', () => this.save({})),
      btn('Done', 'Stop editing', () => this.stop(), true));
    info.el.querySelector(':scope > .rb-tabs')!.after(bar);
    this.bar = bar;
    this.decorate();
    info.el.addEventListener('dragstart', this.onDragStart);
    info.el.addEventListener('dragover', this.onDragOver);
    info.el.addEventListener('drop', this.onDrop);
    info.el.addEventListener('dragend', this.onDragEnd);
    info.el.addEventListener('click', this.onClick, true);
    addEventListener('keydown', this.onKey, true);
  }

  stop(): void {
    const info = this.editing;
    if (!info) return;
    info.el.classList.remove('rb-live');
    info.el.querySelector('.rb-gear')?.setAttribute('aria-pressed', 'false');
    for (const g of info.el.querySelectorAll<HTMLElement>('.rb-group')) {
      g.draggable = false;
      g.classList.remove('rb-live-hidden');
      g.querySelector(':scope > .rb-live-x')?.remove();
    }
    for (const b of info.el.querySelectorAll<HTMLElement>('.rb-live-item')) { b.draggable = false; b.classList.remove('rb-live-item'); }
    info.el.removeEventListener('click', this.onClick, true);
    this.palette?.remove();
    this.palette = null;
    info.el.removeEventListener('dragstart', this.onDragStart);
    info.el.removeEventListener('dragover', this.onDragOver);
    info.el.removeEventListener('drop', this.onDrop);
    info.el.removeEventListener('dragend', this.onDragEnd);
    removeEventListener('keydown', this.onKey, true);
    this.bar?.remove();
    this.bar = null;
    this.editing = null;
  }

  /** Grips, × and + on the groups, as the layout is now. */
  private decorate(): void {
    const info = this.editing;
    if (!info) return;
    const hidden = new Set(this.prefs().hiddenGroups ?? []);
    for (const g of info.el.querySelectorAll<HTMLElement>('.rb-group[data-group-key]')) {
      const key = g.dataset.groupKey ?? '';
      if (!key) continue;
      g.draggable = true;
      const off = hidden.has(key);
      g.classList.toggle('rb-live-hidden', off);
      let x = g.querySelector<HTMLButtonElement>(':scope > .rb-live-x');
      if (!x) {
        x = document.createElement('button');
        x.type = 'button';
        x.className = 'rb-live-x';
        x.addEventListener('click', (e) => { e.stopPropagation(); this.toggleHidden(key); });
        g.append(x);
      }
      x.textContent = off ? '+' : '×';
      x.title = off ? 'Show this group again' : 'Hide this group';
      for (const b of g.querySelectorAll<HTMLElement>('button[data-cmd], button[data-sh], button[data-doc], button[data-own-cmd]')) {
        if (b.closest('.rb-fly-menu, .rb-fold-btn') || !itemKey(b)) continue;
        b.draggable = true;
        b.classList.add('rb-live-item');
      }
    }
  }

  /** The group a button sits in, by key ('' for none). */
  private groupOf(el: Element): string {
    return el.closest<HTMLElement>('.rb-group[data-group-key]')?.dataset.groupKey ?? '';
  }

  /** Prefs with a command taken out of a group (hidden, if it is one of the group's own buttons). */
  private without(p: RibbonPrefs, group: string, key: string): RibbonPrefs {
    const q: RibbonPrefs = { ...p };
    if (group.startsWith('own:')) {
      const id = group.slice(4);
      const own = q.own?.[id];
      if (own) q.own = { ...q.own, [id]: { ...own, items: own.items.filter((k) => k !== key) } };
      return q;
    }
    const extra = q.extra?.[group];
    if (extra?.includes(key)) {
      const e = { ...q.extra, [group]: extra.filter((k) => k !== key) };
      if (!e[group].length) delete e[group];
      if (Object.keys(e).length) q.extra = e; else delete q.extra;
      return q;
    }
    q.hiddenItems = [...new Set([...(q.hiddenItems ?? []), `${group} ${key}`])];
    return q;
  }

  /** Prefs with a command put into a group (shown again, if it is one of the group's own buttons taken off before). */
  private withItem(p: RibbonPrefs, group: string, key: string): RibbonPrefs {
    const q: RibbonPrefs = { ...p };
    if (group.startsWith('own:')) {
      const id = group.slice(4);
      const own = q.own?.[id];
      if (own && !own.items.includes(key)) q.own = { ...q.own, [id]: { ...own, items: [...own.items, key] } };
      return q;
    }
    const tag = `${group} ${key}`;
    if (q.hiddenItems?.includes(tag)) {
      const h = q.hiddenItems.filter((x) => x !== tag);
      if (h.length) q.hiddenItems = h; else delete q.hiddenItems;
      return q;
    }
    const g = this.editing!.groups.get(group)?.el;
    const there = g && [...g.querySelectorAll<HTMLElement>('button')].some((b) => itemKey(b) === key && !b.classList.contains('rb-user-hidden'));
    if (there) return q;
    q.extra = { ...q.extra, [group]: [...(q.extra?.[group] ?? []), key] };
    return q;
  }

  private moveItem(item: ItemDrag, to: string | null): void {
    let p = this.prefs();
    if (to && to === item.from) return;
    if (item.from) p = this.without(p, item.from, item.key);
    if (to) p = this.withItem(p, to, item.key);
    this.save(p);
  }

  /** While editing, a click on a button that was taken off brings it back; other clicks on the groups' buttons do nothing. */
  private onClick = (e: MouseEvent): void => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.rb-live-item');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    if (b.classList.contains('rb-user-hidden')) {
      const g = this.groupOf(b);
      if (g) this.save(this.withItem(this.prefs(), g, itemKey(b)));
    }
  };

  /** The Commands list: this ribbon's commands by group, and the menus', to drag onto a group. */
  private togglePalette(): void {
    if (this.palette) { this.palette.remove(); this.palette = null; return; }
    const info = this.editing!;
    const pal = document.createElement('div');
    pal.className = 'rb-live-palette';
    const find = document.createElement('input');
    find.type = 'search';
    find.placeholder = 'Find a command';
    find.setAttribute('aria-label', 'Find a command');
    const list = document.createElement('div');
    list.className = 'rb-live-list';
    const groups: { name: string; items: Pickable[] }[] = [];
    for (const [key, g] of info.groups) {
      const seen = new Set<string>();
      const items: Pickable[] = [];
      for (const b of g.el.querySelectorAll<HTMLElement>('button[data-cmd], button[data-sh], button[data-doc]')) {
        const k = itemKey(b);
        if (!k || seen.has(k) || b.closest('.rb-extra')) continue;
        seen.add(k);
        const t = b.cloneNode(true) as HTMLElement;
        t.querySelectorAll('.rb-icon, .rb-lead, svg, kbd').forEach((x) => x.remove());
        const words = t.textContent!.replace(/[▾…]/g, '').replace(/\s+/g, ' ').trim();
        items.push({ key: k, label: words.length > 2 ? words : (b.title.split(/[.:;] /)[0] || words) });
      }
      if (items.length) groups.push({ name: `${info.tabs.get(g.tab)?.name ?? ''} › ${g.name}`, items });
      void key;
    }
    groups.push(...this.hooks.menus());
    const draw = () => {
      const q = find.value.trim().toLowerCase();
      list.replaceChildren();
      for (const g of groups) {
        const items = g.items.filter((it) => !q || it.label.toLowerCase().includes(q));
        if (!items.length) continue;
        const h = document.createElement('div');
        h.className = 'rb-live-list-head';
        h.textContent = g.name;
        list.append(h);
        for (const it of items) {
          const r = document.createElement('div');
          r.className = 'rb-live-cmd';
          r.draggable = true;
          r.textContent = it.label;
          r.title = `Drag ${it.label} into a group on the ribbon`;
          r.addEventListener('dragstart', (e) => {
            this.dragItem = { key: it.key, from: null };
            this.dropped = false;
            e.dataTransfer?.setData(ITEM_TYPE, it.key);
            e.dataTransfer?.setData('text/plain', it.label);
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
          });
          r.addEventListener('dragend', () => { this.dragItem = null; this.clearMarks(); });
          list.append(r);
        }
      }
    };
    find.addEventListener('input', draw);
    draw();
    pal.append(find, list);
    // (fixed, so the ribbon's own scrolling doesn't clip it)
    const r = this.bar!.getBoundingClientRect();
    pal.style.top = `${r.bottom + 2}px`;
    document.body.append(pal);
    this.palette = pal;
    find.focus();
  }

  private clearMarks(): void {
    for (const x of this.editing?.el.querySelectorAll('.rb-live-dragging, .rb-live-before, .rb-live-after, .rb-live-tab, .rb-live-into') ?? []) x.classList.remove('rb-live-dragging', 'rb-live-before', 'rb-live-after', 'rb-live-tab', 'rb-live-into');
  }

  private toggleHidden(key: string): void {
    const p = { ...this.prefs() };
    const h = new Set(p.hiddenGroups ?? []);
    if (h.has(key)) h.delete(key); else h.add(key);
    if (h.size) p.hiddenGroups = [...h]; else delete p.hiddenGroups;
    this.save(p);
  }

  /** Each tab's groups in the order they stand in the page now. */
  private layoutNow(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [tab, t] of this.editing!.tabs) {
      out[tab] = [...t.panel.querySelectorAll<HTMLElement>(':scope > .rb-group')]
        .map((g) => g.dataset.groupKey ?? '')
        .filter(Boolean);
    }
    return out;
  }

  private onDragStart = (e: DragEvent): void => {
    const t = e.target as HTMLElement;
    const item = t.closest<HTMLElement>('.rb-live-item');
    if (item) {
      const from = this.groupOf(item);
      this.dragItem = { key: itemKey(item), from: from || null };
      this.dropped = false;
      item.classList.add('rb-live-dragging');
      e.dataTransfer?.setData(ITEM_TYPE, this.dragItem.key);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      return;
    }
    const g = t.closest<HTMLElement>('.rb-group');
    if (!g) return;
    this.dragKey = g.dataset.groupKey ?? null;
    g.classList.add('rb-live-dragging');
    e.dataTransfer?.setData('text/plain', this.dragKey ?? '');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  };

  private onDragOver = (e: DragEvent): void => {
    if (!this.dragKey && !this.dragItem) return;
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLElement>('.rb-tabs [role=tab]');
    const g = t.closest<HTMLElement>('.rb-group');
    if (this.dragItem) {
      if (!g) return;
      e.preventDefault();
      this.clearMarks();
      g.classList.add('rb-live-into');
      return;
    }
    if (!tab && !g) return;
    e.preventDefault();
    for (const x of this.editing!.el.querySelectorAll('.rb-live-before, .rb-live-after, .rb-live-tab')) x.classList.remove('rb-live-before', 'rb-live-after', 'rb-live-tab');
    if (tab) { tab.classList.add('rb-live-tab'); return; }
    const r = g!.getBoundingClientRect();
    g!.classList.add(e.clientX < r.left + r.width / 2 ? 'rb-live-before' : 'rb-live-after');
  };

  private onDrop = (e: DragEvent): void => {
    const info = this.editing;
    if (!info) return;
    if (this.dragItem) {
      e.preventDefault();
      this.dropped = true;
      const g = (e.target as HTMLElement).closest<HTMLElement>('.rb-group[data-group-key]');
      const item = this.dragItem;
      this.dragItem = null;
      this.clearMarks();
      if (g) this.moveItem(item, g.dataset.groupKey!);
      return;
    }
    const key = this.dragKey;
    if (!key) return;
    e.preventDefault();
    const moving = info.el.querySelector<HTMLElement>('.rb-group.rb-live-dragging');
    const t = e.target as HTMLElement;
    const tabBtn = t.closest<HTMLElement>('.rb-tabs [role=tab]');
    if (moving && tabBtn) {
      const tabKey = [...info.tabs].find(([, v]) => v.button === tabBtn)?.[0];
      if (tabKey) info.tabs.get(tabKey)!.panel.append(moving);
    } else if (moving) {
      const g = t.closest<HTMLElement>('.rb-group');
      if (g && g !== moving) {
        const r = g.getBoundingClientRect();
        if (e.clientX < r.left + r.width / 2) g.before(moving); else g.after(moving);
      }
    }
    this.save({ ...this.prefs(), groups: this.layoutNow() });
  };

  private onDragEnd = (e: DragEvent): void => {
    // a button dropped off the ribbon is taken away
    const item = this.dragItem;
    if (item && !this.dropped && item.from && this.editing) {
      const r = this.editing.el.getBoundingClientRect();
      const out = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (out) this.moveItem(item, null);
    }
    this.dragItem = null;
    this.dragKey = null;
    this.clearMarks();
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.editing) { e.preventDefault(); e.stopPropagation(); this.stop(); }
  };

  private async exportLayout(): Promise<void> {
    const info = this.editing!;
    const text = JSON.stringify({ app: 'Chem Illustrator', ribbon: info.id, layout: this.prefs() }, null, 2);
    await this.hooks.saveText(`${info.title} ribbon.json`, text);
  }

  private async importLayout(): Promise<void> {
    const info = this.editing!;
    const text = await this.hooks.openText();
    if (text === null) return;
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { this.hooks.flash('That file isn\'t a ribbon layout (save one with Export).'); return; }
    const o = raw as { ribbon?: unknown; layout?: unknown };
    if (!o || typeof o !== 'object' || !o.layout) { this.hooks.flash('That file isn\'t a ribbon layout (save one with Export).'); return; }
    // a layout saved from another ribbon goes to that ribbon
    const id = typeof o.ribbon === 'string' ? o.ribbon : info.id;
    const p = parseRibbons({ [id]: o.layout })[id];
    if (!p) { this.hooks.flash('Nothing in that file fits this program\'s ribbons.'); return; }
    if (id === info.id) this.save(p);
    else { this.hooks.set({ ...this.hooks.get(), [id]: p }); this.hooks.flash(`That layout is for another ribbon; it is in use there now.`); }
  }
}
