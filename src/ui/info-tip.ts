// The "i" beside a header or label that holds its help text (UI rule 2, Nate 2026-11-02):
// explanations never get a line of their own. Rest the pointer on it (or focus it with Tab) to
// read the tip; click or tap it to pin the tip open, which is how it reads on a touch screen.

/** The tip on screen: `pinned` when clicked (stays until a click elsewhere or Escape). */
let open: { icon: HTMLElement; pop: HTMLElement; pinned: boolean } | null = null;
let showTimer = 0;
let hideTimer = 0;

/** How long the pointer rests on an "i" before its tip shows, and lingers after leaving. */
const HOVER_SHOW_MS = 120;
const HOVER_HIDE_MS = 150;

function clearTimers(): void {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  showTimer = hideTimer = 0;
}

function closeTip(): void {
  clearTimers();
  if (!open) return;
  open.pop.remove();
  open.icon.setAttribute('aria-expanded', 'false');
  open = null;
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', onKey, true);
}

function outside(e: Event): void {
  if (open && !open.pop.contains(e.target as Node) && e.target !== open.icon) closeTip();
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && open) {
    e.stopPropagation();
    e.preventDefault();
    closeTip();
  }
}

function placeTip(icon: HTMLElement, pinned: boolean): void {
  closeTip();
  const pop = document.createElement('div');
  pop.className = 'info-pop';
  pop.setAttribute('role', 'tooltip');
  pop.textContent = icon.dataset.tip ?? '';
  // the pointer may move from the "i" onto its tip (to select the words) without it closing
  pop.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  pop.addEventListener('pointerleave', () => hideSoon(icon));
  // inside the open dialog (a modal's top layer hides anything outside it), else on the page
  (icon.closest('dialog') ?? document.body).append(pop);
  const r = icon.getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 16);
  pop.style.maxWidth = `${w}px`;
  const pr = pop.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left - 8, window.innerWidth - pr.width - 8));
  const below = r.bottom + 6 + pr.height < window.innerHeight;
  pop.style.left = `${left}px`;
  pop.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - 6 - pr.height)}px`;
  icon.setAttribute('aria-expanded', 'true');
  open = { icon, pop, pinned };
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', onKey, true);
}

/** Click, tap, Enter or Space: pin the tip open, or close it if it was already pinned. */
function toggleTip(icon: HTMLElement): void {
  if (open?.icon === icon) {
    if (open.pinned) closeTip();
    else {
      clearTimers();
      open.pinned = true;
    }
    return;
  }
  placeTip(icon, true);
}

/** Pointer resting on the "i", or Tab onto it: show the tip until the pointer or focus leaves. */
function showSoon(icon: HTMLElement, delay: number): void {
  clearTimeout(hideTimer);
  if (open?.icon === icon) return;
  if (open?.pinned) return; // a pinned tip stays until dismissed
  clearTimeout(showTimer);
  showTimer = window.setTimeout(() => placeTip(icon, false), delay);
}

function hideSoon(icon: HTMLElement): void {
  clearTimeout(showTimer);
  if (open?.icon !== icon || open.pinned) return;
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(closeTip, HOVER_HIDE_MS);
}

/** An "i" whose tip is `text`: hover or focus shows it, a click pins it open. */
export function infoIcon(text: string, className = ''): HTMLElement {
  const i = document.createElement('span');
  i.className = className ? `info-icon ${className}` : 'info-icon';
  i.textContent = 'i';
  // no `title`: the browser's own tooltip would show on top of ours
  i.dataset.tip = text;
  i.tabIndex = 0;
  i.setAttribute('role', 'button');
  i.setAttribute('aria-label', text);
  i.setAttribute('aria-expanded', 'false');
  // inside a <label>, a click must not tick the box or move to the field
  i.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleTip(i);
  });
  i.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggleTip(i);
    }
  });
  // a mouse or pen resting on it shows the tip; touch goes through the click above
  i.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'touch') showSoon(i, HOVER_SHOW_MS);
  });
  i.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') hideSoon(i);
  });
  i.addEventListener('focus', () => {
    // keyboard focus only: a click focuses it too, and pins the tip itself
    let keyboard = true;
    try { keyboard = i.matches(':focus-visible'); } catch { /* older engines */ }
    if (keyboard) showSoon(i, 0);
  });
  i.addEventListener('blur', () => hideSoon(i));
  return i;
}

/** Change what an "i" says (for help that follows a choice). Empty text hides it. */
export function setInfo(icon: HTMLElement, text: string): void {
  icon.dataset.tip = text;
  icon.setAttribute('aria-label', text);
  icon.hidden = !text;
  if (open?.icon === icon) open.pop.textContent = text;
}

/**
 * Put an "i" holding `text` at the end of `header` (a dialog's title, a section heading or a
 * field's label) and return it. Nothing is added for empty text.
 */
export function addInfo(header: Element | null | undefined, text: string | undefined, className = ''): HTMLElement | null {
  if (!header || !text) return null;
  const i = infoIcon(text, className);
  header.classList.add('has-info');
  // beside the words, before any buttons the header ends with (a close ×)
  const btn = header.querySelector(':scope > button');
  if (btn) header.insertBefore(i, btn);
  else header.append(i);
  return i;
}

/** The title of a dialog (its first h2, else h3): where the dialog's own help goes. */
export function dialogTitle(d: ParentNode): HTMLElement | null {
  return d.querySelector<HTMLElement>('h2') ?? d.querySelector<HTMLElement>('h3');
}

/**
 * Turn a line of help already in the page into an "i" on `header`: the line is hidden (kept, so
 * code that updates it still can) and the "i" reads it each time it is shown.
 */
export function foldIntoInfo(line: Element | null | undefined, header: Element | null | undefined, className = ''): HTMLElement | null {
  if (!(line instanceof HTMLElement) || !header) return null;
  const text = line.textContent?.trim() ?? '';
  const i = addInfo(header, text || ' ', className);
  if (!i) return null;
  line.hidden = true;
  line.classList.add('folded-help');
  const sync = () => setInfo(i, line.textContent?.trim() ?? '');
  new MutationObserver(sync).observe(line, { childList: true, characterData: true, subtree: true });
  sync();
  return i;
}

/**
 * Give every `data-info="…"` element under `root` its "i" (once). Windows written as HTML put
 * their help this way: `<h2 data-info="What this does">Title</h2>`.
 */
export function infoFromAttrs(root: ParentNode): void {
  const all = root instanceof Element && root.matches('[data-info]') ? [root, ...root.querySelectorAll('[data-info]')] : [...root.querySelectorAll('[data-info]')];
  for (const el of all) {
    const text = el.getAttribute('data-info') ?? '';
    const have = [...el.children].find((c) => c.classList.contains('info-icon')) as HTMLElement | undefined;
    if (have) setInfo(have, text);
    else addInfo(el, text);
  }
}

let wrapped = false;

/** Turn `data-info` into "i" tips in every window as it opens (each dialog's show and showModal). */
export function infoTipsOnOpen(): void {
  if (wrapped || typeof HTMLDialogElement === 'undefined') return;
  wrapped = true;
  const proto = HTMLDialogElement.prototype;
  const modal = proto.showModal, show = proto.show;
  proto.showModal = function (this: HTMLDialogElement) {
    infoFromAttrs(this);
    return modal.call(this);
  };
  proto.show = function (this: HTMLDialogElement) {
    infoFromAttrs(this);
    return show.call(this);
  };
}

/** `header` with an "i" holding `text` (for building windows in one expression). */
export function withInfo<T extends Element>(header: T, text: string): T {
  addInfo(header, text);
  return header;
}
