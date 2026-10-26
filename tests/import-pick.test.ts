// @vitest-environment jsdom
//
// File > Import Structures from PDF: the drawings are found on this computer, shown outlined on
// their pages, and only the ones the person leaves ticked are read (sent to the AI model, when
// that is the reader chosen).

import { describe, it, expect, vi, beforeAll } from 'vitest';

const sent: number[] = [];
vi.mock('../src/recognise/reader', () => ({
  canReadHere: false,
  PACK_MB: 140,
  packReady: async () => false,
  downloadPack: async () => {},
  cancelPack: async () => {},
  localReader: { read: async () => { throw new Error('not here'); } },
  readWithAi: async () => ({ kind: 'smiles', smiles: 'C1CCCCC1', note: '', ms: 0 }),
}));
vi.mock('../src/ai/link', () => ({ aiReady: async () => true, aiName: () => 'Claude (Anthropic)' }));
vi.mock('../src/ui/import-review', () => ({
  pixelsPng: () => '',
  openReview: (o: { found: { pixels: { width: number } }[] }) => { for (const f of o.found) sent.push(f.pixels.width); },
}));

import { importPdfDrawings, type ImportHost } from '../src/ui/import-structures';
import { pickDrawings } from '../src/ui/import-pick';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement;
  proto.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  proto.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});

const pic = (width: number, page: number, x: number) => ({
  where: `Page ${page}, ${width}`, page, box: { x, y: 100, w: 200, h: 150 },
  pixels: { width, height: 1, data: new Uint8ClampedArray(width * 4) },
});
const found = [pic(1, 1, 50), pic(2, 1, 400), pic(3, 2, 50)];
const pages = [1, 2].map((n) => ({ n, url: 'data:image/jpeg;base64,', width: 1000, height: 1300 }));
const tick = () => new Promise((r) => setTimeout(r, 0));
const host = { style: () => ({}), chem: { ready: true }, ai: () => ({}), flash: () => {}, place: () => {} } as unknown as ImportHost;
const button = (d: Element, text: RegExp) => [...d.querySelectorAll('button')].find((b) => text.test(b.textContent ?? ''))!;

describe('picking the drawings to read', () => {
  it('outlines each drawing on its page, all ticked to start', async () => {
    const done = pickDrawings({ title: 'T', note: '', pages, found, readers: [{ value: 'ai', label: 'AI' }] });
    const d = document.querySelector('dialog.import-pick')!;
    const marks = d.querySelectorAll<HTMLButtonElement>('.import-mark');
    expect(marks.length).toBe(3);
    expect(d.querySelectorAll('.import-page').length).toBe(2);
    expect(marks[1].style.left).toBe('40%');
    expect([...marks].every((m) => m.classList.contains('on'))).toBe(true);
    expect(button(d, /^Read /).textContent).toBe('Read 3 Structures');
    button(d, /Tick None/).click();
    expect(button(d, /^Read /).disabled).toBe(true);
    marks[2].click();
    button(d, /^Read /).click();
    const r = await done;
    expect(r?.chosen.map((f) => f.pixels.width)).toEqual([3]);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('sends only the ticked drawings to the AI model', async () => {
    sent.length = 0;
    const done = importPdfDrawings(host, found, pages, { file: 'paper.pdf', title: 'T', note: '', tickDoubtful: false, photo: false });
    await tick();
    const d = document.querySelector('dialog.import-pick')!;
    expect(d.textContent).toMatch(/Only the ticked ones are sent to the AI model/);
    d.querySelectorAll<HTMLButtonElement>('.import-mark')[0].click();
    button(d, /^Read /).click();
    await done;
    expect(sent).toEqual([2, 3]);
  });

  it('reads nothing when cancelled', async () => {
    sent.length = 0;
    const done = importPdfDrawings(host, found, pages, { file: 'paper.pdf', title: 'T', note: '', tickDoubtful: false, photo: false });
    await tick();
    button(document.querySelector('dialog.import-pick')!, /^Cancel$/).click();
    await done;
    expect(sent).toEqual([]);
  });
});
