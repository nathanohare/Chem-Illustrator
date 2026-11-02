// @vitest-environment jsdom
//
// Settings ▸ Preferences ▸ "Enter finishes typing a text box": with it on, Enter ends the typing
// and Alt+Enter (Option+Enter on a Mac) starts a new paragraph; with it off (the default) Enter
// starts a new paragraph and Esc ends the typing, as in ChemDraw.

import { describe, expect, it } from 'vitest';
import { CaptionEditor, keyHint, type CaptionResult, type EditorHost } from '../src/ui/caption-editor';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings';

function open(enterFinishes: boolean) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const h: EditorHost = {
    host,
    view: { scale: 1 },
    toScreen: (p) => p,
    measure: (t, size) => t.length * size * 0.5,
    defaultSize: 10,
    redraw: () => {},
    enterFinishes: () => enterFinishes,
  };
  let result: CaptionResult | null = null;
  const ed = new CaptionEditor(h, { x: 0, y: 0 }, { runs: [{ text: 'ab' }] }, {}, (r) => { result = r; });
  const ta = host.querySelector('textarea')!;
  const key = (o: KeyboardEventInit) => ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...o }));
  const hint = () => host.querySelector('.cb-hint')!.textContent;
  return { ed, key, hint, result: () => result };
}

describe('Enter finishes typing a text box', () => {
  it('is off unless chosen, and is kept in the settings file', () => {
    expect(DEFAULT_SETTINGS.enterFinishesText).toBe(false);
    expect(parseSettings('{}').enterFinishesText).toBe(false);
    expect(parseSettings(JSON.stringify({ enterFinishesText: true })).enterFinishesText).toBe(true);
  });

  it('off: Enter starts a new paragraph and the text stays open', () => {
    const t = open(false);
    t.key({});
    expect(t.ed.isOpen).toBe(true);
    expect(t.ed.ed.text.split('\n').length).toBe(2);
    expect(t.hint()).toBe('Enter: new paragraph · Tab: indent · Esc: done');
    t.key({ key: 'Escape' });
    expect(t.ed.isOpen).toBe(false);
  });

  it('on: Enter finishes, Alt+Enter and Shift+Enter still break the line', () => {
    const t = open(true);
    t.key({ altKey: true });
    t.key({ shiftKey: true });
    expect(t.ed.isOpen).toBe(true);
    expect(t.ed.ed.text.split('\n').length).toBe(3);
    t.key({});
    expect(t.ed.isOpen).toBe(false);
    expect(t.result()).not.toBeNull();
  });

  it('on: the bar says which keys do what', () => {
    expect(keyHint('Enter: new paragraph · Tab: indent · Esc: done', true, false)).toBe('Alt+Enter: new paragraph · Tab: indent · Enter: done');
    expect(keyHint('Enter: new line · Esc: done', true, true)).toBe('Option+Enter: new line · Enter: done');
    expect(keyHint('Tab: next cell · Shift+Tab: back · Enter: new line · Esc: done', true, false)).toBe('Tab: next cell · Shift+Tab: back · Alt+Enter: new line · Enter: done');
    expect(open(true).hint()).toBe('Alt+Enter: new paragraph · Tab: indent · Enter: done');
  });
});
