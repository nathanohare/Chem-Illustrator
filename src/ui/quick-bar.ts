// The quick bar beside the menus (Office's Quick Access Toolbar): small buttons for the commands
// used most. Save, Undo, Redo, Fit, the toolbox lock and the dark page to start with. Its ▾ button
// ticks the usual ones on and off; right-click a menu item or a ribbon button to add it, or a
// quick button to take it off; Customize Quick Access Toolbar… (the ▾ button, or View ▸ Toolboxes)
// adds any menu command and puts them in order. Kept with the settings.

import { showContextMenu, type MenuItem } from './context-menu';
import { moved } from './toolboxes';

/** What the bar has to start with. */
export const QUICK_DEFAULT: readonly string[] = ['save', 'undo', 'redo', 'zoom-fit', 'lock-toolboxes', 'dark-page'];
/** Offered with a tick on the ▾ menu: the commands most people put there. */
export const QUICK_OFFERED: readonly string[] = ['new', 'open', 'save', 'print', 'undo', 'redo', 'cut', 'copy', 'paste', 'zoom-fit', 'focus-view', 'lock-toolboxes', 'dark-page'];

const CMD = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The bar's commands from the settings file: null (as it comes) unless it is a list of command names. */
export function parseQuick(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return [...new Set(v.filter((c): c is string => typeof c === 'string' && CMD.test(c)))].slice(0, 40);
}

/** The list with `cmd` put on (at the end, or at `at`) or taken off. */
export function withQuick(list: readonly string[], cmd: string, on: boolean, at?: number): string[] {
  const out = list.filter((c) => c !== cmd);
  if (on) out.splice(at ?? out.length, 0, cmd);
  return out;
}

export interface QuickHooks {
  /** The bar's commands (null: as it comes). */
  get(): string[] | null;
  set(list: string[] | null): void;
  run(cmd: string): void;
  /** A command's name as the menus show it now (Undo Add Bond). */
  label(cmd: string): string;
  key(cmd: string): string | undefined;
  icon(cmd: string): string | undefined;
  /** Whether a command can be used now, and whether it is on (a ticked menu item), or null. */
  state(cmd: string): { enabled: boolean; on: boolean | null };
  /** Every menu command, by menu, for Customize Quick Access Toolbar. */
  all(): { name: string; items: { cmd: string; label: string }[] }[];
}

export class QuickBar {
  private more: HTMLButtonElement;
  /** What each button shows now, so it is drawn again only when that changes. */
  private drawn = new WeakMap<HTMLButtonElement, string>();

