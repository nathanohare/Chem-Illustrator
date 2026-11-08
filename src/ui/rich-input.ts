// The box a cell is typed in: plain text as a textarea would hold it, and a look for each
// character so part of it can be made bold, italic or underlined while typing (issue #503), as
// in Excel. It answers to the parts of a textarea the sheet uses (value, selectionStart,
// setRangeText…). The browser edits the text; the looks follow by comparing the text before and
// after, so typed characters take the look of the one before them.

import { type RunLook, type TextRun, type ToggleLook, cleanLook, runsFrom, spliceLooks, toggleLooks, toggledLook } from '../sheet/rich-text';

export class RichInput {
  readonly el: HTMLDivElement;
  private text = '';
  private looks: RunLook[] = [];
  /** The selection when the box last had it (a ribbon button takes the focus before it acts). */
  private sel = { start: 0, end: 0 };
  /** Bold, Italic… pressed with nothing selected: the look of what is typed next, there. */
  private typing: { at: number; look: RunLook } | null = null;
  private composing = false;

  constructor() {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-multiline', 'true');
    this.el = el;
    el.addEventListener('compositionstart', () => { this.composing = true; });
    el.addEventListener('compositionend', () => { this.composing = false; this.read(); });
    // the browser's own Bold and Italic would put its markup in; Ctrl+B is the sheet's
    el.addEventListener('beforeinput', (e) => { if (e.inputType.startsWith('format')) e.preventDefault(); });
    el.addEventListener('input', () => this.read());
    // pasted or dropped text comes in plain
    el.addEventListener('paste', (e) => {
      const t = e.clipboardData?.getData('text/plain');
      e.preventDefault();
      if (t) this.insert(t.replace(/\r\n?/g, '\n'));
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const t = e.dataTransfer?.getData('text/plain');
      if (t) this.insert(t.replace(/\r\n?/g, '\n'));
    });
    document.addEventListener('selectionchange', () => this.keepSelection());
  }

  // ---------------------------------------------------------------- the textarea's ways

  get value(): string { return this.text; }

  /** New text, keeping the looks of what stayed the same (the formula bar typed in). */
  set value(v: string) {
    if (v === this.text) return;
    this.looks = spliceLooks(this.text, v, this.looks);
    this.text = v;
    this.typing = null;
    const end = Math.min(this.sel.end, v.length);
    this.render();
    this.sel = { start: Math.min(this.sel.start, end), end };
  }

