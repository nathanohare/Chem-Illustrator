// @vitest-environment jsdom
//
// Right-clicking an atom or bond picks just that atom or bond, not its whole structure (#327),
// and the colour menu closes cleanly when closing it sets off its own colour box's change (#326).

import { describe, it, expect, vi } from 'vitest';
import { Doc } from '../src/model';
import { Editor } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';
import { colourButton } from '../src/ui/colour-picker';

window.requestAnimationFrame = () => 0;

function setup() {
  const doc = new Doc();
  const ids: number[] = [];
  doc.edit('Chain', () => {
    for (let i = 0; i < 4; i++) ids.push(doc.addAtom(100 + 30 * i, 100 + (i % 2) * 15).id);
    for (let i = 0; i < 3; i++) doc.addBond(ids[i], ids[i + 1]);
  });
  const scene = document.createElement('canvas'), overlay = document.createElement('canvas');
  const host = document.createElement('div');
  host.append(scene, overlay);
  document.body.append(host);
  const renderer = new Renderer(scene, overlay);
  const ed = new Editor(doc, renderer, host);
  ed.paused = true;
  const at = (p: { x: number; y: number }) => {
    const s = renderer.toScreen(p);
    return new MouseEvent('contextmenu', { clientX: s.x, clientY: s.y, button: 2 });
  };
  return { doc, ed, ids, at };
}

describe('right-click on a structure', () => {
  it('picks only the atom under the pointer', () => {
    const { doc, ed, ids, at } = setup();
    const h = ed.contextPick(at(doc.atoms.get(ids[1])!));
    expect(h).toEqual({ kind: 'atom', id: ids[1] });
    expect([...ed.sel.atoms]).toEqual([ids[1]]);
    expect(ed.sel.bonds.size).toBe(0);
  });

  it('picks only the bond under the pointer', () => {
    const { doc, ed, ids, at } = setup();
    const a = doc.atoms.get(ids[1])!, b = doc.atoms.get(ids[2])!;
    const h = ed.contextPick(at({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
    expect(h?.kind).toBe('bond');
    expect(ed.sel.bonds.size).toBe(1);
    expect(ed.sel.atoms.size).toBeLessThan(ids.length);
  });

  it('keeps a selection the atom is already part of', () => {
    const { doc, ed, ids, at } = setup();
    ed.selectAll();
    ed.contextPick(at(doc.atoms.get(ids[1])!));
    expect(ed.sel.atoms.size).toBe(ids.length);
  });
});

describe('the colour menu', () => {
  it('closes once, and still takes the colour, when closing it fires its colour box', () => {
    const doc = new Doc();
    const on = vi.fn();
    const btn = colourButton(doc, '#ff0000', on);
    document.body.append(btn);
    btn.click();
    const pop = document.querySelector<HTMLElement>('.colour-pop')!;
    const box = pop.querySelector<HTMLInputElement>('input[type=color]')!;
    box.value = '#00ff00';
    // as in WebView2: taking the menu out blurs its colour box, which sends the colour chosen
    const realRemove = pop.remove.bind(pop);
    const remove = vi.fn(() => { box.dispatchEvent(new Event('change')); realRemove(); });
    pop.remove = remove;
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith('#00ff00');
    expect(document.querySelector('.colour-pop')).toBeNull();
  });
});
