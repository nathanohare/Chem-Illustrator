// @vitest-environment jsdom
//
// Repeat Label on the right-click menu: the label last typed in an atom's label box (NHAc) goes on
// another atom, or on every atom asked for, in one undoable step.

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { Editor } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';
import { COMMAND_NAMES } from '../src/editor/keymap';

window.requestAnimationFrame = () => 0;
// (jsdom has no canvas: one that draws nothing and measures every character 5 units wide)
const noop = () => undefined;
const ctx: unknown = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? (s: string) => ({ width: s.length * 5, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
    : k === 'getTransform' ? () => new DOMMatrix()
    : k === 'createLinearGradient' || k === 'createPattern' || k === 'createRadialGradient' ? () => ({ addColorStop: noop })
    : noop),
  set: () => true,
});
(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx;

function editorWith(doc: Doc): Editor {
  const scene = document.createElement('canvas'), overlay = document.createElement('canvas');
  const host = document.createElement('div');
  host.append(scene, overlay);
  document.body.append(host);
  const ed = new Editor(doc, new Renderer(scene, overlay), host);
  ed.paused = true;
  return ed;
}

/** A chain of four carbons. */
function butane(doc: Doc): number[] {
  let ids: number[] = [];
  doc.edit('Chain', () => {
    ids = [0, 1, 2, 3].map((i) => doc.addAtom(100 + 13 * i, 100 + (i % 2) * 7.5).id);
    for (let i = 0; i < 3; i++) doc.addBond(ids[i], ids[i + 1], 1);
  });
  return ids;
}

/** Type a label in the atom's label box and press Enter, as a person would. */
function typeLabel(ed: Editor, id: number, text: string): void {
  ed.editLabel(id);
  const box = document.querySelector<HTMLElement>('.label-input')!;
  box.textContent = text;
  box.dispatchEvent(new Event('input'));
  box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

describe('Repeat Label', () => {
  it('remembers the label typed, and puts it on another atom', () => {
    const doc = new Doc();
    const ed = editorWith(doc);
    const [a, , , d] = butane(doc);
    expect(ed.lastLabel).toBeNull();
    expect(ed.repeatLabel([d])).toBe(false);
    typeLabel(ed, a, 'NHAc');
    expect(doc.atoms.get(a)!.label).toBe('NHAc');
    expect(ed.lastLabel?.text).toBe('NHAc');
    expect(ed.repeatLabel([d])).toBe(true);
    expect(doc.atoms.get(d)!.label).toBe('NHAc');
    expect(doc.atoms.get(d)!.z).toBe(7);
  });

  it('labels several atoms in one step that one undo takes back', () => {
    const doc = new Doc();
    const ed = editorWith(doc);
    const [a, b, c, d] = butane(doc);
    typeLabel(ed, a, 'OTBS');
    ed.repeatLabel([b, c, d, 999]);
    expect([b, c, d].map((id) => doc.atoms.get(id)!.label)).toEqual(['OTBS', 'OTBS', 'OTBS']);
    doc.undo();
    expect([b, c, d].map((id) => doc.atoms.get(id)!.label)).toEqual([null, null, null]);
    expect(doc.atoms.get(a)!.label).toBe('OTBS');
  });

  it('an element symbol typed repeats as that element', () => {
    const doc = new Doc();
    const ed = editorWith(doc);
    const [a, , , d] = butane(doc);
    typeLabel(ed, a, 'Cl');
    ed.repeatLabel([d]);
    expect(doc.atoms.get(d)!.label).toBeNull();
    expect(doc.atoms.get(d)!.z).toBe(17);
  });

  it('clearing a label does not replace the label to repeat', () => {
    const doc = new Doc();
    const ed = editorWith(doc);
    const [a, b] = butane(doc);
    typeLabel(ed, a, 'CO2Me');
    typeLabel(ed, b, 'OMe');
    typeLabel(ed, b, '');
    expect(ed.lastLabel?.text).toBe('OMe');
  });

  it('can be given a key', () => {
    expect(COMMAND_NAMES['repeat-label']).toBe('Repeat Last Label');
  });
});
