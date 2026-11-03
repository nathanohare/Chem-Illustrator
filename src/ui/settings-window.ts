// The Settings window: every setting in one place, with a list of pages on the left and a search
// box, as in Office. Each page is one of the program's settings windows shown inside this one
// (the menu items that used to open them now open their page here). Saving or cancelling a
// page shows it again with what it now holds.
//
// Every page ends the same way, in a bar along the window's foot: Apply uses the page's
// settings now and keeps them. On a page about the open file (Drawing Style), Apply is for that
// file and Set as Default is for new files too; elsewhere the two do the same. Leaving a page, or the
// window, with changes not yet applied asks whether to apply them or throw them away.

import { hostNextDialog, setPreviewSlot } from './dialog-host';

export interface SettingsPage {
  id: string;
  title: string;
  /** Words to find it by (the names of its settings). */
  words: string;
  /** Open the page's settings window (it opens inside this one). */
  open: () => void | Promise<void>;
  /** A page of buttons that do things (export, file types), with no settings to apply: no Apply bar. */
  actions?: boolean;
  /** A page about the open file (Drawing Style): Apply is for that file, Set as Default for new files too. */
  perFile?: boolean;
}

/** How a page's settings were put to use: for now, or kept as the default. */
export type ApplyMode = 'apply' | 'default';

/** What the window needs from the program: the settings as they stand, and what to do once a page is applied. */
export interface SettingsHost {
  /** Every setting now, as plain data (compared before and after a page, and put back on Discard). */
  snapshot(): Record<string, unknown>;
  /** Put settings back as they were (Discard on a page that changes things as you go). */
  restore(s: Record<string, unknown>): void;
  /** A page was applied: `before` is how the settings stood before it. */
  applied(page: string, mode: ApplyMode, before: Record<string, unknown>): void;
}

/** The pages whose title or words have every word of `q`, best first (title matches before word matches). */
export function findPages(pages: SettingsPage[], q: string): SettingsPage[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return pages;
  const has = (s: string) => words.every((w) => s.toLowerCase().includes(w));
  return [...pages.filter((p) => has(p.title)), ...pages.filter((p) => !has(p.title) && has(`${p.title} ${p.words}`))];
}

/** The settings that differ between two snapshots (by key). */
export function changedKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

