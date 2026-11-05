// Reading ChemDraw CDXML files: structures (atoms, bonds, abbreviations), captions with
// their formatting, arrows, and the common graphics (lines, boxes, circles, brackets,
// charge symbols). Anything not understood yet is counted and skipped, never fatal.

import { tint } from '../colours';
import { pathId, freeformId } from '../design/geo';
import { parseGuides } from '../editor/guides';
import { fillFrameMembers, frameFromTag } from '../editor/frames';
import { ATTACH_TAG, CHEM_TAG, IGNORE_TAG, attachFromTag, fillAttachments } from '../editor/attached';
import { readSpecies } from '../chem/species';
import { highlightStyleFromTag } from '../render/highlight';
import { attachRingFills, ringGeometry, ringsIn } from '../chem/ring-fill';
import { paperOf } from './cdxml-print';
import { lipDirection } from '../chem/polymer';
import { Doc, Atom, Bond, BondDisplay, TextRun, Arrow, Shape, Entity, Kind, StereoLabel, Caption, StepRoles, MorphStep, CHIRAL_FLAGS, PARTIAL, PAPER, type Pin, type OrbitalTag, type PictureFx, type ShapeMath, type HighlightStyle } from '../model';
import { TEXT_TAG, parseTextTag, runsFromChemDraw } from '../text/chemdraw-text';
import { readPageTag } from '../page-grid';
import { DocStyle, MAP_LOOKS, mapBoxStyle, type MapLook } from '../style';
import { elementNumber, hasImplicitH, implicitHydrogens, SYMBOLS } from '../chem/elements';
import { addNicknames, labelBonds, labelSpec, layoutLabel } from '../chem/labels';
import { ringBonds, ringsThroughBond } from '../chem/aromatic';
import { DEG } from '../geom';
import { chordLocal, ellipseArcPoints, headBend, swapHalf } from '../objects';
import { pinSymbols } from '../chem/pins';
import { kids, descendants, withoutDoctype } from './xml';
import { styleFromFace, isSymbolFont, fromSymbolFont, symbolOnlyByChoice, plainByChoice } from '../richtext';
import { dataUrl, fromDataUrl, imageSize } from '../render/images';
import { unzlibSync } from 'fflate';
import { emfToSvg } from '../render/emf-read';
import { emfInWmf } from '../render/wmf-read';
import { tidyFx } from '../render/picture-fx';
import { TABLE_TAG, TABLE_PART_TAG, applyTableTag, gridOf, linesFromBorders, parseTableTag, type ReadCell } from './cdxml-table';
import { layoutTable, NOTE_SCALE } from '../table';
import { arialWidth } from '../text-metrics';
import { cleanScheme } from '../drawing-styles';
import { freshBox, type ChartBox } from '../sheet/chart-box';
import { relinkNewman } from '../design/newman';

export interface ReadStats {
  atoms: number;
  bonds: number;
  captions: number;
  arrows: number;
  shapes: number;
  skipped: Record<string, number>;
  parseMs: number;
  buildMs: number;
}

/** The captions grouped with a table: its title, footnotes, and the text of joined cells by "row column". */
interface TableParts { title?: Element; notes?: Element; cells?: [string, Element][] }

const num = (el: Element, name: string, def = 0): number => {
  const v = el.getAttribute(name);
  if (v === null) return def;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
};

const pts = (v: string | null): number[] => (v ? v.trim().split(/\s+/).map(Number) : []);

