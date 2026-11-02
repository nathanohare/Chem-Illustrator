// A one-line text field that shows subscripts and superscripts as they will look (the Smart
// Scheme pane's rows). It keeps its own text: each character is plain, subscript or superscript,
// either set by hand (the formatting bar, Ctrl+= and Ctrl+Shift+=) or worked out by chemical
// interpretation as you type (the digits of formulas drop, as the Catalytic Cycle window's
// species do). Turning interpretation off leaves the text as typed.

import { chemRuns } from '../text/chemtext';
import type { TextPart } from '../chem/smart-scheme';

export type Pos = '' | 'sub' | 'sup';
interface Ch { c: string; pos: Pos; set: boolean }

export interface RichFieldOptions {
  placeholder: string;
  label: string;
  /** Is chemical interpretation on? */
  chem(): boolean;
  /** The text was changed and finished (Enter, or the caret left the field). */
  done(parts: TextPart[]): void;
  /** The caret moved, or the formatting where it is changed (the bar shows it). */
  onState?(f: RichField): void;
}

/** Where each character of `text` goes with chemical interpretation on. */
export function chemPositions(text: string): Pos[] {
  // markup characters are taken as plain text here (the bar sets sub- and superscripts)
  const safe = text.replace(/[_^]/g, ' ');
  const out: Pos[] = [];
  for (const r of chemRuns(safe)) for (const _ of r.text) out.push(r.sub ? 'sub' : r.sup ? 'sup' : '');
  while (out.length < text.length) out.push('');
  return out.slice(0, text.length);
}

export class RichField {
  readonly el: HTMLDivElement;
  private chars: Ch[] = [];
  private was = '';
  /** What the next typed characters are: set by the bar with nothing selected (null: as the text before the caret). */
  private pending: Pos | 'auto' | null = null;
  private caretAt = -1;
  private undo: Ch[][] = [];

  constructor(parts: TextPart[], private o: RichFieldOptions) {
    const el = document.createElement('div');
    this.el = el;
    el.className = 'sp-rich';
    el.contentEditable = 'true';
    el.tabIndex = 0;
    el.spellcheck = false;
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-label', o.label);
    el.dataset.placeholder = o.placeholder;
    this.load(parts);
    this.was = this.key();
    this.wasParts = this.parts();
    this.render(null);
    el.addEventListener('beforeinput', (e) => this.onInput(e));
    el.addEventListener('compositionend', () => this.resync());
    el.addEventListener('keydown', (e) => this.onKey(e));
    el.addEventListener('focus', () => { document.addEventListener('selectionchange', this.onSel); this.onSel(); });
    el.addEventListener('blur', () => { document.removeEventListener('selectionchange', this.onSel); this.pending = null; this.commit(); });
    // pasted text comes in as plain text (through beforeinput)
    el.addEventListener('drop', (e) => e.preventDefault());
  }

  // ---------------------------------------------------------------- the text

  private load(parts: TextPart[]): void {
    this.chars = parts.flatMap((p) => [...p.text].map((c) => ({ c, pos: (p.sub ? 'sub' : p.sup ? 'sup' : '') as Pos, set: false })));
    this.settle(true);
  }

  /** The text's characters as pieces of plain, subscript and superscript text. */
  parts(): TextPart[] {
    const out: TextPart[] = [];
    for (const ch of this.chars) {
      const last = out[out.length - 1];
      const pos = ch.pos;
      if (last && (pos === 'sub') === !!last.sub && (pos === 'sup') === !!last.sup) last.text += ch.c;
      else out.push({ text: ch.c, ...(pos ? { [pos]: true } : {}) });
    }
    return out;
  }

  text(): string { return this.chars.map((c) => c.c).join(''); }
  private key(): string { return this.chars.map((c) => c.c + c.pos).join('|'); }

  /**
   * Characters not set by hand go where interpretation puts them. With `mark`, a character that
   * sits where interpretation wouldn't put it counts as set by hand (text loaded, or pasted).
   */
  private settle(mark = false): void {
    const want = this.o.chem() ? chemPositions(this.text()) : this.chars.map(() => '' as Pos);
    this.chars.forEach((ch, i) => {
      if (mark) ch.set = ch.pos !== want[i];
      else if (!ch.set) ch.pos = want[i];
      // set by hand to where interpretation puts it anyway: left to interpretation
      else if (ch.pos === want[i]) ch.set = false;
    });
  }

