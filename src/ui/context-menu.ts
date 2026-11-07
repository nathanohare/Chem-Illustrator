// Right-click menus: commands from the menus at the top (with their own names, keys and ticks),
// in groups that open to the side, so people used to finding things on the right-click menu in
// ChemDraw find them there too.

import { COMMAND_NAMES } from '../editor/keymap';
import { commandIcon } from './command-icons';

/** One of the buttons in a row of them (Cut, Copy, Paste, Delete at the top of the Canvas menu). */
export interface MenuRowButton { cmd: string; label?: string }

/**
 * A command (named as in the top menus unless `label` says otherwise; `key` shows a key the
 * command list doesn't know, such as an atom hotkey), an action of the menu's own (`run`; with
 * `opens`, it opens a menu of its own beside its row, so the row has a group's arrow), a group,
 * a row of buttons, or a line.
 */
export type MenuItem =
  | { cmd: string; label?: string; checked?: boolean; key?: string; title?: string; disabled?: boolean }
  | { label: string; run: (row: DOMRect) => void; cmd?: string; checked?: boolean; key?: string; title?: string; disabled?: boolean; opens?: boolean }
  | { label: string; items: MenuItem[] }
  | { row: MenuRowButton[] }
  | null;

export interface MenuHooks {
  run(cmd: string): void;
  /** The key that runs a command, to show beside it (else the program's own key for it). */
  key?(cmd: string): string | undefined;
  /** Escape shut the menu: put the keys back where they were (a document's caret, a sheet's cell). */
  escaped?(): void;
}

/** The program's key for a command, for menus that don't say (set once by the program). */
let defaultKey: (cmd: string) => string | undefined = () => undefined;
export function setMenuKeys(f: (cmd: string) => string | undefined): void { defaultKey = f; }
/** What to do when Escape shuts the menu now open. */
let onEscape: (() => void) | undefined;

let open: HTMLDivElement[] = [];

export function closeContextMenu(): void {
  for (const m of open) m.remove();
  open = [];
  onEscape = undefined;
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', escape, true);
  window.removeEventListener('blur', closeContextMenu);
}

const outside = (e: Event) => { if (!open.some((m) => m.contains(e.target as Node))) closeContextMenu(); };
const escape = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopPropagation();
  // Esc closes the innermost group first
  open.pop()?.remove();
  if (!open.length) {
    const back = onEscape;
    closeContextMenu();
    back?.();
  } else backToGroupRow();
};

/** Close every group deeper than `depth` and take the highlight off the rows that opened them. */
function closeBelow(depth: number): void {
  while (open.length > depth + 1) open.pop()!.remove();
  for (const o of open[depth]?.querySelectorAll('[aria-expanded="true"]') ?? []) o.setAttribute('aria-expanded', 'false');
}

/** After the innermost group shuts from the keyboard, put focus back on the row that opened it. */
function backToGroupRow(): void {
  const row = open[open.length - 1]?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]');
  row?.setAttribute('aria-expanded', 'false');
  row?.focus();
}

/** The name and tick of a command as the top menus show it. */
export function topMenuEntry(cmd: string): { label: string; checked: boolean | null } | null {
  const b = document.querySelector<HTMLButtonElement>(`.menu-wrap [data-cmd="${cmd}"]`);
  if (!b) return null;
  const span = b.querySelector('span');
  const text = (span ?? b).cloneNode(true) as HTMLElement;
  text.querySelector('kbd')?.remove();
  const checked = b.getAttribute('role') === 'menuitemcheckbox' ? b.getAttribute('aria-checked') === 'true' : null;
  return { label: text.textContent!.trim(), checked };
}

/** Drop lines at the ends and doubled lines, and empty groups. */
export function tidyItems(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const it of items) {
    if (it && 'items' in it) {
      const sub = tidyItems(it.items);
      if (sub.length) out.push({ ...it, items: sub });
    } else if (it || (out.length && out[out.length - 1])) out.push(it);
  }
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

/** Show a menu at (x, y) in the window. */
export function showContextMenu(x: number, y: number, items: MenuItem[], hooks: MenuHooks): void {
  closeContextMenu();
  const m = build(tidyItems(items), hooks, 0);
  if (!m) return;
  onEscape = hooks.escaped;
  place(m, x, y, null);
  m.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('blur', closeContextMenu);
  });
}

