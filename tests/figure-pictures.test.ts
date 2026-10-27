// @vitest-environment jsdom
// A document's figures are recorded once; when the icons arrive (a .docx with icons opened before
// they had loaded drew them empty and too small, laptop bench) they are recorded again.

import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/sheet/structure-doc', () => ({ structureDoc: (c: unknown) => ({ c }) }));
let w = 0;
vi.mock('../src/render/picture', () => ({
  recordPicture: () => (w ? { box: { x1: 0, y1: 0, x2: w, y2: w }, items: [] } : null),
  pictureCanvas: () => ({ canvas: document.createElement('canvas') }),
}));

import { FigurePictures } from '../src/document/figures';
import { newDocument } from '../src/document/document';

describe('FigurePictures', () => {
  it('records each drawing once, and again after forget()', () => {
    const f = new FigurePictures();
    const contents = { atoms: [], bonds: [], captions: [], arrows: [], shapes: [] };
    const style = newDocument().drawingStyle;
    // nothing to draw yet (the icon's outline isn't loaded): the size of an empty drawing
    expect(f.size(contents, style)).toEqual({ w: 24, h: 24 });
    w = 60;
    expect(f.size(contents, style)).toEqual({ w: 24, h: 24 });
    f.forget();
    expect(f.size(contents, style)).toEqual({ w: 60, h: 60 });
  });
});
