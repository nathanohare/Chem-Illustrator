// @vitest-environment jsdom
// The caret's blink in a document paints the pages again only when there is a caret to blink:
// not with text selected, not with the typing field unfocused, and not in Read Mode.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { docMode, press } from './doc-mode-harness';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Caret blink', () => {
  it('repaints only while a caret can show', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const { dm, ta } = await docMode({ runs: [{ text: 'Hello world here' }], paras: [{}] });
    ta.focus();
    let paints = 0;
    const redraw = dm.redraw.bind(dm);
    vi.spyOn(dm, 'redraw').mockImplementation(() => { paints++; redraw(); });
    const paintsIn = (ms: number) => { paints = 0; vi.advanceTimersByTime(ms); return paints; };

    // a caret: it blinks (one paint each 530 ms)
    expect(paintsIn(5300)).toBe(10);
    // text selected: one paint at most (to take the caret off), then none
    press(ta, 'End');
    press(ta, 'ArrowLeft', { shiftKey: true });
    expect(dm.file!.ed.collapsed).toBe(false);
    paintsIn(600);
    expect(paintsIn(5300)).toBe(0);
    // caret again, then the typing field loses focus
    press(ta, 'ArrowRight');
    expect(paintsIn(5300)).toBe(10);
    ta.blur();
    paintsIn(600);
    expect(paintsIn(5300)).toBe(0);
    // Read Mode
    ta.focus();
    dm.run('view-read');
    ta.focus();
    paintsIn(600);
    expect(paintsIn(5300)).toBe(0);
  }, 60000);
});
