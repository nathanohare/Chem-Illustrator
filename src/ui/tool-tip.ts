// The tool tip for a drawing tool's button: its name and hotkey, what it does, and the keys that
// change it (Alt, Shift, Ctrl…), as a small card beside the button. It takes over from the
// browser's own one-line tip, which the button keeps for when this one is off.

/** What the card shows for a tool. */
export interface ToolTipContent {
  name: string;
  hotkey: string;
  body: string;
  keys: [string, string][];
  /** A last line in grey: how to open the tool's palette. */
  more?: string;
}

/** How long the mouse rests on a button before the card shows (ms); once one shows, the next comes at once. */
const DELAY = 500;

export class ToolTip {
  enabled = true;
  private el: HTMLDivElement;
  private timer = 0;
  private over: HTMLElement | null = null;
  private warm = 0;

  /** `content` gives the card for a button (it carries `data-tip-tool`), or null for none. */
  constructor(private content: (button: HTMLElement) => ToolTipContent | null, private mac = false) {
    this.el = document.createElement('div');
    this.el.className = 'tool-tip';
    this.el.hidden = true;
    this.el.setAttribute('role', 'tooltip');
    this.el.id = 'tool-tip';
    document.body.append(this.el);
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch') return;
      // (a palette's corner arrow covers a quarter of its button: the tip is the button's)
      const el = e.target as HTMLElement;
      const b = el.closest?.<HTMLElement>('[data-tip-tool]') ?? el.closest?.('.palette-wrap')?.querySelector<HTMLElement>(':scope > [data-tip-tool]') ?? null;
      if (b === this.over) return;
      this.leave();
      if (b && this.enabled) this.enter(b);
    });
    // a press, a key or a scroll puts it away
    for (const ev of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(ev, () => this.leave(true), true);
    window.addEventListener('blur', () => this.leave(true));
  }

  private enter(b: HTMLElement): void {
    this.over = b;
    // the browser's tip would show as well: kept aside while the mouse is on the button
    for (const x of this.titled(b)) if (x.title) { x.dataset.tipTitle = x.title; x.removeAttribute('title'); }
    const wait = performance.now() - this.warm < 800 ? 0 : DELAY;
    this.timer = window.setTimeout(() => this.show(b), wait);
  }

  private leave(now = false): void {
    clearTimeout(this.timer);
    const b = this.over;
    for (const x of b ? this.titled(b) : []) if (x.dataset.tipTitle != null) { if (!x.title) x.title = x.dataset.tipTitle; delete x.dataset.tipTitle; }
    if (b) b.removeAttribute('aria-describedby');
    if (!this.el.hidden) this.warm = now ? 0 : performance.now();
    this.el.hidden = true;
    this.over = null;
  }

  /** The button and its palette's corner arrow: their own tips wait while this one is up. */
  private titled(b: HTMLElement): HTMLElement[] {
    const more = b.parentElement?.classList.contains('palette-wrap') ? b.parentElement.querySelector<HTMLElement>(':scope > .more') : null;
    return more ? [b, more] : [b];
  }

  private show(b: HTMLElement): void {
    if (!b.isConnected || this.over !== b) return;
    const c = this.content(b);
    if (!c) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
    const key = (k: string) => `<kbd>${esc(this.mac ? k.replace(/^Ctrl\b/, '⌘').replace(/^Alt\b/, '⌥') : k)}</kbd>`;
    this.el.innerHTML = `<div class="tt-head"><span>${esc(c.name)}</span>${c.hotkey ? key(c.hotkey) : ''}</div>`
      + (c.body ? `<div class="tt-body">${esc(c.body)}</div>` : '')
      + (c.keys.length ? `<div class="tt-keys">${c.keys.map(([k, what]) => `${key(k)}<span>${esc(what)}</span>`).join('')}</div>` : '')
      + (c.more ? `<div class="tt-more">${esc(c.more)}</div>` : '');
    this.el.hidden = false;
    b.setAttribute('aria-describedby', this.el.id);
    // beside the button, on whichever side has room, kept on the screen
    const r = b.getBoundingClientRect(), w = this.el.offsetWidth, h = this.el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = r.right + 8, y = r.top - 4;
    if (x + w > vw - 4) x = r.left - w - 8;
    const below = x < 4;
    if (below) { x = Math.min(Math.max(4, r.left), vw - w - 4); y = r.bottom + 6; }
    if (y + h > vh - 4) y = below ? r.top - h - 6 : vh - h - 4;
    y = Math.max(4, y);
    this.el.style.left = `${Math.round(x)}px`;
    this.el.style.top = `${Math.round(y)}px`;
  }
}
