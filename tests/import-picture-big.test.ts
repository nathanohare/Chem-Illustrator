// @vitest-environment jsdom
//
// Import Structures from Picture with a big scan (A4 at 1200 dpi): the browser is asked to decode
// it already shrunk to 2,000 pixels, so the full-size picture is never drawn on the page's thread.

import { afterEach, describe, it, expect, vi } from 'vitest';
import { decodePicture } from '../src/ui/import-structures';

/** The first bytes of a PNG of w × h pixels (enough to know its size). */
function pngHead(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function decoder(w: number, h: number) {
  const asked: (ImageBitmapOptions | undefined)[] = [];
  vi.stubGlobal('createImageBitmap', vi.fn(async (_b: Blob, o?: ImageBitmapOptions) => {
    asked.push(o);
    const k = o?.resizeWidth ? o.resizeWidth / w : o?.resizeHeight ? o.resizeHeight / h : 1;
    return { width: Math.round(w * k), height: Math.round(h * k), close() {} };
  }));
  // jsdom has no canvas: one that gives back white pixels of the size asked
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return { fillRect() {}, drawImage() {}, getImageData: (_x: number, _y: number, cw: number, ch: number) => ({ width: cw, height: ch, data: new Uint8ClampedArray(cw * ch * 4).fill(255) }) } as never;
  } as never);
  return asked;
}

describe('a big picture', () => {
  it('is decoded already shrunk to 2,000 pixels on its longer side', async () => {
    const asked = decoder(9900, 14000);
    const px = await decodePicture(pngHead(9900, 14000), 'image/png');
    expect(asked[0]).toMatchObject({ resizeHeight: 2000 });
    expect(px).toMatchObject({ width: 1414, height: 2000 });
  });

  it('a small one is decoded as it is', async () => {
    const asked = decoder(800, 600);
    const px = await decodePicture(pngHead(800, 600), 'image/png');
    expect(asked[0]?.resizeWidth).toBeUndefined();
    expect(asked[0]?.resizeHeight).toBeUndefined();
    expect(px).toMatchObject({ width: 800, height: 600 });
  });
});