export function readCdxml(text: string): { doc: Doc; stats: ReadStats } {
  const t0 = performance.now();
  // ChemDraw writes a DOCTYPE pointing at a web address; drop it so nothing is fetched.
  const xml = new DOMParser().parseFromString(withoutDoctype(text), 'application/xml');
  const t1 = performance.now();
  const root = xml.documentElement;
  if (!root || root.nodeName !== 'CDXML') throw new Error('This does not look like a CDXML file.');
  decodeTags(root);
  hoistOwnTags(root);
  const doc = new Doc();
  // Remember where each object came from, so saving can rewrite only what changed.
  const all = descendants(root);
  const ordOf = new Map<Element, number>();
  let maxId = 0;
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    ordOf.set(el, i);
    const v = Number(el.getAttribute('id'));
    if (v > maxId) maxId = v;
  }
  const ord = new Map<string, number>();
  /** Which entity each element became (kind + id), for the references in reaction steps (worked out when first needed, once the file is read). */
  let refMap: Map<Element, string> | null = null;
  const refOf = () => (refMap ??= new Map([...ord].map(([key, o]) => [all[o], key])));
  const morphTags: [number, string][] = [];
  const pinTags: [number, string][] = [];
  /** Auto-Animate Steps' pieces, from each thing's hidden tag (set on the things once the file is read). */
  const pieces: [Kind, number, number][] = [];
  const from = (kind: Kind, id: number, el: Element) => {
    const o = ordOf.get(el);
    if (o !== undefined) ord.set(kind + id, o);
    const piece = Number(kids(el).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === PIECE_TAG)?.getAttribute('Value'));
    if (Number.isInteger(piece) && piece > 0) pieces.push([kind, id, piece]);
  };
  const stats: ReadStats = { atoms: 0, bonds: 0, captions: 0, arrows: 0, shapes: 0, skipped: {}, parseMs: t1 - t0, buildMs: 0 };
  const skip = (what: string) => { stats.skipped[what] = (stats.skipped[what] ?? 0) + 1; };

  // Document style.
  const st: DocStyle = { ...doc.style, name: 'From file' };
  // sizes must be above zero (a hash spacing of 0 would draw hashes for ever)
  const size = (name: string, dflt: number) => { const v = num(root, name, dflt); return v > 0 ? v : dflt; };
  st.bondLength = size('BondLength', 30);
  st.lineWidth = size('LineWidth', 1);
  st.boldWidth = size('BoldWidth', 4);
  st.marginWidth = num(root, 'MarginWidth', 2);
  st.hashSpacing = size('HashSpacing', 2.7);
  st.bondSpacing = num(root, 'BondSpacing', 12);
  st.chainAngle = num(root, 'ChainAngle', 120);
  st.labelSize = size('LabelSize', 10);
  st.captionSize = size('CaptionSize', 12);
  st.captionFace = num(root, 'CaptionFace', 0);
  if (root.hasAttribute('LabelFace')) st.labelFace = num(root, 'LabelFace', 0); else delete st.labelFace;
  doc.style = st;
  // ChemDraw's highlight disc (measured from its own pictures): 0.27 bond lengths plus half a line width across
  const chemdrawHighlight: HighlightStyle = { shape: 'round', size: (0.27 * st.bondLength + st.lineWidth / 2) / (0.27 * st.bondLength) };

  // Colours: index 0 is black and 1 white; the colour table starts at index 2.
  const colors: string[] = ['#000000', '#ffffff'];
  const ct = all.find((e) => e.nodeName === 'colortable');
  if (ct) {
    for (const c of kids(ct)) {
      if (c.nodeName !== 'color') continue;
      const h = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');
      colors.push('#' + h(num(c, 'r')) + h(num(c, 'g')) + h(num(c, 'b')));
    }
  }
  const color = (el: Element): string | undefined => {
    const v = el.getAttribute('color');
    if (v === null) return undefined;
    const c = colors[Number(v)];
    return c && c !== '#000000' ? c : undefined;
  };
  const bg = root.getAttribute('bgcolor');
  if (bg !== null && colors[Number(bg)]) doc.background = colors[Number(bg)];
  // the page: one sheet's drawing area (the page's box over how many sheets it spans)
  const pg = all.find((e) => e.nodeName === 'page');
  if (pg) doc.guides = parseGuides(kids(pg).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === GUIDES_TAG)?.getAttribute('Value'));
  const arrowText = pg && kids(pg).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === ARROW_TEXT_TAG)?.getAttribute('Value');
  if (arrowText) {
    try {
      const v = JSON.parse(arrowText) as { size?: unknown; font?: unknown; width?: unknown; head?: unknown; headWidth?: unknown; scheme?: unknown };
      if (typeof v.size === 'number' && v.size > 0 && v.size < 400) doc.style.arrowTextSize = v.size;
      if (typeof v.font === 'string' && v.font.trim()) doc.style.arrowTextFont = v.font.trim().slice(0, 80);
      const pt = (x: unknown) => (typeof x === 'number' && x > 0 && x <= 30 ? x : undefined);
      if (pt(v.width)) doc.style.arrowWidth = pt(v.width);
      if (pt(v.head)) doc.style.arrowHeadLength = pt(v.head);
      if (pt(v.headWidth)) doc.style.arrowHeadWidth = pt(v.headWidth);
      const scheme = cleanScheme(v.scheme);
      if (scheme) doc.style.scheme = scheme;
    } catch { /* not ours to read */ }
  }
  const mapLook = pg && kids(pg).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === MAP_LOOK_TAG)?.getAttribute('Value');
  if (mapLook) {
    try {
      const v = JSON.parse(mapLook) as { look?: unknown; box?: unknown };
      if (MAP_LOOKS.some((l) => l.value === v.look)) doc.style.mapLook = v.look as MapLook;
      if (v.box !== undefined) doc.style.mapBox = mapBoxStyle(v.box);
    } catch { /* not ours to read */ }
  }
  const pb = pg?.getAttribute('BoundingBox')?.trim().split(/\s+/).map(Number);
  const posterW = Number(pg?.getAttribute('Width')), posterH = Number(pg?.getAttribute('Height'));
  if (pg?.getAttribute('DrawingSpace') === 'poster' && pb && pb.length === 4 && pb.every(isFinite)) {
    // a poster is one sheet of its own size (Width and Height); WidthPages and HeightPages only say
    // how many sheets of paper it prints on
    const w = posterW > 10 ? posterW : pb[2] - pb[0], h = posterH > 10 ? posterH : pb[3] - pb[1];
    if (w > 10 && h > 10) doc.page = { w, h, grow: false, poster: true };
  } else if (pb && pb.length === 4 && pb.every(isFinite)) {
    const wp = Math.max(1, Number(pg!.getAttribute('WidthPages')) || 1), hp = Math.max(1, Number(pg!.getAttribute('HeightPages')) || 1);
    const w = (pb[2] - pb[0]) / wp, h = (pb[3] - pb[1]) / hp;
    if (w > 10 && h > 10) {
      // the paper's name from ChemDraw's print record (its margins are its own), else from the page
      const sheet = paperOf(root.getAttribute('MacPrintInfo'));
      const pw = sheet ? sheet.w - 72 : w, ph = sheet ? sheet.h - 72 : h;
      const paper = PAPER.find((p) => (Math.abs(p.w - pw) < 2 && Math.abs(p.h - ph) < 2) || (Math.abs(p.w - ph) < 2 && Math.abs(p.h - pw) < 2));
      doc.page = { w, h, grow: true, ...(paper ? { name: paper.name } : {}), ...(wp > 1 ? { across: wp } : {}), ...(hp > 1 ? { down: hp } : {}) };
      // this program's page grid: which edges are fixed, and whether it is kept to its pages
      const grid = readPageTag(kids(pg!).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === PAGE_TAG)?.getAttribute('Value'));
      if (grid) Object.assign(doc.page, grid);
    }
  }

  const fonts = new Map<string, string>();
  const ft = all.find((e) => e.nodeName === 'fonttable');
  if (ft) for (const f of kids(ft)) if (f.nodeName === 'font') fonts.set(f.getAttribute('id') ?? '', f.getAttribute('name') ?? 'Arial');
  // the drawing's label and caption fonts (a Symbol font is only for single characters)
  for (const [attr, key] of [['LabelFont', 'labelFont'], ['CaptionFont', 'captionFont']] as const) {
    const name = fonts.get(root.getAttribute(attr) ?? '');
    if (name?.trim() && !isSymbolFont(name)) doc.style[key] = name.trim();
  }

  // Charges drawn by a separate circled-charge graphic are not drawn again on the atom.
  const chargeShown = new Set<string>();
  for (const r of all) {
    if (r.nodeName === 'represent' && r.getAttribute('attribute') === 'Charge') chargeShown.add(r.getAttribute('object') ?? '');
  }

  /** The text pieces of a <t>. Symbol-font text becomes the characters it shows, unless `raw`. */
  const runsOf = (t: Element, raw = false): TextRun[] => {
    const out: TextRun[] = [];
    for (const s of kids(t)) {
      if (s.nodeName !== 's') continue;
      const face = num(s, 'face', 0);
      const fontName = fonts.get(s.getAttribute('font') ?? '');
      const run: TextRun = { text: s.textContent ?? '', ...styleFromFace(face) };
      const size = s.getAttribute('size');
      if (size !== null) run.size = Number(size);
      // Greek letters and signs written in the Symbol font become the characters they show
      if (isSymbolFont(fontName) && !raw) run.text = fromSymbolFont(run.text);
      // a run in another font than the captions' keeps it, Arial included (ChemDraw's own default)
      else if (fontName?.trim() && fontName.trim().toLowerCase() !== (doc.style.captionFont || 'Arial').toLowerCase()) run.font = fontName.trim();
      const c = color(s);
      if (c) run.color = c;
      out.push(run);
    }
    return out;
  };

  const usedIds = new Set<number>();
  const idFor = (el: Element): number => {
    const v = Number(el.getAttribute('id'));
    if (Number.isInteger(v) && v > 0 && !usedIds.has(v)) { usedIds.add(v); return v; }
    const n = doc.newId();
    usedIds.add(n);
    return n;
  };

  /** A stereo label (ChemDraw's objecttag named "stereo"), placed relative to (ox, oy). */
  const stereoTag = (tag: Element, ox: number, oy: number): StereoLabel | undefined => {
    const st = kids(tag).find((k) => k.nodeName === 't');
    const runs = st ? runsOf(st) : [];
    const [sx, sy] = pts(st?.getAttribute('p') ?? null);
    const text = runs.map((r) => r.text).join('');
    if (!text || !Number.isFinite(sx) || !Number.isFinite(sy) || st!.getAttribute('Visible') === 'no') return undefined;
    const l: StereoLabel = { text, dx: sx - ox, dy: sy - oy, size: runs[0].size ?? 4.5, fromFile: true, ...(tag.getAttribute('PositioningType') === 'offset' ? { offset: true } : {}) };
    if (runs[0].italic) l.italic = true;
    return l;
  };

  interface PendingLabel { atom: Atom; text: string; hShown: number | null }
  const pendingLabels: PendingLabel[] = [];
  /** Circles drawn inside structures: ring circles when they sit in the middle of an aromatic ring. */
  const pendingCircles: { x: number; y: number; oval: () => void }[] = [];

  /** Every bond read, by its id in the file, and the bonds the file says each one crosses. */
  const allBondIds = new Map<string, number>();
  const fileCrossings: [number, string[]][] = [];
  const readFragment = (frag: Element) => {
    // text ChemDraw turned into a lone label on saving (Interpret Chemically): a text box again, as
    // it was written; ChemDraw's guess at what an unknown name is made of (DMAP as D, M, A, P) is not kept
    // (also such a label sharing a fragment with structures it has no bond to, as older ChemDraw
    // versions save them: the same text box, so it reads back the same once saved here)
    const bonded = new Set<string>();
    for (const k of kids(frag)) {
      if (k.nodeName === 'b') { bonded.add(k.getAttribute('B') ?? ''); bonded.add(k.getAttribute('E') ?? ''); }
      if (k.nodeName === 'n') for (const a of (k.getAttribute('Attachments') ?? '').trim().split(/\s+/)) bonded.add(a);
    }
    const asText = new Set<Element>();
    for (const n of kids(frag)) {
      if (n.nodeName !== 'n' || bonded.has(n.getAttribute('id') ?? '')) continue;
      const type = n.getAttribute('NodeType');
      const t = kids(n).find((k) => k.nodeName === 't');
      // (ChemDraw 25 keeps reagent text such as "MsCl, Et3N" as an AnonymousAlternativeGroup it couldn't interpret)
      if (t && (type === 'Unspecified' || ((type === 'Fragment' || type === 'Nickname' || type === 'AnonymousAlternativeGroup') && n.getAttribute('NeedsClean') === 'yes'))) {
        const c = captionOf(t);
        if (c) {
          const cap = doc.addCaption({ id: idFor(t), ...c });
          from('c', cap.id, t);
          stats.captions++;
          asText.add(n);
        }
      }
    }
    if (asText.size && kids(frag).every((k) => k.nodeName !== 'n' || asText.has(k))) {
      // the text's own marks stay: a counter-ion's circled charge (BF4⊖, TfO⊖) sits in its fragment
      for (const g of kids(frag)) if (g.nodeName === 'graphic') readGraphic(g);
      return;
    }
    const nodeIds = new Map<string, number>();
    const pendingMulti: { id: number; key: string; ids: string[]; x: number; y: number; el: Element }[] = [];
    const variables: { id: number; x: number; y: number; ring: number[] | null }[] = [];
    for (const n of kids(frag)) {
      if (n.nodeName !== 'n' || asText.has(n)) continue;
      const type = n.getAttribute('NodeType');
      const [x, y] = pts(n.getAttribute('p'));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const id = idFor(n);
      if (type === 'MultiAttachment' || type === 'VariableAttachment') {
        // the middle of a ring or π-bond a metal is bonded to: its atoms are read once they all are
        const a = doc.addAtom(x, y, 0, { id, multi: [], ...(type === 'VariableAttachment' ? { variable: true } : {}) });
        if (kids(n).some((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === KEKULE_TAG)) a.kekule = true;
        pendingMulti.push({ id: a.id, key: n.getAttribute('id') ?? '', ids: (n.getAttribute('Attachments') ?? '').trim().split(/\s+/).filter(Boolean), x, y, el: n });
        from('a', a.id, n);
        nodeIds.set(n.getAttribute('id') ?? '', id);
        continue;
      }
      // read as plain atoms, which they aren't quite: said so in the read's warnings
      if (type === 'LinkNode') skip(`${type} node`);
      if (type === 'ExternalConnectionPoint') {
        // a point of attachment drawn on its own (the wavy line ending a substituent)
        const attachColor = color(n);
        const a = doc.addAtom(x, y, 0, { id, attach: n.getAttribute('ExternalConnectionType') ?? 'Unspecified', ...(attachColor ? { color: attachColor } : {}) });
        const num = Number(n.getAttribute('ExternalConnectionNum'));
        if (Number.isInteger(num) && num > 0) a.attachNum = num;
        from('a', a.id, n);
        nodeIds.set(n.getAttribute('id') ?? '', id);
        continue;
      }
      const z = num(n, 'Element', 6);
      // a label's charge may be kept only on an atom of its inner fragment (BF4− as ChemDraw saves it)
      const inner = type === 'Fragment' || type === 'Nickname' ? kids(n).find((k) => k.nodeName === 'fragment') : undefined;
      const charge = n.hasAttribute('Charge') || !inner ? num(n, 'Charge', 0)
        : kids(inner).reduce((q, k) => q + (k.nodeName === 'n' ? num(k, 'Charge', 0) : 0), 0);
      const extra: Partial<Atom> = { id, charge, isotope: num(n, 'Isotope', 0) };
      if (n.getAttribute('IgnoreWarnings') === 'yes') extra.ignoreWarnings = true;
      const xyz = pts(n.getAttribute('xyz'));
      if (xyz.length === 3 && xyz.every(Number.isFinite)) extra.xyz = xyz as [number, number, number];
      const rad = n.getAttribute('Radical');
      if (rad === 'Singlet' || rad === 'Doublet' || rad === 'Triplet') extra.radical = rad.toLowerCase() as Atom['radical'];
      // a ring-fusion H: a filled dot (toward the viewer) or a hashed one (away)
      if (n.getAttribute('HDot') === 'yes') extra.hDot = 'dot';
      else if (n.getAttribute('HDash') === 'yes') extra.hDot = 'dash';
      const c = color(n);
      if (c) extra.color = c;
      if (chargeShown.has(n.getAttribute('id') ?? '')) extra.hideCharge = true;
      const ls = n.getAttribute('LabelSize');
      const mw = Number(n.getAttribute('MarginWidth') ?? frag.getAttribute('MarginWidth'));
      if (mw > 0 && Math.abs(mw - st.marginWidth) > 1e-3) extra.marginWidth = mw;
      if (ls !== null) extra.s = Number(ls) / st.labelSize;
      let t: Element | null = null;
      for (const ch of kids(n)) {
        if (ch.nodeName === 't') t = ch;
        else if (ch.nodeName === 'objecttag' && ch.getAttribute('Name') === 'stereo') {
          // ChemDraw's (R)/(S) label beside the atom
          const l = stereoTag(ch, x, y);
          if (l) extra.stereoLabel = l;
        } else if (ch.nodeName === 'objecttag' && ch.getAttribute('Name') === 'number') {
          // where the atom number sits (the ' key)
          const l = stereoTag(ch, x, y);
          if (l) {
            extra.numberLabel = { dx: l.dx, dy: l.dy, size: l.size };
            // its own colour and weight, as ChemDraw keeps them on the number's text
            const s = kids(kids(ch).find((k) => k.nodeName === 't') ?? ch).find((k) => k.nodeName === 's');
            const nc = s ? color(s) : undefined;
            const nf = s ? num(s, 'face', 0) & 7 : 0;
            if (nc && nc !== (color(n) ?? '#000000')) extra.numberLabel.color = nc;
            if (nf) extra.numberLabel.face = nf;
          }
        }
      }
      if (n.getAttribute('ShowAtomStereo') === 'yes') extra.showStereo = true;
      const enh = n.getAttribute('EnhancedStereoType');
      if (enh === 'Absolute') extra.enhStereo = { type: 'abs' };
      else if (enh === 'And' || enh === 'Or') extra.enhStereo = { type: enh === 'And' ? 'and' : 'or', group: num(n, 'EnhancedStereoGroupNum', 1) };
      const groupTag = kids(n).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === GROUP_TAG)?.getAttribute('Value');
      // (a group saved with its label text counts only while ChemDraw shows that text: a label
      // retyped there, OMe to OEt, means a different group)
      if (groupTag) {
        let g: { label?: unknown; smiles?: unknown } | null = null;
        try { g = groupTag.trim().startsWith('{') ? JSON.parse(groupTag) : null; } catch { g = null; }
        const shown = kids(n).find((k) => k.nodeName === 't')?.textContent ?? '';
        if (!g) extra.group = groupTag;
        else if (typeof g.smiles === 'string' && (typeof g.label !== 'string' || g.label === shown)) extra.group = g.smiles;
      }
      const altTag = kids(n).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === ALT_TAG)?.getAttribute('Value');
      if (altTag) extra.alt = altTag;
      const mapTag = Number(kids(n).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === MAP_TAG)?.getAttribute('Value'));
      if (Number.isInteger(mapTag) && mapTag > 0) extra.mapNo = mapTag;
      const hlA = kids(n).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === HIGHLIGHT_TAG)?.getAttribute('Value');
      if (hlA && /^#[0-9a-f]{6}$/i.test(hlA)) extra.highlight = hlA.toLowerCase();
      // ChemDraw's own atom highlight
      else if (n.hasAttribute('highlightColor') && colors[num(n, 'highlightColor', -1)]) {
        extra.highlight = colors[num(n, 'highlightColor', -1)];
        extra.hl = chemdrawHighlight;
      }
      const lookA = highlightStyleFromTag(kids(n).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === HIGHLIGHT_LOOK_TAG)?.getAttribute('Value'));
      if (lookA && extra.highlight) extra.hl = lookA;
      if (n.getAttribute('ShowTerminalCarbonLabels') === 'yes' || n.getAttribute('ShowNonTerminalCarbonLabels') === 'yes') extra.showCarbon = true;
      const atomNumber = n.getAttribute('AtomNumber');
      if (atomNumber) extra.atomNumber = atomNumber;
      if (n.getAttribute('ShowAtomNumber') === 'yes') extra.showNumber = true;
      const atom = doc.addAtom(x, y, z, extra);
      from('a', id, n);
      nodeIds.set(n.getAttribute('id') ?? '', id);
      stats.atoms++;
      if (t) {
        const runs = runsOf(t);
        // a label set in a face of its own (bold labels in a drawing whose labels are plain, or the other way)
        // (only what every run has: the italic t of tBu is the label's marks, not its face)
        const faces = kids(t).filter((k) => k.nodeName === 's').map((k) => num(k, 'face', 0));
        const face = faces.length ? faces.reduce((m, v) => m & v) : undefined;
        if (face !== undefined && (face & 1) !== ((st.labelFace ?? 0) & 1)) atom.face = face;
        let txt = runs.map((r) => r.text).join('');
        // a charge the label doesn't show (no sign, and no circled charge beside it) isn't shown
        if (atom.charge && !/[+−]|-d*$/.test(txt)) atom.hideCharge = true;
        if (atom.charge) {
          // the charge is part of the label text ("N+", "O2−"); it is drawn from the charge instead
          const n = Math.abs(atom.charge);
          txt = txt.replace(new RegExp(`${n > 1 ? n : ''}[${atom.charge > 0 ? '+' : '\\-−'}]$`), '');
        }
        // the label's inner fragment as ChemDraw has it (written back while the label is unchanged)
        const innerEl = kids(n).find((k) => k.nodeName === 'fragment');
        if (innerEl && type && typeof XMLSerializer !== 'undefined') {
          const nick = n.getAttribute('GenericNickname');
          atom.cdxInner = { label: txt, type, ...(nick ? { nick } : {}), xml: new XMLSerializer().serializeToString(innerEl), x, y };
        } else if (type === 'Unspecified') {
          // a label ChemDraw couldn't interpret ((3,4)-MDP) stays one while unchanged: read as a group
          // and cleaned, ChemDraw turns it round
          atom.cdxInner = { label: txt, type, xml: '' };
        }
        const look = labelLookOf(runs, txt);
        if (look.supDigits !== undefined) atom.supDigits = look.supDigits;
        if (look.marks) atom.labelMarks = look.marks;
        // (ChemDraw draws the text's size, whatever the node's LabelSize says)
        const size = runs[0]?.size;
        if (size) atom.s = size / st.labelSize;
        const lj = t.getAttribute('LabelJustification');
        const la = t.getAttribute('LabelAlignment');
        const ld = n.getAttribute('LabelDisplay');
        // stacked above or below, as ChemDraw draws it: not when the node says the label runs left or right
        const below = ld === 'Below' || (ld !== 'Left' && ld !== 'Right' && la === 'Below'), above = ld === 'Above' || (ld !== 'Left' && ld !== 'Right' && la === 'Above');
        // (stacked wins over centred)
        if (!above && !below && (la === 'Center' || t.getAttribute('Justification') === 'Center')) atom.centred = true;
        // which way the label runs: the node's LabelDisplay, else the text's LabelJustification;
        // LabelAlignment counts only for labels stacked above or below (the spec: multi-attached labels)
        if (above || below) { atom.just = 'auto'; atom.stacked = above ? 'up' : 'down'; if (t.getAttribute('LineHeight') === 'auto') atom.stackedLoose = true; }
        else if (ld === 'Left' || ld === 'Right') { atom.just = ld === 'Left' ? 'right' : 'left'; atom.fixedDir = true; }
        else if (ld === 'Center') atom.fixedDir = true;
        else if (lj === 'Right' || lj === 'Left') atom.just = lj === 'Right' ? 'left' : 'right';
        else if (la === 'Right') atom.just = 'left';
        else if (la === 'Left') atom.just = 'right';
        const nh = n.getAttribute('NumHydrogens');
        const isPlain = !type || type === 'Element';
        pendingLabels.push({ atom, text: txt, hShown: isPlain && nh !== null ? Number(nh) : isPlain ? null : -1 });
      }
    }
    for (const m of pendingMulti.splice(0)) {
      const atoms = m.ids.map((x) => nodeIds.get(x)).filter((x): x is number => x !== undefined);
      if (atoms.length >= 2) { doc.updateAtom(m.id, { multi: atoms }); if (doc.atoms.get(m.id)!.variable) variables.push({ ...m, ring: ringFromTag(m.el, nodeIds) }); }
      else { doc.removeAtom(m.id); nodeIds.delete(m.key); skip('multicenter attachment without its atoms'); }
    }
    const bondIds = new Map<string, number>();
    // ChemDraw lists near misses among a fragment's crossing bonds too, so every bond keeps its layer there
    const layered = kids(frag).some((k) => k.nodeName === 'b' && k.hasAttribute('CrossingBonds'));
    for (const b of kids(frag)) {
      if (b.nodeName === 'graphic') readGraphic(b); // circled charges and lone pairs sit with their structure
      if (b.nodeName === 'curve') readCurve(b); // (a metal complex's perspective ring ellipse, a wave)
      if (b.nodeName !== 'b') continue;
      let a1 = nodeIds.get(b.getAttribute('B') ?? '');
      let a2 = nodeIds.get(b.getAttribute('E') ?? '');
      if (a1 === undefined || a2 === undefined || a1 === a2) continue;
      const ord = b.getAttribute('Order') ?? '1';
      let order = ord === '2' ? 2 : ord === '3' ? 3 : ord === '4' ? 4 : ord === '1.5' ? 1.5 : ord === '0.5' ? PARTIAL : 1;
      let display: BondDisplay = 'solid';
      const disp = b.getAttribute('Display');
      let swap = false;
      switch (disp) {
        case 'WedgeBegin': display = 'wedge'; break;
        case 'WedgeEnd': display = 'wedge'; swap = true; break;
        case 'HollowWedgeBegin': display = 'hollowWedge'; break;
        case 'HollowWedgeEnd': display = 'hollowWedge'; swap = true; break;
        case 'WavyWedgeBegin': display = 'wavyWedge'; break;
        case 'WavyWedgeEnd': display = 'wavyWedge'; swap = true; break;
        case 'WedgedHashBegin': display = 'hashWedge'; break;
        case 'WedgedHashEnd': display = 'hashWedge'; swap = true; break;
        case 'Hash': display = 'hash'; break;
        case 'Bold': display = 'bold'; break;
        case 'Dash': display = 'dash'; break;
        case 'Wavy': display = 'wavy'; break;
      }
      if (order === PARTIAL && display === 'solid') display = 'dash';
      if (ord === 'dative') display = 'dative';
      if (ord === 'hydrogen') display = 'hydrogen';
      if (ord === 'ionic') display = 'ionic';
      const d2 = b.getAttribute('Display2');
      // looks of ours that ChemDraw 25 can't keep (it draws the nearest it has): our tag holds them,
      // while ChemDraw's words are still the ones written beside it
      const look = bondLookOf(kids(b).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === BOND_LOOK_TAG)?.getAttribute('Value'));
      if (look.display && ord === '1' && disp === (look.display === 'wavyWedge' ? 'Wavy' : 'Dash')) display = look.display;
      let line2: Bond['line2'];
      // (ChemDraw saves a double bond with a dashed second line as its dashed aromatic bond, Order 1.5)
      if (d2 === 'Dash' && (ord === '2' || (ord === '1.5' && look.line2 === 'dash'))) { order = 2; line2 = 'dash'; }
      else if (order === 2 && (d2 === 'Bold' || d2 === 'Hash')) line2 = d2 === 'Bold' ? 'bold' : 'hash';
      else if (order === 2 && !d2 && (look.line2 === 'bold' || look.line2 === 'hash')) line2 = look.line2;
      let dpos: Bond['dpos'] = 'auto';
      const dp = b.getAttribute('DoublePosition');
      // (ChemDraw's Right is on the left of B to E as drawn, y running down, whichever way the bond runs: measured from its pictures)
      if (dp === 'Center') dpos = 'center';
      else if (dp === 'Right') dpos = 'left';
      else if (dp === 'Left') dpos = 'right';
      if (swap) {
        [a1, a2] = [a2, a1];
        if (dpos === 'left') dpos = 'right'; else if (dpos === 'right') dpos = 'left';
      }
      const extra: Partial<Bond> = { id: idFor(b), dpos };
      // ChemDraw's aromatic bond (Order="1.5") on its own is drawn as one line; with Display2 Dash it is its
      // dashed aromatic bond (as ChemDraw saves one, though it reads Order 2 with Display2 Dash the same way)
      if (ord === '1.5' && d2 !== 'Dash') extra.plain = true;
      if (line2) extra.line2 = line2;
      if (b.getAttribute('IgnoreWarnings') === 'yes') extra.ignoreWarnings = true;
      if (b.getAttribute('ShowBondStereo') === 'yes') extra.showStereo = true;
      // the label characters the bond meets (counted from 0; 0 is the default), with their atoms
      const ba = num(b, 'BeginAttach', 0), ea = num(b, 'EndAttach', 0);
      const [at1, at2] = swap ? [ea, ba] : [ba, ea];
      if (at1 > 0) extra.beginAttach = at1;
      if (at2 > 0) extra.endAttach = at2;
      // a bond crossing others: the higher Z is in front
      if (layered && b.hasAttribute('Z')) extra.z = num(b, 'Z');
      const tag = kids(b).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === 'stereo');
      if (tag) {
        // ChemDraw's (E)/(Z) label by the double bond, kept relative to the bond's middle
        const p = doc.atoms.get(a1)!, q = doc.atoms.get(a2)!;
        const l = stereoTag(tag, (p.x + q.x) / 2, (p.y + q.y) / 2);
        if (l) extra.stereoLabel = l;
      }
      // the bond's own widths, else its structure's (ChemDraw keeps them on either)
      const own = (name: string) => b.getAttribute(name) ?? frag.getAttribute(name);
      const lw = own('LineWidth');
      if (lw !== null) extra.s = Number(lw) / st.lineWidth;
      const widths = { BoldWidth: 'boldWidth', HashSpacing: 'hashSpacing', MarginWidth: 'marginWidth', BondLength: 'bondLength' } as const;
      for (const [attr, key] of Object.entries(widths)) {
        const v = Number(own(attr));
        if (own(attr) !== null && v > 0 && Math.abs(v - st[key]) > 1e-3) extra[key] = v;
        // a bond with a line width of its own keeps the drawing's other widths (they would scale with it)
        else if (extra.s !== undefined && Math.abs(extra.s - 1) > 1e-3) extra[key] = own(attr) !== null && v > 0 ? v : st[key];
      }
      const c = color(b);
      if (c) extra.color = c;
      const hlB = kids(b).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === HIGHLIGHT_TAG)?.getAttribute('Value');
      if (hlB && /^#[0-9a-f]{6}$/i.test(hlB)) extra.highlight = hlB.toLowerCase();
      else if (b.hasAttribute('highlightColor') && colors[num(b, 'highlightColor', -1)]) {
        extra.highlight = colors[num(b, 'highlightColor', -1)];
        extra.hl = chemdrawHighlight;
      }
      const lookB = highlightStyleFromTag(kids(b).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === HIGHLIGHT_LOOK_TAG)?.getAttribute('Value'));
      if (lookB && extra.highlight) extra.hl = lookB;
      if (kids(b).some((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === SPOKES_TAG)) extra.spokes = true;
      const bond = doc.addBond(a1, a2, order, display, extra);
      from('b', bond.id, b);
      bondIds.set(b.getAttribute('id') ?? '', bond.id);
      allBondIds.set(b.getAttribute('id') ?? '', bond.id);
      const crosses = (b.getAttribute('CrossingBonds') ?? '').trim();
      if (crosses) fileCrossings.push([bond.id, crosses.split(/\s+/)]);
      stats.bonds++;
    }
    // a variable attachment goes where the file has it: the middle of its atoms, or of the smallest
    // ring they are all in (this program keeps it at one or the other, so anywhere else is said so)
    for (const v of variables) {
      const a = doc.atoms.get(v.id)!;
      if (v.ring) { doc.updateAtom(v.id, { ringOf: v.ring }); continue; }
      const near = (c: { x: number; y: number } | null) => !!c && Math.hypot(c.x - v.x, c.y - v.y) < 0.5;
      if (near(doc.centreOf({ multi: a.multi }))) { const whole = smallestRing(a.multi!); if (whole && whole.length === a.multi!.length) doc.updateAtom(v.id, { ringOf: whole }); continue; }
      const ring = smallestRing(a.multi!);
      if (ring) doc.updateAtom(v.id, { ringOf: ring });
      if (!near(doc.centreOf(doc.atoms.get(v.id)!))) skip('variable attachment moved to the middle of its atoms');
    }
    // a carbon left on its own with no label (a stray atom): ChemDraw draws nothing there
    for (const n of kids(frag)) {
      if (n.nodeName !== 'n' || n.getAttribute('NodeType') || kids(n).some((k) => k.nodeName === 't') || num(n, 'Element', 6) !== 6) continue;
      const id = nodeIds.get(n.getAttribute('id') ?? '');
      if (id !== undefined && doc.degree(id) === 0) doc.updateAtom(id, { bare: true });
    }
    // ChemDraw's ring fills: an area coloured in behind the bonds that go round it
    for (const area of kids(frag)) {
      if (area.nodeName !== 'ColoredMolecularArea') continue;
      const ring = cycleOf(doc, (area.getAttribute('BasisObjects') ?? '').trim().split(/\s+/).map((x) => bondIds.get(x)).filter((x): x is number => x !== undefined));
      const fill = colors[num(area, 'bgcolor', -1)];
      if (!ring || !fill) { skip('ring fill'); continue; }
      const sh = doc.addShape({ id: idFor(area), kind: 'ring', ring, ...ringGeometry(doc, ring), filled: true, fillColor: fill, z: -1000 });
      from('s', sh.id, area);
      stats.shapes++;
    }
  };

  const readCaption = (t: Element) => {
    const c = captionOf(t);
    if (!c) return;
    const cap = doc.addCaption({ id: idFor(t), ...c });
    from('c', cap.id, t);
    stats.captions++;
  };

  /** A caption's text and layout as read from its element (null for an empty or hidden one). */
  const captionOf = (t: Element): Omit<Caption, 'id'> | null => {
    const runs = runsOf(t, true);
    if (!runs.length || t.getAttribute('Visible') === 'no') return null;
    const [px, py] = pts(t.getAttribute('p'));
    const bb = pts(t.getAttribute('BoundingBox'));
    // (ChemDraw 25 leaves a text without its own justification on the left, whatever the document's CaptionJustification)
    const j = t.getAttribute('Justification') ?? t.getAttribute('CaptionJustification');
    const justify = j === 'Center' ? 'center' : j === 'Right' ? 'right' : j === 'Full' ? 'justify' : 'left';
    const ww = Number(t.getAttribute('WordWrapWidth'));
    const wrap = ww > 0 ? ww : undefined;
    let x = px, width: number | undefined;
    if (wrap !== undefined) {
      // a text box: its lines wrap to its width, and p is on the side the lines are lined up on
      if (justify === 'center') x = px - wrap / 2;
      else if (justify === 'right') x = px - wrap;
    } else if (justify !== 'left' && bb.length === 4) {
      x = Math.min(bb[0], bb[2]);
      width = Math.abs(bb[2] - bb[0]);
    }
    for (const r of runs) if (r.size === undefined) r.size = st.captionSize;
    // ChemDraw stores where each line starts (as UTF-8 byte offsets). Without a wrap width those
    // are all line breaks; in a text box the lines wrap by themselves.
    const ls = t.getAttribute('LineStarts');
    if (ls && wrap === undefined) applyLineEnds(runs, ls.trim().split(/\s+/).map(Number).slice(0, -1));
    // (the line ends count the text as stored, so Symbol-font text is turned into Greek letters afterwards)
    for (const r of runs) {
      if (isSymbolFont(r.font)) { r.text = fromSymbolFont(r.text); delete r.font; if (symbolOnlyByChoice(r.text)) r.symbolFont = true; }
      else if (plainByChoice(r.text)) r.symbolFont = false;
    }
    const lh = t.getAttribute('LineHeight') ?? t.getAttribute('CaptionLineHeight');
    let lineHeight = lh && /^[\d.]+$/.test(lh) ? Number(lh) : undefined;
    // lists and paragraph formatting saved by this program, if the text still matches them
    const tagEl = kids(t).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === TEXT_TAG);
    const back = runsFromChemDraw(runs, parseTextTag(tagEl?.getAttribute('Value') ?? null));
    const extra: Partial<Caption> = {};
    if (wrap !== undefined) extra.wrap = wrap;
    if (back.paras) extra.paras = back.paras;
    if (back.lineSpacing) { extra.lineSpacing = back.lineSpacing; lineHeight = undefined; }
    // ChemDraw's usual spacing, variable (which it takes a text with no line height of its own to have):
    // lines as close as their ink lets them
    else if (lineHeight === undefined && (lh === null || lh === 'variable')) extra.inkLines = true;
    const attach = attachFromTag(kids(t).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === ATTACH_TAG)?.getAttribute('Value') ?? null);
    if (attach) extra.attach = attach;
    if (kids(t).some((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === IGNORE_TAG)) extra.ignoreWarnings = true;
    // read as chemistry or as text: as set here by hand, else ChemDraw's Interpret Chemically
    // (text it interprets that this program wouldn't read by itself is kept as Chemical)
    const chemTag = kids(t).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === CHEM_TAG)?.getAttribute('Value');
    if (chemTag === 'yes' || chemTag === 'no') extra.chem = chemTag === 'yes';
    else if (t.getAttribute('InterpretChemically') === 'yes' && !readSpecies(back.runs.map((r) => r.text).join(''))) extra.chem = true;
    const turn = Number(kids(t).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === TURN_TAG)?.getAttribute('Value'));
    // ChemDraw's own turn (1/65536 degree, clockwise about the text's origin) when this program left no tag
    const angle = (Number(t.getAttribute('RotationAngle') ?? NaN) / 65536) % 360;
    // ChemDraw's own angle wins when it has one (turned again or set level there); our tag only
    // for files that have none
    if (t.hasAttribute('RotationAngle') && Number.isFinite(angle)) { if (angle) extra.rot = angle > 180 ? angle - 360 : angle; }
    else if (Number.isFinite(turn) && turn) extra.rot = turn;
    return { x, y: py, runs: back.runs, justify, width, lineHeight, ...extra };
  };

  /**
   * A ChemDraw table: its cells' text, column widths and rules, with what this program tagged
   * on it (heading rows, alignment, joined cells), and its title and footnotes when they are
   * grouped with it. `outer` is the group holding them, which stands for the table when saving.
   */
  const readTable = (tbl: Element, outer: Element | null, parts: TableParts) => {
    const read: ReadCell[] = [];
    const figs: Element[] = [];
    /** Add a text's runs to a cell (after any it has, on a new line). */
    const addText = (cell: ReadCell['cell'], t: Element) => {
      const c = captionOf(t);
      if (!c) return;
      if (cell.runs.length) cell.runs.push({ text: '\n' });
      cell.runs.push(...c.runs);
      if (c.paras) cell.paras = c.paras;
      // text lined up on purpose keeps it; ChemDraw's own text sits where it was clicked, so
      // it takes its column's alignment here
      if (t.getAttribute('Justification')) cell.align = c.justify;
    };
    for (const pg of kids(tbl)) {
      if (pg.nodeName !== 'page') continue;
      const bb = pts(pg.getAttribute('BoundingBox') ?? pg.getAttribute('BoundsInParent'));
      if (bb.length < 4) continue;
      const [x1, y1, x2, y2] = [Math.min(bb[0], bb[2]), Math.min(bb[1], bb[3]), Math.max(bb[0], bb[2]), Math.max(bb[1], bb[3])];
      // ChemDraw leaves out a border as wide as the drawing's lines (and keeps the ones it hides, at 0)
      const borders = { left: st.lineWidth, top: st.lineWidth, bottom: st.lineWidth, right: st.lineWidth };
      const cell: ReadCell['cell'] = { runs: [] };
      for (const ch of kids(pg)) {
        if (ch.nodeName === 'border') {
          const side = ch.getAttribute('Side') as keyof typeof borders | null;
          if (side && side in borders) borders[side] = num(ch, 'LineWidth', st.lineWidth);
        } else if (ch.nodeName === 't') addText(cell, ch);
        else if (ch.nodeName === 'fragment') {
          // ChemDraw turns text it can read as chemistry (Pd(OAc)2, THF) into a label; its text stays
          const label = labelText(ch);
          if (label) addText(cell, label);
          else {
            // a structure in the cell, placed from the cell's top left corner (read as a copy moved
            // onto the page; the table is written again with it when saved)
            const copy = ch.cloneNode(true) as Element;
            for (const e of [copy, ...descendants(copy)]) movePoints(e, x1, y1);
            figs.push(copy);
          }
        } else if (ch.nodeName !== 'objecttag') skip(`${ch.nodeName} in a table cell`);
      }
      read.push({ x1, y1, x2, y2, cell, borders });
    }
    const grid = gridOf(read);
    if (!grid) { skip('empty table'); return; }
    // the text of joined cells, kept beside the table
    for (const [key, t] of parts.cells ?? []) {
      const [r, c] = key.split(' ').map(Number);
      const at = grid.rows[r]?.[c];
      if (at) addText(at.cell, t);
    }
    // the size most of the text is set in becomes the table's own; runs keep any other size
    const sizes = new Map<number, number>();
    for (const row of grid.rows) for (const c of row) for (const r of c.cell.runs) if (r.size !== undefined && r.text.trim()) sizes.set(r.size, (sizes.get(r.size) ?? 0) + r.text.length);
    const common = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? st.captionSize;
    const plain = (runs: TextRun[], size: number) => runs.map((r) => { if (r.size !== size) return r; const { size: _, ...rest } = r; return rest; });
    let table: NonNullable<Shape['table']> = {
      cols: grid.cols,
      rows: grid.rows.map((row) => row.map((c) => {
        const cell = { ...c.cell, runs: plain(c.cell.runs, common) };
        if (!cell.paras) delete cell.paras;
        return cell;
      })),
      head: 0,
      lines: 'acs',
    };
    if (common !== st.captionSize) table.size = common;
    const tagEl = kids(tbl).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === TABLE_TAG);
    const tag = parseTableTag(tagEl?.getAttribute('Value') ?? null);
    table = applyTableTag(table, tag, linesFromBorders(grid.rows.map((row) => row.map((c) => c.borders))));
    // with the tag, cells line up as their columns do unless they were set on their own
    if (tag) table.rows = table.rows.map((row, r) => row.map((cell, c) => {
      const own = tag.cellAlign?.some(([rr, cc]) => rr === r && cc === c);
      if (own || !cell.align) return cell;
      const { align: _, ...rest } = cell;
      return rest;
    }));
    const partRuns = (el: Element | undefined, size: number) => {
      const c = el ? captionOf(el) : null;
      return c ? plain(c.runs, size) : undefined;
    };
    const title = partRuns(parts.title, table.size ?? st.captionSize);
    const notes = partRuns(parts.notes, (table.size ?? st.captionSize) * NOTE_SCALE);
    if (title?.length) table.title = title;
    if (notes?.length) table.notes = notes;
    // the table's corner: its first cell, less the room its title takes
    const lay = layoutTable(table, st.captionSize, (t, size, _f, style) => arialWidth(t, size, /bold/.test(style)));
    const x1 = grid.rows[0][0].x1, y1 = grid.rows[0][0].y1 - lay.ys[0];
    const sh = doc.addShape({ id: idFor(outer ?? tbl), kind: 'table', x1, y1, x2: x1 + lay.width, y2: y1 + lay.height, table, z: tbl.hasAttribute('Z') ? num(tbl, 'Z') : undefined });
    from('s', sh.id, outer ?? tbl);
    stats.shapes++;
    for (const f of figs) readFragment(f);
  };

  /** A group made of a table and its tagged title, footnotes and joined cells' text. */
  const tableGroup = (g: Element): ({ table: Element } & TableParts) | null => {
    let table: Element | null = null;
    const parts: TableParts = {};
    for (const ch of kids(g)) {
      if (ch.nodeName === 'table' && !table) { table = ch; continue; }
      const part = ch.nodeName === 't' ? kids(ch).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === TABLE_PART_TAG)?.getAttribute('Value') : null;
      if (part === 'title' || part === 'notes') { parts[part] = ch; continue; }
      const cell = part ? /^cell (\d+) (\d+)$/.exec(part) : null;
      if (cell) { (parts.cells ??= []).push([`${cell[1]} ${cell[2]}`, ch]); continue; }
      if (ch.nodeName !== 'objecttag') return null;
    }
    return table ? { table, ...parts } : null;
  };

  /** The text of a label ChemDraw made from a cell's text: a fragment of one labelled node. */
  const labelText = (frag: Element): Element | null => {
    const nodes = kids(frag).filter((k) => k.nodeName === 'n');
    if (nodes.length !== 1 || kids(frag).some((k) => k.nodeName === 'b')) return null;
    return kids(nodes[0]).find((k) => k.nodeName === 't') ?? null;
  };

  const headOf = (v: string | null): Arrow['headStyle'] => (v === 'Full' ? 'full' : v === 'HalfLeft' ? 'halfLeft' : v === 'HalfRight' ? 'halfRight' : 'none');

  /** The smallest ring holding all of these atoms. */
  const smallestRing = (atoms: number[]): number[] | null => {
    let best: number[] | null = null;
    for (const r of ringsIn(doc, [])) if ((!best || r.length < best.length) && atoms.every((id) => r.includes(id))) best = r;
    return best;
  };

  const readArrow = (a: Element) => {
    const head = pts(a.getAttribute('Head3D'));
    const tail = pts(a.getAttribute('Tail3D'));
    if (head.length < 2 || tail.length < 2) { skip('arrow without ends'); return; }
    const lw = num(a, 'LineWidth', st.lineWidth);
    const headStyle = headOf(a.getAttribute('ArrowheadHead'));
    const tailStyle = headOf(a.getAttribute('ArrowheadTail'));
    const lt = a.getAttribute('LineType') ?? '';
    const type = a.getAttribute('ArrowheadType');
    let sweep = 0;
    const ang = a.getAttribute('AngularSize');
    if (ang !== null && Number(ang) !== 0) {
      // CDXML angles run anticlockwise (y up); ours run with y down.
      sweep = -Number(ang) * DEG;
      const c = pts(a.getAttribute('Center3D'));
      if (c.length >= 2) {
        const a0 = Math.atan2(tail[1] - c[1], tail[0] - c[0]);
        const r = Math.hypot(tail[0] - c[0], tail[1] - c[1]);
        const hx = c[0] + r * Math.cos(a0 + sweep), hy = c[1] + r * Math.sin(a0 + sweep);
        if (Math.hypot(hx - head[0], hy - head[1]) > r * 0.2) sweep = -sweep;
      }
    }
    const arrow: Omit<Arrow, 'id'> & { id: number } = {
      id: idFor(a),
      tail: { x: tail[0], y: tail[1] },
      head: { x: head[0], y: head[1] },
      headStyle,
      tailStyle,
      headType: type === 'Hollow' ? 'hollow' : type === 'Angle' ? 'angle' : 'solid',
      line: lt.includes('Dashed') ? 'dashed' : lt.includes('Bold') ? 'bold' : lt.includes('Wavy') ? 'wavy' : 'solid',
      noGo: a.getAttribute('NoGo') === 'Cross' || a.getAttribute('NoGo') === 'Hash',
      ...(a.getAttribute('NoGo') === 'Hash' ? { noGoKind: 'hash' as const } : {}),
      ...(a.getAttribute('Dipole') === 'yes' ? { dipole: true } : {}),
      equilibrium: a.getAttribute('ArrowShaftSpacing') !== null && headStyle.startsWith('half') && tailStyle.startsWith('half'),
      sweep,
      headLength: (num(a, 'HeadSize', 1000) / 100) * lw,
      headWidth: (num(a, 'ArrowheadWidth', 250) / 100) * lw,
      color: color(a),
    };
    // the head's notch (ChemDraw takes a missing or zero ArrowheadCenterSize as 7/8 of the head)
    const cs = num(a, 'ArrowheadCenterSize', 0), hs = num(a, 'HeadSize', 1000);
    // (3/4, the notch our own arrows are drawn with and written as, reads back as ours: straight sides)
    if (!(cs > 0 && hs > 0 && cs === Math.round(hs * 0.75))) arrow.headCenter = cs > 0 && hs > 0 ? Math.min(1, cs / hs) : 0.875;
    // an arc of an ellipse (its axes differ): drawn along the ellipse, as Bézier pieces, instead of
    // the circle through the tail
    const ell = ellipseArcBez(a, tail, head, Number(ang ?? 0));
    if (ell) {
      arrow.sweep = 0;
      arrow.bez = ell.map((p) => chordLocal(arrow.tail, arrow.head, p));
      // the ellipse itself, so the arrow can go back to ChemDraw as its arc arrow
      const P = (n: string) => { const v = pts(a.getAttribute(n)); return chordLocal(arrow.tail, arrow.head, { x: v[0], y: v[1] }); };
      arrow.ellipse = { center: P('Center3D'), major: P('MajorAxisEnd3D'), minor: P('MinorAxisEnd3D'), angular: Number(ang) };
    }
    if (lw !== st.lineWidth) arrow.lineWidth = lw;
    // ChemDraw draws a bold shaft at the BoldWidth and dashes it at the HashSpacing, the arrow's or the drawing's
    if (arrow.line === 'bold') arrow.boldWidth = num(a, 'BoldWidth', st.boldWidth);
    if (arrow.line === 'dashed') arrow.hashSpacing = num(a, 'HashSpacing', st.hashSpacing);
    // two shafts with a full head: a retrosynthetic arrow (spacing in hundredths of the line width)
    const spacing = a.getAttribute('ArrowShaftSpacing');
    if (spacing !== null && !arrow.equilibrium && Number(spacing) > 0) arrow.shaftSpacing = (Number(spacing) / 100) * lw;
    doc.addArrow(arrow);
    from('r', arrow.id, a);
    const mt = kids(a).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === MORPH_TAG);
    if (mt) morphTags.push([arrow.id, mt.getAttribute('Value') ?? '']);
    const pt = kids(a).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === PIN_TAG);
    if (pt) pinTags.push([arrow.id, pt.getAttribute('Value') ?? '']);
    stats.arrows++;
  };

  /**
   * A ChemDraw curve with an arrowhead (a freehand arrow, or an S-shaped arrow saved here): an
   * arrow along its Bézier curves. Curves without heads are skipped.
   */
  const readCurve = (c: Element) => {
    const type = num(c, 'CurveType', 0);
    const own = kids(c).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === CURVE_ARROW_TAG)?.getAttribute('Value');
    // CurveType bits: closed 1, dashed 2, bold 4, arrow at end 8, at start 16, half-arrow at end 32, at start 64
    const n = pts(c.getAttribute('CurvePoints'));
    const knots: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < n.length; i += 2) knots.push({ x: n[i], y: n[i + 1] });
    if (knots.length < 6 || knots.length % 3) { skip('curve'); return; }
    if (type & 1) {
      // a closed curve (a perspective ring's ellipse): a shape of its own, outlined as ChemDraw draws it
      const m = knots.length / 3, P = (i: number) => knots[3 * (i % m) + 1];
      const path = [P(0)];
      for (let i = 0; i < m; i++) path.push(knots[3 * i + 2], knots[3 * ((i + 1) % m)], P(i + 1));
      const xs = path.map((p) => p.x), ys = path.map((p) => p.y);
      const box = { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
      if (box.x2 - box.x1 < 1e-3 && box.y2 - box.y1 < 1e-3) { skip('closed curve'); return; }
      const lw = num(c, 'LineWidth', st.lineWidth);
      const filled = c.getAttribute('FillType') === 'Solid' || !!(type & 128);
      const sh = doc.addShape({ id: idFor(c), kind: 'geo', geo: pathId(path, box), ...box, color: color(c), z: num(c, 'Z', 0), filled, ...(type & 2 ? { dashed: true } : {}), ...(type & 4 ? { bold: true } : {}), ...(lw !== st.lineWidth ? { lineWidth: lw } : {}) });
      from('s', sh.id, c);
      stats.shapes++;
      return;
    }
    // each point comes with its handle in before it and its handle out after it
    const path = [knots[1]];
    for (let k = 1; 3 * k + 1 < knots.length; k++) path.push(knots[3 * k - 1], knots[3 * k], knots[3 * k + 1]);
    const tail = path[0], head = path[path.length - 1];
    if (Math.hypot(head.x - tail.x, head.y - tail.y) < 1e-6) { skip('curve'); return; }
    // an open curve with no heads (and not a curved arrow of ours with its heads off): a Freeform curve
    if (!own && !(type & (8 | 16 | 32 | 64))) {
      const xs = path.map((p) => p.x), ys = path.map((p) => p.y);
      const box = { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
      const lw = num(c, 'LineWidth', st.lineWidth);
      const sh = doc.addShape({ id: idFor(c), kind: 'geo', geo: freeformId(path, box, false), ...box, color: color(c), z: num(c, 'Z', 0), filled: false, ...(type & 2 ? { dashed: true } : {}), ...(type & 4 ? { bold: true } : {}), ...(lw !== st.lineWidth ? { lineWidth: lw } : {}) });
      from('s', sh.id, c);
      stats.shapes++;
      return;
    }
    const lw = num(c, 'LineWidth', st.lineWidth);
    let look: Partial<Arrow> = {};
    try { look = own ? JSON.parse(own) : {}; } catch { look = {}; }
    // heads, dashes or weight changed in ChemDraw since we wrote it: its own bits win, and only what
    // they can't say (head shape and size) comes from our tag
    const seen = (look as { seen?: { curveType?: unknown } }).seen;
    if (seen && typeof seen.curveType === 'number' && seen.curveType !== type) look = { headType: look.headType, headLength: look.headLength, headWidth: look.headWidth };
    // the head's size or shape changed there: the curve's own (read below) win over the tag's
    const headNow = `${num(c, 'HeadSize', 1000)} ${num(c, 'ArrowheadWidth', 250)} ${c.getAttribute('ArrowheadType') ?? 'Solid'}`;
    if (seen && typeof (seen as { head?: unknown }).head === 'string' && (seen as { head: string }).head !== headNow) { delete look.headType; delete look.headLength; delete look.headWidth; }
    const arrow: Omit<Arrow, 'id'> & { id: number } = {
      id: idFor(c), tail, head,
      headStyle: type & 8 ? 'full' : type & 32 ? 'halfLeft' : 'none',
      tailStyle: type & 16 ? 'full' : type & 64 ? 'halfLeft' : 'none',
      headType: 'solid', line: type & 2 ? 'dashed' : type & 4 ? 'bold' : 'solid', noGo: false, equilibrium: false, sweep: 0,
      headLength: lw * 10, headWidth: lw * 2.5, color: color(c),
      bez: path.slice(1, -1).map((p) => chordLocal(tail, head, p)),
    };
    // a half head's barb goes on the outside of the last bend (ChemDraw's own side isn't stored)
    if (!own && headBend(arrow) < 0) { arrow.headStyle = swapHalf(arrow.headStyle); arrow.tailStyle = swapHalf(arrow.tailStyle); }
    // the head's shape and size, when the curve has them as an arrow has
    if (c.hasAttribute('HeadSize')) arrow.headLength = (num(c, 'HeadSize', 1000) / 100) * lw;
    if (c.hasAttribute('ArrowheadWidth')) arrow.headWidth = (num(c, 'ArrowheadWidth', 250) / 100) * lw;
    const ht = c.getAttribute('ArrowheadType');
    if (ht === 'Hollow' || ht === 'Angle') arrow.headType = ht === 'Hollow' ? 'hollow' : 'angle';
    for (const k of ['headStyle', 'tailStyle', 'headType', 'line', 'headLength', 'headWidth'] as const) if (lookOk(k, look[k])) (arrow as Record<string, unknown>)[k] = look[k];
    if (lw !== st.lineWidth) arrow.lineWidth = lw;
    doc.addArrow(arrow);
    from('r', arrow.id, c);
    const pt = kids(c).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === PIN_TAG);
    if (pt) pinTags.push([arrow.id, pt.getAttribute('Value') ?? '']);
    stats.arrows++;
  };

  /**
   * An arrow as older files keep it, a Line or Arc graphic with an ArrowType and no arrow of its
   * own: read as ChemDraw 25 reads it (it makes the same arrow, measured by opening such a file
   * and saving it). A Line is stored head then tail, an Arc head then centre, sweeping round from
   * its head by AngularSize; a Line with no head stays a line. Saved, it is written back in its
   * place as an arrow (the writer replaces the graphic, as ChemDraw does).
   */
  const legacyArrow = (g: Element, bb: number[]): boolean => {
    const kind = g.getAttribute('ArrowType') ?? 'NoHead';
    const heads: Record<string, Record<string, string>> = {
      FullHead: { ArrowheadHead: 'Full' },
      HalfHead: { ArrowheadHead: 'HalfLeft' },
      Equilibrium: { ArrowheadHead: 'HalfLeft', ArrowheadTail: 'HalfLeft', ArrowShaftSpacing: '300' },
      Resonance: { ArrowheadHead: 'Full', ArrowheadTail: 'Full' },
      RetroSynthetic: { ArrowheadHead: 'Full', ArrowheadType: 'Angle', ArrowheadCenterSize: '1000', ArrowShaftSpacing: '1000' },
      Hollow: { ArrowheadHead: 'Full', ArrowheadType: 'Hollow', ArrowheadCenterSize: '1000', ArrowShaftSpacing: '1000' },
    };
    const arc = g.getAttribute('GraphicType') === 'Arc';
    if (!arc && !heads[kind]) return false;
    const head = { x: bb[0], y: bb[1] };
    let tail = { x: bb[2], y: bb[3] };
    const a = g.ownerDocument.createElement('arrow');
    if (arc) {
      const c = { x: bb[2], y: bb[3] }, r = Math.hypot(head.x - c.x, head.y - c.y);
      const sweep = Math.abs(num(g, 'AngularSize', 0));
      if (!(r > 0) || !(sweep > 0)) return false;
      const a0 = Math.atan2(head.y - c.y, head.x - c.x), a1 = a0 + sweep * DEG;
      tail = { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) };
      const minor = { x: c.x + r * Math.cos(a0 + Math.PI / 2), y: c.y + r * Math.sin(a0 + Math.PI / 2) };
      a.setAttribute('AngularSize', String(sweep));
      a.setAttribute('Center3D', `${c.x} ${c.y} 0`);
      a.setAttribute('MajorAxisEnd3D', `${head.x} ${head.y} 0`);
      a.setAttribute('MinorAxisEnd3D', `${minor.x} ${minor.y} 0`);
    }
    for (const [k, v] of Object.entries({ ArrowheadType: 'Solid', HeadSize: g.getAttribute('HeadSize') ?? '1000', ArrowheadCenterSize: '875', ArrowheadWidth: '250', ...heads[kind] })) a.setAttribute(k, v);
    for (const k of ['id', 'Z', 'color', 'LineWidth', 'LineType']) { const v = g.getAttribute(k); if (v !== null) a.setAttribute(k, v); }
    a.setAttribute('Head3D', `${head.x} ${head.y} 0`);
    a.setAttribute('Tail3D', `${tail.x} ${tail.y} 0`);
    const before = doc.arrows.size;
    readArrow(a);
    if (doc.arrows.size === before) return false;
    // (the graphic is where it came from, for saving it back in place)
    from('r', [...doc.arrows.keys()].pop()!, g);
    return true;
  };

  const readGraphic = (g: Element) => {
    if (g.getAttribute('SupersededBy') !== null) return;
    const type = g.getAttribute('GraphicType');
    const bb = pts(g.getAttribute('BoundingBox'));
    if ((type === 'Line' || type === 'Arc') && bb.length >= 4 && legacyArrow(g, bb)) return;
    const c = color(g);
    const z = num(g, 'Z', 0);
    const base = { id: idFor(g), color: c, z };
    const add = (s: Omit<Shape, 'id'> & { id: number }) => {
      // ChemDraw's faded shape: filled with its colour faded towards white (FadePercent, in tenths of a percent)
      const fade = num(g, 'FadePercent', -1);
      if (fade >= 0 && !s.filled) {
        const ink = c ?? '#000000';
        s.filled = true;
        // (its outline stays in the full colour, so the fill is a colour of its own)
        s.fillColor = tint(ink, 1 - Math.min(1, fade / 1000));
        if (fade <= 1000) s.fade = fade;
      }
      // our fill style and outline colour, which ChemDraw has no words for
      const tag = kids(g).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === FILL_TAG);
      if (tag) {
        try {
          const v = JSON.parse(tag.getAttribute('Value') ?? '{}') as Partial<Shape> & { seen?: { color?: unknown } };
          // recoloured in ChemDraw since we wrote it: ChemDraw's colour wins, our style stays
          // (a tag from before we noted what we wrote says only its own colour: far from the file's, it is out of date)
          const now = c ?? '#000000';
          const recoloured = typeof v.seen?.color === 'string' ? v.seen.color.toLowerCase() !== now.toLowerCase() : typeof v.color === 'string' && !v.fill && colorsFar(v.color, now);
          delete v.seen;
          s.fill = v.fill === 'faded' || v.fill === 'shaded' || v.fill === 'gradient' ? v.fill : undefined;
          if (!recoloured) {
            s.fillColor = typeof v.fillColor === 'string' ? v.fillColor : undefined;
            s.color = typeof v.color === 'string' ? v.color : undefined;
          } else if (s.filled) s.fillColor = c;
          Object.assign(s, fillExtras(v));
          // a pattern with no fill under it
          if (v.filled === false) s.filled = false;
        } catch { /* a damaged tag: keep what ChemDraw shows */ }
      }
      const ft = kids(g).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === FRAME_TAG);
      if (ft) s.frame = frameFromTag(ft.getAttribute('Value'));
      // a part of an orbital drawn here, so it can be changed again
      const orb = orbitalTag(kids(g).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === ORBITAL_TAG)?.getAttribute('Value'));
      if (orb) s.orb = orb;
      // an outline of its own width: ChemDraw draws a graphic's lines at its LineWidth, and bold
      // ones at its BoldWidth, when the graphic has one that isn't the drawing's
      const ownW = g.getAttribute(s.bold ? 'BoldWidth' : 'LineWidth');
      if (s.kind !== 'picture' && ownW !== null && Number(ownW) > 0 && Math.abs(Number(ownW) - (s.bold ? st.boldWidth : st.lineWidth)) > 0.005) s.lineWidth = Number(ownW);
      // ChemDraw dashes an outline at the HashSpacing, the graphic's or the drawing's
      if (s.dashed) s.hashSpacing = num(g, 'HashSpacing', st.hashSpacing);
      doc.addShape(s); from('s', s.id, g); stats.shapes++;
    };
    switch (type) {
      case 'Line': {
        if (bb.length < 4) return;
        const lt = g.getAttribute('LineType') ?? '';
        add({ ...base, kind: 'line', x1: bb[0], y1: bb[1], x2: bb[2], y2: bb[3], dashed: lt.includes('Dashed'), bold: lt.includes('Bold'), ...(g.getAttribute(DOTTED_ATTR) === 'yes' || kids(g).some((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === DOTTED_TAG && k.getAttribute('Value') === 'yes') ? { dotted: true } : {}) });
        return;
      }
      case 'Rectangle': {
        if (bb.length < 4) return;
        const rt = g.getAttribute('RectangleType') ?? '';
        // a turned box (a diamond, say) is kept by its middle and two half-axes; its BoundingBox doesn't show it
        let [x1, y1, x2, y2] = bb, rot = 0;
        const cen = pts(g.getAttribute('Center3D')), maj = pts(g.getAttribute('MajorAxisEnd3D')), min = pts(g.getAttribute('MinorAxisEnd3D'));
        if (cen.length >= 2 && maj.length >= 2 && min.length >= 2) {
          let hw = Math.hypot(maj[0] - cen[0], maj[1] - cen[1]), hh = Math.hypot(min[0] - cen[0], min[1] - cen[1]);
          let deg = (Math.atan2(maj[1] - cen[1], maj[0] - cen[0]) * 180) / Math.PI;
          deg = ((deg % 180) + 180) % 180;
          if (Math.abs(deg - 90) < 0.05) { [hw, hh] = [hh, hw]; deg = 0; }
          if (deg > 0.05 && deg < 179.95) {
            rot = +deg.toFixed(3);
            [x1, y1, x2, y2] = [cen[0] - hw, cen[1] - hh, cen[0] + hw, cen[1] + hh];
          }
        }
        const rect: Omit<Shape, 'id'> & { id: number } = {
          ...base, kind: 'rect', x1, y1, x2, y2, ...(rot ? { rot } : {}), rounded: rt.includes('RoundEdge'), shadow: rt.includes('Shadow'),
          filled: rt.includes('Filled') || rt.includes('Shaded'), dashed: rt.includes('Dashed'), bold: rt.includes('Bold'),
          ...(rt.includes('Shaded') ? { fill: 'shaded' as const } : {}),
        };
        // corner radius and shadow size are stored in hundredths of the line width
        const lw = num(g, 'LineWidth', st.lineWidth);
        const cr = g.getAttribute('CornerRadius'), ss = g.getAttribute('ShadowSize');
        if (rect.rounded && cr !== null && Number.isFinite(Number(cr))) rect.radius = (Number(cr) / 100) * lw;
        if (rect.shadow && ss !== null && Number.isFinite(Number(ss))) rect.shadowSize = (Number(ss) / 100) * lw;
        add(rect);
        return;
      }
      case 'Oval':
      case 'Orbital': {
        const cen = pts(g.getAttribute('Center3D')), maj = pts(g.getAttribute('MajorAxisEnd3D')), min = pts(g.getAttribute('MinorAxisEnd3D'));
        if (cen.length < 2 || maj.length < 2) return;
        let rx = Math.hypot(maj[0] - cen[0], maj[1] - cen[1]);
        let ry = min.length >= 2 ? Math.hypot(min[0] - cen[0], min[1] - cen[1]) : rx;
        // an oval whose axes are turned: upright when they lie along the page, else turned
        let rot = 0;
        if (Math.abs(rx - ry) > 0.01) {
          let deg = (Math.atan2(maj[1] - cen[1], maj[0] - cen[0]) * 180) / Math.PI;
          deg = ((deg % 180) + 180) % 180;
          if (Math.abs(deg - 90) < 0.05) [rx, ry] = [ry, rx];
          else if (deg > 0.05 && deg < 179.95) rot = +deg.toFixed(3);
        }
        const ot = g.getAttribute('OvalType') ?? '';
        const filled = ot.includes('Filled') || ot.includes('Shaded');
        const orb = type === 'Orbital' ? g.getAttribute('OrbitalType') : null;
        // shadow size, as a box's, in hundredths of the oval's line width
        const shadowSize = () => { const ss = g.getAttribute('ShadowSize'); return ot.includes('Shadow') && ss !== null && Number.isFinite(Number(ss)) ? { shadowSize: (Number(ss) / 100) * num(g, 'LineWidth', st.lineWidth) } : {}; };
        const oval = () => add({ ...base, ...(orb ? { orbital: orb } : {}), kind: 'oval', x1: cen[0] - rx, y1: cen[1] - ry, x2: cen[0] + rx, y2: cen[1] + ry, ...(rot ? { rot } : {}), filled, ...(ot.includes('Shaded') ? { fill: 'shaded' as const } : {}), dashed: ot.includes('Dashed'), bold: ot.includes('Bold'), shadow: ot.includes('Shadow'), ...shadowSize() });
        // a plain circle kept with a structure may be an aromatic ring's circle (checked once the bonds are in)
        if (g.parentElement?.nodeName === 'fragment' && ot.includes('Circle') && !filled) pendingCircles.push({ x: cen[0], y: cen[1], oval });
        else oval();
        return;
      }
      case 'Symbol': {
        if (bb.length < 4) return;
        // (with no SymbolType, ChemDraw takes it for a lone pair)
        const sym = g.getAttribute('SymbolType') ?? 'LonePair';
        if (CHIRAL_FLAGS[sym]) {
          // a chiral flag: ChemDraw keeps the word as text inside it, and draws the box round that
          const t = kids(g).find((k) => k.nodeName === 't');
          const tb = pts(t?.getAttribute('BoundingBox') ?? null);
          const r = tb.length >= 4 ? { x1: tb[0], y1: tb[1], x2: tb[2], y2: tb[3] } : { x1: Math.min(bb[0], bb[2]), y1: bb[1] - 11, x2: Math.max(bb[0], bb[2]), y2: bb[1] };
          const pad = 2;
          add({ ...base, kind: 'symbol', symbol: sym, x1: r.x1 - pad, y1: r.y1 - pad, x2: r.x2 + pad, y2: r.y2 + pad });
        } else if (sym === 'LonePair' || sym === 'LonePairBar' || sym === 'RadicalCation' || sym === 'RadicalAnion') {
          // two points: a lone pair's ends, or a radical ion's dot and then the middle of its sign
          add({ ...base, kind: 'symbol', symbol: sym, x1: bb[0], y1: bb[1], x2: bb[2], y2: bb[3] });
        } else if (sym === 'Electron') {
          // the dot, then a point further out that only sets its size
          add({ ...base, kind: 'symbol', symbol: sym, x1: bb[0], y1: bb[1], x2: bb[0], y2: bb[1] });
        } else {
          // charge signs: ChemDraw stores the sign's centre, then a point its width away; this program's
          // older files stored its width along the bottom edge instead
          const ours = bb[1] === bb[3] && bb[0] > bb[2] && root.getAttribute('CreationProgram') === 'Chem Illustrator';
          const d = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) || 6;
          const cx = ours ? (bb[0] + bb[2]) / 2 : bb[0], cy = ours ? bb[1] - d / 2 : bb[1];
          add({ ...base, kind: 'symbol', symbol: sym, x1: cx - d / 2, y1: cy - d / 2, x2: cx + d / 2, y2: cy + d / 2 });
        }
        return;
      }
      case 'Bracket': {
        if (bb.length < 4) return;
        const bt = g.getAttribute('BracketType') ?? 'Square';
        const kind = bt.startsWith('Round') ? 'round' : bt.startsWith('Curly') ? 'curly' : 'square';
        add({ ...base, kind: 'bracket', bracket: kind, pair: bt.endsWith('Pair'), x1: bb[0], y1: bb[1], x2: bb[2], y2: bb[3] });
        return;
      }
      default:
        skip(`graphic ${type}`);
    }
  };

  /** ChemDraw objects not shown here, kept with the things their ids name (see Doc.kept). */
  const keepLater: Element[] = [];
  const keepXml = (el: Element) => {
    const byId = new Map<string, Element>();
    for (const e of all) { const id = e.getAttribute('id'); if (id) byId.set(id, e); }
    const refs: Record<string, string> = {};
    const scan = (e: Element) => {
      for (const at of Array.from(e.attributes)) {
        // (only attributes that name objects: a RepeatCount of 2 is not object 2)
        if (at.name === 'id' || !/(ID|IDs|Objects)$/.test(at.name)) continue;
        for (const tok of at.value.trim().split(/\s+/)) {
          if (!/^\d+$/.test(tok) || refs[tok]) continue;
          const target = byId.get(tok);
          let key = target ? refOf().get(target) : undefined;
          // a structure is named by its first atom ("frag:a10")
          if (!key && target?.nodeName === 'fragment') {
            const n = kids(target).find((c) => c.nodeName === 'n' && refOf().has(c));
            if (n) key = `frag:${refOf().get(n)}`;
          }
          if (key) refs[tok] = key;
        }
      }
      for (const k of kids(e)) scan(k);
    };
    scan(el);
    doc.kept.push({ xml: new XMLSerializer().serializeToString(el), refs });
  };

  /** Polymer and repeat groups (ChemDraw's bracketedgroup), read once the brackets are in. */
  const pendingRepeats: Element[] = [];
  const readRepeats = () => {
    if (!pendingRepeats.length) return;
    const byXmlId = new Map<string, Element>();
    for (const e of all) { const id = e.getAttribute('id'); if (id) byXmlId.set(id, e); }
    for (const g of pendingRepeats) {
      const usage = g.getAttribute('BracketUsage');
      if (usage !== 'SRU' && usage !== 'MultipleGroup') { keepXml(g); continue; }
      const text = usage === 'SRU' ? g.getAttribute('SRULabel') || 'n' : String(Math.round(num(g, 'RepeatCount', 2)));
      const brackets: { e: Element; sh: Shape }[] = [];
      for (const k of kids(g)) {
        if (k.nodeName !== 'bracketattachment') continue;
        const e = byXmlId.get(k.getAttribute('GraphicID') ?? '');
        const ref = e ? refOf().get(e) : undefined;
        const sh = ref && ref[0] === 's' ? doc.shapes.get(Number(ref.slice(1))) : undefined;
        if (e && sh?.kind === 'bracket') brackets.push({ e, sh });
      }
      if (!brackets.length) continue;
      // the label goes where ChemDraw shows it: on the bracket holding the label text, else the closing one
      const usageTag = (b: { e: Element }) => kids(b.e).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === 'bracketusage');
      const withText = brackets.find((b) => usageTag(b));
      const labelled = (withText ?? brackets.find((b) => lipDirection(b.sh).x < -0.5) ?? brackets[brackets.length - 1]).sh;
      labelled.repeat = text;
      // the label's own colour, weight and size, as ChemDraw keeps them on its text
      const s0 = withText ? kids(kids(usageTag(withText)!).find((k) => k.nodeName === 't') ?? usageTag(withText)!).find((k) => k.nodeName === 's') : undefined;
      if (s0) {
        const look: NonNullable<Shape['repeatLook']> = {};
        const lc = color(s0);
        if (lc && lc !== (labelled.color ?? '#000000')) look.color = lc;
        // (only what differs from how a label is drawn here: plain numbers, italic letters, 3/4 of the label size)
        const face = num(s0, 'face', 0), size = num(s0, 'size', 0);
        if ((face & 3) !== (/^\d+$/.test(text) ? 0 : 2)) look.face = face;
        if (size > 0 && Math.abs(size - 0.75 * st.labelSize) > 0.01) look.size = size;
        if (Object.keys(look).length) labelled.repeatLook = look;
      }
    }
  };

  /**
   * Plain group elements (not a design shape's or a table's) become groups here: everything
   * inside the outermost one gets its number.
   */
  const readGroups = () => {
    const plain = (g: Element) => g.nodeName === 'group'
      && !kids(g).some((k) => k.nodeName === 'table' || (k.nodeName === 'objecttag' && (k.getAttribute('Name') === GEO_TAG)));
    const numbers = new Map<Element, number>();
    const numberOf = (g: Element) => { let n = numbers.get(g); if (n === undefined) numbers.set(g, (n = numbers.size + 1)); return n; };
    const maps: Partial<Record<Kind, Map<number, { grp?: number; grpPath?: number[] }>>> = { a: doc.atoms, c: doc.captions, r: doc.arrows, s: doc.shapes };
    for (const [key, o] of ord) {
      const m = maps[key[0] as Kind];
      if (!m) continue;
      // every plain group round it, outermost first
      const chain: Element[] = [];
      for (let p = all[o].parentElement; p && p !== root; p = p.parentElement) if (p !== all[o] && plain(p)) chain.unshift(p);
      if (!chain.length) continue;
      const path = chain.map(numberOf);
      const e = m.get(Number(key.slice(1)));
      if (!e) continue;
      e.grp = path[0];
      if (path.length > 1) e.grpPath = path;
    }
  };

  const walk = (el: Element) => {
    for (const ch of kids(el)) {
      switch (ch.nodeName) {
        case 'group': {
          // a design shape saved here: drawn in ChemDraw as curves and text, read back as the shape
          const geoTag = kids(ch).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === GEO_TAG)?.getAttribute('Value');
          if (geoTag) {
            let saved: (Partial<Shape> & { savedBox?: unknown }) | null = null;
            try { saved = JSON.parse(geoTag); } catch { saved = null; }
            // the group's box as saved: in the tag, or (older files) an attribute of ours
            const savedBox = typeof saved?.savedBox === 'string' ? saved.savedBox : null;
            if (saved) delete saved.savedBox;
            if (saved) saved = geoFromTag(saved);
            const bb = pts(ch.getAttribute('BoundingBox'));
            // what we wrote natively beside it: moved in ChemDraw (every point by the same offset) moves
            // the shape; reshaped there, ChemDraw's own curves are read instead
            const seen = (saved as { seen?: { curve?: unknown } } | null)?.seen;
            let shift: { dx: number; dy: number } | null = null;
            if (saved) delete (saved as { seen?: unknown }).seen;
            if (saved && typeof seen?.curve === 'string') {
              delete (saved as { seen?: unknown }).seen;
              const firstCurve = Array.from(ch.getElementsByTagName('curve'))[0];
              const was = pts(seen.curve), now = pts(firstCurve?.getAttribute('CurvePoints') ?? null);
              if (was.length && was.length === now.length) {
                const dx = now[0] - was[0], dy = now[1] - was[1];
                const moved = was.every((v, i) => Math.abs(now[i] - v - (i % 2 ? dy : dx)) < 0.05);
                if (moved) shift = { dx, dy };
                else saved = null;
              } else saved = null;
            }
            if (saved && (saved.kind === 'geo' || (saved.kind === 'ring' && Array.isArray(saved.poly))) && [saved.x1, saved.y1, saved.x2, saved.y2].every((v) => typeof v === 'number')) {
              // a ring fill finds its ring again by where the atoms are (atom ids change between files)
              const sh = doc.addShape({ ...(saved as Omit<Shape, 'id'>), ...(saved.kind === 'ring' ? { ring: undefined } : {}), id: idFor(ch) });
              // moved in ChemDraw: the group's box says where it is now
              const was = ch.getAttribute(GEO_BOX_ATTR) ?? savedBox;
              const wb = pts(was);
              const move = shift ?? (bb.length === 4 && wb.length === 4 ? { dx: bb[0] - wb[0], dy: bb[1] - wb[1] } : null);
              if (move && (Math.abs(move.dx) > 0.01 || Math.abs(move.dy) > 0.01)) {
                const { dx, dy } = move;
                doc.updateShape(sh.id, { x1: sh.x1 + dx, y1: sh.y1 + dy, x2: sh.x2 + dx, y2: sh.y2 + dy, ...(sh.poly ? { poly: sh.poly.map((p) => ({ x: p.x + dx, y: p.y + dy })) } : {}) });
              }
              from('s', sh.id, ch);
              stats.shapes++;
              break;
            }
          }
          const tg = tableGroup(ch);
          if (tg) readTable(tg.table, ch, tg);
          else walk(ch);
          break;
        }
        case 'table': readTable(ch, null, {}); break;
        case 'page': case 'altgroup': walk(ch); break;
        case 'fragment': readFragment(ch); break;
        case 't': readCaption(ch); break;
        case 'arrow': readArrow(ch); break;
        case 'curve': readCurve(ch); break;
        case 'graphic': readGraphic(ch); break;
        case 'embeddedobject': {
          // pictures: ChemDraw keeps a PNG copy of each (with Windows metafiles beside it)
          const bb = pts(ch.getAttribute('BoundingBox'));
          if (bb.length === 4) {
            const pic = pictureOf(ch);
            let chart: ChartBox | undefined;
            try {
              const tag = kids(ch).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === CHART_TAG)?.getAttribute('Value');
              const got = tag ? JSON.parse(tag) as ChartBox : undefined;
              if (got?.chart && Array.isArray(got.cells)) chart = freshBox(got);
            } catch { chart = undefined; }
            let math: ShapeMath | undefined;
            try {
              const tag = kids(ch).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === MATH_TAG)?.getAttribute('Value');
              const got = tag ? JSON.parse(tag) as ShapeMath : undefined;
              if (typeof got?.tex === 'string' && got.size > 0) math = got;
            } catch { math = undefined; }
            let fx: PictureFx | undefined;
            try {
              const tag = kids(ch).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === PICTURE_FX_TAG)?.getAttribute('Value');
              fx = tag ? tidyFx(JSON.parse(tag) as PictureFx) : undefined;
            } catch { fx = undefined; }
            const alt = kids(ch).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === ALT_TAG)?.getAttribute('Value') || undefined;
            // where ChemDraw draws it among the other objects, and turned as ChemDraw turns it (BoundingBox is the unturned frame)
            const z = num(ch, 'Z', 0);
            const ang = (Number(ch.getAttribute('RotationAngle') ?? NaN) / 65536) % 360;
            const rot = Number.isFinite(ang) && Math.abs(ang) > 1e-3 ? +(ang > 180 ? ang - 360 : ang < -180 ? ang + 360 : ang).toFixed(3) : 0;
            const sh = pic
              ? doc.addShape({ id: idFor(ch), kind: 'picture', z, ...(rot ? { rot } : {}), x1: bb[0], y1: bb[1], x2: bb[2], y2: bb[3], src: pic.src, px: pic.px, ...(pic.crop ? { crop: pic.crop } : {}), ...(chart ? { chart } : {}), ...(math ? { math } : {}), ...(fx ? { fx } : {}), ...(alt ? { alt } : {}) })
              // only pictures this program can't show: mark where they sit, and keep them as they are
              : doc.addShape({ id: idFor(ch), kind: 'rect', x1: bb[0], y1: bb[1], x2: bb[2], y2: bb[3], dashed: true, color: '#9aa4b2', picture: true });
            from('s', sh.id, ch);
            stats.shapes++;
            if (!pic) skip('picture');
          }
          break;
        }
        case 'bracketedgroup': pendingRepeats.push(ch); break;
        case 'chemicalproperty': keepLater.push(ch); break;
        // (an annotation is a note about the document, such as clip art's keywords: nothing is drawn)
        case 'scheme': case 'step': case 'colortable': case 'fonttable': case 'objecttag': case 'annotation': break;
        default: skip(ch.nodeName);
      }
    }
  };

  /** Each object's place in the drawing order, from ChemDraw's Z (a structure's from its fragment's). */
  const zOf = (el: Element | undefined, top: boolean): number | undefined => {
      let e: Element | null = el ?? null, found: number | undefined;
      while (e && e !== pg) {
        const v = e.getAttribute('Z');
        if (v !== null && isFinite(Number(v))) { found = Number(v); if (!top) return found; }
        const p = e.parentElement;
        // a structure's place is its outermost fragment's (atoms carry Z of their own in ChemDraw's files)
        if (top && e.nodeName === 'fragment' && (!p || p === pg || p.nodeName === 'group')) return v !== null && isFinite(Number(v)) ? Number(v) : found;
        e = p;
      }
      return top ? undefined : found;
  };
  const at = (kind: Kind, id: number) => { const o = ord.get(kind + id); return o === undefined ? undefined : all[o]; };
  /** ChemDraw draws everything in its Z order: a filled shape over a structure behind it hides that part of it. */
  const shapeOverStructure = (): boolean => {
    for (const sh of doc.shapes.values()) {
      if (!sh.filled || sh.kind === 'ring') continue;
      const z = zOf(at('s', sh.id), false);
      if (z === undefined) continue;
      const box = { x1: Math.min(sh.x1, sh.x2), y1: Math.min(sh.y1, sh.y2), x2: Math.max(sh.x1, sh.x2), y2: Math.max(sh.y1, sh.y2) };
      for (const a of doc.atomsIn(box)) { const za = zOf(at('a', a.id), true); if (za !== undefined && za < z) return true; }
    }
    return false;
  };
  const readStack = () => {
    for (const a of doc.atoms.values()) { const z = zOf(at('a', a.id), true); if (z !== undefined) a.stack = z; }
    for (const c of doc.captions.values()) { const z = zOf(at('c', c.id), false); if (z !== undefined) c.stack = z; }
    for (const r of doc.arrows.values()) { const z = zOf(at('r', r.id), false); if (z !== undefined) r.stack = z; }
    for (const s of doc.shapes.values()) { const z = zOf(at('s', s.id), false); if (z !== undefined) { s.stack = z; s.z = z; } }
  };

  doc.bulk(() => {
    walk(root);
    // the bonds ChemDraw says cross, near misses included, both ways round
    for (const [id, others] of fileCrossings) {
      for (const o of others.map((x) => allBondIds.get(x)).filter((x): x is number => x !== undefined && x !== id)) {
        for (const [p, q] of [[id, o], [o, id]]) {
          const b = doc.bonds.get(p)!;
          if (!b.crossing?.includes(q)) doc.updateBond(p, { crossing: [...(b.crossing ?? []), q] });
        }
      }
    }
    readSteps(all, refOf, doc);
    if (morphTags.length) readMorphTags(morphTags, refOf(), doc);
    if (pinTags.length) readPinTags(pinTags, refOf(), doc);
    readRepeats();
    for (const el of keepLater) keepXml(el);
    for (const c of pendingCircles) if (!ringOfCircle(doc, c)) c.oval();
    // Element labels like "OH", "H2N" or "N" become automatic labels (so they re-justify
    // when the structure changes); anything else is kept exactly as written.
    for (const { atom, text, hShown } of pendingLabels) {
      const auto = hShown !== null && hShown >= 0 && isAutoLabel(atom.z, text, hShown);
      const bos = doc.valenceSum(atom.id);
      const implicitOk = auto && (!hasImplicitH(atom.z) || implicitHydrogens(atom.z, bos, atom.charge) === hShown);
      // a carbon written out (=CH2, CH3 at a chain end) stays shown, as ChemDraw shows it
      if (implicitOk && atom.z === 6) atom.showCarbon = true;
      if (!implicitOk) {
        atom.label = text;
        atom.fileLabel = true;
        // told to run left, ChemDraw draws the text as written (MeO, the O on the atom); this program
        // keeps a label from the atom out (OMe) and turns it to draw it
        if (atom.fixedDir && atom.just === 'left' && !atom.labelMarks) {
          const drawn = (label: string) => layoutLabel(labelSpec(atom.z, label, 0, 0, 1, 1, false, false)!, labelBonds(doc, atom), 10, (t, z) => t.length * z, 'left').runs.map((r) => r.text).join('');
          const turned = drawn(text);
          if (turned !== text && drawn(turned) === text) atom.label = turned;
        }
        // a contracted label brings its group with it, as a nickname for this session
        if (atom.group) addNicknames({ [text]: atom.group });
        if (hShown === null && atom.z === 6 && /^[A-Z][a-z]?$/.test(text) && elementNumber(text) !== undefined) {
          atom.z = elementNumber(text)!;
          atom.label = null;
        }
      }
    }
    attachRingFills(doc);
    // lone pairs, radical dots and circled charges go with their atoms
    pinSymbols(doc);
    fillFrameMembers(doc);
    // Newman projections find their bonds and viewing marks again by where they are drawn
    relinkNewman(doc);
    fillAttachments(doc);
    readGroups();
    if ((pg && kids(pg).some((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === STACK_TAG)) || shapeOverStructure()) readStack();
  });
  doc.reserveIds(maxId);
  const things: Partial<Record<Kind, Map<number, { piece?: number }>>> = { a: doc.atoms, c: doc.captions, r: doc.arrows, s: doc.shapes };
  for (const [kind, id, piece] of pieces) { const e = things[kind]?.get(id); if (e) e.piece = piece; }
  const orig = new Map<string, Entity>();
  // (a shallow copy, as an undo step keeps: edits replace an entity's parts rather than change them)
  const loaded = new WeakSet<Entity>();
  const keep = (kind: Kind, m: Map<number, Entity>) => { for (const e of m.values()) { const key = kind + e.id; if (ord.has(key)) { orig.set(key, { ...e }); loaded.add(e); } } };
  keep('a', doc.atoms); keep('b', doc.bonds); keep('c', doc.captions); keep('r', doc.arrows); keep('s', doc.shapes);
  doc.source = { text, ord, orig, maxId, xml, loaded, page: JSON.stringify(doc.page ?? null) };
  doc.allDirty = true;
  stats.buildMs = performance.now() - t1;
  return { doc, stats };
}

