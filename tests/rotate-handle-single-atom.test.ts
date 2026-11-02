// @vitest-environment jsdom
//
// The handle that turns a selection isn't shown for one atom on its own: turning an atom round
// itself does nothing (its label stays level).

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { Editor } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';

window.requestAnimationFrame = () => 0;

function editor(doc: Doc): Editor {
  const scene = document.createElement('canvas');
  const overlay = document.createElement('canvas');
  const host = document.createElement('div');
  host.append(scene, overlay);
  document.body.append(host);
  const ed = new Editor(doc, new Renderer(scene, overlay), host);
  ed.paused = true;
  return ed;
}

describe('the rotate handle', () => {
  const build = () => {
    const doc = new Doc();
    const ids: number[] = [];
    doc.edit('Build', () => {
      const a = doc.addAtom(100, 100), b = doc.addAtom(114, 108), c = doc.addAtom(128, 100);
      doc.addBond(a.id, b.id); doc.addBond(b.id, c.id);
      ids.push(a.id, b.id, c.id);
    });
    const ed = editor(doc);
    ed.setTool('select');
    return { doc, ed, ids };
  };

  it('is not shown with a single atom selected', () => {
    const { ed, ids } = build();
    ed.sel.atoms.add(ids[1]);
    expect(ed.rotateHandle()).toBeNull();
  });

  it('is shown for a bond, or two or more atoms', () => {
    const { doc, ed, ids } = build();
    ed.sel.atoms.add(ids[0]); ed.sel.atoms.add(ids[1]);
    ed.sel.bonds.add([...doc.bonds.keys()][0]);
    expect(ed.rotateHandle()).not.toBeNull();
  });
});
