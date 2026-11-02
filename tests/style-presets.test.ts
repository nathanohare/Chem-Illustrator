// @vitest-environment jsdom
//
// Drawing style presets (review item 50): built-in styles grouped by use (Journal, Presentation,
// Poster, Thesis/Print) and your own, each as a card with a small structure drawn in it, in the
// Drawing Style window and inline on the Presentation and Design ribbons.

import { describe, expect, it, vi } from 'vitest';
import { ACS_1996 } from '../src/style';
import { STYLE_PRESETS, STYLE_USES, cleanStyle, presetNamed, styleUse } from '../src/drawing-styles';
import { cardFor, cardName, ribbonStyles, sampleDoc, styleCardList, styleCards, styleThumb } from '../src/ui/style-cards';

describe('style presets by use', () => {
  it('has styles for journals, presentations, posters and theses, each sensible', () => {
    for (const u of STYLE_USES) expect(STYLE_PRESETS.filter((p) => p.use === u).length).toBeGreaterThan(0);
    for (const p of STYLE_PRESETS) expect(cleanStyle(p.style)).not.toBeNull();
    expect(new Set(STYLE_PRESETS.map((p) => p.style.name)).size).toBe(STYLE_PRESETS.length);
  });

  it('draws presentation and poster structures bigger, and posters heavier for their size', () => {
    const acs = presetNamed('ACS Document 1996')!.style;
    const poster = STYLE_PRESETS.find((p) => p.use === 'Poster')!.style;
    const slides = STYLE_PRESETS.find((p) => p.use === 'Presentation')!.style;
    expect(slides.bondLength).toBeGreaterThan(acs.bondLength);
    expect(poster.bondLength).toBeGreaterThan(slides.bondLength);
    expect(poster.lineWidth / poster.bondLength).toBeGreaterThan(acs.lineWidth / acs.bondLength);
    expect(presetNamed('Slides, heavy lines')!.style.lineWidth).toBeGreaterThan(presetNamed('Slides (ACS 1996 × 2)')!.style.lineWidth);
  });

  it('knows what a style is for: your own are "Yours"', () => {
    expect(styleUse(ACS_1996)).toBe('Journal');
    expect(styleUse({ ...ACS_1996, name: 'Group meeting' })).toBe('Yours');
  });
});

describe('style cards', () => {
  const own = [{ ...ACS_1996, name: 'Group meeting', bondLength: 20 }];

  it('lists the built-in styles by use, then yours, and finds the one in use', () => {
    const cards = styleCardList(own);
    expect(cards[cards.length - 1]).toMatchObject({ key: 'own:Group meeting', use: 'Yours' });
    expect(cardFor(cards, own[0])!.key).toBe('own:Group meeting');
    expect(cardFor(cards, { ...ACS_1996, name: 'Something else' })!.key).toBe('preset:ACS Document 1996');
    expect(cardName(cards.find((c) => c.style.name === 'Thieme (Synthesis, Synlett)')!)).toBe('Thieme');
  });

  it('draws the sample in the style: a ring, a side chain with OH and a wedge, and a number', () => {
    const d = sampleDoc(presetNamed('RSC')!.style);
    expect(d.atoms.size).toBe(9);
    expect([...d.bonds.values()].some((b) => b.display === 'wedge')).toBe(true);
    expect(d.style.name).toBe('RSC');
    const svg = styleThumb(presetNamed('RSC')!.style);
    if (svg) expect(svg).toMatch(/^<svg[^>]* width="[\d.]+" height="[\d.]+"/);
  });

  it('is a radio group: pointing at a card previews it, clicking picks it', () => {
    const onPick = vi.fn(), onHover = vi.fn(), onSave = vi.fn();
    const grid = styleCards({ own, chosen: 'preset:RSC', onPick, onHover, onSave });
    document.body.append(grid);
    const cards = [...grid.querySelectorAll<HTMLButtonElement>('.style-card[role=radio]')];
    expect(cards.length).toBe(STYLE_PRESETS.length + 1);
    expect(grid.querySelector('[aria-checked=true]')!.getAttribute('data-key')).toBe('preset:RSC');
    cards[2].dispatchEvent(new Event('pointerenter'));
    expect(onHover).toHaveBeenLastCalledWith(expect.objectContaining({ key: cards[2].dataset.key }));
    grid.dispatchEvent(new Event('pointerleave'));
    expect(onHover).toHaveBeenLastCalledWith(null);
    cards[3].click();
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ key: cards[3].dataset.key }));
    expect(cards[3].getAttribute('aria-checked')).toBe('true');
    grid.querySelector<HTMLButtonElement>('.sc-save')!.click();
    expect(onSave).toHaveBeenCalled();
    grid.remove();
  });

  it('sits inline on a ribbon, marking the style in use and previewing on hover', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const pick = vi.fn(), preview = vi.fn(), more = vi.fn();
    let current = presetNamed('Nature journals')!.style;
    const strip = ribbonStyles(host, { own: () => own, current: () => current, pick: (st) => { pick(st); current = st; }, preview, more });
    const cards = [...host.querySelectorAll<HTMLButtonElement>('.rbs-card')];
    expect(cards.length).toBe(STYLE_PRESETS.length + 1);
    expect(host.querySelector('[aria-checked=true] .sc-name')!.textContent).toBe('Nature journals');
    cards[0].dispatchEvent(new Event('pointerenter'));
    expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'ACS Document 1996' }));
    cards[0].click();
    expect(preview).toHaveBeenLastCalledWith(null);
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ name: 'ACS Document 1996' }));
    strip.refresh();
    expect(host.querySelector('[aria-checked=true] .sc-name')!.textContent).toBe('ACS Document 1996');
    host.querySelector<HTMLButtonElement>('.rbs-all')!.click();
    expect(more).toHaveBeenCalled();
    host.remove();
  });
});
