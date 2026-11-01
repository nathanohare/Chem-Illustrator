// @vitest-environment jsdom
//
// Fill Rings sends you to the Style panel for the colour (issue #289). On slides the side panel
// starts folded, so the app opens it when rings were filled; these check the editor's message is
// read right, and that the right-click menu's Show Style Panel has a name.

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { Editor, ringsFilledMessage, ringsWereFilled } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';
import { COMMAND_NAMES } from '../src/editor/keymap';

window.requestAnimationFrame = () => 0;

function editorWith(doc: Doc): Editor {
  const scene = document.createElement('canvas'), overlay = document.createElement('canvas');
  const host = document.createElement('div');
  host.append(scene, overlay);
  document.body.append(host);
  const ed = new Editor(doc, new Renderer(scene, overlay), host);
  ed.paused = true;
  return ed;
}

function benzene(doc: Doc): void {
  doc.edit('Ring', () => {
    const ids = Array.from({ length: 6 }, (_, i) => doc.addAtom(100 + 14 * Math.cos((i * Math.PI) / 3), 100 + 14 * Math.sin((i * Math.PI) / 3)).id);
    for (let i = 0; i < 6; i++) doc.addBond(ids[i], ids[(i + 1) % 6], i % 2 ? 2 : 1);
  });
}

describe('Fill Rings and the Style panel', () => {
  it('reads a fill as a fill, and nothing to fill as nothing', () => {
    expect(ringsWereFilled(ringsFilledMessage(1))).toBe(true);
    expect(ringsWereFilled(ringsFilledMessage(3))).toBe(true);
    expect(ringsWereFilled('No rings in the selection.')).toBe(false);
    expect(ringsWereFilled('Select the rings to fill (or the whole structure) first.')).toBe(false);
  });

  it('a filled ring is selected, and the message says so', () => {
    const doc = new Doc();
    benzene(doc);
    const ed = editorWith(doc);
    ed.selectAll();
    const msg = ed.fillRings();
    expect(ringsWereFilled(msg)).toBe(true);
    expect([...ed.sel.shapes].map((id) => doc.shapes.get(id)?.kind)).toEqual(['ring']);
  });

  it('with nothing selected it does not claim a fill', () => {
    const doc = new Doc();
    benzene(doc);
    const ed = editorWith(doc);
    expect(ringsWereFilled(ed.fillRings())).toBe(false);
  });

  it('the right-click menu item has a name', () => {
    expect(COMMAND_NAMES['show-style']).toBe('Show Style Panel');
  });
});
