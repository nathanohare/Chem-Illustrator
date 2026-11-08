// @vitest-environment jsdom
//
// Speaker notes with formatting (Nate, 2026-11-08): bold, italic and underlined words and bulleted
// lines, kept beside the plain notes text, shown in the Notes pane and saved to PowerPoint.

import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';
import { Doc } from '../src/model';
import { Deck } from '../src/deck/deck';
import { NOTE_BULLET, bulletEdits, notesCharLooks, notesLookOf, notesParagraphs } from '../src/deck/notes-look';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';

const opts: PptxOptions = { async picture() { return null; } };

describe('notes looks', () => {
  it('count only while the notes are still theirs', () => {
    const look = notesLookOf('Say hi', [{ bold: true }, { bold: true }, {}, {}, {}, {}]);
    expect(look?.runs).toEqual([{ text: 'Sa', bold: true }, { text: 'y hi' }]);
    expect(notesCharLooks('Say hi', look)[0]).toEqual({ bold: true });
    expect(notesCharLooks('Say hello', look).every((l) => !Object.keys(l).length)).toBe(true);
    expect(notesLookOf('plain', Array.from({ length: 5 }, () => ({})))).toBeUndefined();
  });

  it('put bullets on the selected lines, or take them off when all have one', () => {
    const text = 'one\ntwo\nthree';
    const apply = (t: string, s: number, e: number) => bulletEdits(t, s, e).reduce((x, d) => x.slice(0, d.at) + d.insert + x.slice(d.at + d.remove), t);
    const on = apply(text, 0, 5);
    expect(on).toBe(`${NOTE_BULLET}one\n${NOTE_BULLET}two\nthree`);
    expect(apply(on, 0, 8)).toBe(text);
    // a caret: its line only
    expect(apply(text, 9, 9)).toBe(`one\ntwo\n${NOTE_BULLET}three`);
  });

  it('split into paragraphs for PowerPoint', () => {
    const text = `${NOTE_BULLET}First\nPlain`;
    const looks = notesCharLooks(text, undefined);
    looks[2] = { italic: true };
    expect(notesParagraphs(text, notesLookOf(text, looks))).toEqual([
      { bullet: true, runs: [{ text: 'F', italic: true }, { text: 'irst' }] },
      { bullet: false, runs: [{ text: 'Plain' }] },
    ]);
  });
});

describe('notes in PowerPoint files', () => {
  it('saves bold, italic, underline and bullets, and reads them back', async () => {
    const deck = Deck.blank(new Doc());
    const text = `Intro ${'bold'}\n${NOTE_BULLET}point`;
    const looks = notesCharLooks(text, undefined);
    for (let i = 6; i < 10; i++) looks[i] = { bold: true };
    for (let i = 13; i < 18; i++) looks[i] = { italic: true, underline: true };
    deck.setNotes(text, 0, notesLookOf(text, looks));
    const bytes = await writePptx({ size: deck.size, master: deck.master, slides: deck.slides.map((s, i) => ({ layout: s.layout, doc: deck.docOf(i), notes: s.notes, notesLook: s.notesLook })) }, opts);
    const xml = strFromU8(unzipSync(bytes)['ppt/notesSlides/notesSlide1.xml']);
    expect(xml).toMatch(/b="1" dirty="0"\/><a:t>bold<\/a:t>/);
    expect(xml).toContain('<a:buChar char="•"/>');
    expect(xml).toMatch(/i="1" u="sng" dirty="0"\/><a:t>point<\/a:t>/);
    expect(xml).not.toContain(NOTE_BULLET);
    const back = readPptx(bytes).slides[0];
    expect(back.notes).toBe(text);
    expect(back.notesLook?.runs).toEqual([{ text: 'Intro ' }, { text: 'bold', bold: true }, { text: `\n${NOTE_BULLET}` }, { text: 'point', italic: true, underline: true }]);
  });

  it('reads PowerPoint\'s own bold words and bullets', async () => {
    const deck = Deck.blank(new Doc());
    deck.setNotes('x');
    const files = unzipSync(await writePptx({ size: deck.size, master: deck.master, slides: [{ layout: 'blank', doc: deck.docOf(0), notes: 'x' }] }, opts));
    const np = 'ppt/notesSlides/notesSlide1.xml';
    files[np] = strToU8(strFromU8(files[np]).replace(/<p:txBody>[\s\S]*<\/p:txBody>/, '<p:txBody><a:bodyPr/><a:lstStyle/>'
      + '<a:p><a:r><a:rPr lang="en-US" b="1"/><a:t>Key</a:t></a:r><a:r><a:rPr lang="en-US"/><a:t> point</a:t></a:r></a:p>'
      + '<a:p><a:pPr marL="171450" indent="-171450"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="en-US"/><a:t>Listed</a:t></a:r></a:p></p:txBody>'));
    const back = readPptx(zipSync(files)).slides[0];
    expect(back.notes).toBe(`Key point\n${NOTE_BULLET}Listed`);
    expect(back.notesLook?.runs[0]).toEqual({ text: 'Key', bold: true });
  });

  it('undoes a change to the notes\' looks', () => {
    const deck = Deck.blank(new Doc());
    deck.setNotes('Hi');
    deck.setNotes('Hi', 0, notesLookOf('Hi', [{ bold: true }, { bold: true }]));
    expect(deck.slides[0].notesLook?.runs).toEqual([{ text: 'Hi', bold: true }]);
    deck.undo();
    expect(deck.slides[0].notesLook).toBeUndefined();
    expect(deck.slides[0].notes).toBe('Hi');
  });
});
