// @vitest-environment jsdom
//
// Import Structures from Picture with a damaged picture file: the message left on screen names the
// file, rather than "No pictures to read." said straight after it.

import { describe, it, expect, vi } from 'vitest';
import { importPictureFiles, type ImportHost } from '../src/ui/import-structures';

describe('a damaged picture file', () => {
  it('is named in the message left on screen', async () => {
    // a PNG cut off after its first bytes
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new DOMException('The source image could not be decoded.', 'InvalidStateError'); }));
    const said: string[] = [];
    const host = { style: () => ({}), chem: { ready: true }, ai: () => ({ provider: 'none', model: '', base: '' }), flash: (m: string) => said.push(m), place: () => {} } as unknown as ImportHost;
    await importPictureFiles(host, [{ name: 'scan-of-notebook.png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), mime: 'image/png' }]);
    expect(said.at(-1)).toBe("scan-of-notebook.png can't be read as a picture.");
    expect(document.querySelector('dialog')).toBeNull();
    vi.unstubAllGlobals();
  });
});