/**
 * ChemDraw draws an aromatic ring's circle as a circle kept with the structure, in the middle of
 * a ring of aromatic bonds. When one is found there, the ring's bonds are marked to draw with a
 * circle (and the circle is not kept as a separate shape). True when it was a ring circle.
 */
export function ringOfCircle(doc: Doc, c: { x: number; y: number }): boolean {
  const L = doc.style.bondLength || 14.4;
  for (const a of doc.atomsNear(c, 1.6 * L)) {
    for (const bid of doc.adj.get(a.id) ?? []) {
      if (doc.bonds.get(bid)!.order !== 1.5) continue;
      for (const ring of ringsThroughBond(doc, bid)) {
        let x = 0, y = 0;
        for (const id of ring) { const r = doc.atoms.get(id)!; x += r.x; y += r.y; }
        if (Math.hypot(x / ring.length - c.x, y / ring.length - c.y) > 0.3 * L) continue;
        const bonds = ringBonds(doc, ring);
        if (bonds.length !== ring.length || bonds.some((id) => doc.bonds.get(id)!.order !== 1.5)) continue;
        for (const id of bonds) doc.bonds.get(id)!.circle = true;
        return true;
      }
    }
  }
  return false;
}

/** Animation settings on arrows, with the file's node ids turned back into atoms (dropped if any is gone). */
function readMorphTags(tags: [number, string][], refOf: Map<Element, string>, doc: Doc): void {
  if (!tags.length) return;
  const atomOf = new Map<string, number>();
  for (const [el, ref] of refOf) if (ref[0] === 'a') atomOf.set(el.getAttribute('id') ?? '', Number(ref.slice(1)));
  for (const [id, json] of tags) {
    const r = doc.arrows.get(id);
    if (!r) continue;
    try {
      const v = JSON.parse(json) as { pairs?: string[][]; exact?: boolean; shifts?: string[][]; slides?: string[][][] };
      const at = (k: string) => { const a = atomOf.get(String(k)); if (a === undefined) throw new Error('gone'); return a; };
      const m: MorphStep = {};
      if (v.pairs?.length) m.pairs = v.pairs.map(([a, b]) => [at(a), at(b)]);
      if (v.exact) m.exact = true;
      if (v.shifts?.length) m.shifts = v.shifts.map(([u, w, d]) => [at(u), at(w), at(d)]);
      if (v.slides?.length) m.slides = v.slides.map(([[a, b], [c, d]]) => [[at(a), at(b)], [at(c), at(d)]]);
      r.morph = m;
    } catch { /* a pairing naming atoms that are not there is no pairing */ }
  }
}

