// Editing a ribbon where it is (the gear at the right of its tabs): its groups get a grip to drag
// them along the tab, or onto another tab's name to move them there, and a × to hide them (a
// hidden group shows faintly while editing, with a + to bring it back). A bar under the tabs
// offers Reset to Default, Export and Import of the layout, the full Customize window, and Done.
// The changes are the same RibbonPrefs the Customize window makes, kept with the settings.

import { parseRibbons, type RibbonInfo, type RibbonPrefs, type RibbonsPrefs } from './ribbon-custom';

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
}

const GEAR = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor"><circle cx="8" cy="8" r="5.4" stroke-width="2.6" stroke-dasharray="2.1 2.14"/><circle cx="8" cy="8" r="4" stroke-width="1.3"/><circle cx="8" cy="8" r="1.5" stroke-width="1.3"/></svg>';

export class RibbonLive {
  private editing: RibbonInfo | null = null;
  private bar: HTMLElement | null = null;
  private dragKey: string | null = null;

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
    say.textContent = 'Editing the ribbon: drag a group by its name to move it (onto a tab to move it there); × hides it.';
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
    }
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
    const g = (e.target as HTMLElement).closest<HTMLElement>('.rb-group');
    if (!g) return;
    this.dragKey = g.dataset.groupKey ?? null;
    g.classList.add('rb-live-dragging');
    e.dataTransfer?.setData('text/plain', this.dragKey ?? '');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  };

  private onDragOver = (e: DragEvent): void => {
    if (!this.dragKey) return;
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLElement>('.rb-tabs [role=tab]');
    const g = t.closest<HTMLElement>('.rb-group');
    if (!tab && !g) return;
    e.preventDefault();
    for (const x of this.editing!.el.querySelectorAll('.rb-live-before, .rb-live-after, .rb-live-tab')) x.classList.remove('rb-live-before', 'rb-live-after', 'rb-live-tab');
    if (tab) { tab.classList.add('rb-live-tab'); return; }
    const r = g!.getBoundingClientRect();
    g!.classList.add(e.clientX < r.left + r.width / 2 ? 'rb-live-before' : 'rb-live-after');
  };

  private onDrop = (e: DragEvent): void => {
    const info = this.editing;
    const key = this.dragKey;
    if (!info || !key) return;
    e.preventDefault();
    const moving = info.el.querySelector<HTMLElement>('.rb-live-dragging');
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

  private onDragEnd = (): void => {
    this.dragKey = null;
    for (const x of this.editing?.el.querySelectorAll('.rb-live-dragging, .rb-live-before, .rb-live-after, .rb-live-tab') ?? []) x.classList.remove('rb-live-dragging', 'rb-live-before', 'rb-live-after', 'rb-live-tab');
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
