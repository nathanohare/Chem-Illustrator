// @vitest-environment jsdom
//
// File > Print in the Windows app: the printer, copies and pages are asked by the app, which
// then prints at the pages' own size and orientation (WebView2's print settings), or falls back
// to the system's Print window where WebView2 can't.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: [string, unknown][] = [];
let printResult: () => Promise<unknown> = async () => undefined;
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: (cmd: string, args?: unknown) => {
    calls.push([cmd, args]);
    if (cmd === 'printers') return Promise.resolve({ names: ['Office laser', 'Microsoft Print to PDF'], default: 'Microsoft Print to PDF' });
    return printResult();
  },
}));
const answers: Record<string, string>[] = [];
vi.mock('../src/ui/ask', () => ({ ask: vi.fn(async (_t: string, fields: { name: string; value: string }[]) => ({ ...Object.fromEntries(fields.map((f) => [f.name, f.value])), ...answers.shift() })) }));
vi.mock('../src/io/files', () => ({ showError: vi.fn(async () => {}) }));

const { printPages } = await import('../src/ui/print');
const { ask } = await import('../src/ui/ask');

const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('printing in the Windows app', () => {
  beforeEach(() => {
    calls.length = 0;
    printResult = async () => undefined;
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/130', configurable: true });
    window.print = vi.fn();
  });

  it('prints a landscape page at its own size, to the printer and pages picked', async () => {
    answers.push({ printer: 'Office laser', copies: '2', pages: '1-2, 3' });
    printPages({ pages: ['<svg/>', '<svg/>', '<svg/>'], w: 792, h: 612 });
    await settle();
    const fields = vi.mocked(ask).mock.calls.at(-1)![1];
    expect(fields.find((f) => f.name === 'printer')!.value).toBe('Microsoft Print to PDF');
    expect(calls.at(-1)).toEqual(['print_page', { printer: 'Office laser', w: 792, h: 612, copies: 2, pages: '1-2,3' }]);
    expect(window.print).not.toHaveBeenCalled();
    expect(document.getElementById('print-root')).toBeNull();
  });

  it("uses the system's Print window where WebView2 has no print settings", async () => {
    printResult = async () => { throw 'unsupported: no ICoreWebView2_16'; };
    printPages({ pages: ['<svg/>'], w: 720, h: 405 });
    await settle();
    await new Promise((r) => requestAnimationFrame(r));
    expect(window.print).toHaveBeenCalled();
  });
});
