// Turns the small SVG pictures we write as text (template and ligand icons) into elements with
// DOM calls, not innerHTML: only the shapes and attributes a picture uses are made, and text goes
// in as text, so nothing in a name or label can ever be read as markup.

const NS = 'http://www.w3.org/2000/svg';

/** The elements a picture may use. */
const TAGS = new Set(['svg', 'g', 'line', 'path', 'polygon', 'polyline', 'circle', 'ellipse', 'rect', 'text', 'tspan']);
/** The attributes it may set (nothing that runs code or loads anything). */
const ATTRS = new Set([
  'width', 'height', 'viewBox', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform',
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'paint-order', 'opacity',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'aria-hidden',
]);

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** The picture `markup` describes, built element by element; null when it has no <svg> at its root. */
export function svgNode(markup: string): SVGSVGElement | null {
  const token = /<(\/?)([a-zA-Z]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  const attr = /([\w:-]+)="([^"]*)"/g;
  let root: SVGSVGElement | null = null;
  const stack: Element[] = [];
  for (const m of markup.matchAll(token)) {
    const [, closing, tag, attrs, selfClose, text] = m;
    const top = stack[stack.length - 1];
    if (text !== undefined) {
      if (top && text.trim()) top.append(document.createTextNode(unescape(text)));
      continue;
    }
    if (closing) { if (top?.localName === tag) stack.pop(); continue; }
    if (!TAGS.has(tag) || (!top && tag !== 'svg')) continue;
    const node = document.createElementNS(NS, tag);
    for (const [, name, value] of attrs.matchAll(attr)) if (ATTRS.has(name)) node.setAttribute(name, unescape(value));
    if (top) top.append(node);
    else if (!root) root = node as SVGSVGElement;
    else continue;
    if (!selfClose) stack.push(node);
  }
  return root;
}