  get hidden(): boolean { return this.el.hidden; }
  set hidden(h: boolean) { this.el.hidden = h; }
  get style(): CSSStyleDeclaration { return this.el.style; }
  get scrollHeight(): number { return this.el.scrollHeight; }
  set className(c: string) { this.el.className = c; }
  set spellcheck(on: boolean) { this.el.spellcheck = on; }
  setAttribute(name: string, value: string): void { this.el.setAttribute(name, value); }
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void): void { this.el.addEventListener(type, fn); }

  get selectionStart(): number { this.keepSelection(); return this.sel.start; }
  get selectionEnd(): number { this.keepSelection(); return this.sel.end; }

  focus(opts?: FocusOptions): void {
    this.el.focus(opts);
    this.place(this.sel.start, this.sel.end);
  }

  setSelectionRange(start: number, end: number): void {
    const n = this.text.length;
    this.sel = { start: Math.max(0, Math.min(start, n)), end: Math.max(0, Math.min(end, n)) };
    if (this.sel.end < this.sel.start) this.sel.end = this.sel.start;
    this.typing = null;
    if (this.el.isConnected && document.activeElement === this.el) this.place(this.sel.start, this.sel.end);
  }

  select(): void { this.setSelectionRange(0, this.text.length); }

  /** Put text in place of part of it, as a textarea's setRangeText does ('end' puts the caret after it). */
  setRangeText(t: string, start: number, end: number, mode: 'select' | 'start' | 'end' | 'preserve' = 'preserve'): void {
    const before = this.text;
    const after = before.slice(0, start) + t + before.slice(end);
    const like = this.typing && this.typing.at === start ? this.typing.look : null;
    this.looks = [...this.looks.slice(0, start), ...Array.from({ length: t.length }, () => ({ ...(like ?? this.looks[start - 1] ?? this.looks[end] ?? {}) })), ...this.looks.slice(end)];
    this.text = after;
    this.typing = null;
    this.render();
    if (mode === 'end') this.setSelectionRange(start + t.length, start + t.length);
    else if (mode === 'start') this.setSelectionRange(start, start);
    else if (mode === 'select') this.setSelectionRange(start, start + t.length);
  }

  // ---------------------------------------------------------------- formatting

  /** New text and its looks (a cell opened for typing). */
  setText(text: string, looks?: RunLook[]): void {
    this.text = text;
    this.looks = looks && looks.length === text.length ? looks.map(cleanLook) : Array.from({ length: text.length }, () => ({}));
    this.typing = null;
    this.sel = { start: text.length, end: text.length };
    this.render();
  }

  /** The look of each character. */
  get charLooks(): RunLook[] { return this.looks; }

  /** The text as runs, or undefined when it has one look throughout. */
  get runs(): TextRun[] | undefined { return runsFrom(this.text, this.looks); }

  /**
   * Bold, Italic, Underline: on or off for the selected text, or for what is typed next when
   * nothing is selected. `base`: whether the cell itself has the look.
   */
  toggle(key: ToggleLook, base = false): void {
    // (the selection as it is now: Ctrl+I can come before the browser says Shift+arrow moved it)
    this.keepSelection();
    const { start, end } = this.sel;
    if (start === end) {
      const look = this.typing?.at === start ? this.typing.look : this.looks[start - 1] ?? this.looks[start] ?? {};
      this.typing = { at: start, look: toggledLook(look, key, base) };
      return;
    }
    this.looks = toggleLooks(this.looks, start, end, key, base);
    this.render();
    this.place(start, end);
  }

  /** Whether the selected text (or what is typed next) has a look, as the ribbon shows it pressed. */
  has(key: ToggleLook, base = false): boolean {
    this.keepSelection();
    const { start, end } = this.sel;
    if (start === end) {
      const look = this.typing?.at === start ? this.typing.look : this.looks[start - 1] ?? this.looks[start] ?? {};
      return look[key] ?? base;
    }
    return this.looks.slice(start, end).every((l) => l[key] ?? base);
  }

  // ---------------------------------------------------------------- inside

  private insert(t: string): void {
    this.keepSelection();
    this.setRangeText(t, this.sel.start, this.sel.end, 'end');
    this.el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** The browser changed the text: the looks follow, and the box is drawn again in its own markup. */
  private read(): void {
    if (this.composing) return;
    const after = textOf(this.el);
    if (after === this.text && this.el.childNodes.length && this.drawn()) return;
    const caret = this.domSelection();
    const typed = this.typing;
    this.looks = spliceLooks(this.text, after, this.looks, typed && caret && caret.end > typed.at ? typed.look : null);
    this.text = after;
    if (typed && caret && caret.end > typed.at) this.typing = null;
    this.render();
    if (caret) { this.sel = caret; this.place(caret.start, caret.end); }
  }

  /** Is the box's markup what render() makes (the browser can add its own while typing)? */
  private drawn(): boolean {
    for (const n of Array.from(this.el.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) return false;
      const e = n as HTMLElement;
      if (e.tagName === 'BR' && e.dataset.end !== undefined) continue;
      if (e.tagName !== 'SPAN' || e.childNodes.length !== 1 || e.firstChild!.nodeType !== Node.TEXT_NODE) return false;
    }
    return true;
  }

  private render(): void {
    const el = this.el;
    el.textContent = '';
    for (const run of runsFrom(this.text, this.looks) ?? (this.text ? [{ text: this.text }] : [])) {
      const span = document.createElement('span');
      span.textContent = run.text;
      const l = cleanLook(run);
      if (l.bold !== undefined) span.style.fontWeight = l.bold ? 'bold' : 'normal';
      if (l.italic !== undefined) span.style.fontStyle = l.italic ? 'italic' : 'normal';
      const lines = [l.underline ? 'underline' : '', l.strike ? 'line-through' : ''].filter(Boolean).join(' ');
      if (lines || l.underline === false) span.style.textDecoration = lines || 'none';
      if (l.color) span.style.color = l.color;
      if (l.font) span.style.fontFamily = `"${l.font}"`;
      if (l.size) span.style.fontSize = `${(l.size * 4) / 3}px`;
      if (l.pos) { span.style.verticalAlign = l.pos === 'sub' ? 'sub' : 'super'; span.style.fontSize = '70%'; }
      el.append(span);
    }
    // the line after a last new line shows, and an empty box keeps its height
    if (!this.text || this.text.endsWith('\n')) {
      const br = document.createElement('br');
      br.dataset.end = '';
      el.append(br);
    }
  }

  /** Remember where the selection is while the box has it. */
  private keepSelection(): void {
    if (document.activeElement !== this.el) return;
    const got = this.domSelection();
    if (got && (got.start !== this.sel.start || got.end !== this.sel.end)) {
      this.sel = got;
      if (this.typing && this.typing.at !== got.start) this.typing = null;
    }
  }

  private domSelection(): { start: number; end: number } | null {
    const s = this.el.ownerDocument.getSelection();
    if (!s || !s.rangeCount) return null;
    const r = s.getRangeAt(0);
    if (!this.el.contains(r.startContainer) || !this.el.contains(r.endContainer)) return null;
    const a = offsetIn(this.el, r.startContainer, r.startOffset), b = offsetIn(this.el, r.endContainer, r.endOffset);
    return { start: Math.min(a, b), end: Math.max(a, b) };
  }

  private place(start: number, end: number): void {
    const doc = this.el.ownerDocument;
    const s = doc.getSelection();
    if (!s || document.activeElement !== this.el) return;
    const a = pointAt(this.el, start), b = pointAt(this.el, end);
    const r = doc.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    s.removeAllRanges();
    s.addRange(r);
  }
}