  constructor(private el: HTMLElement, private hooks: QuickHooks) {
    this.more = document.createElement('button');
    this.more.type = 'button';
    this.more.className = 'qa-more';
    this.more.title = 'Customize Quick Access Toolbar: choose the buttons here';
    this.more.setAttribute('aria-label', 'Customize Quick Access Toolbar');
    this.more.setAttribute('aria-haspopup', 'menu');
    this.more.innerHTML = '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    this.more.addEventListener('click', () => {
      const r = this.more.getBoundingClientRect();
      this.openMenu(r.left, r.bottom + 2);
    });
    el.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button[data-qa]');
      if (b && !b.disabled) this.hooks.run(b.dataset.qa!);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const cmd = (e.target as Element).closest<HTMLElement>('[data-qa]')?.dataset.qa;
      showContextMenu(e.clientX, e.clientY, [
        ...(cmd ? [{ cmd: `qa-off:${cmd}`, label: 'Remove from Quick Access Toolbar' }] : []),
        { cmd: 'qa-edit', label: 'Customize Quick Access Toolbar…' },
      ], { run: (c) => this.act(c), key: () => undefined });
    });
    this.render();
  }

  /** The commands on the bar now. */
  list(): string[] {
    return [...(this.hooks.get() ?? QUICK_DEFAULT)];
  }

  has(cmd: string): boolean {
    return this.list().includes(cmd);
  }

  private put(list: string[]): void {
    const same = list.length === QUICK_DEFAULT.length && list.every((c, i) => c === QUICK_DEFAULT[i]);
    this.hooks.set(same ? null : list);
    this.render();
  }

  /** Put a command on the bar, or take it off. */
  toggle(cmd: string, on = !this.has(cmd)): void {
    this.put(withQuick(this.list(), cmd, on));
  }

  render(): void {
    const buttons = this.list().map((cmd) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.qa = cmd;
      return b;
    });
    this.el.replaceChildren(...buttons, this.more);
    this.refresh();
  }

  /** Bring each button's picture, name, key and state up to date. */
  refresh(): void {
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('button[data-qa]')) {
      const cmd = b.dataset.qa!;
      const icon = this.hooks.icon(cmd);
      const label = this.hooks.label(cmd);
      const draw = icon ?? `<span class="qa-text">${label.replace(/…$/, '').replace(/[&<>]/g, '')}</span>`;
      if (this.drawn.get(b) !== draw) { b.innerHTML = draw; this.drawn.set(b, draw); }
      b.classList.toggle('qa-icon', !!icon);
      const k = this.hooks.key(cmd);
      const st = this.hooks.state(cmd);
      b.title = k ? `${label} (${k})` : label;
      b.setAttribute('aria-label', label);
      b.disabled = !st.enabled;
      if (st.on === null) b.removeAttribute('aria-pressed');
      else b.setAttribute('aria-pressed', String(st.on));
    }
  }

  /** The ▾ menu: the usual commands with ticks, then Customize… and Reset. */
  openMenu(x: number, y: number): void {
    const items: MenuItem[] = [
      ...QUICK_OFFERED.map((cmd) => ({ cmd: `qa-tick:${cmd}`, label: this.hooks.label(cmd).replace(/^(Undo|Redo) .*/, '$1'), checked: this.has(cmd) })),
      null,
      { cmd: 'qa-edit', label: 'More Commands…' },
      { cmd: 'qa-reset', label: 'Reset Quick Access Toolbar' },
    ];
    showContextMenu(x, y, items, { run: (c) => this.act(c), key: () => undefined });
  }

  private act(c: string): void {
    const [what, cmd] = c.split(':');
    if (what === 'qa-tick' || what === 'qa-off') this.toggle(cmd, what === 'qa-tick' ? undefined : false);
    else if (what === 'qa-on') this.toggle(cmd, true);
    else if (what === 'qa-edit') this.edit();
    else if (what === 'qa-reset') { this.hooks.set(null); this.render(); }
  }

  /** What a right-click on a menu item or ribbon button offers for the command it runs. */
  menuFor(cmd: string): MenuItem[] {
    return this.has(cmd)
      ? [{ cmd: `qa-off:${cmd}`, label: 'Remove from Quick Access Toolbar' }]
      : [{ cmd: `qa-on:${cmd}`, label: 'Add to Quick Access Toolbar' }];
  }

  /** Run one of menuFor's items. */
  run(c: string): void {
    this.act(c);
  }

  /** Customize Quick Access Toolbar: every menu command on the left, the bar's on the right, in order. */
  edit(): void {
    const d = document.createElement('dialog');
    d.className = 'quick-editor';
    d.innerHTML = `<h2>Customize Quick Access Toolbar</h2>
      <p class="muted">Pick a command on the left and Add it. The bar shows them in the order on the right.</p>
      <div class="qe-cols">
        <div class="qe-col"><input type="search" class="qe-filter" placeholder="Find a command" aria-label="Find a command"><select class="qe-all" size="14" aria-label="Commands"></select></div>
        <div class="qe-mid"><button type="button" class="qe-add">Add ›</button><button type="button" class="qe-remove">‹ Remove</button></div>
        <div class="qe-col"><div class="qe-head">Quick Access Toolbar</div><select class="qe-bar" size="14" aria-label="Buttons on the bar"></select></div>
        <div class="qe-mid"><button type="button" class="qe-up" title="Move up (left on the bar)">▲</button><button type="button" class="qe-down" title="Move down (right on the bar)">▼</button></div>
      </div>
      <p class="ask-buttons"><button type="button" class="qe-reset">Reset</button><span class="spacer"></span><button type="button" class="primary qe-done">Done</button></p>`;
    const q = <T extends HTMLElement>(s: string) => d.querySelector(s) as T;
    const all = q<HTMLSelectElement>('.qe-all'), bar = q<HTMLSelectElement>('.qe-bar'), filter = q<HTMLInputElement>('.qe-filter');
    const groups = this.hooks.all();
    const fillAll = () => {
      const f = filter.value.trim().toLowerCase();
      const keep = all.value;
      all.replaceChildren();
      for (const g of groups) {
        const items = g.items.filter((c) => !f || c.label.toLowerCase().includes(f));
        if (!items.length) continue;
        const og = document.createElement('optgroup');
        og.label = g.name;
        for (const c of items) og.append(new Option(c.label, c.cmd, false, c.cmd === keep));
        all.append(og);
      }
    };
    const fillBar = (pick?: string) => {
      bar.replaceChildren(...this.list().map((c) => new Option(this.hooks.label(c).replace(/^(Undo|Redo) .*/, '$1'), c, false, c === pick)));
    };
    const at = () => bar.selectedIndex;
    filter.addEventListener('input', fillAll);
    const add = () => {
      const c = all.value;
      if (!c) return;
      const i = at();
      this.put(withQuick(this.list(), c, true, i < 0 ? undefined : i + 1));
      fillBar(c);
    };
    const remove = () => {
      const c = bar.value;
      if (!c) return;
      const i = at();
      this.toggle(c, false);
      fillBar(this.list()[Math.min(i, this.list().length - 1)]);
    };
    const shift = (by: number) => {
      const i = at();
      const list = this.list();
      if (i < 0 || i + by < 0 || i + by >= list.length) return;
      this.put(moved(list, i, i + by));
      fillBar(list[i]);
    };
    q('.qe-add').addEventListener('click', add);
    all.addEventListener('dblclick', add);
    q('.qe-remove').addEventListener('click', remove);
    bar.addEventListener('dblclick', remove);
    bar.addEventListener('keydown', (e) => { if (e.key === 'Delete') { e.preventDefault(); remove(); } });
    q('.qe-up').addEventListener('click', () => shift(-1));
    q('.qe-down').addEventListener('click', () => shift(1));
    q('.qe-reset').addEventListener('click', () => { this.hooks.set(null); this.render(); fillBar(); });
    const close = () => { if (d.open) d.close(); d.remove(); };
    q('.qe-done').addEventListener('click', close);
    d.addEventListener('close', () => d.remove());
    fillAll();
    fillBar();
    document.body.append(d);
    d.showModal();
    filter.focus();
  }
}
