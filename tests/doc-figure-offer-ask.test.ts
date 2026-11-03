// @vitest-environment jsdom
//
// The Make Figures offer on opening a document: it shows by default, Don't Ask for This File
// keeps it from showing for that document (saved in the .docx, so it holds when reopened, in
// Word too), and Settings ▸ Preferences can stop it for every document.

import { describe, it, expect } from 'vitest';
import { strToU8 } from 'fflate';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { newDocument, objectRun, paraFromStyle, runStyleOf, type DocText } from '../src/document/document';
import { DocFile } from '../src/document/doc-file';
import { FigureOffer } from '../src/ui/doc-figure-offer';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings';
import type { DocView } from '../src/ui/doc-view';
import * as rt from '../src/richtext';
import type { Contents, TextRun } from '../src/model';

const amine: Contents = {
  atoms: [{ id: 1, x: 0, y: 0, z: 7, label: 'NH2', charge: 0, isotope: 0, just: 'auto' }, { id: 2, x: 14, y: 0, z: 6, label: null, charge: 0, isotope: 0, just: 'auto' }],
  bonds: [{ id: 3, a1: 1, a2: 2, order: 1, display: 'solid', dpos: 'auto' }], captions: [], arrows: [], shapes: [],
};

/** A document with one plain structure (not a figure) in its text. */
function withStructure(extra: Partial<DocText> = {}): DocText {
  const d = newDocument();
  const n = runStyleOf(d.styles.Normal);
  const runs: TextRun[] = [{ ...n, text: 'Before\n' }, objectRun(1, n), { ...n, text: '\nAfter' }];
  const N = paraFromStyle(d.styles.Normal, {});
  return { ...d, runs: rt.normalizeRuns(runs), paras: [N, N, N], objects: { 1: { kind: 'drawing', contents: amine } }, ...extra };
}

const deps: DocxDeps = {
  async picture() { return { png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...strToU8('40x20')]), w: 40, h: 20 }; },
};

function offerOn(allowed = true) {
  const pane = document.createElement('div');
  const applied: { t: DocText; kind: string }[] = [];
  const flashes: string[] = [];
  const offer = new FigureOffer(pane, {
    view: () => ({ zoom: 1, proposals: null, proposalLabel: () => null }) as unknown as DocView,
    apply: (t, kind) => applied.push({ t, kind }),
    redraw: () => {},
    flash: (m) => flashes.push(m),
    allowed: () => allowed,
  });
  const bar = pane.querySelector('.figure-offer') as HTMLDivElement;
  const buttons = () => [...bar.querySelectorAll('button')].map((b) => b.textContent);
  const click = (label: string) => [...bar.querySelectorAll('button')].find((b) => b.textContent === label)!.click();
  return { offer, bar, buttons, click, applied, flashes };
}

describe('the Make Figures offer', () => {
  it('shows on opening, with Don\'t Ask for This File beside Not Now', () => {
    const o = offerOn();
    o.offer.opened(new DocFile(withStructure()));
    expect(o.bar.hidden).toBe(false);
    expect(o.buttons()).toEqual(['Preview Figures…', 'Don\'t Ask for This File', 'Not Now']);
  });

  it('Don\'t Ask for This File marks the document, and the mark keeps the offer away next time', () => {
    const o = offerOn();
    o.offer.opened(new DocFile(withStructure()));
    o.click('Don\'t Ask for This File');
    expect(o.bar.hidden).toBe(true);
    expect(o.applied).toHaveLength(1);
    expect(o.applied[0].t.noFigureOffer).toBe(true);
    expect(o.flashes[0]).toMatch(/Settings ▸ Preferences/);
    const again = offerOn();
    again.offer.opened(new DocFile(o.applied[0].t));
    expect(again.bar.hidden).toBe(true);
  });

  it('the mark round-trips a Word file', async () => {
    const { doc: marked } = await readDocx(await writeDocx(withStructure({ noFigureOffer: true }), deps));
    expect(marked.noFigureOffer).toBe(true);
    const { doc: plain } = await readDocx(await writeDocx(withStructure(), deps));
    expect(plain.noFigureOffer).toBeUndefined();
    const o = offerOn();
    o.offer.opened(new DocFile(marked));
    expect(o.bar.hidden).toBe(true);
  });

  it('turned off in Preferences, no document offers; Make Figures from the menu still previews', () => {
    const o = offerOn(false);
    const f = new DocFile(withStructure());
    o.offer.opened(f);
    expect(o.bar.hidden).toBe(true);
    o.offer.start(f);
    expect(o.bar.hidden).toBe(false);
    expect(o.buttons()).toEqual(['Make Figures', 'Cancel']);
  });

  it('the setting is on unless turned off, and is kept', () => {
    expect(DEFAULT_SETTINGS.offerFigures).toBe(true);
    expect(parseSettings(JSON.stringify({ offerFigures: false })).offerFigures).toBe(false);
    expect(parseSettings(JSON.stringify({})).offerFigures).toBe(true);
  });
});
