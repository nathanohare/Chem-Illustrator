// A settings box that floats over the window, as Word's Paragraph and Styles boxes do: opened
// from the small corner button on a ribbon group, moved by its title bar, and closed with ×
// or Escape. Its pin button asks for it to go into the panel on the right instead.

export class FloatBox {
  readonly el: HTMLDivElement;
  readonly body: HTMLDivElement;
  private titleEl: HTMLSpanElement;
  /** Where it was left (kept while the app is open). */
  private at: { x: number; y: number } | null = null;
  private pinBtn: HTMLButtonElement;
  /** Pinned down the right side of the window (dock). */
  docked = false;

  constructor(title: string, private onPin: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'float-box';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    const head = document.createElement('div');
    head.className = 'fb-head';
    this.titleEl = document.createElement('span');
    this.titleEl.className = 'fb-title';
    this.titleEl.textContent = title;
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'fb-pin';
    pin.innerHTML = PIN_ICON;
    pin.title = 'Pin to the panel on the right (it stays there until you unpin it)';
    pin.addEventListener('click', () => this.onPin());
    this.pinBtn = pin;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'fb-close';
    close.textContent = '×';
    close.title = 'Close (Esc)';
    close.addEventListener('click', () => this.close());
    head.append(this.titleEl, pin, close);
    this.body = document.createElement('div');
    this.body.className = 'fb-body';
    this.el.append(head, this.body);
    // before the fields, which keep their keys to themselves
    this.el.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); }, true);
    this.wireDrag(head);
    document.body.append(this.el);
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  set title(t: string) {
    this.titleEl.textContent = t;
  }

  /** Show it, under `near` (a ribbon button) the first time, then where it was left. */
  show(near?: HTMLElement | null): void {
    this.el.hidden = false;
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    let { x, y } = this.at ?? { x: window.innerWidth - w - 24, y: 120 };
    if (!this.at && near) {
      const r = near.getBoundingClientRect();
      x = r.right - w;
      y = r.bottom + 6;
    }
    this.place(x, y, w, h);
    const first = [...this.body.querySelectorAll<HTMLElement>('input, select, button')].find((x) => x.offsetParent !== null);
    first?.focus();
  }

  close(): void {
    this.el.hidden = true;
  }

  /**
   * Stand it down the right side of the window, under the ribbon (over the side panel), or let it
   * float again where it was.
   */
  dock(on: boolean): void {
    this.docked = on;
    this.el.classList.toggle('fb-docked', on);
    this.pinBtn.innerHTML = on ? PINNED_ICON : PIN_ICON;
    this.pinBtn.title = on ? 'Unpin: float it over the window again' : 'Pin to the right side of the window';
    if (on) {
      const side = document.querySelector('main') ?? document.querySelector('aside');
      const top = side ? Math.max(0, side.getBoundingClientRect().top) : 0;
      this.el.style.left = '';
      this.el.style.top = `${top}px`;
      this.el.style.maxHeight = '';
    } else if (this.at) {
      this.place(this.at.x, this.at.y);
    }
  }

  private place(x: number, y: number, w = this.el.offsetWidth, h = this.el.offsetHeight): void {
    if (this.docked) return;
    x = Math.max(4, Math.min(x, window.innerWidth - w - 4));
    y = Math.max(4, Math.min(y, window.innerHeight - Math.min(h, 120)));
    this.at = { x, y };
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    // never past the bottom of the window: what doesn't fit scrolls
    this.el.style.maxHeight = `${Math.max(120, window.innerHeight - y - 8)}px`;
  }

  private wireDrag(head: HTMLElement): void {
    head.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button') || e.button !== 0) return;
      e.preventDefault();
      const r = this.el.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = (m: PointerEvent) => this.place(m.clientX - dx, m.clientY - dy);
      const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });
  }
}

/** A drawing pin (filled when pinned). */
export const PIN_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 1.5h4l-.6 4.2 2.6 2.3v1H9v5l-1 1-1-1v-5H4v-1l2.6-2.3z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
export const PINNED_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 1.5h4l-.6 4.2 2.6 2.3v1H9v5l-1 1-1-1v-5H4v-1l2.6-2.3z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
