// @vitest-environment jsdom
// The status bar's word count in a document: counted again only when the text changes, once the
// typing stops, not on every key press or caret move (in a long document a count takes ~11 ms).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { docMode, type, press } from './doc-mode-harness';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Word count in the status bar', () => {
  it('is not counted on caret moves or on each key, and is up to date once the typing stops', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const { ta } = await docMode({ runs: [{ text: 'Hello world here' }], paras: [{}] });
    const status = () => document.querySelector('#doc-status')!.textContent ?? '';
    expect(status()).toContain('3 words');
    // the count splits the whole text at spaces
    let counts = 0;
    const split = String.prototype.split;
    vi.spyOn(String.prototype, 'split').mockImplementation(function (this: string, sep: unknown, limit?: number) {
      if (sep instanceof RegExp && sep.source.startsWith('[\\s')) counts++;
      return split.call(this, sep as string, limit);
    } as typeof String.prototype.split);
    for (let k = 0; k < 5; k++) press(ta, 'ArrowLeft');
    expect(counts).toBe(0);
    press(ta, 'End');
    type(ta, ' and more');
    expect(counts).toBe(0);
    vi.advanceTimersByTime(400);
    expect(counts).toBe(1);
    expect(status()).toContain('5 words');
  }, 60000);
});
