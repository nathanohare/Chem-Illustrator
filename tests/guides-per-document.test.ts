// @vitest-environment jsdom
//
// Guides from the Guides toolbox belong to the drawing they were put on: another canvas, a
// presentation or a design doesn't show them, and moving one moves it in its own drawing only.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: async () => { throw new Error('no disk here'); } }));

import { Doc } from '../src/model';
import { DEFAULT_GUIDES, type CanvasGuides } from '../src/editor/guides';
import { newDocument } from '../src/document/document';
import { Workspace, type WorkspaceHooks } from '../src/workspace';
import { writeCdxml } from '../src/io/cdxml-write';

function workspace() {
  const hooks: WorkspaceHooks = {
    leave: () => {}, enter: () => {}, changed: () => {}, flash: () => {},
    pptx: { async picture() { return null; }, async svgToPng() { return new Uint8Array(4); } },
    measure: (t: string, s: number) => t.length * s * 0.5,
    sheets: { read: async () => { throw new Error('no'); }, write: async () => '' },
    documents: { read: async () => ({ doc: newDocument(), warnings: [] }), write: async () => new Uint8Array() },
  };
  const host = new Doc();
  return { ws: new Workspace(host, hooks), host };
}

const cross = (x: number, y: number): CanvasGuides => ({ ...DEFAULT_GUIDES, list: [{ kind: 'cross', x, y }] });

describe('guides belong to their own drawing', () => {
  it('stay with their canvas when another canvas, presentation or design shows', () => {
    const { ws, host } = workspace();
    const first = ws.active;
    host.guides = cross(100, 100);
    // (as the Guides toolbox does: the canvas has unsaved changes, so a new tab doesn't take its place)
    ws.noteKeptChange();
    expect(first.dirty).toBe(true);
    ws.newDrawing();
    expect(host.guides).toBeNull();
    ws.newSlides();
    expect(host.guides).toBeNull();
    ws.newDesign({ w: 960, h: 540 } as never);
    expect(host.guides).toBeNull();
    expect(ws.tabs).toContain(first);
    ws.activate(first);
    expect(host.guides?.list).toEqual([{ kind: 'cross', x: 100, y: 100 }]);
  });

  it('move only in the canvas they are moved in', () => {
    const { ws, host } = workspace();
    const first = ws.active;
    host.guides = cross(100, 100);
    const second = ws.newDrawing();
    host.guides = cross(50, 50);
    // moved in the second canvas (the editor replaces the guides when one is dragged)
    host.guides = { ...host.guides, list: [{ kind: 'cross', x: 80, y: 60 }] };
    ws.activate(first);
    expect(host.guides?.list).toEqual([{ kind: 'cross', x: 100, y: 100 }]);
    ws.activate(second);
    expect(host.guides?.list).toEqual([{ kind: 'cross', x: 80, y: 60 }]);
  });

  it('come with a file opened into its own tab, and stay out of the others', async () => {
    const { ws, host } = workspace();
    const saved = new Doc();
    saved.bulk(() => { saved.addAtom(0, 0); });
    saved.guides = cross(144, 72);
    const text = writeCdxml(saved, { name: 'guides.cdxml', textMeasure: (t: string, s: number) => t.length * s * 0.5 });
    const first = ws.active;
    host.bulk(() => { host.addAtom(10, 10); });
    expect(await ws.openBytes(new TextEncoder().encode(text), 'guides.cdxml')).toBe(true);
    expect(host.guides?.list).toEqual([{ kind: 'cross', x: 144, y: 72 }]);
    ws.activate(first);
    expect(host.guides).toBeNull();
  });

  it('are copied when a whole drawing is loaded', () => {
    const a = new Doc(), b = new Doc();
    b.guides = cross(10, 20);
    a.loadFrom(b);
    expect(a.guides).toEqual(b.guides);
    a.guides!.list[0].x = 99;
    expect(b.guides!.list[0].x).toBe(10);
  });
});
