// Selecting part of a text box's text by dragging from where the caret is (issue #519). The hidden
// field that takes the keys sits at the caret, so it must let presses through to the drawing;
// only in touch mode, where it covers the text for the pencil, does it take them (and pass them on).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
const rule = (sel: string) => {
  const at = css.indexOf(`${sel} {`);
  expect(at).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
};

describe('the hidden text field of a text box being typed in', () => {
  it('lets a press at the caret reach the text', () => {
    expect(rule('.text-input')).toMatch(/pointer-events:\s*none/);
  });

  it('takes presses in touch mode, where it covers the text', () => {
    expect(rule('.text-input.scribble-pad')).toMatch(/pointer-events:\s*auto/);
  });
});