/** Pins on arrows' ends, with the file's node ids turned back into atoms (a pin naming an atom that is gone is dropped). */
function readPinTags(tags: [number, string][], refOf: Map<Element, string>, doc: Doc): void {
  if (!tags.length) return;
  const atomOf = new Map<string, number>();
  for (const [el, ref] of refOf) if (ref[0] === 'a') atomOf.set(el.getAttribute('id') ?? '', Number(ref.slice(1)));
  for (const [id, json] of tags) {
    const r = doc.arrows.get(id);
    if (!r) continue;
    try {
      const v = JSON.parse(json) as Record<'tail' | 'head', { on: Pin['on']; ref: string[]; at: [number, number]; hand: number } | undefined>;
      const pin: Arrow['pin'] = {};
      for (const end of ['tail', 'head'] as const) {
        const p = v[end];
        if (!p || !Array.isArray(p.ref) || !Array.isArray(p.at) || !p.at.slice(0, 2).every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
        const ref = p.ref.map((k) => atomOf.get(String(k)));
        if (ref.some((x) => x === undefined) || !['atom', 'bond', 'gap'].includes(p.on)) continue;
        pin[end] = { on: p.on, ref: ref as number[], at: { x: p.at[0], y: p.at[1] }, hand: p.hand < 0 ? -1 : 1, was: { ...r[end] } };
      }
      if (pin.tail || pin.head) r.pin = pin;
    } catch { /* not a pin */ }
  }
}

const STEP_ROLES: [string, keyof StepRoles][] = [
  ['ReactionStepReactants', 'reactants'], ['ReactionStepProducts', 'products'],
  ['ReactionStepObjectsAboveArrow', 'above'], ['ReactionStepObjectsBelowArrow', 'below'], ['ReactionStepPlusses', 'plusses'],
];

/**
 * ChemDraw's reaction steps: the roles are kept with each step's arrow. A step names whole
 * structures (fragments), captions, groups of them, and the arrow (or the older copy of it that
 * ChemDraw keeps for old versions).
 */
function readSteps(all: Element[], refs: () => Map<Element, string>, doc: Doc): void {
  if (!all.some((el) => el.nodeName === 'step')) return;
  const refOf = refs();
  const byId = new Map<string, Element>();
  // (fonts are numbered on their own: a font's id can be the same as a drawn object's)
  for (const el of all) { const id = el.getAttribute('id'); if (id && el.nodeName !== 'font' && !byId.has(id)) byId.set(id, el); }
  const refsOf = (el: Element | undefined, out: string[]) => {
    if (!el) return;
    const own = refOf.get(el);
    if (own) { if (!out.includes(own)) out.push(own); return; }
    if (el.nodeName === 'fragment') {
      const n = kids(el).find((k) => k.nodeName === 'n' && refOf.has(k));
      if (n && !out.includes(refOf.get(n)!)) out.push(refOf.get(n)!);
      return;
    }
    if (el.nodeName === 'group') for (const k of kids(el)) refsOf(k, out);
  };
  for (const st of all) {
    if (st.nodeName !== 'step') continue;
    const arrows: string[] = [];
    for (const id of (st.getAttribute('ReactionStepArrows') ?? '').split(/\s+/).filter(Boolean)) {
      let el = byId.get(id);
      const newer = el?.getAttribute('SupersededBy');
      if (el && !refOf.has(el) && newer) el = byId.get(newer);
      refsOf(el, arrows);
    }
    const r = arrows.map((a) => (a[0] === 'r' ? doc.arrows.get(Number(a.slice(1))) : undefined)).find(Boolean);
    if (!r || r.step) continue;
    const roles: StepRoles = { reactants: [], products: [], above: [], below: [] };
    for (const [attr, key] of STEP_ROLES) {
      const list: string[] = [];
      for (const id of (st.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) refsOf(byId.get(id), list);
      if (list.length || key !== 'plusses') (roles[key] as string[]) = list;
    }
    // a cycle's step names, written inside it (ChemDraw counts them as below the arrow)
    const inside: string[] = [];
    const tag = kids(st).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === INSIDE_TAG)?.getAttribute('Value');
    for (const id of (tag ?? '').split(/\s+/).filter(Boolean)) refsOf(byId.get(id), inside);
    if (inside.length) {
      roles.inside = inside;
      roles.below = roles.below.filter((x) => !inside.includes(x));
    }
    r.step = roles;
  }
  // ChemDraw's atom-atom map (pairs of a reactant atom and its product atom), when the file has
  // no map numbers of ours: the atoms of each pair get one number, kept along a chain of steps
  if ([...doc.atoms.values()].some((a) => a.mapNo)) return;
  const num = new Map<number, number>();
  let next = 1;
  for (const st of all) {
    if (st.nodeName !== 'step') continue;
    const map = st.getAttribute('ReactionStepAtomMap') ?? [st.getAttribute('ReactionStepAtomMapManual'), st.getAttribute('ReactionStepAtomMapAuto')].filter(Boolean).join(' ');
    const x = map.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i + 1 < x.length; i += 2) {
      const [ra, pa] = [x[i], x[i + 1]].map((id) => { const e = byId.get(id), ref = e && refOf.get(e); return ref?.[0] === 'a' ? Number(ref.slice(1)) : null; });
      if (ra === null || pa === null) continue;
      const n = num.get(ra) ?? num.get(pa) ?? next++;
      num.set(ra, n); num.set(pa, n);
    }
  }
  for (const [id, n] of num) { const a = doc.atoms.get(id); if (a) a.mapNo = n; }
}

