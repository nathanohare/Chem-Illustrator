// Speaker notes with formatting: bold, italic, underline or struck-through words, and bulleted
// lines. The notes stay plain text everywhere else (the slide show, printing, search), with a
// bulleted line starting "• "; the looks are kept beside the text, for the Notes pane and for
// PowerPoint, and count only while the text is still theirs.

import { cleanLook, runsFrom, type RunLook, type TextRun } from '../sheet/rich-text';

/** What starts a bulleted line of the notes. */
export const NOTE_BULLET = '• ';

/** Notes' looks: the text they were made for, and it as runs. */
export interface NotesLook { text: string; runs: TextRun[] }

/** The looks each notes character has: from `look` when it belongs to `text`, otherwise none. */
export function notesCharLooks(text: string, look: NotesLook | undefined): RunLook[] {
  if (!look || look.text !== text) return Array.from({ length: text.length }, () => ({}));
  const out: RunLook[] = [];
  for (const r of look.runs) {
    const { text: t, ...l } = r;
    for (let i = 0; i < t.length; i++) out.push(cleanLook(l));
  }
  return out.length === text.length ? out : Array.from({ length: text.length }, () => ({}));
}

/** The looks to keep for notes typed as `text` with these looks (none when all plain). */
export function notesLookOf(text: string, looks: RunLook[]): NotesLook | undefined {
  const runs = runsFrom(text, looks);
  return runs ? { text, runs } : undefined;
}

/**
 * Bullets on or off for the lines a selection (start to end) touches: off when they all have
 * one, on otherwise. The edits to make, last first, so each one's place is still right.
 */
export function bulletEdits(text: string, start: number, end: number): { at: number; remove: number; insert: string }[] {
  const lines: number[] = [];
  let at = text.lastIndexOf('\n', start - 1) + 1;
  for (;;) {
    lines.push(at);
    const next = text.indexOf('\n', at);
    if (next < 0 || next >= end || (next + 1 > end && end > start)) break;
    at = next + 1;
  }
  const all = lines.every((p) => text.startsWith(NOTE_BULLET, p));
  return lines.reverse().flatMap((p) => {
    if (all) return [{ at: p, remove: NOTE_BULLET.length, insert: '' }];
    return text.startsWith(NOTE_BULLET, p) ? [] : [{ at: p, remove: 0, insert: NOTE_BULLET }];
  });
}

/** The notes as paragraphs: each line's text (without its bullet), whether it has one, and its runs. */
export function notesParagraphs(text: string, look: NotesLook | undefined): { bullet: boolean; runs: TextRun[] }[] {
  const looks = notesCharLooks(text, look);
  const out: { bullet: boolean; runs: TextRun[] }[] = [];
  let at = 0;
  for (const line of text.split('\n')) {
    const bullet = line.startsWith(NOTE_BULLET);
    const from = at + (bullet ? NOTE_BULLET.length : 0);
    const body = text.slice(from, at + line.length);
    out.push({ bullet, runs: runsFrom(body, looks.slice(from, at + line.length)) ?? (body ? [{ text: body }] : []) });
    at += line.length + 1;
  }
  return out;
}

/** Show notes in `el` (the Presenter View's), with their bold, italic and underlined words. */
export function showNotesIn(el: HTMLElement, text: string, look: NotesLook | undefined): void {
  el.textContent = '';
  const looks = notesCharLooks(text, look);
  for (const r of runsFrom(text, looks) ?? [{ text }]) {
    const span = document.createElement('span');
    span.textContent = r.text;
    if (r.bold) span.style.fontWeight = 'bold';
    if (r.italic) span.style.fontStyle = 'italic';
    const lines = [r.underline ? 'underline' : '', r.strike ? 'line-through' : ''].filter(Boolean).join(' ');
    if (lines) span.style.textDecoration = lines;
    el.append(span);
  }
}
