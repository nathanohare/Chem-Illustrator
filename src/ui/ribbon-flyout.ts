// Ribbon buttons that drop a short list of commands below them, as Office's do: a dropdown
// (Media ▾ holding Picture, Video and Audio) or a split button (New Slide, whose arrow picks the
// new slide's layout). The commands in the list are the ribbon's own buttons, kept inside the
// ribbon, so a click on one runs it exactly as it ran before it moved into the list.
//
//   <div class="rb-fly">
//     <button class="rb-big rb-fly-btn" data-ic="media-menu">…Media ▾</button>   (or, for a split
//     <div class="rb-fly-menu" role="menu" hidden>…the ribbon's buttons…</div>      button, the main
//   </div>                                                                          button, then a
//                                                                                   .rb-fly-btn arrow)

let openMenu: HTMLElement | null = null;

function close(): void {
  if (!openMenu) return;
  openMenu.hidden = true;
  openMenu.parentElement?.querySelector(':scope > .rb-fly-btn')?.setAttribute('aria-expanded', 'false');
  openMenu = null;
}

function show(menu: HTMLElement, by: HTMLElement): void {
  close();
  const r = (by.closest('.rb-fly') ?? by).getBoundingClientRect();
  menu.dispatchEvent(new CustomEvent('rb-fly-open')); // a gallery fills itself with the choices as they are now
  menu.hidden = false;
  menu.style.left = `${Math.max(4, Math.min(r.left, innerWidth - menu.offsetWidth - 4))}px`;
  menu.style.top = `${r.bottom + 2}px`;
  by.setAttribute('aria-expanded', 'true');
  openMenu = menu;
  menu.querySelector<HTMLElement>('button:not([disabled])')?.focus({ preventScroll: true });
}

/** Wire every ribbon dropdown and split button (once, for the whole page). */
export function installRibbonFlyouts(): void {
  for (const b of document.querySelectorAll<HTMLElement>('.rb-fly-btn')) {
    b.setAttribute('aria-haspopup', 'menu');
    b.setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest<HTMLElement>('.rb-fly-btn');
    if (btn) {
      const menu = btn.parentElement?.querySelector<HTMLElement>(':scope > .rb-fly-menu');
      if (menu) {
        e.stopPropagation();
        if (menu === openMenu) close();
        else show(menu, btn);
      }
      return;
    }
    // a command in the list has run (the ribbon heard the click first): the list closes
    if (openMenu && (t.closest('.rb-fly-menu') === openMenu ? t.closest('button') : true)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (!openMenu) return;
    if (e.key === 'Escape') {
      const by = openMenu.parentElement?.querySelector<HTMLElement>(':scope > .rb-fly-btn');
      close();
      by?.focus();
      e.stopPropagation();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...openMenu.querySelectorAll<HTMLElement>('button:not([disabled])')];
      const at = items.indexOf(document.activeElement as HTMLElement);
      items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
      e.preventDefault();
    }
  }, true);
  addEventListener('resize', close);
}
