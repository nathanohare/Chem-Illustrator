// Fast walks over a parsed XML tree. Live DOM collections (getElementsByTagName, children)
// can be slow on large files in some XML engines, so these build plain arrays once.

/** Element children of `e`, in order. */
export function kids(e: Element): Element[] {
  const out: Element[] = [];
  for (let c = e.firstElementChild; c; c = c.nextElementSibling) out.push(c);
  return out;
}

/** Every element below `root`, in document order (the same order as getElementsByTagName('*')). */
export function descendants(root: Element): Element[] {
  const out: Element[] = [];
  const visit = (e: Element) => {
    for (let c = e.firstElementChild; c; c = c.nextElementSibling) {
      out.push(c);
      visit(c);
    }
  };
  visit(root);
  return out;
}

/** Text with each lone half of a surrogate pair (left when text is cut inside an emoji, or pasted
 * from some PDFs) made U+FFFD: XML can't hold one, and the desktop app's JSON reader refuses one. */
export function wellFormed(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

/**
 * XML text without its DOCTYPE, internal subset included, so a file can neither fetch a DTD
 * nor declare entities that swell into a huge text. A DOCTYPE that can't be cut out cleanly
 * (so might still declare something) is refused.
 */
export function withoutDoctype(text: string): string {
  const out = text.replace(/<!DOCTYPE(?:[^>[]|\[(?:[^\]"']|"[^"]*"|'[^']*')*\])*>/gi, '');
  if (/<!(?:DOCTYPE|ENTITY)/i.test(out)) throw new Error('This file declares XML entities, which are not allowed.');
  return out;
}
