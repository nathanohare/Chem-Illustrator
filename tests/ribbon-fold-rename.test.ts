// @vitest-environment jsdom
//
// A folded group (Format Favorites) keeps its picture when the ribbon is laid out again after a
// group is dragged: renaming it touches only its words.

import { describe, expect, it } from 'vitest';
import { applyRibbon, readRibbons } from '../src/ui/ribbon-custom';
import { fitRow } from '../src/ui/ribbon-fit';

describe('a folded group after the ribbon is rearranged', () => {
  it('keeps its icon and shows its name only as words', () => {
    document.body.innerHTML = `<div id="doc-ribbon" class="ribbon"><div class="rb-tabs"><button data-doc-tab="home">Home</button></div>
      <div class="rb-panel" data-doc-panel="home">
        <div class="rb-group"><div class="rb-row"><button data-doc="paste"><span class="rb-icon"><svg id="paste-pic"></svg></span>Paste</button></div><div class="rb-label">Clipboard</div></div>
        <div class="rb-group rb-fold-always"><div class="rb-row"><button data-doc="fav"><span class="rb-icon"><svg id="fav-pic"></svg></span>Add</button></div><div class="rb-label">Format Favorites</div></div>
      </div></div>`;
    const panel = document.querySelector<HTMLElement>('[data-doc-panel]')!;
    // (jsdom lays nothing out: give the row a width so it is fitted)
    Object.defineProperty(panel, 'clientWidth', { value: 800 });
    fitRow(panel);
    expect(document.querySelector('.rb-fold-btn .rb-icon svg')).not.toBeNull();
    const [info] = readRibbons();
    applyRibbon(info, { groups: { home: ['g:format-favorites', 'g:clipboard'] } }, { run: () => {} });
    const btn = document.querySelector<HTMLElement>('.rb-fold-btn')!;
    expect(btn.querySelector('.rb-icon svg')).not.toBeNull();
    expect(btn.querySelector('.rb-icon')!.textContent).toBe('');
    expect(btn.querySelector('.rb-fold-text')!.textContent).toBe('Format Favorites ');
    applyRibbon(info, { groupNames: { 'g:format-favorites': 'Favorites' } }, { run: () => {} });
    expect(btn.querySelector('.rb-icon svg')).not.toBeNull();
    expect(btn.querySelector('.rb-fold-text')!.textContent).toBe('Favorites ');
    expect(btn.getAttribute('aria-label')).toBe('Favorites');
  });
});