/** Insert line breaks into styled runs at the given UTF-8 byte offsets. */
export function applyLineEnds(runs: TextRun[], ends: number[]): void {
  const want = new Set(ends);
  const chars: { ch: string; run: number }[] = [];
  runs.forEach((r, k) => { for (const ch of r.text) chars.push({ ch, run: k }); });
  const breaks: number[] = [];
  const size = (ch: string) => { const cp = ch.codePointAt(0)!; return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; };
  // ChemDraw counts LineStarts in bytes of UTF-8; some older files (ChemDraw 21) count characters
  const byteLen = chars.reduce((n, c) => n + size(c.ch), 0), last = Math.max(...ends);
  const inChars = last === chars.length && last !== byteLen;
  if (!inChars && last > byteLen) return;
  const hasNewlines = chars.some((c) => c.ch === '\n');
  const word = /[\p{L}\p{N}]/u;
  let at = 0;
  chars.forEach((c, i) => {
    // (never split a word or number where the text already breaks its own lines)
    if (i > 0 && want.has(at) && !(hasNewlines && word.test(chars[i - 1].ch) && word.test(c.ch))) breaks.push(i);
    at += inChars ? 1 : size(c.ch);
  });
  for (let k = breaks.length - 1; k >= 0; k--) {
    const i = breaks[k];
    const prev = chars[i - 1];
    if (prev.ch === '\n') continue;
    if (prev.ch === ' ') prev.ch = '\n';
    else chars.splice(i, 0, { ch: '\n', run: prev.run });
  }
  runs.forEach((r) => (r.text = ''));
  for (const c of chars) runs[c.run].text += c.ch;
}

