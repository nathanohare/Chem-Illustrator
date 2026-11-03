// @vitest-environment jsdom
// Review 2026-11-03 (windows and AI Assistant), the low findings and Nate's answers: proved here, kept once fixed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAiPrefs } from '../src/ai/link';
import { cappedText, TEXT_CAP } from '../src/ai/assistant';
import { Viewer3d } from '../src/ui/viewer3d';
import type { Model3d } from '../src/chem/model3d-build';

describe('the Assistant and a whole document (Nate: off unless chosen in Settings)', () => {
  it('is off until chosen, and the choice is kept', () => {
    expect(parseAiPrefs({ provider: 'openai' }).sendDocument).toBeUndefined();
    expect(parseAiPrefs({ provider: 'openai', sendDocument: true }).sendDocument).toBe(true);
    expect(parseAiPrefs({ provider: 'openai', sendDocument: 'yes' }).sendDocument).toBeUndefined();
  });

  it('sends at most a capped amount of text, and says so', () => {
    const long = 'word '.repeat(30_000);
    const got = cappedText('the whole document\'s text', long, TEXT_CAP.document);
    expect(got.text).toHaveLength(TEXT_CAP.document);
    expect(got.label).toBe('the whole document\'s text (the first 100,000 characters)');
    expect(cappedText('the selected text', 'short', TEXT_CAP.selection)).toEqual({ label: 'the selected text', text: 'short' });
  });
});

describe('the 3-D Model window\'s method help', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('is behind an "i" by the switch, not a line of its own', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    if (!HTMLDialogElement.prototype.show) HTMLDialogElement.prototype.show = function () { this.open = true; };
    const m: Model3d = { atoms: [{ z: 8, charge: 0 }, { z: 1, charge: 0 }], bonds: [{ a: 0, b: 1, order: 1, aromatic: false }], conformers: [{ xyz: [0, 0, 0, 1, 0, 0], energy: 0 }] };
    const v = new Viewer3d(() => {});
    v.show(m, 'Water-ish', () => {});
    const el = (v as unknown as { box: { el: HTMLElement } }).box.el;
    const note = el.querySelector<HTMLElement>('.v3d-note')!;
    expect(note.hidden).toBe(true);
    expect(note.textContent).not.toMatch(/MMFF94s\+ force field/);
    const i = el.querySelector<HTMLElement>('.info-icon')!;
    expect(i.dataset.tip).toMatch(/^Quick: about a dozen likely shapes/);
    const w = v as unknown as { tier: string; showTier(): void };
    w.tier = 'search';
    w.showTier();
    expect(i.dataset.tip).toMatch(/^Full Search/);
  });
});
