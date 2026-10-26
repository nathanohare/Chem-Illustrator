// @vitest-environment jsdom
//
// The desktop app's first Import Structures downloads the structure reader (about 140 MB). If the
// download stalls, the "Downloading…" window can be closed with Cancel or Esc, which stops it.

import { describe, it, expect, vi, beforeAll } from 'vitest';

const cancelPack = vi.fn(async () => {});
let failDownload: (e: Error) => void = () => {};
vi.mock('../src/recognise/reader', () => ({
  canReadHere: true,
  PACK_MB: 140,
  packReady: async () => false,
  // a download that stalls: it ends only when cancelled
  downloadPack: () => new Promise<void>((_ok, fail) => { failDownload = fail; }),
  cancelPack: () => { cancelPack(); failDownload(new Error('Cancelled.')); return Promise.resolve(); },
  localReader: { read: async () => { throw new Error('no'); } },
  readWithAi: async () => { throw new Error('no'); },
}));
const asked: string[] = [];
vi.mock('../src/ui/ask', () => ({ ask: async (_t: string, _f: unknown, o: { note?: string }) => { asked.push(o.note ?? ''); return {}; } }));
vi.mock('../src/ai/link', () => ({ aiReady: async () => false, aiName: () => 'AI' }));

import { importPictures, type ImportHost } from '../src/ui/import-structures';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement;
  proto.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  proto.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});

const host = {
  style: () => ({}), chem: { ready: true }, ai: () => ({}), flash: () => {}, place: () => {},
} as unknown as ImportHost;
const found = [{ where: 'ring.png', pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) } }];
const opts = { title: 'Import Structures from Picture', note: '', tickDoubtful: true, photo: true };
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('the structure reader download window', () => {
  for (const how of ['Cancel', 'Esc'] as const) {
    it(`can be closed with ${how}, which stops the download`, async () => {
      cancelPack.mockClear();
      asked.length = 0;
      const done = importPictures(host, found, opts);
      await tick();
      const d = document.querySelector('dialog')!;
      expect(d.textContent).toMatch(/Downloading the structure reader/);
      if (how === 'Cancel') {
        const button = [...d.querySelectorAll('button')].find((b) => b.textContent === 'Cancel');
        expect(button, 'no Cancel button').toBeDefined();
        button!.click();
      } else d.dispatchEvent(new Event('cancel', { cancelable: true }));
      let over = false;
      void done.then(() => { over = true; });
      await tick();
      await tick();
      expect(cancelPack).toHaveBeenCalledOnce();
      expect(over, 'still waiting for the download').toBe(true);
      expect(document.querySelector('dialog')).toBeNull();
      // cancelled on purpose: no "could not be downloaded" message
      expect(asked.filter((n) => /could not be downloaded/.test(n))).toEqual([]);
    });
  }
});
