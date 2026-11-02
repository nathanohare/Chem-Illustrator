// @vitest-environment jsdom
//
// Nate's review of the Drawing Style window: the reaction arrow options (gaps, how the text lines
// up, fitting the arrow to its text) live in the drawing style too. A style's own values win over
// the app's scheme settings when text is typed by an arrow and in Clean Up Reaction, travel with
// the style (compared, cleaned, scaled), and are kept in CDXML for this app while ChemDraw sees a
// hidden tag.

import { afterEach, describe, expect, it } from 'vitest';
import { Doc, type Arrow } from '../src/model';
import { arrowFrame, inFrame, plainMeasure } from '../src/chem/reaction';
import { arrowTexts, setSideText } from '../src/chem/arrow-text';
import { applySchemePlan, DEFAULT_SCHEME_PREFS, fittedLength, planCleanUp, prefsOf, schemePrefs, setSchemePrefs, spacing } from '../src/chem/scheme-layout';
import { cleanScheme, cleanStyle, sameLook, scaleStyle } from '../src/drawing-styles';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import { ACS_1996 } from '../src/style';

afterEach(() => setSchemePrefs(DEFAULT_SCHEME_PREFS));

const arrow = (doc: Doc, tail = { x: 100, y: 100 }, head = { x: 160, y: 100 }): Arrow =>
  doc.edit('arrow', () => doc.addArrow({ tail, head, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 1.5 }));

describe('a style\'s own scheme settings', () => {
  it('win over the app\'s, the rest coming from the app', () => {
    const doc = new Doc();
    expect(prefsOf(doc)).toBe(schemePrefs);
    setSchemePrefs({ plusGap: 9 });
    doc.style = { ...doc.style, scheme: { lead: 2, headGap: 12, textAlign: 'right' } };
    const p = prefsOf(doc);
    expect([p.lead, p.headGap, p.textAlign, p.plusGap, p.fit]).toEqual([2, 12, 'right', 9, true]);
  });
  it('fit the arrow to its text by the style\'s lead and head gap when text is typed', () => {
    const doc = new Doc();
    doc.style = { ...doc.style, scheme: { lead: 2, headGap: 12, textGap: 5 } };
    const m = plainMeasure(doc);
    const r = arrow(doc);
    doc.edit('t', () => setSideText(doc, m, r, 'above', 'Pd(PPh3)4, K2CO3'));
    const now = doc.arrows.get(r.id)!;
    const f = arrowFrame(now);
    const q = inFrame(f, m.captionBox(arrowTexts(doc, m, now).above[0]));
    expect(q.t1).toBeCloseTo(2, 3);
    expect(q.s1).toBeCloseTo(5, 3);
    expect(f.length).toBeCloseTo(fittedLength(q.t2 - q.t1, 6, doc.style.bondLength, prefsOf(doc)), 3);
    // the app's own settings are left as they were
    expect(schemePrefs.lead).toBeNull();
  });
  it('steer Clean Up Reaction: the gap to the structures, and lines lined up as the style says', () => {
    const build = (scheme?: { structGap?: number; textAlign?: 'left' | 'center' | 'right' }) => {
      const doc = new Doc();
      if (scheme) doc.style = { ...doc.style, scheme };
      const L = doc.style.bondLength;
      const ids = doc.edit('b', () => {
        const a = [doc.addAtom(0, 0).id, doc.addAtom(L, 0).id];
        doc.addBond(a[0], a[1], 1);
        const r = doc.addArrow({ tail: { x: 2 * L, y: 0 }, head: { x: 5 * L, y: 0 }, sweep: 0, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, headLength: 6, headWidth: 1.5 }).id;
        const top = doc.addCaption({ x: 2.3 * L, y: -6, runs: [{ text: 'TFA' }], justify: 'left' }).id;
        const low = doc.addCaption({ x: 2.3 * L, y: 14, runs: [{ text: 'CH2Cl2, 23 C, 1 h' }], justify: 'left' }).id;
        const p = [doc.addAtom(6 * L, 0).id, doc.addAtom(7 * L, 0).id];
        doc.addBond(p[0], p[1], 1);
        return { a, r, top, low };
      });
      const m = plainMeasure(doc);
      applySchemePlan(doc, m, planCleanUp(doc, m)!);
      const r = doc.arrows.get(ids.r)!;
      const t = m.captionBox(doc.captions.get(ids.top)!), b = m.captionBox(doc.captions.get(ids.low)!);
      return { doc, r, t, b, gap: Math.min(r.tail.x, r.head.x) - Math.max(...ids.a.map((id) => doc.atoms.get(id)!.x)) };
    };
    const usual = build();
    expect(usual.gap).toBeCloseTo(spacing(usual.doc.style.bondLength).gap, 1);
    expect(Math.abs((usual.t.x1 + usual.t.x2) / 2 - (usual.b.x1 + usual.b.x2) / 2)).toBeLessThan(0.5);
    const own = build({ structGap: 20, textAlign: 'left' });
    expect(own.gap).toBeCloseTo(20, 1);
    expect(own.t.x1).toBeCloseTo(own.b.x1, 1);
    // and the app's settings are as they were
    expect(schemePrefs.structGap).toBeNull();
    expect(schemePrefs.textAlign).toBe('center');
  });
});

describe('the values travel with the style', () => {
  it('are cleaned, compared and scaled with it', () => {
    expect(cleanScheme({ lead: 3, headGap: -1, textGap: 'x', textAlign: 'middle', fit: false, structGap: 1e6 })).toEqual({ lead: 3, fit: false, structGap: 500 });
    expect(cleanScheme({ textAlign: 'nowhere' })).toBeUndefined();
    const st = cleanStyle({ ...ACS_1996, scheme: { textAlign: 'left', lead: 4 } })!;
    expect(st.scheme).toEqual({ textAlign: 'left', lead: 4 });
    expect(sameLook(st, ACS_1996)).toBe(false);
    expect(sameLook({ ...ACS_1996, scheme: {} }, ACS_1996)).toBe(true);
    const big = scaleStyle(st, 2);
    expect(big.scheme).toEqual({ textAlign: 'left', lead: 8 });
  });
  it('are kept in CDXML, in this app\'s hidden tag', () => {
    const doc = new Doc();
    doc.edit('a', () => { doc.addAtom(0, 0); });
    doc.style = { ...doc.style, scheme: { structGap: 12, textAlign: 'right', fit: false, headGap: 3 } };
    const text = writeCdxml(doc);
    expect(text).toMatch(/<objecttag[^>]*Name="Chem Illustrator arrows"/);
    expect(readCdxml(text).doc.style.scheme).toEqual({ structGap: 12, textAlign: 'right', fit: false, headGap: 3 });
  });
});
