// The two icon sets (Settings ▸ Preferences ▸ Icon set). "New" draws every command in the one
// style of icon-set.ts, as picked on the icon redesign pages; "Classic" keeps the simple line
// drawings the Canvas toolboxes had before, which are closest to ChemDraw's.
//
// Today's drawings are spread over many files (the toolboxes, the Canvas ribbon, menus, the
// animation gallery), so rather than editing each, the new set swaps them as they are put on the
// screen: each <svg> whose markup is one of today's drawings gets the new drawing instead
// (icon-picks.ts lists them by the hash of their markup). Switching back to Classic puts the old
// drawings back. Ribbon buttons that were words only, and folded groups that had no picture, get
// their new pictures in both sets (icon-set.ts and ribbon-fit.ts), since Classic never had any.

import { ICON_SWAPS } from './icon-picks';

export type IconSetName = 'new' | 'classic';
export const ICON_SET_NAMES: readonly IconSetName[] = ['new', 'classic'];

/** A drawing's markup with its spacing made even, so the same drawing always hashes the same. */
export function normaliseIcon(markup: string): string {
  return markup.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
}

/** A short hash (FNV-1a, base 36) of a drawing's markup, as icon-picks.ts keys them. */
export function iconHash(markup: string): string {
  const s = normaliseIcon(markup);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** The attributes of the old drawing's <svg> that the new one drops (it is coloured by class). */
const OLD_ATTRS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity'];

/**
 * A swapped <svg> keeps which old drawing it had (its hash) and its old attributes in data-ic-new,
 * to put back for Classic. It is kept on the element itself (not in a table) so a copy of the
 * button, such as a folded group showing its first picture, can be put back too. The old markup
 * itself stays here in memory, keyed by that hash, so putting it back never reads markup from the page.
 */
interface Before { key: string; attrs: [string, string][] }
const OLD_MARKUP = new Map<string, string>();

/** The words of the button or menu item an icon sits on (its tooltip, name and text). */
function labelOf(svg: Element): string {
  const host = svg.closest('button, [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [title], [aria-label]');
  if (!host) return '';
  return `${host.getAttribute('title') ?? ''} ${host.getAttribute('aria-label') ?? ''} ${host.textContent ?? ''}`;
}

/** Give one <svg> its new drawing, if it shows one of today's drawings. */
export function swapIcon(svg: SVGElement): boolean {
  if (svg.hasAttribute('data-ic-new')) return false;
  const html = svg.innerHTML;
  if (!html || html.length > 6000) return false;
  const key = iconHash(html);
  const list = ICON_SWAPS[key];
  if (!list) return false;
  let pick = list.find((s) => !s.only);
  if (list.some((s) => s.only)) {
    const words = labelOf(svg);
    pick = list.find((s) => s.only && words.includes(s.only)) ?? pick;
  }
  if (!pick) return false;
  OLD_MARKUP.set(key, html);
  const old: Before = { key, attrs: [...svg.attributes].map((a) => [a.name, a.value]) };
  for (const a of OLD_ATTRS) svg.removeAttribute(a);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.classList.add('ci-ic');
  svg.setAttribute('data-ic-new', JSON.stringify(old));
  svg.innerHTML = pick.d;
  return true;
}

/** Put a swapped <svg> back to today's drawing. */
function restoreIcon(svg: SVGElement): void {
  let old: Before;
  try { old = JSON.parse(svg.getAttribute('data-ic-new') ?? ''); } catch { return; }
  if (!old || typeof old.key !== 'string' || !Array.isArray(old.attrs)) return;
  const html = OLD_MARKUP.get(old.key);
  if (html === undefined) return;
  for (const a of [...svg.attributes]) svg.removeAttribute(a.name);
  for (const [n, v] of old.attrs) if (typeof n === 'string' && !/^on/i.test(n)) svg.setAttribute(n, String(v));
  svg.innerHTML = html;
}

/** Swap every drawing under `root` (and root itself). */
export function swapIcons(root: ParentNode | Element): number {
  let n = 0;
  if (root instanceof SVGElement && root.tagName.toLowerCase() === 'svg') return swapIcon(root) ? 1 : 0;
  for (const s of root.querySelectorAll<SVGElement>('svg')) if (swapIcon(s)) n++;
  return n;
}

let current: IconSetName = 'new';
let watcher: MutationObserver | null = null;

/** The icon set showing now. */
export function iconSet(): IconSetName {
  return current;
}

/**
 * Show the new icon set or the classic one. The new one also watches the page, so drawings put
 * on the screen later (a toolbox opening, a menu, a dialog) get theirs too.
 */
export function setIconSet(name: IconSetName, root: Document = document): void {
  current = name;
  root.documentElement.dataset.iconSet = name;
  if (name === 'classic') {
    watcher?.disconnect();
    watcher = null;
    for (const s of root.querySelectorAll<SVGElement>('svg[data-ic-new]')) restoreIcon(s);
    return;
  }
  swapIcons(root.body ?? root);
  if (watcher || typeof MutationObserver === 'undefined') return;
  watcher = new MutationObserver((records) => {
    for (const r of records) {
      // a drawing changed in place (its markup set again): check that <svg> once more
      const inSvg = r.target instanceof Element ? r.target.closest('svg') : null;
      if (inSvg) {
        if (!inSvg.hasAttribute('data-ic-new')) swapIcon(inSvg as SVGElement);
        continue;
      }
      for (const n of r.addedNodes) if (n instanceof Element) swapIcons(n);
    }
  });
  watcher.observe(root.body ?? root.documentElement, { childList: true, subtree: true });
}