/** Is `text` just the element symbol with its hydrogens, in either order (N, NH, HN, H3C)? */
export function isAutoLabel(z: number, text: string, h: number): boolean {
  const sym = SYMBOLS[z];
  if (!sym) return false;
  const hs = h === 0 ? '' : h === 1 ? 'H' : `H${h}`;
  return text === sym + hs || text === hs + sym || (h === 0 && text === sym);
}

/** Our own clipboard attributes for pictures (any format, and cropping), which ChemDraw doesn't have. */
/** The tag that marks a bond as part of an aromatic ring drawn with a circle (ours; ChemDraw has none). */
/** An older way this program marked ring circles; removed from bonds when saving (the circle itself is what counts). */
export const CIRCLE_TAG = 'ci-aromatic-circle';
/** The tag that keeps a filled shape's fill style and outline colour (ChemDraw has one colour). */
export const FILL_TAG = 'Chem Illustrator fill';
/** A frame's gap and whether it follows what it surrounds (editor/frames.ts). */
export const FRAME_TAG = 'Chem Illustrator frame';
/** A part of an orbital drawn here that ChemDraw keeps as an oval (an s orbital, a dz²'s ring): how the orbital was asked for (Shape.orb as JSON). */
export const ORBITAL_TAG = 'Chem Illustrator orbital';