  /** Chemical interpretation was turned on or off: the text is worked out again. */
  rechem(): void {
    this.remember();
    this.settle();
    this.render(this.selection());
  }

  // ---------------------------------------------------------------- the caret

  private offsetOf(node: Node, off: number): number {
    const r = document.createRange();
    r.setStart(this.el, 0);
    r.setEnd(node, off);
    return r.toString().length;
  }

  /** The selection in the field, as character offsets (start ≤ end). */
  selection(): [number, number] | null {
    const s = document.getSelection();
    if (!s || !s.rangeCount || !this.el.contains(s.anchorNode) || !this.el.contains(s.focusNode)) return null;
    const a = this.offsetOf(s.anchorNode!, s.anchorOffset), b = this.offsetOf(s.focusNode!, s.focusOffset);
    return a <= b ? [a, b] : [b, a];
  }

  private spot(at: number): [Node, number] {
    const walk = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT);
    let n: Node | null, left = at, last: Node | null = null;
    while ((n = walk.nextNode())) {
      const len = n.textContent?.length ?? 0;
      if (left <= len) return [n, left];
      left -= len;
      last = n;
    }
    return last ? [last, last.textContent?.length ?? 0] : [this.el, 0];
  }

  select(a: number, b = a): void {
    const s = document.getSelection();
    if (!s) return;
    const [n1, o1] = this.spot(a), [n2, o2] = this.spot(b);
    s.setBaseAndExtent(n1, o1, n2, o2);
    this.caretAt = a === b ? a : -1;
  }

  focusAll(): void { this.el.focus(); this.select(0, this.chars.length); }

  private onSel = (): void => {
    const sel = this.selection();
    // the caret moved somewhere else: what the bar set for the next characters is forgotten
    if (!sel || sel[0] !== sel[1] || sel[0] !== this.caretAt) { this.pending = null; this.caretAt = sel && sel[0] === sel[1] ? sel[0] : -1; }
    this.o.onState?.(this);
  };

  /** Where the next character typed at `at` goes (what the bar shows with nothing selected). */
  private nextPos(at: number): { pos: Pos; set: boolean } {
    if (this.pending === 'auto') return { pos: '', set: false };
    if (this.pending) return { pos: this.pending, set: true };
    const prev = this.chars[at - 1];
    return prev?.set ? { pos: prev.pos, set: true } : { pos: '', set: false };
  }

  /** Is subscript (or superscript) on where the caret is, or over all that is selected? */
  state(pos: 'sub' | 'sup'): boolean {
    const sel = this.selection();
    if (!sel) return false;
    const [a, b] = sel;
    if (a === b) {
      if (this.pending) return this.pending === pos;
      const prev = this.chars[a - 1];
      return !!prev && prev.pos === pos;
    }
    return this.chars.slice(a, b).every((c) => c.pos === pos);
  }

  // ---------------------------------------------------------------- changes

  private remember(): void {
    this.undo.push(this.chars.map((c) => ({ ...c })));
    if (this.undo.length > 100) this.undo.shift();
  }

  /** Put text in place of the selection (or at the caret), as the bar's symbols do. */
  insert(text: string): void {
    const [a, b] = this.selection() ?? [this.chars.length, this.chars.length];
    const t = text.replace(/\s*[\r\n]+\s*/g, ' ');
    this.remember();
    const how = this.nextPos(a);
    this.chars.splice(a, b - a, ...[...t].map((c) => ({ c, ...how })));
    this.settle();
    const at = a + [...t].length;
    this.render([at, at]);
  }

  private remove(a: number, b: number): void {
    if (b <= a) return;
    this.remember();
    this.chars.splice(a, b - a);
    this.settle();
    this.render([a, a]);
  }

  /** Subscript or superscript on or off: over the selection, or for what is typed next. */
  toggle(pos: 'sub' | 'sup'): void {
    const sel = this.selection();
    if (!sel) return;
    const [a, b] = sel;
    if (a === b) {
      this.pending = this.state(pos) ? 'auto' : pos;
      this.caretAt = a;
      this.o.onState?.(this);
      return;
    }
    this.remember();
    const off = this.chars.slice(a, b).every((c) => c.pos === pos);
    for (const ch of this.chars.slice(a, b)) { ch.pos = off ? '' : pos; ch.set = true; }
    this.settle();
    this.render([a, b]);
  }

  private onInput(e: InputEvent): void {
    const len = this.chars.length;
    const [a, b] = this.selection() ?? [len, len];
    const word = (i: number, dir: -1 | 1) => {
      const t = this.text();
      let j = i;
      if (dir < 0) { while (j > 0 && /\s/.test(t[j - 1])) j--; while (j > 0 && !/\s/.test(t[j - 1])) j--; } else { while (j < t.length && /\s/.test(t[j])) j++; while (j < t.length && !/\s/.test(t[j])) j++; }
      return j;
    };
    switch (e.inputType) {
      case 'insertText': case 'insertReplacementText': case 'insertFromPaste': case 'insertFromDrop': case 'insertFromYank': {
        const t = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
        e.preventDefault();
        if (t) this.insert(t);
        return;
      }
      case 'deleteContentBackward': e.preventDefault(); this.remove(a === b ? Math.max(0, a - 1) : a, b); return;
      case 'deleteContentForward': e.preventDefault(); this.remove(a, a === b ? Math.min(len, b + 1) : b); return;
      case 'deleteWordBackward': e.preventDefault(); this.remove(a === b ? word(a, -1) : a, b); return;
      case 'deleteWordForward': e.preventDefault(); this.remove(a, a === b ? word(b, 1) : b); return;
      case 'deleteSoftLineBackward': case 'deleteHardLineBackward': e.preventDefault(); this.remove(a === b ? 0 : a, b); return;
      case 'deleteSoftLineForward': case 'deleteHardLineForward': e.preventDefault(); this.remove(a, a === b ? len : b); return;
      case 'deleteByCut': case 'deleteContent': case 'deleteByDrag': e.preventDefault(); this.remove(a, b); return;
      case 'insertParagraph': case 'insertLineBreak': e.preventDefault(); return;
      case 'historyUndo': e.preventDefault(); this.back(); return;
      case 'formatSubscript': e.preventDefault(); this.toggle('sub'); return;
      case 'formatSuperscript': e.preventDefault(); this.toggle('sup'); return;
      case 'formatBold': case 'formatItalic': case 'formatUnderline': case 'historyRedo': e.preventDefault(); return;
      default: setTimeout(() => this.resync());
    }
  }

  private back(): void {
    const prev = this.undo.pop();
    if (!prev) return;
    this.chars = prev;
    this.render([this.chars.length, this.chars.length]);
  }

  /** Something changed the field the field didn't do itself (typing with an input method): read it again. */
  private resync(): void {
    const sel = this.selection();
    const out: Ch[] = [];
    const walk = (n: Node, pos: Pos) => {
      if (n.nodeType === Node.TEXT_NODE) { for (const c of n.textContent ?? '') out.push({ c, pos, set: false }); return; }
      const tag = (n as Element).tagName;
      const p: Pos = tag === 'SUB' ? 'sub' : tag === 'SUP' ? 'sup' : pos;
      for (const k of n.childNodes) walk(k, p);
    };
    for (const k of this.el.childNodes) walk(k, '');
    if (out.map((c) => c.c + c.pos).join('|') === this.key()) return;
    this.remember();
    this.chars = out;
    this.settle(true);
    this.render(sel);
  }

  private onKey(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter') { e.preventDefault(); this.el.blur(); return; }
    if (e.key === 'Escape') { e.preventDefault(); this.undo = []; this.load(this.wasParts); this.render(null); this.el.blur(); return; }
    if (mod && !e.altKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); this.toggle(e.shiftKey || e.key === '+' ? 'sup' : 'sub'); return; }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); this.back(); }
  }

  /** The text as last finished (Escape goes back to it). */
  private wasParts: TextPart[] = [];

  /** Finished: the text goes to the drawing if it changed. */
  commit(): void {
    const k = this.key();
    if (k === this.was) return;
    this.was = k;
    this.wasParts = this.parts();
    this.o.done(this.parts());
  }

  /** Show the text, with the selection at these offsets (null: leave the caret alone). */
  private render(sel: [number, number] | null): void {
    const frag = document.createDocumentFragment();
    for (const p of this.parts()) {
      if (p.sub || p.sup) {
        const e = document.createElement(p.sub ? 'sub' : 'sup');
        e.textContent = p.text;
        frag.append(e);
      } else frag.append(document.createTextNode(p.text));
    }
    this.el.replaceChildren(frag);
    this.el.classList.toggle('empty', !this.chars.length);
    if (sel && document.activeElement === this.el) this.select(sel[0], sel[1]);
    this.o.onState?.(this);
  }
}