/** The values of a page's boxes, to tell whether anything was changed in it. */
function formState(root: HTMLElement): string {
  return [...root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')]
    .filter((el) => !el.closest('.sw-foot, [data-no-dirty]') && el.type !== 'search')
    .map((el) => (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') ? String(el.checked) : el.value))
    .join('\u0001');
}

const isCancel = (b: HTMLButtonElement) => /^(Cancel|Close)$/.test(b.textContent?.trim() ?? '');

export class SettingsWindow {
  private d: HTMLDialogElement | null = null;
  private list!: HTMLElement;
  private pane!: HTMLElement;
  private aside!: HTMLElement;
  private foot!: HTMLElement;
  private applyBtn!: HTMLButtonElement;
  private defaultBtn!: HTMLButtonElement;
  private search!: HTMLInputElement;
  private page = '';
  private reopen = 0;
  /** The page's own window, shown in the pane. */
  private current: HTMLDialogElement | null = null;
  /** The page's own button that applies it (its Save, OK or Apply), when it has one. */
  private submit: HTMLButtonElement | null = null;
  /** How things stood as the page opened: the settings, and its boxes. */
  private start: { settings: Record<string, unknown>; form: string } | null = null;
  /** The page's open() still running, with the way it is being applied once it is. */
  private running: Promise<void> = Promise.resolve();
  private pending: { mode: ApplyMode; before: Record<string, unknown> } | null = null;
  /** A question about unapplied changes is showing. */
  private asking = false;

  /** While a page is being applied: whether as the default (a page about the open file reads this). */
  mode: ApplyMode = 'apply';

  constructor(private pages: SettingsPage[], private host: SettingsHost | null = null) {}

  get isOpen(): boolean { return !!this.d?.open; }

  /** The pane on the right where a page shows a preview (empty for pages without one). */
  get previewPane(): HTMLElement | null { return this.d?.open ? this.aside : null; }

  /** Open at a page (by id), or at the first. */
  open(id = this.pages[0].id): void {
    this.build();
    if (!this.d!.open) this.d!.showModal();
    this.search.value = '';
    this.fillList();
    void this.go(id);
    // typing goes to the search box, not the page's first box (which a page focuses as it opens)
    requestAnimationFrame(() => { if (this.d?.open) this.search.focus(); });
  }

  private build(): void {
    if (this.d) return;
    const d = document.createElement('dialog');
    d.className = 'settings-window';
    d.setAttribute('aria-label', 'Settings');
    d.innerHTML = `<div class="sw-head"><h2>Settings</h2><input type="search" class="sw-search" placeholder="Find a setting" aria-label="Find a setting"><button type="button" class="sw-close" title="Close (Esc)">×</button></div>`
      + `<div class="sw-body"><nav class="sw-list" aria-label="Pages"></nav><div class="sw-pane"></div><div class="sw-aside" role="complementary" aria-label="Preview" hidden></div></div>`
      + `<div class="sw-foot"><span class="sw-note muted"></span><button type="button" class="sw-default" title="Use these settings now and keep them: for next time, and for new files">Set as Default</button><button type="button" class="primary sw-apply" title="Use these settings now and keep them for next time">Apply</button></div>`;
    this.list = d.querySelector('.sw-list')!;
    this.pane = d.querySelector('.sw-pane')!;
    this.aside = d.querySelector('.sw-aside')!;
    this.foot = d.querySelector('.sw-foot')!;
    this.applyBtn = d.querySelector('.sw-apply')!;
    this.defaultBtn = d.querySelector('.sw-default')!;
    this.search = d.querySelector('.sw-search')!;
    d.querySelector('.sw-close')!.addEventListener('click', () => void this.close());
    this.applyBtn.addEventListener('click', () => void this.commit('apply'));
    this.defaultBtn.addEventListener('click', () => void this.commit('default'));
    d.addEventListener('cancel', (e) => { e.preventDefault(); void this.close(); });
    // Esc closes the whole window, wherever the focus is: a page would otherwise take it as its
    // own Cancel and simply be shown again
    d.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      // (but a list that is open, a colour palette or a key being recorded takes it first)
      if (t?.closest('select, [aria-expanded="true"], .colour-pop, .recording')) return;
      e.preventDefault();
      e.stopPropagation();
      void this.close();
    }, true);
    this.search.addEventListener('input', () => {
      const found = this.fillList();
      if (found.length && !found.some((p) => p.id === this.page)) void this.go(found[0].id);
    });
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.pane.querySelector<HTMLElement>('input, select, textarea, button')?.focus(); }
    });
    // a page's own Save (or the bar's Apply, which presses it) applies it: note how things stood first
    this.pane.addEventListener('submit', () => {
      if (!this.pending) this.pending = { mode: this.mode, before: this.snap() };
    }, true);
    // the bar shows whether there is anything to apply
    const changed = () => this.refreshBar();
    this.pane.addEventListener('input', changed);
    this.pane.addEventListener('change', changed);
    this.pane.addEventListener('click', () => setTimeout(changed, 0));
    // a page saved or cancelled closes its window: show the page again, with its new values
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) if (n instanceof HTMLDialogElement) { this.current = n; this.fitPage(n); }
        for (const n of r.removedNodes) if (n === this.current) this.pageClosed();
      }
    }).observe(this.pane, { childList: true });
    this.pane.addEventListener('close', (e) => { if (e.target === this.current) this.pageClosed(); }, true);
    document.body.append(d);
    this.d = d;
  }

  private snap(): Record<string, unknown> {
    return this.host ? this.host.snapshot() : {};
  }

  /** A page's window has come into the pane: its own buttons give way to the bar's. */
  private fitPage(dlg: HTMLDialogElement): void {
    const p = this.pageOf(this.page);
    const buttons = [...dlg.querySelectorAll<HTMLButtonElement>('button')];
    this.submit = buttons.find((b) => b.type === 'submit') ?? null;
    if (!p.actions) {
      // the page's Save and Cancel (or Close) are the bar's Apply and the window's close now
      if (this.submit) this.submit.classList.add('sw-hidden');
      for (const b of buttons) if (isCancel(b)) b.classList.add('sw-hidden');
      for (const row of dlg.querySelectorAll<HTMLElement>('.ask-buttons, .dialog-buttons, .buttons')) {
        if ([...row.children].every((c) => c.classList.contains('sw-hidden'))) row.classList.add('sw-hidden');
      }
    }
    // a frame later, once the page has filled its boxes
    requestAnimationFrame(() => { this.start = { settings: this.snap(), form: formState(dlg) }; this.refreshBar(); });
  }

  private pageOf(id: string): SettingsPage {
    return this.pages.find((x) => x.id === id) ?? this.pages[0];
  }

  /** Changes on the page not yet applied. */
  private dirty(): boolean {
    if (!this.start || this.pageOf(this.page).actions) return false;
    if (this.current && formState(this.current) !== this.start.form) return true;
    return !!this.host && changedKeys(this.start.settings, this.snap()).length > 0;
  }

  private refreshBar(): void {
    const page = this.pageOf(this.page);
    const actions = page.actions;
    this.foot.classList.toggle('sw-actions', !!actions);
    this.applyBtn.title = page.perFile ? 'Use these settings in the open file' : 'Use these settings now and keep them for next time';
    this.foot.querySelector<HTMLElement>('.sw-default')!.title = page.perFile ? 'Use these settings in the open file, and for new files too' : 'Here the same as Apply: the settings are used now and kept for next time';
    const dirty = this.dirty();
    this.applyBtn.disabled = !dirty;
    const note = this.foot.querySelector('.sw-note')!;
    note.textContent = actions ? '' : dirty ? 'Changes not applied yet' : '';
  }

  /**
   * Apply the page (Apply, or Set as Default): its own Save does the work where it has one;
   * a page that changes things as you go has already done it.
   */
  private async commit(mode: ApplyMode): Promise<void> {
    const p = this.pageOf(this.page);
    if (p.actions) return;
    this.mode = mode;
    try {
      if (this.submit?.isConnected) {
        this.pending = { mode, before: this.start?.settings ?? this.snap() };
        const form = this.submit.form;
        if (form) form.requestSubmit(this.submit); else this.submit.click();
        await this.running;
        // (the page shows again with what it now holds)
      } else {
        this.host?.applied(p.id, mode, this.start?.settings ?? this.snap());
        if (this.current) this.start = { settings: this.snap(), form: formState(this.current) };
      }
    } finally {
      this.mode = 'apply';
    }
    this.refreshBar();
  }

  private pageClosed(): void {
    this.current = null;
    this.submit = null;
    clearTimeout(this.reopen);
    // once the page has finished applying what it was given
    void this.running.then(() => {
      clearTimeout(this.reopen);
      this.reopen = window.setTimeout(() => { if (this.d?.open && !this.current) this.show(this.page); }, 30);
    });
  }

  /**
   * Changes not applied: ask what to do with them. Resolves true to carry on (applied or
   * thrown away), false to stay on the page.
   */
  private async settle(): Promise<boolean> {
    if (!this.dirty()) return true;
    if (this.asking) return false;
    this.asking = true;
    const title = this.pageOf(this.page).title;
    const answer = await askUnapplied(this.d!, title);
    this.asking = false;
    if (answer === 'stay') return false;
    if (answer === 'discard') {
      // a page that changes things as you go is put back as it was
      if (this.host && this.start && changedKeys(this.start.settings, this.snap()).length) this.host.restore(this.start.settings);
      return true;
    }
    await this.commit(answer);
    return true;
  }

  async close(): Promise<void> {
    if (!(await this.settle())) return;
    clearTimeout(this.reopen);
    hostNextDialog(null);
    setPreviewSlot(null);
    const was = this.current;
    this.current = null;
    this.start = null;
    this.d?.close();
    this.pane?.replaceChildren();
    this.aside?.replaceChildren();
    was?.close();
  }

  private fillList(): SettingsPage[] {
    const found = findPages(this.pages, this.search.value);
    this.list.replaceChildren(...found.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.page = p.id;
      b.textContent = p.title;
      b.classList.toggle('on', p.id === this.page);
      b.addEventListener('click', () => void this.go(p.id));
      return b;
    }));
    if (!found.length) {
      const none = document.createElement('p');
      none.className = 'muted';
      none.textContent = 'No setting has those words.';
      this.list.append(none);
    }
    return found;
  }

  /** Move to a page, after asking about changes left on this one. */
  private async go(id: string): Promise<void> {
    if (this.page && this.page !== id && this.current && !(await this.settle())) {
      for (const b of this.list.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', b.dataset.page === this.page);
      return;
    }
    this.show(id);
  }

  private show(id: string): void {
    const p = this.pageOf(id);
    this.page = p.id;
    for (const b of this.list.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', b.dataset.page === p.id);
    // a page left unsaved is dropped, as Cancel would
    const was = this.current;
    this.current = null;
    this.submit = null;
    this.start = null;
    this.pane.replaceChildren();
    this.aside.replaceChildren();
    this.aside.hidden = true;
    this.d!.classList.remove('with-preview');
    if (was) was.close();
    clearTimeout(this.reopen);
    hostNextDialog(this.pane);
    setPreviewSlot(this.aside);
    this.refreshBar();
    this.running = Promise.resolve(p.open()).then(() => {
      const done = this.pending;
      this.pending = null;
      if (done && this.host) this.host.applied(p.id, done.mode, done.before);
    }, () => { this.pending = null; });
  }
}

/** Apply, Set as Default, Discard, or stay on the page. */
function askUnapplied(over: HTMLDialogElement, title: string): Promise<ApplyMode | 'discard' | 'stay'> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'ask sw-unapplied';
    d.innerHTML = `<form method="dialog"><h2>Apply your changes?</h2><p class="muted"></p><p class="ask-buttons">`
      + `<button type="button" data-a="stay">Keep Editing</button><button type="button" data-a="discard">Discard</button>`
      + `<button type="button" data-a="default">Set as Default</button><button type="button" class="primary" data-a="apply">Apply</button></p></form>`;
    d.querySelector('p.muted')!.textContent = `${title} has changes that haven't been applied.`;
    let done = false;
    const finish = (a: ApplyMode | 'discard' | 'stay') => { if (done) return; done = true; d.close(); d.remove(); resolve(a); };
    for (const b of d.querySelectorAll<HTMLButtonElement>('button')) b.addEventListener('click', () => finish(b.dataset.a as ApplyMode | 'discard' | 'stay'));
    d.addEventListener('cancel', (e) => { e.preventDefault(); finish('stay'); });
    over.append(d);
    d.showModal();
    d.querySelector<HTMLButtonElement>('.primary')!.focus();
  });
}
