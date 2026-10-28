// Document mode running in jsdom for tests: the app's page (index.html) with canvases that draw
// nothing, and a DocumentMode showing a document. Import this before anything from src/.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DocumentMode } from '../src/ui/doc-mode';
import type { DocFile } from '../src/document/doc-file';
import type { DocText } from '../src/document/document';

const noop = () => undefined;
const ctx: unknown = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? (s: string) => ({ width: s.length * 5, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 })
    : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) })
    : k === 'createLinearGradient' || k === 'createPattern' || k === 'createRadialGradient' ? () => ({ addColorStop: noop })
    : k === 'getTransform' ? () => new DOMMatrix()
    : noop),
  set: () => true,
});
(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx;
const g = globalThis as unknown as Record<string, unknown>;
g.requestAnimationFrame = () => 1;
g.cancelAnimationFrame = noop;
g.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

/** A DocumentMode showing a new document made from `t` (its runs, paragraphs and objects). */
export async function docMode(t: Partial<DocText>): Promise<{ dm: DocumentMode; f: DocFile; ta: HTMLTextAreaElement }> {
  const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
  document.body.innerHTML = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '');
  // innerHTML never runs scripts; take them out so none is left in the page either
  for (const el of document.body.querySelectorAll('script')) el.remove();
  const { DocumentMode } = await import('../src/ui/doc-mode');
  const { DocFile } = await import('../src/document/doc-file');
  const { newDocument } = await import('../src/document/document');
  // the app: nothing to do for the document's calls to it
  const host = new Proxy({}, { get: () => () => false }) as never;
  const dm = new DocumentMode(host);
  const f = new DocFile({ ...newDocument(), ...t } as DocText);
  dm.show({ id: 1, mode: 'document', name: 'Test', document: f, sheetState: null } as never);
  const ta = document.querySelector<HTMLTextAreaElement>('.doc-input')!;
  return { dm, f, ta };
}

/** Type text into the document as the keyboard does. */
export function type(ta: HTMLTextAreaElement, text: string): void {
  for (const ch of text) ta.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: ch, cancelable: true, bubbles: true }));
}

/** Press a key in the document. */
export function press(ta: HTMLTextAreaElement, key: string, mods: KeyboardEventInit = {}): void {
  ta.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...mods }));
}