/** An orbital part's tag read back, or undefined when it isn't one. */
export function orbitalTag(json: string | null | undefined): OrbitalTag | undefined {
  try {
    const v = JSON.parse(json ?? '') as Partial<OrbitalTag>;
    if (typeof v?.kind !== 'string' || typeof v.look !== 'string' || typeof v.part !== 'number' || !Number.isInteger(v.part) || v.part < 0) return undefined;
    const colours = Array.isArray(v.colours) && v.colours.length === 2 && v.colours.every((c) => typeof c === 'string') ? { colours: v.colours as [string, string] } : {};
    return { kind: v.kind, look: v.look, ...(v.flip === true ? { flip: true } : {}), ...colours, part: v.part };
  } catch { return undefined; }
}
/** The tag on a reaction step listing the captions written inside a catalytic cycle (its step names). */
export const INSIDE_TAG = 'Chem Illustrator inside';
/** The gradient and pattern settings kept in a fill tag, checked. */
export function fillExtras(v: Partial<Shape>): Partial<Shape> {
  const out: Partial<Shape> = {};
  const hex = (c: unknown) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : undefined);
  if (hex(v.fill2)) out.fill2 = hex(v.fill2);
  if (typeof v.gradAngle === 'number' && isFinite(v.gradAngle)) out.gradAngle = v.gradAngle;
  if (v.gradRadial === true) out.gradRadial = true;
  const patterns = ['hatch', 'backhatch', 'crosshatch', 'horizontal', 'vertical', 'grid', 'dots', 'dense-dots'];
  if (typeof v.pattern === 'string' && patterns.includes(v.pattern)) out.pattern = v.pattern;
  if (hex(v.patternColor)) out.patternColor = hex(v.patternColor);
  if (typeof v.patternSize === 'number' && v.patternSize > 0 && v.patternSize < 100) out.patternSize = v.patternSize;
  if (v.patternClear === true) out.patternClear = true;
  if (typeof v.patternTransparency === 'number' && v.patternTransparency > 0 && v.patternTransparency <= 1) out.patternTransparency = v.patternTransparency;
  return out;
}

/** A highlight behind an atom or bond: its colour (ChemDraw has no highlights, so it shows nothing). */
export const HIGHLIGHT_TAG = 'Chem Illustrator highlight';
/** A hapto bond drawn as a line to each of its atoms rather than to their middle. */
export const SPOKES_TAG = 'Chem Illustrator spokes';
/** How a highlight is drawn (its shape, size, shadow…), when not the usual look. */
export const HIGHLIGHT_LOOK_TAG = 'Chem Illustrator highlight look';
/** The tag that keeps a contracted label's group (SMILES), so its chemistry comes back with the file. */
export const GROUP_TAG = 'Chem Illustrator group';
/** On the page: its page grid's fixed edges, and whether it grows (page-grid.ts). */
export const PAGE_TAG = 'Chem Illustrator page grid';
/** The drawing's guides (crosshairs, lines, grid, ticks), as JSON on the page: only this program reads it. */
export const GUIDES_TAG = 'Chem Illustrator guides';
/** On the page when objects have an order of their own (Format > Order): their places are then read from ChemDraw's Z. */
export const STACK_TAG = 'Chem Illustrator order';
/** The drawing style's text above and below arrows (size, font), as JSON on the page: ChemDraw has no setting for it. */
export const ARROW_TEXT_TAG = 'Chem Illustrator arrows';
/** The drawing's map-number box look and its own box format, as JSON on the page (ChemDraw draws its own gray boxes). */
export const MAP_LOOK_TAG = 'Chem Illustrator map numbers';
/** On a MultiAttachment node: its π-system drawn in Kekulé form rather than delocalized (only this program reads it). */
export const KEKULE_TAG = 'Chem Illustrator Kekule';
/** A variable attachment's ring, whose middle it sits at: {ring: node ids, seen: {attachments: the Attachments written beside it}}. */
export const RING_TAG = 'Chem Illustrator ring';
/** A bond's look that ChemDraw 25 drops (hydrogen, ionic and wavy wedge bonds, second-line styles): {display?, line2?}. */
export const BOND_LOOK_TAG = 'Chem Illustrator bond look';
/** The tag on turned text: degrees clockwise about the start of its first line (ChemDraw shows it level). */
export const TURN_TAG = 'Chem Illustrator turn';
/** The tag on the group that draws a design shape in ChemDraw: the shape as it is here. */
export const GEO_TAG = 'Chem Illustrator shape';

/** Two colours further apart than ChemDraw's rounding of a colour table can make them. */
function colorsFar(a: string, b: string): boolean {
  const ch = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const x = ch(a), y = ch(b);
  return x.some((v, i) => !(Math.abs(v - y[i]) <= 8));
}

/** A curve arrow's look from our tag, only where it is one the arrow can have. */
function lookOk(k: 'headStyle' | 'tailStyle' | 'headType' | 'line' | 'headLength' | 'headWidth', v: unknown): boolean {
  if (k === 'headStyle' || k === 'tailStyle') return v === 'none' || v === 'full' || v === 'halfLeft' || v === 'halfRight';
  if (k === 'headType') return v === 'solid' || v === 'hollow' || v === 'angle';
  if (k === 'line') return v === 'solid' || v === 'dashed' || v === 'bold' || v === 'wavy';
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

const GEO_KINDS: Record<string, 'string' | 'number' | 'boolean'> = {
  kind: 'string', geo: 'string', color: 'string', fillColor: 'string', fill: 'string',
  x1: 'number', y1: 'number', x2: 'number', y2: 'number', z: 'number', rot: 'number', lineWidth: 'number', stack: 'number',
  filled: 'boolean', dashed: 'boolean', bold: 'boolean', dotted: 'boolean',
};

/** A design shape from our tag, without what a shape can't hold (one bad value would stop the drawing saving). */
function geoFromTag(saved: Partial<Shape> & Record<string, unknown>): (Partial<Shape> & Record<string, unknown>) | null {
  if (typeof saved !== 'object' || Array.isArray(saved)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(saved)) {
    if (k === 'id') continue;
    const want = GEO_KINDS[k];
    if (want && (typeof v !== want || (want === 'number' && !Number.isFinite(v as number)))) continue;
    if (k === 'poly' && !(Array.isArray(v) && v.every((p) => p && typeof p.x === 'number' && typeof p.y === 'number'))) continue;
    out[k] = v;
  }
  return out as Partial<Shape> & Record<string, unknown>;
}
/** A reaction arrow's animation settings (MorphStep as JSON, atoms by the file's node ids). */
export const MORPH_TAG = 'Chem Illustrator animation';
/** An atom's atom-atom map number across a reaction (Atom.mapNo). */
export const MAP_TAG = 'Chem Illustrator map';
/** Auto-Animate Steps: the piece a thing moves with in the slide show (Atom.piece, Caption.piece and so on). */
export const PIECE_TAG = 'Chem Illustrator piece';
/** An electron-pushing arrow's pins (what its ends are stuck to: Pin as JSON without `was`, atoms by node id). */
export const PIN_TAG = 'Chem Illustrator pin';
/** An S-shaped arrow saved as a ChemDraw curve: its heads as they are here (JSON). */
export const CURVE_ARROW_TAG = 'Chem Illustrator arrow';

/** A variable attachment's ring from our tag, while its atoms are still the ones written beside it. */
function ringFromTag(n: Element, nodeIds: Map<string, number>): number[] | null {
  const json = kids(n).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === RING_TAG)?.getAttribute('Value');
  if (!json) return null;
  try {
    const v = JSON.parse(json) as { ring?: unknown; seen?: { attachments?: unknown } };
    if (!Array.isArray(v.ring) || v.seen?.attachments !== n.getAttribute('Attachments')) return null;
    const ring = v.ring.map((id) => nodeIds.get(String(id)));
    return ring.length > 2 && ring.every((id) => id !== undefined) ? ring as number[] : null;
  } catch { return null; }
}

