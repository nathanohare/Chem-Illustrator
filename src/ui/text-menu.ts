// A right-click menu over text (a document's page, a text box being typed in), put at the point
// clicked: over everything, inside the window and scrolling when it is taller than the window, and
// with the arrow keys moving through its items (laptop bench: in a short window the menu was cut
// off at the bottom of the document area, out of reach).

/**
 * Show `menu` at (x, y) in its window; Escape calls `close`. Returns what to call when the menu
 * closes.
 */
export function placeTextMenu(menu: HTMLElement, x: number, y: number, doc: Document = document, close?: () => void): () => void {
  const win = doc.defaultView ?? window;
  menu.classList.add('at-point');
  doc.body.append(menu);
  // kept inside the window, now and when the window changes size (Interface Size zooms it)
  const place = () => {
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = `${Math.max(4, Math.min(x, win.innerWidth - w - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(y, win.innerHeight - h - 4))}px`;
  };
  place();
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && close) {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (!list.length) return;
    e.preventDefault();
    e.stopPropagation();
    const i = list.indexOf(doc.activeElement as HTMLButtonElement);
    const down = e.key === 'ArrowDown';
    const next = i < 0 ? (down ? 0 : list.length - 1) : (i + (down ? 1 : -1) + list.length) % list.length;
    // (a focused item is scrolled into sight)
    list[next].focus();
  };
  doc.addEventListener('keydown', keys, true);
  win.addEventListener('resize', place);
  return () => { doc.removeEventListener('keydown', keys, true); win.removeEventListener('resize', place); };
}
