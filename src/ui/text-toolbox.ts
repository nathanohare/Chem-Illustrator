// The Text Formatting toolbox (View > Toolboxes): the same bar that shows above text while it is
// typed (src/ui/text-bar.ts), so the two always match. It docks at any edge or floats like the
// other toolboxes, and works on the text being typed (its selection), or on the whole of each
// picked caption or text box, or in a document, as the ribbon's buttons do.

import { buildTextBar, type TextBarState } from './text-bar';
import type { TextFormat } from '../text/format';

export interface TextToolboxHooks {
  /** Make the change; false when there is no text to change. */
  format(f: TextFormat): boolean;
  /** Type a character where the caret is (or start a caption with it); false when it can't go anywhere. */
  type(ch: string): boolean;
  /** Add, change or take off a link (Insert > Link). */
  link(): void;
  /** How the text the buttons would change looks now, for showing which are on (null: no text). */
  look(): TextBarState | null;
  /** The keyboard back to the text being typed, if any. */
  back(): void;
  /** A short message in the status bar. */
  say(text: string): void;
}

/** The toolbox's contents, built into `body`. `vertical`: docked at a side, so it is narrow. */
export function buildTextToolbox(body: HTMLElement, vertical: boolean, h: TextToolboxHooks): { refresh(): void } {
  body.classList.add('tt-box');
  body.classList.toggle('tt-vertical', vertical);
  body.setAttribute('role', 'toolbar');
  body.setAttribute('aria-label', 'Text formatting');
  // a click here keeps the text being typed open (the caption editor ends on a click anywhere else)
  body.dataset.keepsTyping = '';
  const bar = buildTextBar(body, {
    format: (f) => h.format(f),
    type: (ch) => h.type(ch),
    link: () => h.link(),
    state: () => h.look(),
    back: () => h.back(),
    nothing: () => h.say('Click into some text, or pick a caption or text box, first.'),
  });
  return { refresh: bar.refresh };
}
