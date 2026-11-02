// @vitest-environment jsdom
//
// Template and ligand pictures are built with DOM calls, not innerHTML (CodeQL alerts 27 and 28):
// the same picture comes out, and nothing in it can run or load anything.

import { describe, it, expect } from 'vitest';
import { svgNode } from '../src/ui/svg-node';
import { templateIcon } from '../src/ui/template-icons';
import { TEMPLATES } from '../src/chem/templates';

describe('svgNode', () => {
  it('builds a template picture with the same shapes and labels as its markup', () => {
    for (const t of [...TEMPLATES.slice(0, 30), ...TEMPLATES.slice(-30)]) {
      const markup = templateIcon(t, 64);
      const node = svgNode(markup)!;
      expect(node.namespaceURI).toBe('http://www.w3.org/2000/svg');
      const ref = document.createElement('div');
      ref.innerHTML = markup;
      const want = ref.querySelector('svg')!;
      expect([...node.querySelectorAll('*')].map((e) => e.localName)).toEqual([...want.querySelectorAll('*')].map((e) => e.localName));
      expect(node.textContent).toBe(want.textContent);
      expect(node.getAttribute('viewBox')).toBe(want.getAttribute('viewBox'));
    }
  });

  it('keeps text as text and drops anything that could run', () => {
    const node = svgNode('<svg width="10" onload="alert(1)"><text x="1">&lt;img src=x onerror=alert(1)&gt; &amp; Co</text><script>alert(1)</script><image href="x"/><line x1="0" onclick="x()"/></svg>')!;
    expect(node.getAttribute('onload')).toBeNull();
    expect(node.querySelector('text')!.textContent).toBe('<img src=x onerror=alert(1)> & Co');
    expect(node.querySelector('script, image, img')).toBeNull();
    expect(node.querySelector('line')!.getAttribute('onclick')).toBeNull();
    expect(node.querySelector('line')!.getAttribute('x1')).toBe('0');
  });

  it('gives nothing for markup that is not a picture', () => {
    expect(svgNode('<div>hi</div>')).toBeNull();
    expect(svgNode('')).toBeNull();
  });
});
