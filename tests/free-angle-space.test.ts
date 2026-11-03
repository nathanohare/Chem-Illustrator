// @vitest-environment jsdom
// Space frees a bond's angle while held. Let go while typing in a box, it must not stay "held"
// (every bond after that would draw at free angles).
import { it, expect } from 'vitest';
import { Doc } from '../src/model';
import { Editor } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';

window.requestAnimationFrame = () => 0;

it('lets go of Space when it is let go in a text box', () => {
  const doc = new Doc();
  const scene = document.createElement('canvas'), overlay = document.createElement('canvas'), host = document.createElement('div');
  host.append(scene, overlay); document.body.append(host);
  const ed = new Editor(doc, new Renderer(scene, overlay), host);
  const held = () => (ed as unknown as { spaceHeld: boolean }).spaceHeld;
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
  expect(held()).toBe(true);
  const box = document.createElement('input');
  document.body.append(box);
  box.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true }));
  expect(held()).toBe(false);
});