/**
 * A bond's look from our tag: what ChemDraw 25 has no way to keep (it ignores Order hydrogen and
 * ionic, Display WavyWedge and Display2 Bold and Hash, in CDXML and CDX, and draws a plain bond).
 * Written beside the nearest ChemDraw has (Display Dash for hydrogen and ionic, Wavy for the wavy
 * wedge, Display2 Dash for a dashed second line, a plain double bond for the others), and used
 * only while those words stand.
 */
function bondLookOf(json: string | null | undefined): { display?: 'hydrogen' | 'ionic' | 'wavyWedge'; line2?: 'dash' | 'bold' | 'hash' } {
  if (!json) return {};
  try {
    const v = JSON.parse(json) as { display?: unknown; line2?: unknown };
    return {
      ...(v.display === 'hydrogen' || v.display === 'ionic' || v.display === 'wavyWedge' ? { display: v.display } : {}),
      ...(v.line2 === 'dash' || v.line2 === 'bold' || v.line2 === 'hash' ? { line2: v.line2 } : {}),
    };
  } catch { return {}; }
}
/** The group's box when saved here (ChemDraw rewrites BoundingBox when the group is moved). */
export const GEO_BOX_ATTR = 'ChemIllustratorBox';
/** A tag of this program's own (ChemDraw's own tags, such as "stereo", are left as they are). */
const ownTag = (e: Element) => e.nodeName === 'objecttag' && /^(Chem Illustrator |ci-)/.test(e.getAttribute('Name') ?? '');

/**
 * A tag value as saved: CDX keeps strings in one code page (Windows-1252 here), so a value with
 * anything outside printable ASCII is saved as a JSON string with \uXXXX escapes, which comes
 * through CDX, ChemDraw and any code page unchanged. (So is a value that starts with a quote, so
 * that reading it back is never in doubt.) Plain ASCII values are saved as they are.
 */
export function encodeTagValue(v: string): string {
  if (!/[^\x20-\x7e]/.test(v) && !v.startsWith('"')) return v;
  return JSON.stringify(v).replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** Our tags' values as they were (see encodeTagValue); older files' raw values read as they are. */
export function decodeTags(root: Element): void {
  for (const e of descendants(root)) {
    if (!ownTag(e)) continue;
    const v = e.getAttribute('Value');
    if (!v || v.length < 2 || !v.startsWith('"') || !v.endsWith('"')) continue;
    try { const s: unknown = JSON.parse(v); if (typeof s === 'string') e.setAttribute('Value', s); } catch { /* an older raw value */ }
  }
}

/** Saves our tags' values (in place), see encodeTagValue. */
export function encodeTags(root: Element): void {
  for (const e of descendants(root)) {
    const v = ownTag(e) ? e.getAttribute('Value') : null;
    if (v) { const w = encodeTagValue(v); if (w !== v) e.setAttribute('Value', w); }
  }
}

/** This program's tags for the whole page (ChemDraw drops tags kept on the page itself). */
const PAGE_LEVEL_TAGS = (): string[] => [PAGE_TAG, GUIDES_TAG, STACK_TAG, ARROW_TEXT_TAG, MAP_LOOK_TAG];

/** An element's own tag of a name. */
const ownTagOf = (e: Element, name: string) => kids(e).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === name) ?? null;

/** A step's arrow elements: the ones it names, and the arrows that took their place. */
function stepArrows(st: Element, byId: Map<string, Element>): Element[] {
  const out: Element[] = [];
  for (const id of (st.getAttribute('ReactionStepArrows') ?? '').split(/\s+/).filter(Boolean)) {
    const el = byId.get(id);
    if (!el) continue;
    out.push(el);
    const newer = el.getAttribute('SupersededBy');
    const n = newer ? byId.get(newer) : undefined;
    if (n) out.push(n);
  }
  return out;
}

const idMap = (root: Element): Map<string, Element> => {
  const m = new Map<string, Element>();
  for (const e of descendants(root)) { const id = e.getAttribute('id'); if (id && e.nodeName !== 'font' && !m.has(id)) m.set(id, e); }
  return m;
};

/**
 * ChemDraw keeps tags on objects (text, graphics, groups, arrows) but drops the ones on the page
 * and on reaction steps. So files keep this program's page tags on the first object on the page,
 * and a step's tag on its arrow (see lowerOwnTags); on opening they go back where they are read
 * from (the page, the step). Older files have them there already.
 */
export function hoistOwnTags(root: Element): void {
  const page = kids(root).find((k) => k.nodeName === 'page');
  if (!page) return;
  const names = PAGE_LEVEL_TAGS();
  for (const ch of kids(page)) {
    if (ch.nodeName === 'objecttag') continue;
    for (const k of kids(ch)) {
      const name = k.getAttribute('Name') ?? '';
      if (k.nodeName !== 'objecttag' || !names.includes(name)) continue;
      ch.removeChild(k);
      if (!ownTagOf(page, name)) page.appendChild(k);
    }
  }
  let byId: Map<string, Element> | null = null;
  for (const st of descendants(page)) {
    if (st.nodeName !== 'step') continue;
    byId ??= idMap(root);
    for (const a of stepArrows(st, byId)) {
      const tag = ownTagOf(a, INSIDE_TAG);
      if (!tag) continue;
      a.removeChild(tag);
      if (!ownTagOf(st, INSIDE_TAG)) st.appendChild(tag);
    }
  }
}

/** Where a file keeps this program's page and step tags (the other way from hoistOwnTags). */
export function lowerOwnTags(root: Element): void {
  const page = kids(root).find((k) => k.nodeName === 'page');
  if (!page) return;
  const names = PAGE_LEVEL_TAGS();
  const tags = kids(page).filter((k) => k.nodeName === 'objecttag' && names.includes(k.getAttribute('Name') ?? ''));
  const ok = (e: Element) => !e.hasAttribute('SupersededBy');
  const carrier = kids(page).find((e) => ['t', 'graphic', 'group', 'curve', 'table', 'arrow', 'embeddedobject'].includes(e.nodeName) && ok(e))
    ?? kids(page).find((e) => e.nodeName === 'fragment');
  if (carrier) for (const t of tags) carrier.appendChild(t);
  let byId: Map<string, Element> | null = null;
  for (const st of descendants(page)) {
    if (st.nodeName !== 'step') continue;
    const tag = ownTagOf(st, INSIDE_TAG);
    if (!tag) continue;
    byId ??= idMap(root);
    const arrow = stepArrows(st, byId).find((a) => a.nodeName === 'arrow' || (a.nodeName === 'graphic' && ok(a)));
    if (arrow) arrow.appendChild(tag);
  }
}

/** A line drawn dotted here (ChemDraw is given dashes): the attribute of older files. */
export const DOTTED_ATTR = 'ChemIllustratorDotted';
/** A line drawn dotted here (ChemDraw is given dashes), value "yes". */
export const DOTTED_TAG = 'Chem Illustrator dotted';
/** A chart (Insert > Chart on slides): the chart and its data, on the picture standing for it. */
export const CHART_TAG = 'Chem Illustrator chart';
/** An equation (Insert > Equation on slides): its LaTeX, size, colour and font, on the picture standing for it. */
export const MATH_TAG = 'Chem Illustrator equation';
/** A picture's Picture Format settings (brightness, recolouring, background removed, shape…), which ChemDraw doesn't have. */
export const PICTURE_FX_TAG = 'Chem Illustrator picture format';
/** Alt text written for a structure (on one of its atoms) or a picture, which ChemDraw doesn't have. */
export const ALT_TAG = 'Chem Illustrator alt text';
export const OWN_PICTURE = 'ChemIllustratorPicture';
export const OWN_CROP = 'ChemIllustratorCrop';

/** Each hex digit's value, by character code (anything else 0, as parseInt's NaN became). */
const HEX = (() => {
  const t = new Uint8Array(128);
  for (let i = 0; i < 16; i++) { t['0123456789abcdef'.charCodeAt(i)] = i; t['0123456789ABCDEF'.charCodeAt(i)] = i; }
  return t;
})();

/** The picture in a ChemDraw embedded object, when there is one this program can show. */
function pictureOf(el: Element): { src: string; px: { w: number; h: number }; crop: Shape['crop'] | null } | null {
  const own = el.getAttribute(OWN_PICTURE);
  const c = pts(el.getAttribute(OWN_CROP));
  const crop = c.length === 4 && c.every(Number.isFinite) ? { l: c[0], t: c[1], r: c[2], b: c[3] } : null;
  if (own?.startsWith('data:image/')) {
    try {
      const { mime, bytes } = fromDataUrl(own);
      return { src: own, px: imageSize(bytes, mime) ?? { w: 100, h: 100 }, crop };
    } catch {
      // fall back to the PNG
    }
  }
  const hexBytes = (name: string): Uint8Array | null => {
    const hex = el.getAttribute(name);
    if (!hex || hex.length < 48 || !/^[0-9a-f]+$/i.test(hex.slice(0, 64))) return null;
    // (by character codes: a big picture is megabytes of hex)
    const bytes = new Uint8Array(hex.length >> 1);
    for (let i = 0, j = 0; i < bytes.length; i++, j += 2) bytes[i] = (HEX[hex.charCodeAt(j)] << 4) | HEX[hex.charCodeAt(j + 1)];
    return bytes;
  };
  const picture = (bytes: Uint8Array, mime: string) => ({ src: dataUrl(bytes, mime), px: imageSize(bytes, mime) ?? { w: 100, h: 100 }, crop });
  // a Windows metafile with lines and text (a chart or spectrum) is sharper than ChemDraw's PNG copy of it
  const unpack = (name: string): Uint8Array | null => {
    const packed = hexBytes(name);
    if (!packed) return null;
    try { return unzlibSync(packed); } catch { return null; }
  };
  const wmf = hexBytes('WindowsMetafile') ?? unpack('CompressedWindowsMetafile');
  const emf = hexBytes('EnhancedMetafile') ?? unpack('CompressedEnhancedMetafile') ?? (wmf ? emfInWmf(wmf) : null);
  const drawn = emf ? emfToSvg(emf) : null;
  if (emf && drawn && drawn.vectors > 0) return picture(emf, 'image/x-emf');
  for (const [name, mime] of [['PNG', 'image/png'], ['JPEG', 'image/jpeg'], ['GIF', 'image/gif'], ['BMP', 'image/bmp']]) {
    const bytes = hexBytes(name);
    if (bytes) return picture(bytes, mime);
  }
  return emf && drawn ? picture(emf, 'image/x-emf') : null;
}

/**
 * How a label from a file raises its characters: R numbers written raised (or, for R1, R12…,
 * written on the line or lowered) and any other characters raised, lowered by hand.
 */
export function labelLookOf(runs: TextRun[], text: string): { supDigits?: boolean; marks?: string } {
  const mixed = runs.some((r) => r.formula) && runs.some((r) => !r.formula && !r.sup && !r.sub);
  const out: { supDigits?: boolean; marks?: string } = {};
  const raisedDigits = runs.length > 1 && runs[runs.length - 1].sup && /^\d+$/.test(runs[runs.length - 1].text);
  if (raisedDigits) out.supDigits = true;
  else if (/^R\d+$/.test(text)) out.supDigits = false;
  let marks = '', any = false;
  runs.forEach((r, k) => {
    for (const _ of r.text) {
      const raisedR = raisedDigits && k === runs.length - 1;
      // (in a label of mixed styles, a run in bold or out of formula style stays as it is: a 28 in bold is no subscript)
      const m = r.sup && !raisedR ? (r.italic ? '*' : '^') : r.sub ? (r.italic ? ',' : '_') : r.italic ? '/' : mixed && r.bold ? '!' : mixed && !r.formula ? '=' : '.';
      if (m !== '.') any = true;
      marks += m;
    }
  });
  if (any) out.marks = marks.slice(0, text.length);
  return out;
}

/** Move an element's own points (not its children's) by (dx, dy). */
function movePoints(e: Element, dx: number, dy: number): void {
  for (const name of ['p', 'BoundingBox']) {
    const v = e.getAttribute(name);
    if (v === null) continue;
    e.setAttribute(name, pts(v).map((x, i) => String(+(x + (i % 2 ? dy : dx)).toFixed(3))).join(' '));
  }
}

/**
 * The atoms in order round a closed loop of bonds (a ring fill's bonds), or null when the bonds
 * are not one simple loop.
 */
export function cycleOf(doc: Doc, bonds: number[]): number[] | null {
  if (bonds.length < 3) return null;
  const next = new Map<number, number[]>();
  for (const id of bonds) {
    const b = doc.bonds.get(id);
    if (!b) return null;
    for (const [p, q] of [[b.a1, b.a2], [b.a2, b.a1]]) {
      const l = next.get(p) ?? [];
      l.push(q);
      next.set(p, l);
    }
  }
  if ([...next.values()].some((l) => l.length !== 2)) return null;
  const start = doc.bonds.get(bonds[0])!.a1;
  const ring = [start];
  let prev = -1, at = start;
  for (;;) {
    const [u, v] = next.get(at)!;
    const go = u !== prev ? u : v;
    if (go === start) break;
    ring.push(go);
    prev = at;
    at = go;
    if (ring.length > bonds.length) return null;
  }
  return ring.length === bonds.length ? ring : null;
}

/**
 * The inner Bézier points (two controls and an end per piece, the last end left out) of a ChemDraw
 * arc arrow along an ellipse, from its tail through AngularSize degrees on the side that ends at its
 * head; null for a circular arc (axes within 3%) or one without its axes.
 */
export function ellipseArcBez(el: Element, tail: number[], head: number[], angularSize: number): { x: number; y: number }[] | null {
  const c = pts(el.getAttribute('Center3D')), ma = pts(el.getAttribute('MajorAxisEnd3D')), mi = pts(el.getAttribute('MinorAxisEnd3D'));
  if (c.length < 2 || ma.length < 2 || mi.length < 2) return null;
  return ellipseArcPoints({ x: c[0], y: c[1] }, { x: ma[0] - c[0], y: ma[1] - c[1] }, { x: mi[0] - c[0], y: mi[1] - c[1] }, { x: tail[0], y: tail[1] }, { x: head[0], y: head[1] }, angularSize);
}
