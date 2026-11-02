// A small menu at a point (a sheet's or document's right-click menus, a gallery card's menu).

/** A small menu at a point: [label, action, enabled?] items, null for a line. */
export function popupMenu(x: number, y: number, items: ([string, () => void, boolean?, string?] | null)[]): HTMLDivElement {
  document.querySelector('.popup-menu')?.remove();
  // where the keys went before (a document's caret, a sheet's cell): Escape goes back there
  const back = document.activeElement;
  const m = document.createElement('div');
  m.className = 'menu popup-menu';
  m.setAttribute('role', 'menu');
  for (const it of items) {
    if (!it) { m.append(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.textContent = it[0];
    if (it[3]) { const ic = document.createElement('span'); ic.className = 'pm-ic'; ic.innerHTML = it[3]; b.prepend(ic); }
    b.disabled = it[2] === false;
    b.addEventListener('click', () => { m.remove(); it[1](); });
    m.append(b);
  }
  // inside a window open over the page (the top layer), so it shows over that window
  const modal = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].reverse().find((d) => d.matches(':modal'));
  (modal ?? document.body).append(m);
  // kept inside the window, now and when the window changes size (Interface Size zooms it)
  const place = () => {
    if (!m.isConnected) { removeEventListener('resize', place); return; }
    const r = m.getBoundingClientRect();
    m.style.left = `${Math.max(4, Math.min(x, innerWidth - r.width - 4))}px`;
    m.style.top = `${Math.max(4, Math.min(y, innerHeight - r.height - 4))}px`;
  };
  place();
  addEventListener('resize', place);
  const close = (e: Event) => {
    if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
    if (e instanceof PointerEvent && m.contains(e.target as Node)) return;
    m.remove();
    document.removeEventListener('pointerdown', close, true);
    document.removeEventListener('keydown', close, true);
    if (e instanceof KeyboardEvent) {
      // Escape only closes the menu: it doesn't also reach the page underneath
      e.preventDefault();
      e.stopPropagation();
      if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true });
    }
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', close, true);
  });
  m.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  m.addEventListener('keydown', (e) => {
    const list = [...m.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
  });
  return m;
}
