// @vitest-environment jsdom
//
// The two icon sets (src/ui/icon-swap.ts): New swaps today's drawings for the picked ones as they
// reach the screen, Classic puts them back, a copy of a swapped picture can be put back too, and
// a drawing shared by two commands only changes on the button it was picked for.

import { afterEach, describe, expect, it } from 'vitest';
import { ICON_SWAPS, TEXT_ICONS, GROUP_ICONS } from '../src/ui/icon-picks';
import { iconHash, setIconSet, swapIcons } from '../src/ui/icon-swap';
import { applyIconSet, buttonKey } from '../src/ui/icon-set';

const OLD = '<path d="M3 17c4-10 14-10 18 0"></path><circle cx="12" cy="9.5" r="2.2"></circle><path d="M18 2v5M15.5 4.5h5"></path>';
const oldSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${OLD}</svg>`;
const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => { setIconSet('classic'); document.body.innerHTML = ''; });

describe('icon picks data', () => {
  it('has drawings for today\'s pictures, text-only buttons and folded groups', () => {
    expect(Object.keys(ICON_SWAPS).length).toBeGreaterThan(100);
    expect(Object.keys(TEXT_ICONS).length).toBeGreaterThan(100);
    expect(Object.keys(GROUP_ICONS).length).toBeGreaterThan(20);
  });
  it('draws only with the icon set\'s own elements and classes', () => {
    const all = [...Object.values(ICON_SWAPS).flat().map((s) => s.d), ...Object.values(TEXT_ICONS), ...Object.values(GROUP_ICONS)];
    for (const d of all) {
      expect(d).not.toMatch(/<(script|foreignObject|image|use)\b|on\w+=|href=/i);
      for (const [, c] of d.matchAll(/class="([^"]*)"/g)) for (const k of c.split(' ')) expect(['a', 'f', 'p', 's', 'k', 'i']).toContain(k);
    }
  });
});

describe('iconHash', () => {
  it('reads the same drawing the same however it is spaced', () => {
    expect(iconHash(OLD)).toBe(iconHash(OLD.replace(/></g, '>\n  <')));
    expect(iconHash(OLD)).not.toBe(iconHash(OLD.replace('2.2', '2.3')));
  });
  it('knows the Add Bend drawing the Canvas ribbon shows today', () => {
    expect(ICON_SWAPS[iconHash(OLD)]).toBeTruthy();
  });
});

describe('setIconSet', () => {
  it('swaps today\'s drawings, later ones too, and Classic puts them back', async () => {
    document.body.innerHTML = `<button title="Add Bend">${oldSvg}</button>`;
    setIconSet('new');
    const svg = document.querySelector('svg')!;
    expect(svg.hasAttribute('data-ic-new')).toBe(true);
    expect(svg.classList.contains('ci-ic')).toBe(true);
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.hasAttribute('stroke')).toBe(false);
    // a picture put on the page later (a toolbox opening) gets its new drawing too
    const later = document.createElement('div');
    later.innerHTML = `<button title="Add Bend">${oldSvg}</button>`;
    document.body.append(later);
    await tick();
    expect(later.querySelector('svg')!.hasAttribute('data-ic-new')).toBe(true);
    // a copy of a swapped picture (a folded group shows its first one) goes back as well
    const copy = document.createElement('span');
    copy.innerHTML = svg.outerHTML;
    document.body.append(copy);
    setIconSet('classic');
    for (const s of document.querySelectorAll('svg')) {
      expect(s.hasAttribute('data-ic-new')).toBe(false);
      expect(s.innerHTML).toBe(OLD);
      expect(s.getAttribute('stroke')).toBe('currentColor');
    }
  });
  it('leaves drawings it doesn\'t know alone', () => {
    document.body.innerHTML = '<svg viewBox="0 0 24 24"><path d="M1 1h2"></path></svg>';
    expect(swapIcons(document.body)).toBe(0);
  });
  it('changes a drawing two commands share only on the button it was picked for', () => {
    // Canvas Align Left and Justify share one drawing today; each was picked its own
    const list = Object.values(ICON_SWAPS).find((l) => l.some((s) => s.only === 'Justify'))!;
    expect(list).toBeTruthy();
    expect(list.every((s) => s.only)).toBe(true);
    expect(list.find((s) => s.only === 'Justify')!.d).not.toBe(list.find((s) => s.only === 'Align Left')?.d);
  });
});

describe('text-only ribbon buttons', () => {
  it('get a picture before their name, without the typed stand-in', () => {
    const key = 'doc:zotero-refresh';
    expect(TEXT_ICONS[key]).toBeTruthy();
    document.body.innerHTML = '<div class="ribbon"><button data-doc="zotero-refresh">⟳ Refresh</button><button data-doc="next-comment">Next ▶</button></div>';
    applyIconSet(document);
    const [a, b] = document.querySelectorAll('button');
    expect(buttonKey(a)).toBe(key);
    expect(a.querySelector('.rb-lead svg.ci-ic')).toBeTruthy();
    const words = (el: Element) => [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('');
    expect(words(a)).toBe('Refresh');
    expect(words(b)).toBe('Next');
    // a second pass adds nothing more
    applyIconSet(document);
    expect(a.querySelectorAll('svg').length).toBe(1);
  });
  it('key a function category by its name', () => {
    document.body.innerHTML = '<button data-sh="fn-cat" data-cat="Text">Text ▾</button>';
    expect(buttonKey(document.querySelector('button')!)).toBe('sh:fn-cat:Text');
  });
});