function build(items: MenuItem[], hooks: MenuHooks, depth: number): HTMLDivElement | null {
  if (!items.length) return null;
  const m = document.createElement('div');
  m.className = 'menu context-menu';
  m.setAttribute('role', 'menu');
  const keyOf = (cmd: string) => (hooks.key ?? defaultKey)(cmd);
  for (const it of items) {
    if (!it) { m.append(document.createElement('hr')); continue; }
    if ('row' in it) { m.append(buttonRow(it.row, hooks, depth, keyOf)); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    const name = document.createElement('span');
    b.append(name);
    if ('items' in it) {
      name.textContent = it.label;
      b.setAttribute('role', 'menuitem');
      b.setAttribute('aria-haspopup', 'menu');
      b.setAttribute('aria-expanded', 'false');
      b.classList.add('has-sub');
      const openSub = (focus: boolean) => {
        // close any deeper group, then open this one beside its row
        closeBelow(depth);
        const sub = build(it.items, hooks, depth + 1);
        if (!sub) return;
        b.setAttribute('aria-expanded', 'true');
        const r = b.getBoundingClientRect();
        place(sub, r.right - 2, r.top - 5, r);
        if (focus) sub.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      };
      b.addEventListener('pointerenter', () => { follow(b); if (b.getAttribute('aria-expanded') !== 'true') openSub(false); });
      b.addEventListener('click', () => openSub(true));
      b.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); openSub(true); } });
    } else {
      const own = 'run' in it;
      const top = own ? null : topMenuEntry(it.cmd);
      // (a command no top menu has goes by its name in Keyboard Shortcuts, never its id)
      name.textContent = it.label ?? top?.label ?? (it.cmd ? COMMAND_NAMES[it.cmd] ?? it.cmd : '');
      const checked = it.checked ?? top?.checked;
      if (checked != null) {
        b.setAttribute('role', 'menuitemcheckbox');
        b.setAttribute('aria-checked', String(checked));
      } else b.setAttribute('role', 'menuitem');
      if (it.title) b.title = it.title;
      b.disabled = !!it.disabled;
      const opens = own && it.opens;
      if (opens) { b.classList.add('has-sub'); b.setAttribute('aria-haspopup', 'menu'); }
      const k = it.key ?? (it.cmd && !opens ? keyOf(it.cmd) : undefined);
      if (k) {
        const kbd = document.createElement('kbd');
        kbd.textContent = k;
        b.append(kbd);
      }
      const go = () => {
        const r = b.getBoundingClientRect();
        closeContextMenu();
        if (own) it.run(r);
        else hooks.run(it.cmd);
      };
      // moving onto a command shuts any open group beside this menu, and its row's highlight with it
      b.addEventListener('pointerenter', () => { follow(b); closeBelow(depth); });
      b.addEventListener('click', go);
      if (opens) b.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); go(); } });
    }
    m.append(b);
  }
  m.addEventListener('keydown', (e) => {
    const list = [...m.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled), :scope > .cm-row > button')];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    if (e.key === 'ArrowLeft' && depth > 0) {
      e.preventDefault();
      open.pop()?.remove();
      backToGroupRow();
    }
  });
  open.push(m);
  return m;
}

/** Simple shapes for the row's commands that have no picture of their own. */
const ROW_ICONS: Record<string, string> = {
  delete: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14M10.5 10.5v6M13.5 10.5v6"/></svg>',
};

/** A row of small buttons, each a picture and its name (the key is in its tool tip), as Office's right-click menus start. */
function buttonRow(row: MenuRowButton[], hooks: MenuHooks, depth: number, keyOf: (cmd: string) => string | undefined): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'cm-row';
  div.setAttribute('role', 'group');
  for (const it of row) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    const label = it.label ?? topMenuEntry(it.cmd)?.label ?? COMMAND_NAMES[it.cmd] ?? it.cmd;
    const icon = commandIcon(it.cmd) ?? ROW_ICONS[it.cmd];
    if (icon) {
      const ic = document.createElement('span');
      ic.className = 'cm-ic';
      ic.innerHTML = icon;
      b.append(ic);
    }
    const name = document.createElement('span');
    name.textContent = label;
    b.append(name);
    const k = keyOf(it.cmd);
    b.title = k ? `${label} (${k})` : label;
    b.addEventListener('pointerenter', () => { follow(b); closeBelow(depth); });
    b.addEventListener('click', () => { closeContextMenu(); hooks.run(it.cmd); });
    // left and right go along the row
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const sibs = [...div.querySelectorAll<HTMLButtonElement>('button')];
      const i = sibs.indexOf(b) + (e.key === 'ArrowRight' ? 1 : -1);
      if (i < 0 || i >= sibs.length) return;
      e.preventDefault();
      e.stopPropagation();
      sibs[i].focus();
    });
    div.append(b);
  }
  return div;
}

/** Keyboard focus follows the mouse, as in a system menu, so a focus ring left by the
 * arrow keys (or by opening the menu from the keyboard) never stays on a row the mouse has left. */
function follow(b: HTMLButtonElement): void {
  if (document.activeElement !== b && document.activeElement?.closest('.context-menu')) b.focus({ preventScroll: true });
}

/** Put a menu at (x, y), kept on screen; a group that would run off the right opens to the left of its row. */
function place(m: HTMLDivElement, x: number, y: number, row: DOMRect | null): void {
  m.style.left = '0px';
  m.style.top = '0px';
  document.body.append(m);
  const r = m.getBoundingClientRect();
  let left = x;
  if (left + r.width > innerWidth - 4) left = row ? row.left - r.width + 2 : innerWidth - r.width - 4;
  m.style.left = `${Math.max(4, left)}px`;
  m.style.top = `${Math.max(4, Math.min(y, innerHeight - r.height - 4))}px`;
}
