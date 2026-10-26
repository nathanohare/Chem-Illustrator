// @vitest-environment jsdom
//
// File > Import Structures from PDF reads the pages with only a progress line showing, so the person
// can open or switch to another tab meanwhile. The tab the import started in is kept (an empty new
// drawing is not replaced by the new tab), so Place can go back to it.

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { Workspace, type WorkspaceHooks } from '../src/workspace';

function workspace() {
  const hooks: WorkspaceHooks = {
    leave: () => {}, enter: () => {}, changed: () => {}, flash: () => {},
    pptx: { async picture() { return null; }, async svgToPng() { return new Uint8Array(4); } },
    measure: (t: string, s: number) => t.length * s * 0.5,
    sheets: { read: async () => { throw new Error('no'); }, write: async () => '' },
    documents: { read: async () => { throw new Error('no'); }, write: async () => new Uint8Array() },
  };
  return new Workspace(new Doc(), hooks);
}

describe('a tab kept while a command works', () => {
  it('an empty new drawing is replaced by New Sheet, as usual', () => {
    const ws = workspace();
    const start = ws.active;
    ws.newSheet();
    expect(ws.tabs.includes(start)).toBe(false);
  });

  it('the drawing a PDF import started in stays open when a new sheet is made meanwhile, and can be gone back to', () => {
    const ws = workspace();
    const start = ws.active;
    const release = ws.hold(start);
    const sheet = ws.newSheet();
    expect(ws.tabs.includes(start)).toBe(true);
    expect(ws.active).toBe(sheet);
    ws.activate(start);
    expect(ws.active).toBe(start);
    release();
    // held no longer: the untouched drawing is replaced again
    ws.newDocument();
    expect(ws.tabs.includes(start)).toBe(false);
  });
});