/** The text of the box as the browser left it: <br> and new blocks are new lines. */
export function textOf(el: HTMLElement): string {
  let out = '';
  const walk = (n: Node) => {
    for (const k of Array.from(n.childNodes)) {
      if (k.nodeType === Node.TEXT_NODE) out += (k as Text).data;
      else if (k.nodeType === Node.ELEMENT_NODE) {
        const e = k as HTMLElement;
        if (e.tagName === 'BR') { if (e.dataset.end === undefined) out += '\n'; continue; }
        const block = e.tagName === 'DIV' || e.tagName === 'P';
        if (block && out && !out.endsWith('\n')) out += '\n';
        walk(e);
      }
    }
  };
  walk(el);
  return out;
}

/** A place in the box's markup as a place in its text. */
function offsetIn(root: HTMLElement, node: Node, offset: number): number {
  let n = 0;
  let found = -1;
  const walk = (p: Node): boolean => {
    if (p === node && p.nodeType !== Node.TEXT_NODE) {
      // a place between children: the text of the children before it
      const kids = Array.from(p.childNodes);
      for (let i = 0; i < offset && i < kids.length; i++) n += textOf(wrap(kids[i])).length;
      found = n;
      return true;
    }
    for (const k of Array.from(p.childNodes)) {
      if (k === node && k.nodeType === Node.TEXT_NODE) { found = n + offset; return true; }
      if (k.nodeType === Node.TEXT_NODE) n += (k as Text).data.length;
      else if (k.nodeType === Node.ELEMENT_NODE) {
        const e = k as HTMLElement;
        if (e.tagName === 'BR') { if (e === node) { found = n; return true; } if (e.dataset.end === undefined) n++; continue; }
        if (walk(e)) return true;
      }
    }
    return false;
  };
  walk(root);
  return found < 0 ? n : found;
}

/** A node's text, read as the box's would be. */
function wrap(k: Node): HTMLElement {
  const d = document.createElement('div');
  d.append(k.cloneNode(true));
  return d;
}

/** A place in the text as a place in the box's markup (as render() draws it). */
function pointAt(root: HTMLElement, at: number): { node: Node; offset: number } {
  let n = 0;
  for (const k of Array.from(root.childNodes)) {
    const t = k.firstChild;
    if (k.nodeType === Node.ELEMENT_NODE && (k as HTMLElement).tagName === 'SPAN' && t?.nodeType === Node.TEXT_NODE) {
      const len = (t as Text).data.length;
      if (at <= n + len) return { node: t, offset: at - n };
      n += len;
    }
  }
  return { node: root, offset: root.childNodes.length - (root.lastChild && (root.lastChild as HTMLElement).dataset?.end !== undefined ? 1 : 0) };
}
