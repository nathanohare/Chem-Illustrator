// Writing ChemDraw CDXML files.
//
// A drawing opened from a CDXML file is saved by editing that file: objects that did not
// change are left exactly as ChemDraw wrote them (including things this program cannot draw
// yet, such as pictures, reaction schemes and atom-number tags), changed objects are rewritten,
// deleted ones are removed and new ones are added. A new drawing is written from scratch in
// the same form ChemDraw uses, so ChemDraw opens both.

import { guidesText } from '../editor/guides';
import { CdxmlSource, Doc, Atom, Bond, Caption, Arrow, Shape, TextRun, Entity, Kind, StepRoles, enhancedText, CHIRAL_FLAGS, flagTextSize, type HighlightStyle } from '../model';
import { interpretArrow, isReactionArrow, linkRows, isStep, plainMeasure, schemeItems, type Item } from '../chem/reaction';
import { SYMBOLS } from '../chem/elements';
import { labelBonds, labelSpec, layoutLabel, labelDir, labelGraph, tokenize, isGenericLabel, Measure, MiniGraph, kekulize, labelLook } from '../chem/labels';
import { Vec, DEG, arcCenter, norm, sub, Rect, turnedCorners } from '../geom';
import { arrowEllipse, bezPoints, boxOf, shapeTurn } from '../objects';
import { kids, descendants, wellFormed, withoutDoctype } from './xml';
import { arialWidth } from '../text-metrics';
import { toSymbolPieces, isSymbolFont, faceFromStyle } from '../richtext';
import { layoutText, SINGLE } from '../text/layout';
import { runsForChemDraw, TEXT_TAG } from '../text/chemdraw-text';
import { ATTACH_TAG, CHEM_TAG, IGNORE_TAG, attachTag } from '../editor/attached';
import { captionSpecies } from '../chem/species';
import { atomStereoText, bondStereoText, StereoPlacer, PlacedLabel } from '../chem/stereo';
import { dataUrl, fromDataUrl, rasterPng } from '../render/images';
import { itemsToEmf } from '../render/emf';
import { crystalItems } from '../design/xray';
import { BOND_LOOK_TAG, RING_TAG, PAGE_TAG, GUIDES_TAG, ARROW_TEXT_TAG, MAP_LOOK_TAG, KEKULE_TAG, ALT_TAG, CHART_TAG, MATH_TAG, PLATE_TAG, PICTURE_FX_TAG, OWN_PICTURE, OWN_CROP, CIRCLE_TAG, FILL_TAG, FRAME_TAG, ORBITAL_TAG, INSIDE_TAG, GROUP_TAG, GEO_TAG, MORPH_TAG, MAP_TAG, PIECE_TAG, PIN_TAG, CURVE_ARROW_TAG, TURN_TAG, GEO_BOX_ATTR, DOTTED_ATTR, DOTTED_TAG, HIGHLIGHT_TAG, HIGHLIGHT_LOOK_TAG, SPOKES_TAG, STACK_TAG, decodeTags, encodeTags, hoistOwnTags, lowerOwnTags } from './cdxml';
import { stackItems, usesStacking } from '../editor/stacking';
import { frameTag } from '../editor/frames';
import { tableContents } from '../editor/table-figs';
import { macPrintInfo, paperOf, SHEETS } from './cdxml-print';
import { pageExtent, pageCount, pageTag } from '../page-grid';
import { geoDef, isPathId, isPenId, moveSteps, outlineParts, textArea, turnSteps, type GeoStep } from '../design/geo';
import { FADE, tint } from '../colours';
import { fillInk, mix, ringShadowGroups, ringShadowSize, shadowLook } from '../render/fills';
import { shapeShadow } from '../render/highlight-fx';
import { parseColor } from '../render/vector';
import { layoutTable, cellAlign, isCovered, spanOf, partAt, NOTE_SCALE } from '../table';
import { TABLE_TAG, TABLE_PART_TAG, tableBorders, type TableTag } from './cdxml-table';
import { bondLayer, crossingBondsCached, listedNearMisses } from '../chem/crossing';
import { repeatGroups, repeatCount, repeatLabelPlace } from '../chem/polymer';
import { ellipseAxes, isCircleRing, ringBonds, ringCircle, ringsThroughBond } from '../chem/aromatic';
import { newmanForFile } from '../design/newman';
import { bondWidths, docMapLook, labelBold } from '../style';
import { isMapNumber } from '../render/atom-marks';

/**
 * The drawing's map-number look as the page tag's JSON: saved when the drawing has a look of its
 * own or shows map numbers, so it opens the same on another computer; null otherwise.
 */
function mapLookText(doc: Doc): string | null {
  if (!doc.style.mapLook && !doc.style.mapBox && ![...doc.atoms.values()].some(isMapNumber)) return null;
  const { look, custom } = docMapLook(doc.style);
  return JSON.stringify(look === 'custom' ? { look, box: custom } : { look });
}

/** Numbers in an attribute such as "12.5 30 0". */
const pts = (v: string | null): number[] => (v ?? '').trim().split(/\s+/).filter(Boolean).map(Number);


export interface WriteOptions {
  /** Text width in points; by default Arial's own widths, as ChemDraw uses. */
  measure?: Measure;
  /** File name stored in the document. */
  name?: string;
  /**
   * Width of text in any font, for wrapping text boxes (the app measures with the fonts on the
   * computer). By default Arial's widths, whatever the font.
   */
  textMeasure?: (text: string, size: number, family: string, style: string) => number;
  /**
   * For this program's own clipboard: also keep what only it reads (pictures in any format,
   * and how they are cropped). Files keep to what ChemDraw reads.
   */
  own?: boolean;
  /**
   * A picture of a type ChemDraw can't hold (SVG, WebP) as a PNG data URL of about w by h pixels,
   * or null. By default the browser's copy of it (render/images.ts rasterPng).
   */
  raster?: (src: string, w: number, h: number) => string | null;
}

const NEW_PROLOG = '<?xml version="1.0" encoding="UTF-8" ?>\n<!DOCTYPE CDXML SYSTEM "http://www.cambridgesoft.com/xml/cdxml.dtd" >\n';
const CAP = 0.716; // Arial cap height / font size

/** ChemDraw writes coordinates with two decimals. */
const f2 = (n: number): string => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2);
const pt = (p: Vec): string => `${f2(p.x)} ${f2(p.y)}`;
const pt3 = (p: Vec): string => `${f2(p.x)} ${f2(p.y)} 0`;
const box = (r: Rect): string => `${f2(r.x1)} ${f2(r.y1)} ${f2(r.x2)} ${f2(r.y2)}`;

const POSITION_ATTRS = ['p', 'BoundingBox', 'Head3D', 'Tail3D', 'Center3D', 'MajorAxisEnd3D', 'MinorAxisEnd3D'];

/**
 * An outline as ChemDraw curves: each point with the Bézier handles either side of it (handle in,
 * point, handle out), so straight edges have their handles on the points.
 */
export function chemDrawCurves(steps: GeoStep[]): { points: Vec[]; closed: boolean }[] {
  type Knot = { cin: Vec; p: Vec; cout: Vec };
  const out: { points: Vec[]; closed: boolean }[] = [];
  let knots: Knot[] = [];
  const finish = (closed: boolean) => {
    if (knots.length > 1) {
      const first = knots[0], last = knots[knots.length - 1];
      // a closed outline ending where it began: one point there, with both handles
      if (closed && Math.hypot(first.p.x - last.p.x, first.p.y - last.p.y) < 1e-6) {
        first.cin = last.cin;
        knots.pop();
      }
      out.push({ points: knots.flatMap((k) => [k.cin, k.p, k.cout]), closed });
    }
    knots = [];
  };
  for (const st of steps) {
    if (st[0] === 'M') {
      finish(false);
      const p = { x: st[1], y: st[2] };
      knots.push({ cin: p, p, cout: p });
    } else if (st[0] === 'L' && knots.length) {
      const p = { x: st[1], y: st[2] };
      knots.push({ cin: p, p, cout: p });
    } else if (st[0] === 'C' && knots.length) {
      knots[knots.length - 1].cout = { x: st[1], y: st[2] };
      knots.push({ cin: { x: st[3], y: st[4] }, p: { x: st[5], y: st[6] }, cout: { x: st[5], y: st[6] } });
    } else if (st[0] === 'Z') finish(true);
  }
  finish(false);
  return out;
}

export function writeCdxml(doc: Doc, opts: WriteOptions = {}): string {
  return new CdxmlWriter(doc, opts).write();
}

class CdxmlWriter {
  private x!: XMLDocument;
  private root!: Element;
  private page!: Element;
  private all: Element[] = [];
  private prolog = NEW_PROLOG;
  private nextId = 1;
  private colors: string[] = ['#000000', '#ffffff'];
  private colortable!: Element;
  private fonttable!: Element;
  private fontIds = new Map<string, string>();
  private measure: Measure;
  /** Spots for stereo labels and atom numbers (made when first needed). */
  private placerMade: StereoPlacer | null = null;
  /** Fragment element each atom ends up in. */
  private fragOfAtom = new Map<number, Element>();
  /** Each table as written this time (its table, or the group holding its parts). */
  private tableEls = new Map<number, Element>();
  /** The element written for each bond. */
  private bondEls = new Map<number, Element>();
  /** Neighbours of each atom as read from the file. */
  private origNeighbors = new Map<number, Set<number>>();
  /** Atoms found unchanged since the file was read (see untouched). */
  private untouchedAtoms = new Map<number, boolean>();
  private changed = false;
  /** Fused ring fills that cast one shadow (worked out when the first ring fill is saved). */
  private ringShadows?: Map<number, Shape[]>;
  /** Older copies of arrows that ChemDraw keeps for old versions, by the arrow they belong to. */
  private legacy: Map<string, Element[]> | null = null;

  constructor(private doc: Doc, private opts: WriteOptions) {
    this.measure = opts.measure ?? arialWidth;
  }

  write(): string {
    const doc = this.doc;
    const src = doc.source;
    if (src) this.openSource();
    else this.newDocument();
    let maxId = src?.maxId ?? 0;
    for (const m of [doc.atoms, doc.bonds, doc.captions, doc.arrows, doc.shapes] as Map<number, Entity>[]) for (const id of m.keys()) if (id > maxId) maxId = id;
    this.nextId = maxId + 1;

    if (src) {
      for (const b of src.orig.values()) {
        if (!('a1' in b)) continue;
        const bond = b as Bond;
        for (const [p, q] of [[bond.a1, bond.a2], [bond.a2, bond.a1]]) {
          let s = this.origNeighbors.get(p);
          if (!s) this.origNeighbors.set(p, (s = new Set()));
          s.add(q);
        }
      }
      this.removeDeleted();
    }
    this.writeStructures();
    this.writeCrossings();
    for (const c of doc.captions.values()) this.writeCaption(c);
    for (const r of doc.arrows.values()) this.writeArrow(r);
    for (const s of doc.shapes.values()) this.writeShape(s);
    this.writeRingCircles();
    this.raiseSymbols();
    this.writeRepeatGroups();
    if (!src) this.writeKept();
    this.writeSteps();
    this.writeGroups();
    this.writePieces();
    if (this.writeStack()) this.changed = true;
    this.raiseTableFigures();
    if (src) this.cleanUp();

    // the file name stored inside; an untouched file is not rewritten just for a rename
    if (this.opts.name !== undefined && (this.changed || !src) && this.root.getAttribute('Name') !== this.opts.name) {
      this.root.setAttribute('Name', this.opts.name);
      this.changed = true;
    }
    const b = doc.bounds();
    // a page set here (File > Page Setup), or grown to hold the drawing, is written to the file's page
    if (src && doc.page && !(this.unchangedSinceRead() && this.samePageAsRead(src)) && this.pageNeeds(b)) this.changed = true;
    // the guides and the arrow-text style, kept for this program in tags ChemDraw passes over (guides are never drawn, exported or printed)
    if (this.writeGuides()) this.changed = true;
    if (src && !this.changed) return src.text;
    if (b) this.root.setAttribute('BoundingBox', box(b));
    if (!src || doc.page) this.sizePage(b);
    // characters XML 1.0 can't hold (from text pasted out of Word or a PDF) would make the file
    // unreadable: Word's line break (U+000B) becomes a line break, half an emoji U+FFFD, and the rest are dropped
    // (our page and step tags on objects ChemDraw keeps them on)
    lowerOwnTags(this.root);
    encodeTags(this.root);
    const out = wellFormed(new XMLSerializer().serializeToString(this.root).replace(/\u000B/g, '\n').replace(/[\u0000-\u0008\u000C\u000E-\u001F\uFFFE\uFFFF]/g, ''));
    return this.prolog + out + '\n';
  }

  // ------------------------------------------------------------------ document set-up

  private openSource(): void {
    const src = this.doc.source!, text = src.text;
    const start = text.search(/<CDXML[\s>]/);
    this.prolog = start > 0 ? text.slice(0, start) : NEW_PROLOG;
    // (the reader's copy holds our tags' values as they are; one parsed here gets the same)
    if (!src.xml) { src.xml = new DOMParser().parseFromString(withoutDoctype(text), 'application/xml'); decodeTags(src.xml.documentElement); hoistOwnTags(src.xml.documentElement); }
    this.x = src.xml.cloneNode(true) as XMLDocument;
    this.root = this.x.documentElement;
    this.all = descendants(this.root);
    this.page = this.child(this.root, 'page') ?? this.root.appendChild(this.el('page', { id: this.id() }));
    this.colortable = this.child(this.root, 'colortable') ?? this.root.insertBefore(this.x.createElement('colortable'), this.root.firstChild);
    for (const c of kids(this.colortable)) this.colors.push(rgbHex(c));
    this.fonttable = this.child(this.root, 'fonttable') ?? this.root.insertBefore(this.x.createElement('fonttable'), this.colortable.nextSibling);
    for (const f of kids(this.fonttable)) {
      const name = (f.getAttribute('name') ?? '').toLowerCase();
      if (!this.fontIds.has(name)) this.fontIds.set(name, f.getAttribute('id') ?? '');
    }
  }

  private newDocument(): void {
    this.x = new DOMParser().parseFromString('<CDXML/>', 'application/xml');
    this.root = this.x.documentElement;
    const st = this.doc.style;
    const attrs: Record<string, string> = {
      CreationProgram: 'Chem Illustrator',
      Name: this.opts.name ?? '',
      LabelFont: '3', LabelSize: String(st.labelSize), LabelFace: String((st.labelFace ?? 0) | 96),
      CaptionFont: '3', CaptionSize: String(st.captionSize), CaptionFace: String(st.captionFace),
      HashSpacing: f2(st.hashSpacing), MarginWidth: f2(st.marginWidth), LineWidth: f2(st.lineWidth),
      BoldWidth: f2(st.boldWidth), BondLength: f2(st.bondLength), BondSpacing: String(st.bondSpacing),
      ChainAngle: String(st.chainAngle), LabelJustification: 'Auto', CaptionJustification: 'Left',
      color: '0', bgcolor: '1',
    };
    for (const [k, v] of Object.entries(attrs)) this.root.setAttribute(k, v);
    this.colortable = this.root.appendChild(this.x.createElement('colortable'));
    this.colorIndex('#ffffff', true);
    this.colorIndex('#000000', true);
    this.fonttable = this.root.appendChild(this.x.createElement('fonttable'));
    this.fonttable.appendChild(this.el('font', { id: '3', charset: 'iso-8859-1', name: 'Arial' }));
    this.fontIds.set('arial', '3');
    this.root.setAttribute('LabelFont', this.fontId(st.labelFont || 'Arial'));
    this.root.setAttribute('CaptionFont', this.fontId(st.captionFont || 'Arial'));
    this.page = this.root.appendChild(this.el('page', { id: '' }));
    if (this.doc.background !== '#ffffff') this.root.setAttribute('bgcolor', String(this.colorIndex(this.doc.background, true)));
    this.changed = true;
  }

  /**
   * The page's attributes for the drawing's page (ChemDraw's US Letter page is 540 × 720 pt): its
   * page grid, which grows to hold the drawing (page-grid.ts).
   */
  private pageAttrs(b: Rect | null): Record<string, string> {
    const p = this.doc.page;
    const W = p?.w ?? 540, H = p?.h ?? 720;
    if (p?.poster) {
      // ChemDraw's poster: one sheet of its own size (Width, Height); WidthPages and HeightPages only
      // say how many sheets of paper it prints on (the file's own, else US Letter's)
      const own = (k: string) => Number(this.page.getAttribute(k)) || 0;
      return {
        BoundingBox: `0 0 ${f2(W)} ${f2(H)}`, Width: f2(W), Height: f2(H), DrawingSpace: 'poster', HeaderPosition: '36', FooterPosition: '36',
        WidthPages: String(own('WidthPages') || Math.max(1, Math.ceil(W / 540))), HeightPages: String(own('HeightPages') || Math.max(1, Math.ceil(H / 720))),
      };
    }
    let wp: number, hp: number;
    if (p) ({ across: wp, down: hp } = pageCount(pageExtent(p, b)));
    else { wp = Math.ceil(((b?.x2 ?? 0) + 36) / W); hp = Math.ceil(((b?.y2 ?? 0) + 36) / H); }
    wp = Math.max(1, wp); hp = Math.max(1, hp);
    return { BoundingBox: `0 0 ${f2(W * wp)} ${f2(H * hp)}`, HeaderPosition: '36', FooterPosition: '36', PrintTrimMarks: 'yes', HeightPages: String(hp), WidthPages: String(wp) };
  }

  /** The guides' tag on the page, matching the drawing's guides; true when it had to change. */
  private writeGuides(): boolean {
    const st = this.doc.style;
    // the drawing style's text over arrows and arrow sizes (ChemDraw's style has no place for them)
    const own = { size: st.arrowTextSize, font: st.arrowTextFont, width: st.arrowWidth, head: st.arrowHeadLength, headWidth: st.arrowHeadWidth, scheme: st.scheme };
    const arrow = Object.values(own).some((v) => v !== undefined && v !== '') ? JSON.stringify(own) : null;
    const a = this.pageTag(GUIDES_TAG, guidesText(this.doc.guides));
    const b = this.pageTag(ARROW_TEXT_TAG, arrow);
    const c = this.pageTag(MAP_LOOK_TAG, mapLookText(this.doc));
    return a || b || c;
  }

  /** One of this program's tags on the page, set to `want` (or taken away); true when it changed. */
  private pageTag(name: string, want: string | null): boolean {
    const old = kids(this.page).find((c) => c.nodeName === 'objecttag' && c.getAttribute('Name') === name) ?? null;
    if ((old?.getAttribute('Value') ?? null) === want) return false;
    if (old) this.page.removeChild(old);
    if (want) this.page.appendChild(this.el('objecttag', { TagType: 'String', Name: name, Value: want, Visible: 'no' }));
    return true;
  }

  /** The page grid's fixed edges and whether it grows, kept for this program (ChemDraw takes no notice). */
  private pageGridTag(): Element | null {
    return kids(this.page).find((c) => c.nodeName === 'objecttag' && c.getAttribute('Name') === PAGE_TAG) ?? null;
  }

  /** Whether the file's page differs from the drawing's: another paper size, or the drawing has gone past it. */
  private pageNeeds(b: Rect | null): boolean {
    const p = this.doc.page;
    if (!p) return false;
    const bb = (this.page.getAttribute('BoundingBox') ?? '').trim().split(/\s+/).map(Number);
    if (bb.length !== 4 || !bb.every(isFinite)) return true;
    // a poster (or a page that was one): its own size, three ways
    const poster = this.page.getAttribute('DrawingSpace') === 'poster';
    if (!!p.poster !== poster) return true;
    if (p.poster) {
      const near = (k: string, v: number) => Math.abs(Number(this.page.getAttribute(k)) - v) <= 0.5;
      // (a poster never grows: the page grid's tag is not needed to say so)
      return !(near('Width', p.w) && near('Height', p.h) && Math.abs(bb[2] - bb[0] - p.w) <= 0.5 && Math.abs(bb[3] - bb[1] - p.h) <= 0.5);
    }
    const wp = Math.max(1, Number(this.page.getAttribute('WidthPages')) || 1), hp = Math.max(1, Number(this.page.getAttribute('HeightPages')) || 1);
    if (Math.abs((bb[2] - bb[0]) / wp - p.w) > 0.5 || Math.abs((bb[3] - bb[1]) / hp - p.h) > 0.5) return true;
    const want = this.pageAttrs(b);
    if (want.WidthPages !== String(wp) || want.HeightPages !== String(hp)) return true;
    return (this.pageGridTag()?.getAttribute('Value') ?? null) !== pageTag(p);
  }

  /** The page is as the file had it (ChemDraw lets a drawing run past its pages; that alone is no change). */
  private samePageAsRead(src: CdxmlSource): boolean {
    return JSON.stringify(this.doc.page ?? null) === src.page;
  }

  /** Size the page to the drawing's page, grown to hold the drawing. */
  private sizePage(b: Rect | null): void {
    // (the page as the file had it, before it is sized here)
    const bb = (this.page.getAttribute('BoundingBox') ?? '').trim().split(/\s+/).map(Number);
    const wp = Math.max(1, Number(this.page.getAttribute('WidthPages')) || 1), hp = Math.max(1, Number(this.page.getAttribute('HeightPages')) || 1);
    const was = this.doc.source && bb.length === 4 && bb.every(isFinite) ? { w: (bb[2] - bb[0]) / wp, h: (bb[3] - bb[1]) / hp } : null;
    if (!this.page.getAttribute('id')) this.page.setAttribute('id', this.id());
    for (const [k, v] of Object.entries(this.pageAttrs(b))) this.page.setAttribute(k, v);
    // (no longer a poster: paper pages)
    if (!this.doc.page?.poster) for (const k of ['DrawingSpace', 'Width', 'Height']) this.page.removeAttribute(k);
    const old = this.pageGridTag(), tag = this.doc.page && pageTag(this.doc.page);
    if (old && old.getAttribute('Value') !== tag) this.page.removeChild(old);
    if (tag && old?.getAttribute('Value') !== tag) this.page.insertBefore(this.el('objecttag', { TagType: 'String', Name: PAGE_TAG, Value: tag, Visible: 'no' }), this.page.firstChild);
    this.writePaper(was);
  }

  /**
   * The paper as ChemDraw takes it (its print record), with half-inch margins round the page, unless
   * the file's own record already gives this page.
   */
  private writePaper(was: { w: number; h: number } | null): void {
    const p = this.doc.page;
    if (!p) return;
    // a poster prints on sheets of paper: the file's own print record, else US Letter's
    if (p.poster) {
      if (!this.root.hasAttribute('MacPrintInfo')) { this.root.setAttribute('MacPrintInfo', macPrintInfo(612, 792, false)); this.root.setAttribute('PrintMargins', '36 36 36 36'); }
      return;
    }
    const paper = paperOf(this.root.getAttribute('MacPrintInfo'));
    // the file's own print settings stay while its page is the size it was (a scaled page setup
    // has margins and a print record that don't add up to the page, and they are the user's)
    if (was && Math.abs(was.w - p.w) < 0.5 && Math.abs(was.h - p.h) < 0.5 && this.root.hasAttribute('MacPrintInfo')) return;
    const m = (this.root.getAttribute('PrintMargins') ?? '').trim().split(/\s+/).map(Number);
    if (paper && m.length === 4 && m.every(isFinite) && Math.abs(paper.w - m[0] - m[2] - p.w) < 1 && Math.abs(paper.h - m[1] - m[3] - p.h) < 1) return;
    // a named paper at its true size (A4 is not a whole number of points), turned to the page
    const sheet = p.name ? SHEETS[p.name] : undefined;
    const [w, h] = sheet ? (p.w > p.h ? [sheet.h, sheet.w] : [sheet.w, sheet.h]) : [p.w + 72, p.h + 72];
    this.root.setAttribute('MacPrintInfo', macPrintInfo(w, h, p.name === 'a4'));
    this.root.setAttribute('PrintMargins', '36 36 36 36');
  }

  // ------------------------------------------------------------------ small helpers

  private id(): string {
    return String(this.nextId++);
  }

  private el(name: string, attrs: Record<string, string | number | null | undefined> = {}): Element {
    const e = this.x.createElement(name);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== '') e.setAttribute(k, String(v));
    return e;
  }

  private child(e: Element, name: string): Element | null {
    for (const c of kids(e)) if (c.nodeName === name) return c;
    return null;
  }

  private set(e: Element, name: string, v: string | number | null | undefined): void {
    if (v === null || v === undefined || v === '') e.removeAttribute(name);
    else e.setAttribute(name, String(v));
  }

  /** Index in the file's colour list (0 black, 1 white, then the colour table). */
  private colorIndex(hex: string, forceTable = false): number {
    const h = hex.toLowerCase();
    if (!forceTable) {
      if (h === '#000000') return 0;
      if (h === '#ffffff') return 1;
    }
    const i = this.colors.indexOf(h, 2);
    if (i >= 2) return i;
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
    this.colortable.appendChild(this.el('color', { r: r.toFixed(4), g: g.toFixed(4), b: b.toFixed(4) }));
    this.colors.push(h);
    return this.colors.length - 1;
  }

  private colorAttr(hex: string | undefined): string | null {
    return hex && hex.toLowerCase() !== '#000000' ? String(this.colorIndex(hex)) : null;
  }

  private fontId(name = 'Arial'): string {
    const key = name.toLowerCase();
    let id = this.fontIds.get(key);
    if (id) return id;
    let max = 2;
    for (const v of this.fontIds.values()) max = Math.max(max, Number(v) || 0);
    id = String(max + 1);
    this.fonttable.appendChild(this.el('font', { id, charset: isSymbolFont(name) ? 'Unknown' : 'iso-8859-1', name }));
    this.fontIds.set(key, id);
    return id;
  }

  /** The element an entity was read from, if it is still in the file. */
  private source(kind: Kind, id: number, names: string[]): Element | null {
    const o = this.doc.source?.ord.get(kind + id);
    if (o === undefined) return null;
    const e = this.all[o];
    return e && names.includes(e.nodeName) ? e : null;
  }

  /** Puts `to` in the place of the element an entity was read from, and finds it as that entity's from now on. */
  private replaceSource(kind: Kind, id: number, from: Element, to: Element): void {
    from.parentNode?.replaceChild(to, from);
    const o = this.doc.source?.ord.get(kind + id);
    if (o !== undefined && this.all[o] === from) this.all[o] = to;
  }

  /**
   * Nothing drawn has changed since the file was read: every entity is still the one read, and
   * none has gone. What ChemDraw said then (its layers, its crossing lists, its page) still holds,
   * even where this program would work out something else.
   */
  private unchangedSinceRead(): boolean {
    const src = this.doc.source;
    if (!src?.loaded) return false;
    let n = 0;
    for (const m of [this.doc.atoms, this.doc.bonds, this.doc.captions, this.doc.arrows, this.doc.shapes] as Map<number, Entity>[]) {
      for (const e of m.values()) { if (!src.loaded.has(e)) return false; n++; }
    }
    return n === src.orig.size;
  }

  private orig<T extends Entity>(kind: Kind, id: number): T | null {
    return (this.doc.source?.orig.get(kind + id) as T) ?? null;
  }

  private nodeId(atomId: number): string {
    return this.source('a', atomId, ['n'])?.getAttribute('id') ?? String(atomId);
  }

  // ------------------------------------------------------------------ deletions

  private removeDeleted(): void {
    const doc = this.doc;
    const maps: Record<Kind, Map<number, Entity>> = { a: doc.atoms, b: doc.bonds, c: doc.captions, r: doc.arrows, s: doc.shapes, y: new Map() };
    for (const [key, o] of doc.source!.ord) {
      const kind = key[0] as Kind;
      if (maps[kind].has(Number(key.slice(1)))) continue;
      const e = this.all[o];
      if (!e?.parentNode) continue;
      if (kind === 'r') this.removeLegacyArrow(e);
      e.parentNode.removeChild(e);
      this.changed = true;
    }
  }

  /**
   * ChemDraw keeps an older copy of each arrow (a line or arc graphic) for old versions, and
   * reaction schemes refer to that copy, so it is kept in step with the arrow.
   */
  private legacyOf(arrow: Element): Element[] {
    const id = arrow.getAttribute('id');
    if (!id) return [];
    if (!this.legacy) {
      this.legacy = new Map();
      for (const g of this.all) {
        const by = g.nodeName === 'graphic' ? g.getAttribute('SupersededBy') : null;
        if (by) this.legacy.set(by, [...(this.legacy.get(by) ?? []), g]);
      }
    }
    return this.legacy.get(id) ?? [];
  }

  private removeLegacyArrow(arrow: Element): void {
    for (const g of this.legacyOf(arrow)) g.parentNode?.removeChild(g);
  }

  /** Lines are stored head then tail; arcs head then centre. */
  private updateLegacyArrow(arrow: Element, r: Arrow): void {
    for (const g of this.legacyOf(arrow)) {
      if (g.getAttribute('GraphicType') === 'Arc') {
        if (r.sweep) g.setAttribute('BoundingBox', `${pt(r.head)} ${pt(arcCenter(r.tail, r.head, r.sweep).center)}`);
      } else g.setAttribute('BoundingBox', `${pt(r.head)} ${pt(r.tail)}`);
    }
  }

  // ------------------------------------------------------------------ structures

  private writeStructures(): void {
    const doc = this.doc;
    const comps = doc.fragments().sort((a, b) => b.size - a.size);
    const claimed = new Set<Element>();
    for (const comp of comps) {
      // Reuse the file's fragment that holds most of this structure; split-off parts get new ones.
      const counts = new Map<Element, number>();
      for (const id of comp) {
        const f = this.source('a', id, ['n'])?.parentElement;
        if (f && f.nodeName === 'fragment') counts.set(f, (counts.get(f) ?? 0) + 1);
      }
      let target: Element | null = null, best = 0, near: Element | null = null;
      // a piece that was already apart from the rest of its fragment in the file (ChemDraw keeps
      // separate pieces, even a lone atom, in one fragment) stays in that fragment, leaving it free
      // for a piece split off here
      const apart = counts.size === 1 && this.wasApart(comp);
      for (const [f, n] of counts) {
        near = near ?? f;
        if (apart) target = f;
        else if (!claimed.has(f) && n > best) { target = f; best = n; }
      }
      if (!target) {
        target = this.el('fragment', { id: this.id() });
        if (near?.parentNode) near.parentNode.insertBefore(target, near.nextSibling);
        else this.page.appendChild(target);
        this.changed = true;
      }
      if (!apart) claimed.add(target);
      for (const id of comp) this.fragOfAtom.set(id, target);
    }
    const touched = new Set<Element>();
    for (const a of doc.atoms.values()) if (this.writeAtom(a)) touched.add(this.fragOfAtom.get(a.id)!);
    for (const b of doc.bonds.values()) if (this.writeBond(b)) touched.add(this.fragOfAtom.get(b.a1)!);
    for (const f of touched) this.fitFragment(f);
  }

  /** True when every atom of a structure was read from the file with the same neighbours it has, none outside it. */
  private wasApart(comp: Set<number>): boolean {
    for (const id of comp) {
      if (!this.orig<Atom>('a', id)) return false;
      const was = this.origNeighbors.get(id) ?? new Set<number>();
      const now = this.doc.neighbors(id).map((n) => n.id);
      if (now.length !== was.size || now.some((n) => !was.has(n))) return false;
    }
    return true;
  }

  private neighborsMovedApart(a: Atom): boolean {
    const o = this.orig<Atom>('a', a.id)!;
    const dx = a.x - o.x, dy = a.y - o.y;
    for (const n of this.doc.neighbors(a.id)) {
      const on = this.orig<Atom>('a', n.id);
      if (!on || Math.abs(n.x - on.x - dx) > 1e-6 || Math.abs(n.y - on.y - dy) > 1e-6) return true;
    }
    return false;
  }

  /**
   * An atom that is as it was read, with the same bonds to the same atoms, none of them changed
   * either: its element needs nothing (most of a big drawing, when saved after a small edit).
   */
  private untouched(a: Atom): boolean {
    let u = this.untouchedAtoms.get(a.id);
    if (u !== undefined) return u;
    const loaded = this.doc.source?.loaded;
    const adj = this.doc.adj.get(a.id) ?? [];
    u = !!loaded?.has(a) && adj.length === (this.origNeighbors.get(a.id)?.size ?? 0);
    for (let i = 0; u && i < adj.length; i++) {
      const b = this.doc.bonds.get(adj[i])!;
      u = loaded!.has(b) && loaded!.has(this.doc.atoms.get(b.a1 === a.id ? b.a2 : b.a1)!);
    }
    this.untouchedAtoms.set(a.id, u);
    return u;
  }

  private connectivityChanged(a: Atom): boolean {
    const was = this.origNeighbors.get(a.id) ?? new Set<number>();
    const now = this.doc.neighbors(a.id);
    if (now.length !== was.size) return true;
    for (const n of now) if (!was.has(n.id)) return true;
    for (const bid of this.doc.adj.get(a.id) ?? []) {
      const ob = this.orig<Bond>('b', bid);
      // a bond that is new, or of another order, changes the hydrogens the label shows
      if (!ob || ob.order !== this.doc.bonds.get(bid)?.order) return true;
    }
    return false;
  }

  /** Returns true when the atom's element was written or changed. */
  private writeAtom(a: Atom): boolean {
    const target = this.fragOfAtom.get(a.id)!;
    const e = this.source('a', a.id, ['n']);
    const o = this.orig<Atom>('a', a.id);
    if (!e || !o) {
      const n = this.buildNode(a);
      target.insertBefore(n, this.child(target, 'b') ?? this.child(target, 'graphic'));
      this.changed = true;
      return true;
    }
    let wrote = false;
    if (e.parentElement !== target) {
      target.insertBefore(e, this.child(target, 'b'));
      wrote = true;
    }
    if (this.untouched(a) && !a.showStereo && !a.stereoLabel) {
      if (wrote) this.changed = true;
      return wrote;
    }
    const conn = this.connectivityChanged(a);
    const others = !sameExcept(a, o, ['x', 'y']);
    if (!others && !conn && !this.neighborsMovedApart(a)) {
      if (a.x !== o.x || a.y !== o.y) { shift(e, a.x - o.x, a.y - o.y); wrote = true; }
      // the label of an atom that didn't change can still change with its neighbours
      if (!a.attach && !a.multi && this.atomStereo(e, a, false)) wrote = true;
    } else {
      this.patchNode(e, a, o);
      wrote = true;
    }
    if (wrote) this.changed = true;
    return wrote;
  }

  private writeBond(b: Bond): boolean {
    const target = this.fragOfAtom.get(b.a1)!;
    const e = this.source('b', b.id, ['b']);
    const o = this.orig<Bond>('b', b.id);
    if (!e || !o) {
      const n = this.buildBond(b);
      this.bondEls.set(b.id, n);
      target.appendChild(n);
      this.changed = true;
      return true;
    }
    this.bondEls.set(b.id, e);
    let wrote = false;
    if (e.parentElement !== target) { target.appendChild(e); wrote = true; }
    if (this.doc.source?.loaded?.has(b) && !b.showStereo && !b.stereoLabel && this.untouched(this.doc.atoms.get(b.a1)!) && this.untouched(this.doc.atoms.get(b.a2)!)) {
      if (wrote) this.changed = true;
      return wrote;
    }
    if (!sameExcept(b, o, [])) {
      this.patchBond(e, b, o);
      wrote = true;
    } else {
      const p = this.doc.atoms.get(b.a1)!, q = this.doc.atoms.get(b.a2)!;
      if ((this.connectivityChanged(p) || this.connectivityChanged(q)) && e.hasAttribute('BondCircularOrdering')) {
        e.removeAttribute('BondCircularOrdering');
        wrote = true;
      }
      if (this.bondStereo(e, b, false)) wrote = true;
      // (a label retyped: the character the bond met may be gone)
      if (this.bondAttach(e, b, e.getAttribute('B'))) wrote = true;
    }
    if (wrote) this.changed = true;
    return wrote;
  }

  /** Keep a fragment's box around its atoms after edits. */
  private fitFragment(f: Element): void {
    if (!f.parentNode) return;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of kids(f)) {
      if (n.nodeName !== 'n') continue;
      const [x, y] = nums(n.getAttribute('p'));
      const t = this.child(n, 't');
      const bb = t ? nums(t.getAttribute('BoundingBox')) : [];
      const pts = bb.length === 4 ? [[x, y], [bb[0], bb[1]], [bb[2], bb[3]]] : [[x, y]];
      for (const [px, py] of pts) { x1 = Math.min(x1, px); y1 = Math.min(y1, py); x2 = Math.max(x2, px); y2 = Math.max(y2, py); }
    }
    if (x1 === Infinity) return; // no atoms left; cleanUp drops it unless it still holds a symbol
    f.setAttribute('BoundingBox', box({ x1, y1, x2, y2 }));
  }

  private buildNode(a: Atom): Element {
    if (a.multi) {
      const n = this.el('n', { id: a.id, p: pt(a), NodeType: a.variable ? 'VariableAttachment' : 'MultiAttachment', Attachments: this.attachments(a) });
      this.kekuleTag(n, a);
      this.ringTag(n, a);
      return n;
    }
    if (a.attach) return this.el('n', { id: a.id, p: pt(a), NodeType: 'ExternalConnectionPoint', ExternalConnectionType: a.attach === 'Unspecified' ? null : a.attach, ExternalConnectionNum: a.attachNum ?? null, color: this.colorAttr(a.color) });
    const n = this.el('n', { id: a.id, p: pt(a) });
    this.nodeCore(n, a);
    this.nodeLabel(n, a, true);
    this.atomStereo(n, a, true);
    this.atomNumber(n, a);
    this.atomGroup(n, a);
    this.atomEnhanced(n, a);
    return n;
  }

  /** Enhanced stereo: ChemDraw's EnhancedStereoType and group number, and a tag with the label as shown (abs, &1, or1). */
  private atomEnhanced(n: Element, a: Atom): void {
    const e = a.enhStereo;
    this.set(n, 'EnhancedStereoType', e ? (e.type === 'abs' ? 'Absolute' : e.type === 'and' ? 'And' : 'Or') : null);
    this.set(n, 'EnhancedStereoGroupNum', e && e.type !== 'abs' ? e.group ?? 1 : null);
    const old = kids(n).find((c) => c.nodeName === 'objecttag' && c.getAttribute('Name') === 'enhancedstereo');
    if (old) n.removeChild(old);
    if (!e) return;
    const text = enhancedText(e);
    const p = this.placer.enhanced(a, text);
    const tag = this.el('objecttag', { TagType: 'Unknown', Name: 'enhancedstereo' });
    const t = this.el('t', { p: pt(p), BoundingBox: box({ x1: p.x, y1: p.y - CAP * p.size, x2: p.x + this.measure(text, p.size), y2: p.y }), CaptionLineHeight: 'variable' });
    const sp = this.el('s', { font: this.fontId(), size: f2(p.size).replace(/\.00$/, ''), color: '0' });
    sp.textContent = text;
    t.appendChild(sp);
    tag.appendChild(t);
    n.appendChild(tag);
  }

  private get placer(): StereoPlacer {
    return (this.placerMade ??= new StereoPlacer(this.doc, this.measure));
  }

  /** The atom number (the ' key): ChemDraw's AtomNumber, ShowAtomNumber and a tag with the text. */
  private atomNumber(n: Element, a: Atom): void {
    this.set(n, 'ShowAtomNumber', a.showNumber ? 'yes' : null);
    this.set(n, 'AtomNumber', a.atomNumber ?? null);
    const old = kids(n).find((c) => c.nodeName === 'objecttag' && c.getAttribute('Name') === 'number');
    if (old) n.removeChild(old);
    if (!a.showNumber || !a.atomNumber) return;
    const p = this.placer.number(a);
    const tag = this.el('objecttag', { TagType: 'Unknown', Name: 'number' });
    const t = this.el('t', { p: pt(p), BoundingBox: box({ x1: p.x, y1: p.y - CAP * p.size, x2: p.x + this.measure(a.atomNumber, p.size), y2: p.y }), CaptionLineHeight: 'variable' });
    // in the atom's colour, or the number's own, bold or italic as it was
    const nl = a.numberLabel;
    const s = this.el('s', { font: this.fontId(), size: f2(p.size).replace(/\.00$/, ''), color: this.colorAttr(nl?.color ?? a.color) ?? '0', face: nl?.face || null });
    s.textContent = a.atomNumber;
    t.appendChild(s);
    tag.appendChild(t);
    n.appendChild(tag);
  }

  /** A multicentre point's atoms, as the ids their nodes have in the file. */
  /** A multicentre point's π-system shown in Kekulé form, kept for this program (ChemDraw draws the bonds as they are anyway). */
  private kekuleTag(n: Element, a: Atom): void {
    const old = kids(n).find((c) => c.nodeName === 'objecttag' && c.getAttribute('Name') === KEKULE_TAG);
    if (old && !a.kekule) n.removeChild(old);
    if (!old && a.kekule) n.appendChild(this.el('objecttag', { TagType: 'String', Name: KEKULE_TAG, Value: 'yes', Visible: 'no' }));
  }

  /**
   * A variable attachment's ring, whose middle it sits at (ChemDraw has no place for it): the ring's
   * nodes, with the Attachments written beside it, so a list changed in ChemDraw wins over the tag.
   */
  private ringTag(n: Element, a: Atom): void {
    for (const c of kids(n)) if (c.nodeName === 'objecttag' && c.getAttribute('Name') === RING_TAG) n.removeChild(c);
    const ring = a.variable ? (a.ringOf ?? []).filter((id) => this.doc.atoms.has(id)) : [];
    if (!ring.length) return;
    const v = { ring: ring.map((id) => this.nodeId(id)), seen: { attachments: this.attachments(a) } };
    n.appendChild(this.el('objecttag', { TagType: 'String', Name: RING_TAG, Value: JSON.stringify(v), Visible: 'no' }));
  }

  private attachments(a: Atom): string {
    return (a.multi ?? []).filter((id) => this.doc.atoms.has(id)).map((id) => this.nodeId(id)).join(' ');
  }

  private patchNode(n: Element, a: Atom, o: Atom): void {
    const dx = a.x - o.x, dy = a.y - o.y;
    n.setAttribute('p', pt(a));
    if (a.multi) {
      this.set(n, 'NodeType', a.variable ? 'VariableAttachment' : 'MultiAttachment');
      this.set(n, 'Attachments', this.attachments(a));
      this.kekuleTag(n, a);
      this.ringTag(n, a);
      return;
    }
    if (a.attach) {
      this.set(n, 'NodeType', 'ExternalConnectionPoint');
      this.set(n, 'ExternalConnectionType', a.attach === 'Unspecified' ? null : a.attach);
      this.set(n, 'ExternalConnectionNum', a.attachNum ?? null);
      this.set(n, 'color', this.colorAttr(a.color));
      // an atom turned into a point of attachment loses its label and element
      for (const c of kids(n)) if (c.nodeName === 't' || c.nodeName === 'fragment' || c.nodeName === 'objecttag') n.removeChild(c);
      for (const k of ['Element', 'NumHydrogens', 'NeedsClean', 'GenericNickname', 'Charge', 'Isotope', 'ShowAtomNumber', 'AtomNumber']) n.removeAttribute(k);
      return;
    }
    if (o.attach) for (const k of ['NodeType', 'ExternalConnectionType', 'ExternalConnectionNum']) n.removeAttribute(k);
    this.patchNodeBody(n, a, o, dx, dy);
    this.atomNumber(n, a);
    this.atomGroup(n, a);
    this.atomEnhanced(n, a);
  }

  /** A contracted label keeps the SMILES of its group in a hidden tag (ChemDraw sees the inner fragment). */
  private atomGroup(n: Element, a: Atom): void {
    for (const c of kids(n)) if (c.nodeName === 'objecttag' && (c.getAttribute('Name') === GROUP_TAG || c.getAttribute('Name') === ALT_TAG || c.getAttribute('Name') === MAP_TAG)) n.removeChild(c);
    // (with the label it belongs to: a label retyped in ChemDraw no longer takes this group)
    if (a.group && a.label) n.appendChild(this.el('objecttag', { TagType: 'String', Name: GROUP_TAG, Value: JSON.stringify({ label: a.label, smiles: a.group }), Visible: 'no' }));
    if (a.alt) n.appendChild(this.el('objecttag', { TagType: 'String', Name: ALT_TAG, Value: a.alt, Visible: 'no' }));
    if (a.mapNo) n.appendChild(this.el('objecttag', { TagType: 'String', Name: MAP_TAG, Value: String(a.mapNo), Visible: 'no' }));
    this.highlightTag(n, a.highlight, a.hl);
  }

  /**
   * A highlight: ChemDraw's own highlightColor, which it draws as a disc behind the atom or bond,
   * and the colour and look in hidden tags, which say how it is drawn here (CDX has no tag for
   * highlightColor that we know of, so through CDX only the hidden tags carry it).
   */
  private highlightTag(e: Element, colour: string | undefined, look: HighlightStyle | undefined): void {
    this.set(e, 'highlightColor', colour && /^#[0-9a-f]{6}$/i.test(colour) ? String(this.colorIndex(colour)) : null);
    for (const c of kids(e)) if (c.nodeName === 'objecttag' && (c.getAttribute('Name') === HIGHLIGHT_TAG || c.getAttribute('Name') === HIGHLIGHT_LOOK_TAG)) e.removeChild(c);
    if (colour) e.appendChild(this.el('objecttag', { TagType: 'String', Name: HIGHLIGHT_TAG, Value: colour, Visible: 'no' }));
    if (colour && look && Object.keys(look).length) e.appendChild(this.el('objecttag', { TagType: 'String', Name: HIGHLIGHT_LOOK_TAG, Value: JSON.stringify(look), Visible: 'no' }));
  }

  private patchNodeBody(n: Element, a: Atom, o: Atom, dx: number, dy: number): void {
    for (const c of kids(n)) if (c.nodeName !== 't' && c.nodeName !== 'fragment') shift(c, dx, dy);
    this.nodeCore(n, a);
    this.atomStereo(n, a, true);
    const sameLabel = a.label === o.label && a.z === o.z && a.charge === o.charge && a.isotope === o.isotope && !!a.hideCharge === !!o.hideCharge;
    // (a label given another font, size or bold here is written again in it)
    const sameLook = (a.font || '') === (o.font || '') && (a.s ?? 1) === (o.s ?? 1) && (a.face ?? -1) === (o.face ?? -1);
    const t = this.child(n, 't');
    if (!sameLook && sameLabel && t) {
      this.nodeLabel(n, a, a.label === null);
      return;
    }
    if (sameLabel && a.label !== null) {
      // A text label (abbreviation, R group…) keeps its text, styling and structure; only its placement changes.
      const inner = this.child(n, 'fragment');
      if (inner) shift(inner, dx, dy);
      if (t) this.placeLabel(t, a);
      return;
    }
    if (sameLabel && t && t.textContent === this.autoText(a).text) {
      // An element label whose hydrogens did not change keeps ChemDraw's text and styling.
      this.placeLabel(t, a);
      return;
    }
    this.nodeLabel(n, a, !sameLabel || a.label === null);
  }

  /** An atom's (R)/(S) label and descriptor. Returns true when the node changed. */
  private atomStereo(n: Element, a: Atom, patched: boolean): boolean {
    const info = this.doc.stereo;
    const text = atomStereoText(a, info);
    const place = text ? this.placer.atom(a, text) : null;
    // (a file's label that stands says its own descriptor)
    const desc = a.stereoLabel?.fromFile && a.stereoLabel.text === text ? undefined : info?.atom(a.id);
    return this.syncStereo(n, 'ShowAtomStereo', 'AS', !!a.showStereo, text, place, desc, patched, a.stereoLabel?.offset ? a : null);
  }

  private bondStereo(e: Element, b: Bond, patched: boolean): boolean {
    const info = this.doc.stereo;
    const text = bondStereoText(b, info);
    const place = text ? this.placer.bond(b, text) : null;
    const desc = b.stereoLabel?.fromFile && b.stereoLabel.text === text ? undefined : info?.bond(b.id);
    const ends = this.doc.atoms.get(b.a1), ende = this.doc.atoms.get(b.a2);
    const from = b.stereoLabel?.offset && ends && ende ? { x: (ends.x + ende.x) / 2, y: (ends.y + ende.y) / 2 } : null;
    return this.syncStereo(e, 'ShowBondStereo', 'BS', !!b.showStereo, text, place, desc, patched, from);
  }

  /**
   * Make a stereo label in the file say what the drawing shows: ChemDraw's tag holding the text
   * (at an absolute position), the "show" flag, and the descriptor (AS or BS). An untouched
   * element is left exactly as it was unless its label's text or place changed.
   */
  private syncStereo(e: Element, showAttr: string, descAttr: string, show: boolean, text: string | null, place: PlacedLabel | null, desc: string | null | undefined, patched: boolean, from: { x: number; y: number } | null = null): boolean {
    const old = kids(e).find((c) => c.nodeName === 'objecttag' && c.getAttribute('Name') === 'stereo') ?? null;
    let same = !old && !text;
    if (old && text && place) {
      const t = this.child(old, 't');
      const [x, y] = nums(t?.getAttribute('p') ?? null);
      same = (t?.textContent ?? '') === text && Math.abs(x - place.x) < 0.01 && Math.abs(y - place.y) < 0.01;
    }
    // ChemDraw shows a label only on atoms and bonds marked to show one
    show = show || !!text;
    const showNow = e.getAttribute(showAttr) === 'yes';
    if (same && !patched && showNow === show) return false;
    // not worked out (no chemistry engine): the descriptor the label states
    if (desc === undefined && text) desc = /^\(?([RSrsEZ])\)?$/.exec(text.trim())?.[1];
    if (!same) {
      if (old) e.removeChild(old);
      if (text && place) {
        // (ChemDraw moves a label it had as an offset unless this says so)
        const tag = this.el('objecttag', { TagType: 'Unknown', ...(from ? { PositioningType: 'offset', PositioningOffset: `${f2(place.x - from.x)} ${f2(place.y - from.y)}` } : {}), Name: 'stereo' });
        const t = this.el('t', { p: pt(place), BoundingBox: box({ x1: place.x, y1: place.y - CAP * place.size, x2: place.x + this.measure(text, place.size), y2: place.y + 0.2 * place.size }), CaptionLineHeight: 'variable' });
        const s = this.el('s', { font: this.fontId(), size: f2(place.size).replace(/\.00$/, ''), color: '0', face: place.italic ? 2 : 0 });
        s.textContent = text;
        t.appendChild(s);
        tag.appendChild(t);
        e.appendChild(tag);
      }
    }
    this.set(e, showAttr, show ? 'yes' : null);
    // the descriptor ChemDraw keeps; when we don't know it, ChemDraw works it out again
    if (patched || !same) this.set(e, descAttr, desc ?? null);
    return true;
  }

  /** The label an atom shows: none for a stray carbon from ChemDraw (Atom.bare), which ChemDraw draws as nothing. */
  private shownSpec(a: Atom): ReturnType<typeof labelSpec> {
    const doc = this.doc;
    if (a.bare && !a.label && doc.degree(a.id) === 0) return null;
    return labelSpec(a.z, a.label, a.charge, a.isotope, doc.valenceSum(a.id), doc.degree(a.id), !a.hideCharge, !!a.showCarbon);
  }

  /** Text of an atom's label as ChemDraw stores it ("OH", "NH3+", "OMe"), and its hydrogen count. */
  private autoText(a: Atom): { text: string; hCount: number } {
    const spec = this.shownSpec(a);
    if (!spec) return { text: '', hCount: 0 };
    const chargeText = !a.hideCharge && a.charge ? (Math.abs(a.charge) > 1 ? String(Math.abs(a.charge)) : '') + (a.charge > 0 ? '+' : '-') : '';
    if (a.label !== null) {
      // told to run left, ChemDraw draws the text as written: MeO, not OMe
      let label = a.label;
      // (only a formula turns: a name like (3,4)-MDP reads the same both ways round)
      if (!a.labelMarks && /^[A-Za-z0-9]+$/.test(a.label) && this.forcedDir(a) === 'left') {
        const size = this.doc.style.labelSize * (a.s ?? 1);
        const noCharge = { ...spec, ...labelLook(a), charge: 0 };
        const drawn = layoutLabel(noCharge, labelBonds(this.doc, a), size, this.measure, a.just).runs.map((r) => r.text).join('');
        if ([...drawn].sort().join('') === [...a.label].sort().join('')) label = drawn;
      }
      return { text: label + (chargeText && !/[+\-−]$/.test(a.label) ? chargeText : ''), hCount: 0 };
    }
    const sym = a.isotope === 2 && a.z === 1 ? 'D' : SYMBOLS[a.z] ?? '?';
    const h = spec.hCount ? 'H' + (spec.hCount > 1 ? spec.hCount : '') : '';
    // ChemDraw turns a label it lays out itself (OH reads HO where it runs left). One set to run a
    // way has LabelDisplay, and ChemDraw then draws the text as written.
    const left = !!h && this.forcedDir(a) === 'left';
    return { text: (left ? h + sym : sym + h) + chargeText, hCount: spec.hCount };
  }

  /**
   * Which way a label runs when ChemDraw has to be told: its file said so (ChemDraw's own choice
   * isn't always ours), or it runs against the way it would go by itself. Else null.
   */
  private forcedDir(a: Atom): 'left' | 'right' | null {
    const spec = this.shownSpec(a);
    if (!spec || !a.just || a.just === 'auto' || a.stacked) return null;
    const look = { ...spec, ...labelLook(a) }, dirs = labelBonds(this.doc, a);
    const dir = labelDir(look, dirs, a.just);
    if (dir !== 'left' && dir !== 'right') return null;
    return a.fixedDir || dir !== labelDir(look, dirs, 'auto') ? dir : null;
  }

  /** Element, charge, isotope, colour and size of a node. */
  private nodeCore(n: Element, a: Atom): void {
    const labelled = a.label !== null;
    this.set(n, 'Element', !labelled && a.z !== 6 ? a.z : labelled ? n.getAttribute('Element') : null);
    this.set(n, 'Charge', a.charge || null);
    this.set(n, 'Isotope', a.isotope || null);
    this.set(n, 'color', this.colorAttr(a.color));
    this.set(n, 'LabelSize', a.s && a.s !== 1 ? f2(a.s * this.doc.style.labelSize) : null);
    // the gap round its label, where the structure has its own (ChemDraw's MarginWidth on the atom)
    this.set(n, 'MarginWidth', a.marginWidth !== undefined ? f2(a.marginWidth) : null);
    this.set(n, 'IgnoreWarnings', a.ignoreWarnings ? 'yes' : null);
    this.set(n, 'ShowTerminalCarbonLabels', a.showCarbon && !labelled ? 'yes' : null);
    this.set(n, 'Radical', a.radical ? a.radical[0].toUpperCase() + a.radical.slice(1) : null);
    // a ring-fusion H drawn as a filled (toward the viewer) or hashed (away) dot
    this.set(n, 'HDot', a.hDot === 'dot' ? 'yes' : null);
    this.set(n, 'HDash', a.hDot === 'dash' ? 'yes' : null);
    this.set(n, 'xyz', a.xyz ? a.xyz.map(f2).join(' ') : null);
  }

  /** The node's label text and what it stands for (element + H count, abbreviation, R group). */
  private nodeLabel(n: Element, a: Atom, rebuildInner: boolean): void {
    // keep the old label's font and bold/italic style
    const oldS = this.child(this.child(n, 't') ?? n, 's');
    const keepFont = oldS?.getAttribute('font') ?? null;
    // (the bits every run had, so an italic alkyl prefix doesn't spread to the whole label)
    const oldRuns = [...(this.child(n, 't')?.childNodes ?? [])].filter((c): c is Element => c.nodeName === 's');
    const keepBits = oldRuns.length ? oldRuns.reduce((m, e) => m & Number(e.getAttribute('face') ?? 0), 7) : Number(oldS?.getAttribute('face') ?? 0) & 7;
    for (const c of kids(n)) if (c.nodeName === 't' || (rebuildInner && c.nodeName === 'fragment')) n.removeChild(c);
    if (rebuildInner) for (const k of ['NodeType', 'GenericNickname', 'Warning', 'NumHydrogens', 'NeedsClean']) n.removeAttribute(k);
    if (!this.shownSpec(a)) return;
    const { text, hCount } = this.autoText(a);
    if (a.label === null) n.setAttribute('NumHydrogens', String(hCount));
    else if (rebuildInner) this.labelChemistry(n, a);
    // (not on a label ChemDraw can't interpret, such as (3,4)-MDP: cleaning it turns it round)
    this.set(n, 'NeedsClean', n.getAttribute('NodeType') === 'Unspecified' ? null : 'yes');
    const size = this.doc.style.labelSize * (a.s ?? 1);
    const t = this.el('t', {});
    const color = this.colorAttr(a.color);
    const runs = labelRuns(text, a.label !== null ? labelLook(a) : { supDigits: false });
    // bold as the label is drawn (its own face, else the drawing's); italic and underline as the
    // label or the file had them
    const bold = labelBold(this.doc.style, a);
    const italicUnder = (keepBits | (a.face ?? this.doc.style.labelFace ?? 0)) & 6;
    // the label's own font, else the drawing's (the file's font is kept while it is one of those)
    const want = a.font?.trim() || this.doc.style.labelFont || 'Arial';
    const keptName = keepFont ? [...this.fontIds].find(([, id]) => id === keepFont)?.[0] : undefined;
    const font = keepFont && (keptName === undefined || keptName === want.toLowerCase() || (!a.font && isSymbolFont(keptName))) ? keepFont : this.fontId(want);
    for (const r of runs) {
      const s = this.el('s', { font, size: f2(size).replace(/\.00$/, ''), color: color ?? '0', face: (faceOf(r) ?? 0) | italicUnder | (bold ? 1 : 0) });
      s.textContent = r.text;
      t.appendChild(s);
    }
    n.appendChild(t);
    this.placeLabel(t, a);
  }

  /** What a text label means chemically, in ChemDraw's terms. */
  private labelChemistry(n: Element, a: Atom): void {
    const label = a.label!;
    // one ChemDraw couldn't interpret, as the file had it, while it is unchanged
    if (a.cdxInner?.type === 'Unspecified' && a.cdxInner.label === label) { n.setAttribute('NodeType', 'Unspecified'); n.removeAttribute('Element'); return; }
    if (this.keptInner(n, a)) return;
    const toks = tokenize(label);
    if (isGenericLabel(label) || (toks.length === 1 && toks[0].kind === 'generic')) {
      n.setAttribute('NodeType', 'GenericNickname');
      n.setAttribute('GenericNickname', label);
      return;
    }
    const g = labelGraph(label);
    if (!g) { n.setAttribute('NodeType', 'Unspecified'); return; }
    const heavy = g.atoms.length === 1 && !g.atoms[0].dummy && toks.every((t) => t.kind === 'el');
    if (heavy) {
      // e.g. "NH" typed as a label: an element with its hydrogens
      n.setAttribute('Element', String(g.atoms[0].z));
      n.setAttribute('NumHydrogens', String(toks.filter((t) => t.text === 'H').reduce((s, t) => s + Math.max(1, t.count), 0)));
      return;
    }
    n.removeAttribute('Element');
    n.setAttribute('NodeType', toks.length === 1 && toks[0].kind === 'nick' && toks[0].count <= 1 ? 'Nickname' : 'Fragment');
    n.insertBefore(this.innerFragment(a, g), n.firstChild);
  }

  /**
   * A ChemDraw label's own inner fragment, as the file had it (its ids made new), while the label
   * is unchanged and it still has a connection point for each bond. False when there is none.
   */
  private keptInner(n: Element, a: Atom): boolean {
    const k = a.cdxInner;
    if (!k || k.label !== a.label) return false;
    let f: Element;
    try {
      const d = new DOMParser().parseFromString(k.xml, 'application/xml');
      if (d.getElementsByTagName('parsererror').length || d.documentElement.nodeName !== 'fragment') return false;
      f = this.x.importNode(d.documentElement, true) as Element;
    } catch {
      return false;
    }
    const all = [f, ...descendants(f)];
    const points = all.filter((e) => e.nodeName === 'n' && e.getAttribute('NodeType') === 'ExternalConnectionPoint').length;
    if (points !== Math.max(1, this.doc.neighbors(a.id).length) && points !== this.doc.neighbors(a.id).length) return false;
    const fresh = new Map<string, string>();
    for (const e of all) { const id = e.getAttribute('id'); if (id) { const v = this.id(); fresh.set(id, v); e.setAttribute('id', v); } }
    for (const e of all) {
      for (const name of ['B', 'E', 'Attachments', 'BondCircularOrdering', 'SupersededBy']) {
        const v = e.getAttribute(name);
        if (v !== null) e.setAttribute(name, v.trim().split(/\s+/).map((x) => fresh.get(x) ?? x).join(' '));
      }
    }
    // (the fragment moves with its atom)
    if (k.x !== undefined && k.y !== undefined && (Math.abs(a.x - k.x) > 0.005 || Math.abs(a.y - k.y) > 0.005)) shift(f, a.x - k.x, a.y - k.y);
    n.removeAttribute('Element');
    n.setAttribute('NodeType', k.type);
    this.set(n, 'GenericNickname', k.nick ?? null);
    n.insertBefore(f, n.firstChild);
    return true;
  }

  /** The atoms an abbreviation stands for, joined to the outside through connection points. */
  private innerFragment(a: Atom, g: MiniGraph): Element {
    const doc = this.doc;
    const f = this.el('fragment', { id: this.id() });
    const neighbors = doc.neighbors(a.id);
    let away = { x: 0, y: 0 };
    for (const nb of neighbors) { const d = norm(sub(a, nb)); away = { x: away.x + d.x, y: away.y + d.y }; }
    away = Math.hypot(away.x, away.y) < 1e-6 ? { x: 1, y: 0 } : norm(away);
    const L = doc.style.bondLength * (a.s ?? 1);
    const across = { x: -away.y, y: away.x };
    const ids: string[] = [];
    g.atoms.forEach((m, i) => {
      // a simple zig-zag away from the structure; ChemDraw lays it out properly if the label is expanded
      const p = { x: a.x + away.x * L * 0.87 * i + across.x * (i % 2) * L * 0.5, y: a.y + away.y * L * 0.87 * i + across.y * (i % 2) * L * 0.5 };
      const id = this.id();
      ids.push(id);
      f.appendChild(this.el('n', {
        id, p: pt(p),
        Element: m.dummy || m.z === 6 ? null : m.z,
        Charge: m.charge || null,
        NodeType: m.dummy ? 'GenericNickname' : null,
        GenericNickname: m.dummy ? 'R' : null,
      }));
    });
    const ext: string[] = [];
    const count = Math.max(1, neighbors.length);
    for (let k = 0; k < count; k++) {
      const id = this.id();
      ext.push(id);
      f.appendChild(this.el('n', { id, p: pt(neighbors[k] ?? a), NodeType: 'ExternalConnectionPoint', ExternalConnectionNum: count > 1 ? k + 1 : null }));
    }
    for (const b of kekulize(g)) f.appendChild(this.el('b', { id: this.id(), B: ids[b.a], E: ids[b.b], Order: orderAttr(b.order) }));
    for (const x of ext) f.appendChild(this.el('b', { id: this.id(), B: x, E: ids[0] }));
    return f;
  }

  /** Position, box and justification of an atom label, from the same layout used on screen. */
  private placeLabel(t: Element, a: Atom): void {
    const doc = this.doc;
    const spec = this.shownSpec(a);
    if (!spec) return;
    Object.assign(spec, labelLook(a));
    const dirs = labelBonds(doc, a);
    const size = doc.style.labelSize * (a.s ?? 1);
    const layout = layoutLabel(spec, dirs, size, this.measure, a.just);
    const dir = labelDir(spec, dirs, a.just);
    // ChemDraw puts the baseline 0.39 × size below the atom (the screen layout uses half the
    // cap height), the box top 0.835 × size above the baseline, and the bottom on the baseline
    // unless there are subscripts or descenders.
    const baseline = 0.39 * size;
    const dy = baseline - (CAP * size) / 2;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    let below = /[gjpqy,]/.test(layout.runs.map((r) => r.text).join(''));
    layout.boxes.forEach((b, i) => {
      const run = layout.runs[i];
      x1 = Math.min(x1, b.x1); x2 = Math.max(x2, b.x2);
      if (run.size >= size) { y1 = Math.min(y1, b.y1 + dy - (0.835 - CAP) * size); y2 = Math.max(y2, b.y2 + dy); return; }
      // a smaller run: a subscript count, a superscript number (R¹) or a charge
      const rowBase = layout.runs.find((r) => r.size >= size && Math.abs(r.dy - run.dy) < size)?.dy ?? (CAP * size) / 2;
      if (run.dy > rowBase) below = true;
      else if (/^\d+$/.test(run.text)) y1 = Math.min(y1, rowBase + dy - 1.15 * size);
    });
    if (below) y2 = Math.max(y2, baseline + 0.23 * size);
    // a label centred on its atom (Ru, Si): ChemDraw puts the text's point at the middle and writes Center three ways
    // (a label stacked above or below is written as that, even when it is also centred)
    const centred = !!a.centred && !a.stacked && Math.abs(x1 + x2) < 1;
    const right = !centred && dir === 'left' && [...layout.runs.map((r) => r.text).join('')].length > 1;
    t.setAttribute('p', pt({ x: a.x + (centred ? (x1 + x2) / 2 : right ? x2 : x1), y: a.y + baseline }));
    t.setAttribute('BoundingBox', box({ x1: a.x + x1, y1: a.y + y1, x2: a.x + x2, y2: a.y + y2 }));
    t.setAttribute('LabelJustification', centred ? 'Center' : right ? 'Right' : 'Left');
    t.setAttribute('LabelAlignment', centred ? 'Center' : dir === 'up' ? 'Above' : dir === 'down' ? 'Below' : right ? 'Right' : 'Left');
    // ChemDraw 25 writes a label that runs to the left (Cy3P on PCy3) right-justified both ways
    if (right || centred) t.setAttribute('Justification', centred ? 'Center' : 'Right');
    else t.removeAttribute('Justification');
    if (a.stackedLoose && a.stacked) t.setAttribute('LineHeight', 'auto');
    // the node's LabelDisplay (a ChemDraw file's) says the same, as it comes first when read
    const n = t.parentElement;
    if (n?.nodeName === 'n' && n.hasAttribute('LabelDisplay')) {
      n.setAttribute('LabelDisplay', centred ? 'Center' : dir === 'up' ? 'Above' : dir === 'down' ? 'Below' : right ? 'Right' : 'Left');
    } else if (n?.nodeName === 'n' && centred) {
      if (a.fixedDir) n.setAttribute('LabelDisplay', 'Center');
    } else if (n?.nodeName === 'n') {
      // ChemDraw takes a label's way from this, not from its justification
      const forced = this.forcedDir(a);
      if (forced) n.setAttribute('LabelDisplay', forced === 'left' ? 'Right' : 'Left');
    }
  }

  /**
   * Bonds that cross: ChemDraw lists each one's partners (CrossingBonds) and draws the one with
   * the higher Z in front, with a gap in the one behind. A file whose crossings still agree with
   * the drawing is left alone; otherwise the crossing bonds get fresh, distinct Z values in front
   * of everything (ChemDraw muddles equal ones) in the order they are layered here.
   */
  private writeCrossings(): void {
    if (this.unchangedSinceRead()) return;
    // the bonds that cross, and the near misses a ChemDraw file listed that still pass close
    const partners = new Map<number, Bond[]>();
    // (ChemDraw lists some a little further off than it leaves gaps for, so they are kept to half a bond)
    const st = this.doc.style, reach = Math.max(1.5 * (st.marginWidth + st.lineWidth), st.bondLength / 2);
    const add = (b: Bond, o: Bond) => {
      const l = partners.get(b.id) ?? [];
      if (!l.includes(o)) partners.set(b.id, [...l, o]);
    };
    for (const b of this.doc.bonds.values()) {
      for (const o of crossingBondsCached(this.doc, b)) add(b, o);
      for (const o of listedNearMisses(this.doc, b, reach)) { add(b, o); add(o, b); }
    }
    const want = (b: Bond) => (partners.get(b.id) ?? []).map((o) => this.bondEls.get(o.id)?.getAttribute('id') ?? '').filter(Boolean).sort().join(' ');
    let ok = true;
    // A drawing written afresh (a copy for ChemDraw): every bond gets its Z, in the order they are
    // layered here. ChemDraw also counts near misses as crossings, which this program doesn't,
    // so the bonds round a crossing need their order too, not just the ones that cross.
    if (!this.doc.source && (partners.size || [...this.doc.bonds.values()].some((b) => b.z !== undefined))) {
      let top = 0;
      for (const e of this.page.querySelectorAll('[Z]')) top = Math.max(top, Number(e.getAttribute('Z')) || 0);
      const order = [...this.doc.bonds.values()].sort((a, b) => bondLayer(a) - bondLayer(b) || a.id - b.id);
      order.forEach((b, i) => {
        const e = this.bondEls.get(b.id);
        if (!e) return;
        e.setAttribute('Z', String(top + 1 + i));
        if (partners.has(b.id)) e.setAttribute('CrossingBonds', want(b));
      });
      return;
    }
    // bonds that no longer cross anything lose their list
    for (const [id, e] of this.bondEls) {
      if (partners.has(id) || !e.hasAttribute('CrossingBonds')) continue;
      e.removeAttribute('CrossingBonds');
      this.changed = true;
    }
    for (const [id, cs] of partners) {
      const b = this.doc.bonds.get(id)!, e = this.bondEls.get(id);
      if (!e) continue;
      const have = (e.getAttribute('CrossingBonds') ?? '').split(/\s+/).filter(Boolean).sort().join(' ');
      if (have !== want(b) || !e.hasAttribute('Z')) { ok = false; break; }
      const z = Number(e.getAttribute('Z'));
      for (const o of cs) {
        const oz = Number(this.bondEls.get(o.id)?.getAttribute('Z') ?? NaN);
        if (!(bondLayer(o) > bondLayer(b) ? oz > z : oz < z)) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (ok) return;
    let top = 0;
    for (const e of this.page.querySelectorAll('[Z]')) top = Math.max(top, Number(e.getAttribute('Z')) || 0);
    const order = [...partners.keys()].map((id) => this.doc.bonds.get(id)!).sort((a, b) => bondLayer(a) - bondLayer(b) || a.id - b.id);
    order.forEach((b, i) => {
      const e = this.bondEls.get(b.id);
      if (!e) return;
      e.setAttribute('Z', String(top + 1 + i));
      e.setAttribute('CrossingBonds', want(b));
    });
    this.changed = true;
  }

  /**
   * Aromatic rings drawn with a circle. ChemDraw keeps the circle as a circle graphic inside the
   * structure, in the middle of a ring of aromatic bonds, so that is how they are written; circles
   * already in the file are kept (moved if the ring moved) and ones whose ring lost its circle go.
   */
  /**
   * Polymer and repeat groups: ChemDraw's bracketedgroup on the page, naming the atoms inside
   * and, for each bracket, the bonds crossing it. Groups of other kinds (copolymers, mixtures…)
   * read from a file are left as they were.
   */
  private writeRepeatGroups(): void {
    const ours = (g: Element) => ['SRU', 'MultipleGroup'].includes(g.getAttribute('BracketUsage') ?? '');
    const old = [...this.page.getElementsByTagName('bracketedgroup')].filter(ours);
    const elId = (kind: Kind, id: number, names: string[]) => this.source(kind, id, names)?.getAttribute('id') ?? String(id);
    const made = repeatGroups(this.doc).filter((g) => g.inner.length).map((g) => {
      const count = g.count;
      const e = this.el('bracketedgroup', {
        id: '', BracketedObjectIDs: g.inner.map((id) => this.nodeId(id)).join(' '),
        BracketUsage: count === null ? 'SRU' : 'MultipleGroup', SRULabel: count === null ? g.text : null, RepeatCount: count,
      });
      const shapes = g.other.id === g.label.id ? [g.label] : [g.label, g.other];
      shapes.forEach((sh) => {
        const att = this.el('bracketattachment', { id: '', GraphicID: elId('s', sh.id, ['graphic']) });
        for (const c of g.crossing.filter((x) => x.spine === (sh.id === g.label.id ? 0 : 1) || shapes.length === 1)) {
          att.appendChild(this.el('crossingbond', { id: '', BondID: elId('b', c.bond, ['b']), InnerAtomID: this.nodeId(c.inner) }));
        }
        e.appendChild(att);
      });
      return e;
    });
    // the same groups as before: leave the file as it was. Compared in any order (ChemDraw often
    // lists the closing bracket first), with the bonds crossing the brackets taken together, and a
    // file's group that lists only some of the crossing bonds counted as the same
    const attrs = (e: Element) => [e.getAttribute('BracketUsage'), e.getAttribute('SRULabel'), e.getAttribute('RepeatCount'),
      (e.getAttribute('BracketedObjectIDs') ?? '').trim().split(/\s+/).sort().join(' ')].join('|');
    const graphics = (e: Element) => [...e.getElementsByTagName('bracketattachment')].map((x) => x.getAttribute('GraphicID')).sort().join(' ');
    const crossings = (e: Element) => new Set([...e.getElementsByTagName('crossingbond')].map((x) => `${x.getAttribute('BondID')}:${x.getAttribute('InnerAtomID')}`));
    const same = (o: Element, m: Element) => attrs(o) === attrs(m) && graphics(o) === graphics(m) && [...crossings(o)].every((c) => crossings(m).has(c));
    const left = [...made];
    if (old.length === made.length && old.every((o) => { const i = left.findIndex((m) => same(o, m)); if (i < 0) return false; left.splice(i, 1); return true; })) return;
    for (const e of old) e.parentNode?.removeChild(e);
    for (const e of made) {
      e.setAttribute('id', this.id());
      for (const c of e.getElementsByTagName('*')) c.setAttribute('id', this.id());
      this.page.appendChild(e);
    }
    this.changed = true;
  }

  private writeRingCircles(): void {
    const doc = this.doc;
    const L = doc.style.bondLength || 14.4;
    const shapeEls = new Set<Element>();
    for (const [key, o] of doc.source?.ord ?? []) if (key[0] === 's' && this.all[o]) shapeEls.add(this.all[o]);
    const isRingCircle = (g: Element) => g.nodeName === 'graphic' && !shapeEls.has(g) && !g.hasAttribute('SupersededBy')
      && ['Oval', 'Orbital'].includes(g.getAttribute('GraphicType') ?? '')
      && /Circle/.test(g.getAttribute('OvalType') ?? '') && !/Filled|Shaded/.test(g.getAttribute('OvalType') ?? '');
    const have = new Set<Element>();
    for (const f of new Set(this.fragOfAtom.values())) for (const g of kids(f)) if (isRingCircle(g)) have.add(g);
    const seen = new Set<string>();
    for (const b of doc.bonds.values()) {
      if (!b.circle || b.order !== 1.5) continue;
      for (const ring of ringsThroughBond(doc, b.id)) {
        const key = [...ring].sort((p, q) => p - q).join(',');
        if (seen.has(key) || !isCircleRing(doc, ring)) continue;
        seen.add(key);
        const { center: c, radius: r, ellipse } = ringCircle(doc, ring);
        // a ring seen at an angle: its circle is an ellipse, written with its two axes
        const ax = ellipse ? ellipseAxes(ellipse) : { major: { x: r, y: 0 }, minor: { x: 0, y: r } };
        const frag = this.fragOfAtom.get(ring[0]);
        if (!frag) continue;
        const old = [...have].find((g) => g.parentNode === frag && (([x, y]) => Math.hypot(x - c.x, y - c.y) < 0.3 * L)(pts(g.getAttribute('Center3D'))));
        if (old) {
          have.delete(old);
          const [x, y] = pts(old.getAttribute('Center3D'));
          if (Math.abs(x - c.x) < 0.01 && Math.abs(y - c.y) < 0.01) continue;
          const [mx, my] = pts(old.getAttribute('MajorAxisEnd3D')), [nx, ny] = pts(old.getAttribute('MinorAxisEnd3D'));
          const dx = c.x - x, dy = c.y - y;
          old.setAttribute('Center3D', `${f2(c.x)} ${f2(c.y)} 0`);
          if (Number.isFinite(mx)) old.setAttribute('MajorAxisEnd3D', `${f2(mx + dx)} ${f2(my + dy)} 0`);
          if (Number.isFinite(nx)) old.setAttribute('MinorAxisEnd3D', `${f2(nx + dx)} ${f2(ny + dy)} 0`);
          old.setAttribute('BoundingBox', `${f2((Number.isFinite(mx) ? mx : x + r) + dx)} ${f2(c.y)} ${f2(c.x)} ${f2(c.y)}`);
        } else {
          // as ChemDraw writes it: an s orbital drawn as a plain circle, its box from the rim to the centre
          frag.appendChild(this.el('graphic', {
            id: this.id(), BoundingBox: `${f2(c.x + r)} ${f2(c.y)} ${f2(c.x)} ${f2(c.y)}`, color: this.colorAttr(b.color),
            GraphicType: 'Orbital', OvalType: 'Circle', OrbitalType: 's',
            Center3D: `${f2(c.x)} ${f2(c.y)} 0`, MajorAxisEnd3D: `${f2(c.x + ax.major.x)} ${f2(c.y + ax.major.y)} 0`, MinorAxisEnd3D: `${f2(c.x + ax.minor.x)} ${f2(c.y + ax.minor.y)} 0`,
          }));
        }
        this.changed = true;
      }
    }
    for (const g of have) { g.parentNode?.removeChild(g); this.changed = true; }
  }

  /** ChemDraw paints a fragment's graphics in file order, so a charge sign set inside a ring goes after the ring's circle. */
  private raiseSymbols(): void {
    for (const f of new Set(this.fragOfAtom.values())) {
      const gs = kids(f).filter((g) => g.nodeName === 'graphic');
      const last = gs.map((g) => ['Oval', 'Orbital'].includes(g.getAttribute('GraphicType') ?? '')).lastIndexOf(true);
      if (last < 0) continue;
      const low = gs.slice(0, last).filter((g) => g.getAttribute('GraphicType') === 'Symbol');
      if (!low.length) continue;
      const after = gs[last].nextSibling;
      for (const g of low) f.insertBefore(g, after);
      this.changed = true;
    }
  }

  /**
   * A structure in a table cell goes inside ChemDraw's cell, placed from the cell's top left corner
   * as the cell's text is: ChemDraw paints a table's cells over any structure outside them,
   * whatever the file order or Z.
   */
  private raiseTableFigures(): void {
    const measure = this.opts.textMeasure ?? ((text: string, size: number, _f: string, style: string) => arialWidth(text, size, /bold/.test(style)));
    for (const s of this.doc.shapes.values()) {
      if (s.kind !== 'table' || !s.table) continue;
      const t = s.table;
      const el = this.tableEls.get(s.id);
      const table = el?.nodeName === 'table' ? el : el ? descendants(el).find((e) => e.nodeName === 'table') : undefined;
      if (!table) continue;
      const lay = layoutTable(t, this.doc.style.captionSize, measure);
      const cells = kids(table).filter((k) => k.nodeName === 'page');
      const byFrag = new Map<Element, number[]>();
      for (const id of tableContents(this.doc, s, () => lay)) {
        const f = this.fragOfAtom.get(id);
        if (f) byFrag.set(f, [...(byFrag.get(f) ?? []), id]);
      }
      for (const [f, ids] of byFrag) {
        const xs = ids.map((id) => this.doc.atoms.get(id)!.x), ys = ids.map((id) => this.doc.atoms.get(id)!.y);
        const part = partAt(t, lay, { x: (Math.min(...xs) + Math.max(...xs)) / 2 - s.x1, y: (Math.min(...ys) + Math.max(...ys)) / 2 - s.y1 });
        if (!part || typeof part === 'string') continue;
        const cell = cells[part.r * t.cols.length + part.c];
        if (!cell) continue;
        shift(f, -(s.x1 + lay.xs[part.c]), -(s.y1 + lay.ys[part.r]));
        cell.insertBefore(f, kids(cell).find((k) => k.nodeName === 'border') ?? null);
        this.changed = true;
      }
    }
  }

  private buildBond(b: Bond): Element {
    const e = this.el('b', { id: b.id });
    this.patchBond(e, b);
    return e;
  }

  /**
   * The label characters a bond meets (BeginAttach, EndAttach), with B and E: only while that
   * atom's label still has the character. `fileB` is the element's B as the file had it (before B
   * and E were written again here), which says whose index each attribute held. True when the
   * element changed.
   */
  private bondAttach(e: Element, b: Bond, fileB: string | null): boolean {
    // the file's own index for each atom it named (they go with their atoms, whichever end)
    const was = this.orig<Bond>('b', b.id);
    const fileIdx = new Map<number, string | null>();
    if (was) {
      const [first, second] = fileB !== null && fileB === this.nodeId(was.a2) ? [was.a2, was.a1] : [was.a1, was.a2];
      fileIdx.set(first, e.getAttribute('BeginAttach'));
      fileIdx.set(second, e.getAttribute('EndAttach'));
    }
    const attach = (atom: number, i: number | undefined): string | null => {
      const a = this.doc.atoms.get(atom), label = a?.label, oa = this.orig<Atom>('a', atom);
      // (an automatic label, such as HO, unchanged since it was read and still on this bond keeps
      // the file's own index)
      if (!label && a && oa && oa.label === label && oa.z === a.z && fileIdx.has(atom)) return fileIdx.get(atom) ?? null;
      return i && i > 0 && label && i < [...label].length ? String(i) : null;
    };
    let changed = false;
    for (const [k, v] of [['BeginAttach', attach(b.a1, b.beginAttach)], ['EndAttach', attach(b.a2, b.endAttach)]] as const) {
      if (e.getAttribute(k) === v) continue;
      this.set(e, k, v);
      changed = true;
    }
    return changed;
  }

  private patchBond(e: Element, b: Bond, o?: Bond | null): void {
    const fileB = e.getAttribute('B');
    e.setAttribute('B', this.nodeId(b.a1));
    e.setAttribute('E', this.nodeId(b.a2));
    this.bondAttach(e, b, fileB);
    // a bond read from a file whose order and look haven't changed keeps ChemDraw's own words for
    // them (orders such as 2.5), which we don't draw
    if (!o || o.order !== b.order || o.display !== b.display || !o.plain !== !b.plain || !o.circle !== !b.circle || o.line2 !== b.line2) {
      // ChemDraw draws Order="1.5" alone as one line, and with a dashed second line (Display2 Dash)
      // as its dashed aromatic bond, as it saves one; one-line and ring-circle aromatic bonds are 1.5 alone
      const dashed = b.order === 1.5 && !b.circle && !b.plain && b.display !== 'dative';
      // what ChemDraw 25 keeps but draws its own way goes to it as its nearest look, and is ours
      // again from our tag: hydrogen and ionic bonds dashed, a wavy wedge wavy (it drops their own
      // Order and Display), a bold or hashed second line plain (it drops those Display2s), and a
      // dashed second line as its Display2 Dash (it saves that back as aromatic)
      const look: { display?: string; line2?: string } = {};
      let display = DISPLAY[b.display] ?? null;
      if (b.display === 'hydrogen' || b.display === 'ionic') { display = 'Dash'; look.display = b.display; }
      else if (b.display === 'wavyWedge') { display = 'Wavy'; look.display = b.display; }
      const line2 = b.order === 2 && b.display !== 'dative' && !look.display ? b.line2 : undefined;
      if (line2) look.line2 = line2;
      this.set(e, 'Order', b.display === 'dative' ? 'dative' : b.display === 'hydrogen' || b.display === 'ionic' ? null : orderAttr(b.order));
      this.set(e, 'Display', display);
      this.set(e, 'Display2', dashed || line2 === 'dash' ? 'Dash' : null);
      for (const c of kids(e)) if (c.nodeName === 'objecttag' && c.getAttribute('Name') === BOND_LOOK_TAG) e.removeChild(c);
      if (look.display || look.line2) e.appendChild(this.el('objecttag', { TagType: 'String', Name: BOND_LOOK_TAG, Value: JSON.stringify(look), Visible: 'no' }));
    }
    // (ChemDraw's Right is on the left of B to E as drawn, y running down)
    const dp = b.order === 2 || b.order === 1.5 ? { left: 'Right', right: 'Left', center: 'Center', auto: null }[b.dpos] : null;
    this.set(e, 'DoublePosition', dp);
    this.set(e, 'color', this.colorAttr(b.color));
    this.set(e, 'LineWidth', b.s && b.s !== 1 ? f2(b.s * this.doc.style.lineWidth) : null);
    // a structure at its own settings: ChemDraw keeps all of them on each bond, so new bonds and
    // its Drawing Settings match the structure
    const own = (b.s !== undefined && b.s !== 1) || b.boldWidth !== undefined || b.hashSpacing !== undefined || b.marginWidth !== undefined || b.bondLength !== undefined;
    const w = bondWidths(this.doc.style, b);
    if (own && !e.hasAttribute('LineWidth')) e.setAttribute('LineWidth', f2(w.lineWidth));
    this.set(e, 'BoldWidth', own ? f2(w.boldWidth) : null);
    this.set(e, 'HashSpacing', own ? f2(w.hashSpacing) : null);
    this.set(e, 'MarginWidth', own ? f2(w.marginWidth) : null);
    this.set(e, 'BondLength', own ? f2(w.bondLength) : null);
    this.set(e, 'IgnoreWarnings', b.ignoreWarnings ? 'yes' : null);
    e.removeAttribute('BondCircularOrdering');
    // a hapto bond drawn to each atom (ChemDraw draws it to the middle)
    for (const c of kids(e)) if (c.nodeName === 'objecttag' && c.getAttribute('Name') === SPOKES_TAG) e.removeChild(c);
    if (b.spokes) e.appendChild(this.el('objecttag', { TagType: 'String', Name: SPOKES_TAG, Value: 'yes', Visible: 'no' }));
    this.bondStereo(e, b, true);
    // an older mark for ring circles (the circle is now written as ChemDraw draws it, see writeRingCircles)
    for (const c of kids(e)) if (c.nodeName === 'objecttag' && c.getAttribute('Name') === CIRCLE_TAG) e.removeChild(c);
    this.highlightTag(e, b.highlight, b.hl);
  }

  // ------------------------------------------------------------------ captions, arrows, shapes

  private writeCaption(c: Caption): void {
    const e = this.source('c', c.id, ['t']);
    const o = this.orig<Caption>('c', c.id);
    // (turned text from an older file of ours, with only our tag, gets ChemDraw's turn too)
    const unturned = !!c.rot && !e?.hasAttribute('RotationAngle');
    if (e && o) {
      if (unturned) this.fillCaption(e, c);
      else if (sameExcept(c, o, [])) return;
      else if (sameExcept(c, o, ['x', 'y'])) shift(e, c.x - o.x, c.y - o.y);
      else this.fillCaption(e, c);
    } else {
      const t = this.el('t', { id: c.id });
      this.fillCaption(t, c);
      this.page.appendChild(t);
    }
    this.changed = true;
  }

  private fillCaption(t: Element, c: Caption): void {
    for (const ch of kids(t)) {
      if (ch.nodeName === 's' || (ch.nodeName === 'objecttag' && [TEXT_TAG, ATTACH_TAG, IGNORE_TAG, TURN_TAG, CHEM_TAG].includes(ch.getAttribute('Name') ?? ''))) t.removeChild(ch);
    }
    const def = this.doc.style.captionSize;
    // lists and paragraph formatting are written as ChemDraw can show them, with a tag to read them back
    const { runs, tag } = runsForChemDraw(c);
    let maxSize = 0;
    let stored = '';
    for (const r of runs) {
      const size = r.size ?? def;
      maxSize = Math.max(maxSize, size);
      // Greek letters and signs that an ordinary font can't hold go in the Symbol font, as ChemDraw does
      for (const piece of toSymbolPieces(r.text, r.symbolFont)) {
        const s = this.el('s', { font: this.fontId(piece.symbol ? 'Symbol' : r.font ?? (this.doc.style.captionFont || 'Arial')), size: f2(size).replace(/\.00$/, ''), color: this.colorAttr(r.color) ?? '0', face: faceOf(r) });
        s.textContent = piece.text;
        t.appendChild(s);
        stored += piece.text;
      }
    }
    if (tag) t.appendChild(this.el('objecttag', { TagType: 'String', Name: TEXT_TAG, Value: JSON.stringify(tag), Visible: 'no' }));
    if (c.attach) t.appendChild(this.el('objecttag', { TagType: 'String', Name: ATTACH_TAG, Value: attachTag(c.attach), Visible: 'no' }));
    if (c.ignoreWarnings) t.appendChild(this.el('objecttag', { TagType: 'String', Name: IGNORE_TAG, Value: 'yes', Visible: 'no' }));
    // text read as chemistry is marked for ChemDraw (Interpret Chemically); a choice made by hand is kept for us
    if (c.chem !== undefined) t.appendChild(this.el('objecttag', { TagType: 'String', Name: CHEM_TAG, Value: c.chem ? 'yes' : 'no', Visible: 'no' }));
    this.set(t, 'InterpretChemically', captionSpecies(this.doc, c) ? 'yes' : null);
    // (the turn is RotationAngle alone: a turn tag would outlive a turn changed in ChemDraw)
    const fixed = c.lineHeight ?? (c.lineSpacing && c.lineSpacing !== 1 ? SINGLE * c.lineSpacing * maxSize : undefined);
    // the text as it is drawn: wrapped to the box with the app's text widths (Arial's by default)
    const lay = layoutText({ runs, justify: c.justify, wrap: c.wrap, width: c.width, lineHeight: fixed, inkLines: c.inkLines }, def, this.opts.textMeasure ?? ((text, size, _f, style) => arialWidth(text, size, /bold/.test(style))));
    const width = lay.boxWidth;
    const px = c.justify === 'center' ? c.x + width / 2 : c.justify === 'right' ? c.x + width : c.x;
    t.setAttribute('p', pt({ x: px, y: c.y }));
    // the box ChemDraw reads lined-up text from; a text box's lines are placed from p and its width
    let x1 = 0, x2 = width;
    if (c.wrap !== undefined) {
      x1 = Infinity; x2 = -Infinity;
      for (const l of lay.lines) for (const g of l.pieces) { x1 = Math.min(x1, g.x); x2 = Math.max(x2, g.x + g.w); }
      if (x1 > x2) x1 = x2 = 0;
    }
    const last = lay.lines[lay.lines.length - 1];
    const flat = { x1: c.x + x1, y1: c.y - maxSize * CAP, x2: c.x + x2, y2: c.y + last.y + maxSize * 0.2 };
    t.setAttribute('BoundingBox', box(c.rot ? turnedBox(flat, c, c.rot) : flat));
    // turned text: ChemDraw's angle, clockwise on the page about the text's origin, in 1/65536 degree
    // (text reading up the page is 270°, 17694720, in a ChemDraw 25 save)
    this.set(t, 'RotationAngle', c.rot ? String(Math.round((((c.rot % 360) + 360) % 360) * 65536)) : null);
    this.set(t, 'Justification', c.justify === 'left' ? null : c.justify === 'center' ? 'Center' : c.justify === 'right' ? 'Right' : 'Full');
    this.set(t, 'CaptionJustification', null);
    this.set(t, 'WordWrapWidth', c.wrap !== undefined ? f2(c.wrap) : null);
    // ChemDraw lists where each line starts after the first, then the length (in bytes of the text
    // as stored); without the list it drops blank lines.
    const starts = lay.lines.slice(1).map((l) => utf8Length(stored.slice(0, l.start)));
    starts.push(utf8Length(stored));
    // ChemDraw's variable spacing (lines as close as their ink lets them) is CaptionLineHeight
    // "variable" with no LineHeight; LineHeight "auto" is its looser single spacing
    const ink = !!c.inkLines && fixed === undefined;
    this.set(t, 'LineHeight', fixed ? f2(fixed) : starts.length > 1 && !ink ? 'auto' : null);
    // ChemDraw 25 writes a set line height here too, and its CDX reader spaces lines by this one
    if (fixed) this.set(t, 'CaptionLineHeight', f2(fixed));
    else if (ink) this.set(t, 'CaptionLineHeight', 'variable');
    else if (Number.isFinite(Number(t.getAttribute('CaptionLineHeight')))) this.set(t, 'CaptionLineHeight', null);
    this.set(t, 'LineStarts', starts.length > 1 ? starts.join(' ') : null);
  }

  private writeArrow(r: Arrow): void {
    const o = this.orig<Arrow>('r', r.id);
    // an arrow an older ChemDraw kept only as a line or arc graphic: left as it is while unchanged,
    // otherwise made a ChemDraw arrow in its place (with its id, so schemes still find it), as
    // ChemDraw does
    const legacy = this.source('r', r.id, ['graphic']);
    if (legacy) {
      if (o && sameExcept(r, o, ['step', 'reagentFor', 'pin']) && this.pinValue(r) === this.pinValue(o)) return;
      if (r.bez?.length) { this.writeCurveArrow(r, legacy, null); return; }
      const a = this.el('arrow', { id: legacy.getAttribute('id') ?? r.id });
      this.fillArrow(a, r);
      this.writeMorph(a, r);
      this.writePin(a, r);
      this.replaceSource('r', r.id, legacy, a);
      this.changed = true;
      return;
    }
    const e = this.source('r', r.id, ['arrow', 'curve']);
    // ChemDraw's arc along an ellipse stays its arc arrow while its shape is the one read
    if (e?.nodeName === 'arrow' && o?.bez?.length && e.hasAttribute('AngularSize') && deepEqual(r.bez, o.bez) && this.writeEllipseArrow(e, r, o)) return;
    // an S-shaped arrow is a ChemDraw curve (and one made back into an arc, an arrow again)
    if (r.bez?.length || e?.nodeName === 'curve') { this.writeCurveArrow(r, e, o); return; }
    if (e && o) {
      if (!deepEqual(r.morph, o.morph)) { this.writeMorph(e, r); this.changed = true; }
      if (this.pinValue(r) !== this.pinValue(o)) { this.writePin(e, r); this.changed = true; }
      if (sameExcept(r, o, ['step', 'reagentFor', 'morph', 'pin'])) return;
      const d = { x: r.tail.x - o.tail.x, y: r.tail.y - o.tail.y };
      const moved = { ...o, tail: r.tail, head: { x: o.head.x + d.x, y: o.head.y + d.y } };
      if (sameExcept(r, moved, ['step', 'reagentFor', 'morph', 'pin'])) {
        shift(e, d.x, d.y);
        for (const g of this.legacyOf(e)) shift(g, d.x, d.y);
      } else {
        this.fillArrow(e, r);
        this.updateLegacyArrow(e, r);
      }
    } else {
      const a = this.el('arrow', { id: r.id });
      this.fillArrow(a, r);
      this.writeMorph(a, r);
      this.writePin(a, r);
      this.page.appendChild(a);
    }
    this.changed = true;
  }

  /**
   * A ChemDraw arc arrow along an ellipse (read as Bézier pieces along it), written back as that
   * arc: its ellipse moved, turned and scaled with its ends, its other settings as they are here.
   * False when it can't be (its ends have met): it is then written as a curve.
   */
  private writeEllipseArrow(e: Element, r: Arrow, o: Arrow): boolean {
    const ox = o.head.x - o.tail.x, oy = o.head.y - o.tail.y, d2 = ox * ox + oy * oy;
    if (d2 < 1e-9) return false;
    if (!deepEqual(r.morph, o.morph)) { this.writeMorph(e, r); this.changed = true; }
    if (this.pinValue(r) !== this.pinValue(o)) { this.writePin(e, r); this.changed = true; }
    if (sameExcept(r, o, ['step', 'reagentFor', 'morph', 'pin'])) return true;
    // the move taking the old ends to the new (complex numbers: z -> tail + (z - oldTail) k)
    const rx = r.head.x - r.tail.x, ry = r.head.y - r.tail.y;
    const kx = (rx * ox + ry * oy) / d2, ky = (ry * ox - rx * oy) / d2;
    const T = (p: number[]): Vec => {
      const dx = p[0] - o.tail.x, dy = p[1] - o.tail.y;
      return { x: r.tail.x + dx * kx - dy * ky, y: r.tail.y + dx * ky + dy * kx };
    };
    const xyz = (k: string) => (e.getAttribute(k) ?? '').trim().split(/\s+/).map(Number);
    const [c, ma, mi] = ['Center3D', 'MajorAxisEnd3D', 'MinorAxisEnd3D'].map(xyz);
    if ([c, ma, mi].some((p) => p.length < 2 || p.some((v) => !Number.isFinite(v)))) return false;
    const angular = e.getAttribute('AngularSize');
    this.fillArrow(e, { ...r, sweep: 0, bez: undefined });
    const center = T(c);
    this.set(e, 'Center3D', pt3(center));
    this.set(e, 'MajorAxisEnd3D', pt3(T(ma)));
    this.set(e, 'MinorAxisEnd3D', pt3(T(mi)));
    this.set(e, 'AngularSize', angular);
    const pts = bezPoints(r);
    if (pts) {
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), pad = r.headWidth;
      this.set(e, 'BoundingBox', box({ x1: Math.min(...xs) - pad, y1: Math.min(...ys) - pad, x2: Math.max(...xs) + pad, y2: Math.max(...ys) + pad }));
    }
    for (const g of this.legacyOf(e)) {
      g.setAttribute('BoundingBox', g.getAttribute('GraphicType') === 'Arc' ? `${pt(r.head)} ${pt(center)}` : `${pt(r.head)} ${pt(r.tail)}`);
    }
    this.changed = true;
    return true;
  }

  /**
   * An S-shaped arrow as a ChemDraw curve with arrowheads (each point with its handles either
   * side), its heads kept as they are here in a tag. An arrow saved as a curve and now a plain
   * arc becomes an arrow again, in the curve's place.
   */
  private writeCurveArrow(r: Arrow, e: Element | null, o: Arrow | null): void {
    if (e && o && sameExcept(r, o, ['step', 'reagentFor', 'morph', 'pin']) && this.pinValue(r) === this.pinValue(o)) return;
    // still the arc of an ellipse ChemDraw drew (moved, turned or scaled whole): its arc arrow again,
    // whose head and line ChemDraw draws its own way, not a curve
    const ell = arrowEllipse(r);
    const pts = ell ? null : bezPoints(r);
    const el = this.el(pts ? 'curve' : 'arrow', { id: (e?.nodeName === 'graphic' && e.getAttribute('id')) || r.id });
    if (ell) {
      this.fillArrow(el, { ...r, sweep: 0, bez: undefined });
      this.set(el, 'Center3D', pt3(ell.center));
      this.set(el, 'MajorAxisEnd3D', pt3(ell.major));
      this.set(el, 'MinorAxisEnd3D', pt3(ell.minor));
      this.set(el, 'AngularSize', f2(ell.angularSize).replace(/\.?0+$/, ''));
      const all = bezPoints(r) ?? [r.tail, r.head];
      const xs = all.map((p) => p.x), ys = all.map((p) => p.y), pad = r.headWidth;
      this.set(el, 'BoundingBox', box({ x1: Math.min(...xs) - pad, y1: Math.min(...ys) - pad, x2: Math.max(...xs) + pad, y2: Math.max(...ys) + pad }));
      this.writeMorph(el, r);
    } else if (pts) {
      const n = (pts.length - 1) / 3;
      const knots: Vec[] = [];
      for (let i = 0; i <= n; i++) knots.push(i ? pts[3 * i - 1] : pts[0], pts[3 * i], i < n ? pts[3 * i + 1] : pts[3 * i]);
      const head = r.headStyle === 'full' ? 8 : r.headStyle !== 'none' ? 32 : 0;
      const tail = r.tailStyle === 'full' ? 16 : r.tailStyle !== 'none' ? 64 : 0;
      const kinds = head | tail | (r.line === 'dashed' ? 2 : r.line === 'bold' ? 4 : 0);
      const xs = knots.map((p) => p.x), ys = knots.map((p) => p.y);
      // the head's size and shape as ChemDraw keeps them on a curve (left out where they are its defaults)
      const lw = r.lineWidth ?? this.doc.style.lineWidth;
      const hs = Math.round((r.headLength / lw) * 100), aw = Math.round((r.headWidth / lw) * 100);
      const ht = r.headType === 'hollow' ? 'Hollow' : r.headType === 'angle' ? 'Angle' : 'Solid';
      for (const [k, v] of Object.entries({
        BoundingBox: box({ x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }),
        color: this.colorAttr(r.color), LineWidth: r.lineWidth !== undefined ? f2(r.lineWidth) : null,
        CurvePoints: knots.map((p) => `${f2(p.x)} ${f2(p.y)}`).join(' '), CurveType: String(kinds),
        HeadSize: hs !== 1000 ? String(hs) : null, ArrowheadWidth: aw !== 250 ? String(aw) : null, ArrowheadType: ht !== 'Solid' ? ht : null,
      })) this.set(el, k, v);
      // (with the CurveType and head written beside it: heads, dashes or head sizes changed in
      // ChemDraw win over the tag)
      const look = { headStyle: r.headStyle, tailStyle: r.tailStyle, headType: r.headType, line: r.line, headLength: r.headLength, headWidth: r.headWidth, seen: { curveType: kinds, head: `${hs} ${aw} ${ht}` } };
      el.appendChild(this.el('objecttag', { TagType: 'String', Name: CURVE_ARROW_TAG, Value: JSON.stringify(look), Visible: 'no' }));
    } else {
      this.fillArrow(el, r);
      this.writeMorph(el, r);
    }
    this.writePin(el, r);
    if (e?.parentNode) {
      if (e.nodeName === 'arrow') this.removeLegacyArrow(e);
      this.replaceSource('r', r.id, e, el);
    } else this.page.appendChild(el);
    this.changed = true;
  }

  /** An arrow's pins as saved (atoms by node id), or '' when it has none: to see whether they changed. */
  private pinValue(r: Arrow): string {
    if (!r.pin) return '';
    const v: Record<string, unknown> = {};
    for (const end of ['tail', 'head'] as const) {
      const p = r.pin[end];
      if (p) v[end] = { on: p.on, ref: p.ref.map((id) => this.nodeId(id)), at: [Math.round(p.at.x * 1e4) / 1e4, Math.round(p.at.y * 1e4) / 1e4], hand: p.hand };
    }
    return JSON.stringify(v);
  }

  /** What an arrow's ends are stuck to, so they still follow their structure when the file is opened here again. */
  private writePin(e: Element, r: Arrow): void {
    for (const c of kids(e)) if (c.nodeName === 'objecttag' && c.getAttribute('Name') === PIN_TAG) e.removeChild(c);
    const v = this.pinValue(r);
    if (v) e.appendChild(this.el('objecttag', { TagType: 'String', Name: PIN_TAG, Value: v, Visible: 'no' }));
  }

  /** The step's animation settings, with atoms named by their nodes' ids in this file. */
  private writeMorph(e: Element, r: Arrow): void {
    for (const c of kids(e)) if (c.nodeName === 'objecttag' && c.getAttribute('Name') === MORPH_TAG) e.removeChild(c);
    const m = r.morph;
    if (!m) return;
    const n = (id: number) => this.nodeId(id);
    const v: Record<string, unknown> = {};
    if (m.pairs?.length) v.pairs = m.pairs.map(([a, b]) => [n(a), n(b)]);
    if (m.exact) v.exact = true;
    if (m.shifts?.length) v.shifts = m.shifts.map(([a, b, c]) => [n(a), n(b), n(c)]);
    if (m.slides?.length) v.slides = m.slides.map(([[a, b], [c, d]]) => [[n(a), n(b)], [n(c), n(d)]]);
    e.appendChild(this.el('objecttag', { TagType: 'String', Name: MORPH_TAG, Value: JSON.stringify(v), Visible: 'no' }));
  }

  private fillArrow(e: Element, r: Arrow): void {
    const lw = r.lineWidth ?? this.doc.style.lineWidth;
    const headName = (h: Arrow['headStyle']) => (h === 'full' ? 'Full' : h === 'halfLeft' ? 'HalfLeft' : h === 'halfRight' ? 'HalfRight' : null);
    const headSize = Math.round((r.headLength / lw) * 100);
    const attrs: Record<string, string | number | null> = {
      FillType: 'None',
      ArrowheadHead: headName(r.headStyle),
      ArrowheadTail: headName(r.tailStyle),
      ArrowheadType: r.headType === 'hollow' ? 'Hollow' : r.headType === 'angle' ? 'Angle' : 'Solid',
      HeadSize: headSize,
      // the notch as read, or ours (3/4 of the head; ChemDraw takes a missing one as 7/8)
      ArrowheadCenterSize: Math.round(headSize * (r.headCenter ?? 0.75)),
      ArrowheadWidth: Math.round((r.headWidth / lw) * 100),
      LineType: r.line === 'dashed' ? 'Dashed' : r.line === 'bold' ? 'Bold' : r.line === 'wavy' ? 'Wavy' : null,
      BoldWidth: r.line === 'bold' && r.boldWidth !== undefined ? f2(r.boldWidth) : null,
      HashSpacing: r.line === 'dashed' && r.hashSpacing !== undefined ? f2(r.hashSpacing) : null,
      NoGo: r.noGo ? (r.noGoKind === 'hash' ? 'Hash' : 'Cross') : null,
      Dipole: r.dipole ? 'yes' : null,
      ArrowShaftSpacing: r.equilibrium ? 300 : r.shaftSpacing ? Math.round((r.shaftSpacing / lw) * 100) : null,
      LineWidth: r.lineWidth !== undefined ? f2(r.lineWidth) : null,
      color: this.colorAttr(r.color),
      Head3D: pt3(r.head),
      Tail3D: pt3(r.tail),
    };
    let x1 = Math.min(r.head.x, r.tail.x), y1 = Math.min(r.head.y, r.tail.y), x2 = Math.max(r.head.x, r.tail.x), y2 = Math.max(r.head.y, r.tail.y);
    if (r.sweep) {
      const { center, radius } = arcCenter(r.tail, r.head, r.sweep);
      attrs.Center3D = pt3(center);
      attrs.MajorAxisEnd3D = pt3({ x: center.x + radius, y: center.y });
      attrs.MinorAxisEnd3D = pt3({ x: center.x, y: center.y + radius });
      attrs.AngularSize = f2(-r.sweep / DEG);
      x1 = center.x - radius; y1 = center.y - radius; x2 = center.x + radius; y2 = center.y + radius;
    } else {
      // ChemDraw also stores these for straight arrows
      const c = { x: (r.head.x + r.tail.x) / 2, y: (r.head.y + r.tail.y) / 2 };
      const L = Math.hypot(r.head.x - r.tail.x, r.head.y - r.tail.y);
      attrs.Center3D = pt3(c);
      attrs.MajorAxisEnd3D = pt3({ x: c.x + L, y: c.y });
      attrs.MinorAxisEnd3D = pt3({ x: c.x, y: c.y + L });
      attrs.AngularSize = null;
    }
    const pad = r.headWidth;
    attrs.BoundingBox = box({ x1: x1 - pad, y1: y1 - pad, x2: x2 + pad, y2: y2 + pad });
    for (const [k, v] of Object.entries(attrs)) this.set(e, k, v);
  }

  private writeShape(s: Shape): void {
    if (s.kind === 'table') { this.writeTable(s); return; }
    if (s.kind === 'ring' && this.writeRingArea(s)) return;
    if (s.kind === 'geo' && (isPathId(s.geo) || isPenId(s.geo)) && this.writePathCurve(s)) return;
    if (s.kind === 'geo' || s.kind === 'ring') { this.writeGeo(s); return; }
    const pic = s.picture || s.kind === 'picture';
    const names = pic ? ['embeddedobject'] : ['graphic'];
    const e = this.source('s', s.id, names);
    const o = this.orig<Shape>('s', s.id);
    if (e && o) {
      // (a lone pair's pin is worked out again when the file is opened)
      if (sameExcept(s, o, ['pin'])) return;
      const dx = s.x1 - o.x1, dy = s.y1 - o.y1;
      if (sameExcept(s, { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy }, ['pin'])) shift(e, dx, dy);
      else if (s.kind === 'picture') this.fillPicture(e, s, o.src !== s.src);
      else if (!s.picture) this.fillShape(e, s);
    } else if (pic) {
      // a copied stand-in for a picture this program can't show has no picture to write
      if (s.picture || !s.src) return;
      const g = this.el('embeddedobject', { id: s.id });
      if (!this.fillPicture(g, s, true)) return;
      this.page.appendChild(g);
    } else {
      const g = this.el('graphic', { id: s.id });
      this.fillShape(g, s);
      // circled charges and lone pairs belong with their structure; a circled charge also
      // names the atom whose charge it shows, so ChemDraw leaves the charge off that label
      const owner = s.kind === 'symbol' ? this.chargeOwner(s) : null;
      if (owner) g.appendChild(this.el('represent', { attribute: 'Charge', object: this.nodeId(owner.id) }));
      // a radical's dot names its radical atom, as ChemDraw's does
      const radical = !owner && s.kind === 'symbol' && s.symbol === 'Electron' ? this.radicalOwner(s) : null;
      if (radical) g.appendChild(this.el('represent', { attribute: 'Radical', object: this.nodeId(radical.id) }));
      const host = owner || radical ? this.fragOfAtom.get((owner ?? radical)!.id) ?? null : s.kind === 'symbol' ? this.nearestFragment(s) : null;
      (host ?? this.page).appendChild(g);
    }
    this.changed = true;
  }

  /**
   * A plain ring fill (one solid colour, nothing more) as ChemDraw's own ring fill: a
   * ColoredMolecularArea in the ring's structure, naming the bonds round the ring (BasisObjects)
   * and the colour (bgcolor). ChemDraw then keeps it on the ring as the ring is edited. Fills
   * ChemDraw can't show that way (shadows, patterns, shading, see-through) are written as a
   * filled outline instead (writeGeo). False when this fill isn't written this way.
   */
  private writeRingArea(s: Shape): boolean {
    const e = this.source('s', s.id, ['ColoredMolecularArea']);
    const o = this.orig<Shape>('s', s.id);
    const ring = s.ring?.every((id) => this.doc.atoms.has(id)) ? s.ring : null;
    const bonds = ring ? ringBonds(this.doc, ring) : [];
    const frag = ring ? this.fragOfAtom.get(ring[0]) : undefined;
    const ids = bonds.map((id) => this.bondEls.get(id)?.getAttribute('id'));
    const plain = s.filled && !s.fill && !s.pattern && !s.shadow && !s.transparency && !s.glow && !s.softEdge && !s.bevel && !s.reflection && !s.picFill
      && !(s.lineWidth && s.color) && ring && bonds.length === ring.length && frag && ring.every((id) => this.fragOfAtom.get(id) === frag) && ids.every(Boolean);
    if (!plain) {
      if (e) { e.parentNode?.removeChild(e); this.changed = true; }
      return false;
    }
    if (e && o && sameExcept(s, o, ['poly', 'x1', 'y1', 'x2', 'y2']) && e.parentElement === frag) return true;
    const g = e ?? this.el('ColoredMolecularArea', { id: s.id });
    this.set(g, 'bgcolor', this.colorIndex(fillInk(s), true));
    this.set(g, 'BasisObjects', ids.join(' '));
    if (g.parentElement !== frag) frag!.appendChild(g);
    this.changed = true;
    return true;
  }

  /**
   * A closed curve read from ChemDraw (a perspective ring's ellipse) written back as ChemDraw's
   * own closed curve, where it was (in its structure, when it was there). Each point is written
   * with its handle in before it and its handle out after it. False when the shape has more than
   * a curve can hold (text, effects): it is then written as a design shape. An open curve (the
   * Freeform pen's) is written the same way without Closed, its two ends with handles on themselves.
   */
  private writePathCurve(s: Shape): boolean {
    const e = this.source('s', s.id, ['curve']);
    const open = isPenId(s.geo);
    if (Object.entries(s).some(([k, v]) => v !== undefined && v !== false && !PATH_CURVE_KEYS.has(k)) || (open && s.filled)) {
      // (the design shape replaces the curve)
      if (e) { e.parentNode?.removeChild(e); this.changed = true; }
      return false;
    }
    const o = this.orig<Shape>('s', s.id);
    if (e && o) {
      if (sameExcept(s, o, [])) return true;
      const dx = s.x1 - o.x1, dy = s.y1 - o.y1;
      if (sameExcept(s, { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy }, [])) { shift(e, dx, dy); this.changed = true; return true; }
    }
    const n = s.geo!.slice(open ? 4 : 5).split(',').map(Number);
    const x1 = Math.min(s.x1, s.x2), y1 = Math.min(s.y1, s.y2), w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
    const path: Vec[] = [];
    for (let i = 0; i + 1 < n.length; i += 2) path.push({ x: x1 + (n[i] / 10000) * w, y: y1 + (n[i + 1] / 10000) * h });
    // the start, then two handles and a point for each segment (closed: the last back at the start)
    const m = Math.floor((path.length - 1) / 3);
    if (m < 1 || path.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
    // (ChemDraw drops a curve whose points aren't three to a knot, so an open one must be all cubic)
    if (open && path.length !== 3 * m + 1) return false;
    const knots: Vec[] = [];
    if (open) {
      // each point with its handles in and out; the two ends' outer handles are the ends themselves
      knots.push(path[0], path[0], path[1]);
      for (let i = 1; i < m; i++) knots.push(path[3 * i - 1], path[3 * i], path[3 * i + 1]);
      knots.push(path[3 * m - 1], path[3 * m], path[3 * m]);
    } else for (let i = 0; i < m; i++) knots.push(path[3 * ((i + m - 1) % m) + 2], path[3 * i], path[3 * i + 1]);
    const lw = this.doc.style.lineWidth;
    const kinds = (open ? 0 : 1) | (s.dashed ? 2 : 0) | (s.bold ? 4 : 0);
    const c = e ?? this.el('curve', { id: s.id });
    this.set(c, 'BoundingBox', box({ x1, y1, x2: x1 + w, y2: y1 + h }));
    this.set(c, 'color', this.colorAttr(s.color));
    this.set(c, 'CurvePoints', knots.map((p) => `${f2(p.x)} ${f2(p.y)}`).join(' '));
    this.set(c, 'CurveType', String(kinds));
    this.set(c, 'Closed', open ? null : 'yes');
    // ChemDraw 25 fills a curve by its FillType; the CurveType bit alone leaves it empty
    this.set(c, 'FillType', s.filled ? 'Solid' : null);
    this.set(c, 'LineWidth', s.lineWidth !== undefined && s.lineWidth !== lw ? f2(s.lineWidth) : null);
    if (!c.parentNode) this.page.appendChild(c);
    this.changed = true;
    return true;
  }

  /**
   * A design shape: in ChemDraw a group of curves (the fill, the outline and any detail lines)
   * and its text, tagged with the shape so this program reads it back as the shape.
   */
  private writeGeo(s: Shape): void {
    const e = this.source('s', s.id, ['group']);
    const o = this.orig<Shape>('s', s.id);
    if (e && o && sameExcept(s, o, [])) return;
    let g = e;
    if (!g) {
      g = this.el('group', { id: s.id });
      this.page.appendChild(g);
    }
    for (const c of kids(g)) g.removeChild(c);
    const b = { x1: Math.min(s.x1, s.x2), y1: Math.min(s.y1, s.y2), x2: Math.max(s.x1, s.x2), y2: Math.max(s.y1, s.y2) };
    const def = geoDef(s.geo);
    // a ring's fill: the ring's corners, filled, with no outline (in ChemDraw a plain fill)
    const ringPts = s.kind === 'ring' ? (s.ring?.every((id) => this.doc.atoms.has(id)) ? s.ring.map((id) => this.doc.atoms.get(id)!) : s.poly ?? []) : null;
    const out: { body: GeoStep[]; lines?: GeoStep[] } = ringPts
      ? { body: [...ringPts.map((p, i): GeoStep => [i ? 'L' : 'M', p.x - b.x1, p.y - b.y1]), ['Z']] }
      : def.draw(b.x2 - b.x1, b.y2 - b.y1);
    const lw = this.doc.style.lineWidth;
    const width = ringPts ? 0 : s.lineWidth ?? (s.bold ? lw * 2.5 : lw);
    // a turned shape (an orbital's lobe, a shape turned on a slide) is turned in ChemDraw too
    const turn = s.kind === 'geo' ? shapeTurn(s) : 0;
    const mid = { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
    const curves = (steps: GeoStep[], type: string, color: string | undefined) => {
      for (const c of chemDrawCurves(turnSteps(moveSteps(steps, b.x1, b.y1), mid, turn))) {
        const closed = c.closed && type !== 'open';
        // CurveType's bits (to be checked in ChemDraw): closed 1, dashed 2, bold 4, filled 128
        const kinds = (closed ? 1 : 0) | (type !== 'fill' && s.dashed ? 2 : 0) | (type !== 'fill' && width > 1.75 * lw ? 4 : 0) | (type === 'fill' ? 128 : 0);
        const xs = c.points.map((p) => p.x), ys = c.points.map((p) => p.y);
        g!.appendChild(this.el('curve', {
          id: this.id(), BoundingBox: box({ x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }),
          color: this.colorAttr(color), CurvePoints: c.points.map((p) => `${f2(p.x)} ${f2(p.y)}`).join(' '), CurveType: String(kinds),
          // ChemDraw 25 fills a curve by its FillType; the CurveType bit alone leaves it empty
          FillType: type === 'fill' ? 'Solid' : null,
        }));
      }
    };
    // fused rings cast one shadow round their outer edge, saved with the first of them
    this.ringShadows ??= ringShadowGroups(this.doc.shapes.values(), this.doc.style.bondLength);
    const group = s.kind === 'ring' ? this.ringShadows.get(s.id) : undefined;
    if (ringPts && s.shadow && (!group || group[0] === s)) {
      // ChemDraw has no see-through colours: the shadow is the grey it looks on white
      const look = shadowLook(s, ringShadowSize(s, this.doc.style.bondLength));
      const polys = group ? group.map((r) => r.ring!.map((id) => this.doc.atoms.get(id)).filter((a): a is NonNullable<typeof a> => !!a)) : [ringPts];
      for (const p of shapeShadow(polys, look, true)) {
        const { a } = parseColor(p.colour);
        for (const r of p.region) curves([...r.map((v, i): GeoStep => [i ? 'L' : 'M', v.x - b.x1, v.y - b.y1]), ['Z']], 'fill', mix('#ffffff', look.colour, a));
      }
    }
    if (s.filled) {
      const fc = fillInk(s);
      const ink = s.fill === 'faded' ? tint(fc, FADE) : fc;
      // an icon's holes (each part is filled on its own in ChemDraw) are painted over in white
      if (def.icon && s.kind === 'geo') for (const p of outlineParts(out.body)) curves(p.steps, 'fill', p.depth % 2 ? '#ffffff' : ink);
      else curves(out.body, 'fill', ink);
    }
    if (width > 0) {
      curves(out.body, 'line', s.color ?? '#000000');
      if (out.lines?.length) curves(out.lines, 'open', s.color ?? '#000000');
    }
    if (s.kind === 'geo' && s.text?.runs.some((r) => r.text)) {
      const area = textArea(def, b.x1, b.y1, b.x2, b.y2);
      const w = Math.max(4, area.x2 - area.x1);
      const size = this.doc.style.captionSize;
      const justify = s.textAlign ?? 'center';
      const lay = layoutText({ runs: s.text.runs, paras: s.text.paras, justify, wrap: w }, size, this.opts.textMeasure ?? ((text, sz, _f, style) => arialWidth(text, sz, /bold/.test(style))));
      const th = lay.box.y2 - lay.box.y1;
      const v = s.textValign ?? 'middle';
      const top = v === 'top' ? area.y1 : v === 'bottom' ? area.y2 - th : (area.y1 + area.y2) / 2 - th / 2;
      const t = this.el('t', { id: this.id() });
      this.fillCaption(t, { id: 0, x: area.x1, y: top - lay.box.y1, runs: s.text.runs, paras: s.text.paras, justify, wrap: w });
      g.appendChild(t);
    }
    const { id: _, ...look } = s;
    // a frame takes what lies inside it again on opening (ids change between files)
    if (look.frame) look.frame = { ...look.frame, atoms: [], captions: [], arrows: [], shapes: [] };
    if (look.newman) look.newman = newmanForFile(this.doc, look.newman);
    if (ringPts) look.poly = ringPts.map((p) => ({ x: p.x, y: p.y }));
    // with the group's box as saved (ChemDraw rewrites BoundingBox when the group is moved), in the
    // tag: ChemDraw and CDX drop attributes of our own
    // (with the first curve's points as written: ChemDraw keeps them as they are unless the shape is
    // moved or changed there, when the curves are read instead)
    const first = kids(g).find((k) => k.nodeName === 'curve')?.getAttribute('CurvePoints');
    // (a turned shape's group goes round its turned corners)
    const gb = turn ? boxOf(turnedCorners(b, mid, turn)) : b;
    g.appendChild(this.el('objecttag', { TagType: 'String', Name: GEO_TAG, Value: JSON.stringify({ ...look, savedBox: box(gb), ...(first ? { seen: { curve: first } } : {}) }), Visible: 'no' }));
    this.set(g, 'BoundingBox', box(gb));
    g.removeAttribute(GEO_BOX_ATTR);
    this.changed = true;
  }

  /**
   * A table as ChemDraw keeps one: a page for each cell (row by row), holding the cell's text
   * and its four borders, so the rules show in ChemDraw as drawn here. Its title and footnotes
   * are captions grouped with it. What ChemDraw has no place for (heading rows, column
   * alignment, joined cells) goes in a tag so this program reads the table back as it was.
   */
  private writeTable(s: Shape): void {
    const t = s.table;
    if (!t) return;
    const e = this.source('s', s.id, ['table', 'group']);
    const o = this.orig<Shape>('s', s.id);
    const measure = this.opts.textMeasure ?? ((text: string, size: number, _f: string, style: string) => arialWidth(text, size, /bold/.test(style)));
    // (a table holding structures is written again, so its cells hold them as they are now)
    if (e && o && sameExcept(s, o, []) && !tableContents(this.doc, s, (x) => layoutTable(x, this.doc.style.captionSize, measure)).length) return;
    const el = this.tableElement(s, t, e?.getAttribute('id') ?? String(s.id));
    this.tableEls.set(s.id, el);
    if (e?.parentNode) e.parentNode.replaceChild(el, e);
    else this.page.appendChild(el);
    this.changed = true;
  }

  private tableElement(s: Shape, t: NonNullable<Shape['table']>, outerId: string): Element {
    const def = this.doc.style.captionSize;
    const measure = this.opts.textMeasure ?? ((text: string, size: number, _f: string, style: string) => arialWidth(text, size, /bold/.test(style)));
    const lay = layoutTable(t, def, measure);
    const lw = this.doc.style.lineWidth;
    const sized = (runs: TextRun[], size: number) => runs.map((r) => (r.size === undefined ? { ...r, size } : r));
    // ChemDraw keeps a cell's text inside the cell, so the text of a cell joined over several
    // columns goes beside the table as a caption of its own, tagged with its cell
    const spanText: { r: number; c: number }[] = [];
    t.rows.forEach((row, r) => row.forEach((cell, c) => {
      if (spanOf(t, r, c) > 1 && !isCovered(t, r, c) && lay.cells[r][c] && cell.runs.some((x) => x.text)) spanText.push({ r, c });
    }));
    const hasParts = !!(lay.title || lay.notes || spanText.length);
    // ChemDraw draws a table over the captions grouped with it unless each has its own place in
    // the drawing order, above everything else
    let z = s.z;
    if (spanText.length) {
      let top = 0;
      for (const e of this.page.querySelectorAll('[Z]')) top = Math.max(top, Number(e.getAttribute('Z')) || 0);
      z = top + 1;
    }
    let zNext = z ?? 0;
    const table = this.el('table', { id: hasParts ? this.id() : outerId, BoundingBox: box({ x1: s.x1, y1: s.y1 + lay.ys[0], x2: s.x1 + lay.width, y2: s.y1 + lay.ys[lay.ys.length - 1] }), Z: z });
    const borders = tableBorders(t, lw);
    const color = this.colorAttr(s.color) ?? '0';
    t.rows.forEach((row, r) => {
      for (let c = 0; c < t.cols.length; c++) {
        const x1 = s.x1 + lay.xs[c], y1 = s.y1 + lay.ys[r];
        const bounds = box({ x1, y1, x2: s.x1 + lay.xs[c + 1], y2: s.y1 + lay.ys[r + 1] });
        const page = this.el('page', { id: this.id(), BoundingBox: bounds, BoundsInParent: bounds });
        const placed = lay.cells[r][c];
        const cell = row[c];
        if (placed && cell?.runs.some((x) => x.text) && !isCovered(t, r, c) && spanOf(t, r, c) < 2) {
          const wrap = lay.xs[c + spanOf(t, r, c)] - lay.xs[c] - 2 * lay.padX;
          const text = this.el('t', { id: this.id() });
          // the text's place is measured from the cell's top left corner, as ChemDraw keeps it
          this.fillCaption(text, { id: 0, x: placed.x - lay.xs[c], y: placed.y - lay.ys[r], runs: sized(cell.runs, lay.size), paras: cell.paras, justify: cellAlign(t, r, c), wrap });
          page.appendChild(text);
        }
        // ChemDraw's order: left, top, bottom, right
        const b = borders[r][c];
        for (const side of ['left', 'top', 'bottom', 'right'] as const) page.appendChild(this.el('border', { id: this.id(), LineWidth: f2(b[side]).replace(/\.00$/, ''), color, Side: side }));
        table.appendChild(page);
      }
    });
    const tag: TableTag = { v: 1, head: t.head, lines: t.lines };
    if (t.align) tag.align = t.align;
    if (t.size !== undefined) tag.size = t.size;
    const spans: [number, number, number][] = [];
    const aligns: [number, number, string][] = [];
    const figs: [number, number, number, number][] = [];
    t.rows.forEach((row, r) => row.forEach((cell, c) => {
      if ((cell.span ?? 1) > 1) spans.push([r, c, cell.span!]);
      if (cell.align) aligns.push([r, c, cell.align]);
      if (cell.fig) figs.push([r, c, cell.fig.w, cell.fig.h]);
    }));
    if (spans.length) tag.spans = spans;
    if (aligns.length) tag.cellAlign = aligns;
    if (figs.length) tag.figs = figs;
    table.appendChild(this.el('objecttag', { TagType: 'String', Name: TABLE_TAG, Value: JSON.stringify(tag), Visible: 'no' }));
    if (!hasParts) return table;
    // the title and footnotes go with the table in a group, so they move together in ChemDraw too
    const group = this.el('group', { id: outerId });
    const part = (which: string, p: { x: number; y: number }, runs: TextRun[], size: number, more: Partial<Caption> = {}) => {
      const text = this.el('t', { id: this.id(), Z: z === undefined ? undefined : ++zNext });
      this.fillCaption(text, { id: 0, x: s.x1 + p.x, y: s.y1 + p.y, runs: sized(runs, size), justify: 'left', wrap: lay.width, ...more });
      text.appendChild(this.el('objecttag', { TagType: 'String', Name: TABLE_PART_TAG, Value: which, Visible: 'no' }));
      group.appendChild(text);
    };
    if (lay.title) part('title', lay.title, t.title!, lay.size);
    group.appendChild(table);
    for (const { r, c } of spanText) {
      const cell = t.rows[r][c];
      const wrap = lay.xs[c + spanOf(t, r, c)] - lay.xs[c] - 2 * lay.padX;
      part(`cell ${r} ${c}`, lay.cells[r][c]!, cell.runs, lay.size, { paras: cell.paras, justify: cellAlign(t, r, c), wrap });
    }
    if (lay.notes) part('notes', lay.notes, t.notes!, lay.size * NOTE_SCALE);
    return group;
  }

  /** The atom whose charge a circled ⊕/⊖ shows: the nearest atom with a hidden charge of that sign. */
  /** The radical atom a radical's dot sits beside, if any. */
  private radicalOwner(s: Shape): Atom | null {
    const c = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
    let best: Atom | null = null, bestD = Infinity;
    for (const a of this.doc.atomsNear(c, this.doc.style.bondLength)) {
      const d = Math.hypot(a.x - c.x, a.y - c.y);
      if (a.radical && d < bestD) { best = a; bestD = d; }
    }
    return best;
  }

  private chargeOwner(s: Shape): Atom | null {
    const sign = s.symbol === 'CirclePlus' || s.symbol === 'Plus' ? 1 : s.symbol === 'CircleMinus' || s.symbol === 'Minus' ? -1 : 0;
    if (!sign) return null;
    const c = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
    let best: Atom | null = null, bestD = Infinity;
    for (const a of this.doc.atomsNear(c, this.doc.style.bondLength * 1.5)) {
      if (!a.hideCharge || Math.sign(a.charge) !== sign) continue;
      const d = Math.hypot(a.x - c.x, a.y - c.y);
      if (d < bestD) { best = a; bestD = d; }
    }
    return best;
  }

  private nearestFragment(s: Shape): Element | null {
    const c = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
    const near = this.doc.atomsNear(c, this.doc.style.bondLength);
    return near.length ? this.fragOfAtom.get(near[0].id) ?? null : null;
  }

  /**
   * A picture as ChemDraw keeps it: its place, and the picture itself (PNG, JPEG, GIF, BMP or a
   * Windows metafile; when the picture changed, the copies ChemDraw kept beside the old one go).
   * ChemDraw has no cropping, so files show the whole picture. False when there is nothing
   * ChemDraw could show.
   */
  private fillPicture(e: Element, s: Shape, replace: boolean): boolean {
    // the unturned frame, and the turn as ChemDraw keeps it (degrees × 65536)
    this.set(e, 'BoundingBox', box({ x1: Math.min(s.x1, s.x2), y1: Math.min(s.y1, s.y2), x2: Math.max(s.x1, s.x2), y2: Math.max(s.y1, s.y2) }));
    const turn = (((s.rot ?? 0) % 360) + 360) % 360;
    this.set(e, 'RotationAngle', turn > 1e-6 && turn < 360 - 1e-6 ? String(Math.round(turn * 65536)) : null);
    let png = false, exact = false, emf = false;
    if (replace && s.src) {
      for (const k of ['WindowsMetafile', 'EnhancedMetafile', 'PNG', 'GIF', 'JPEG', 'TIFF', 'BMP', 'OLEObject', 'MacPICT', 'CompressedWindowsMetafile', 'CompressedEnhancedMetafile', 'CompressedOLEObject', 'UncompressedWindowsMetafileSize', 'UncompressedEnhancedMetafileSize', 'UncompressedOLEObjectSize', OWN_PICTURE]) e.removeAttribute(k);
      const types: Record<string, string> = { 'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/gif': 'GIF', 'image/bmp': 'BMP', 'image/x-emf': 'EnhancedMetafile' };
      const put = (src: string): boolean => {
        try {
          const { mime, bytes } = fromDataUrl(src);
          const attr = types[mime];
          if (!attr) return false;
          const hex: string[] = [];
          for (const b of bytes) hex.push((b < 16 ? '0' : '') + b.toString(16));
          this.set(e, attr, hex.join('').toUpperCase());
          return true;
        } catch {
          // not a picture this program made; nothing to write
          return false;
        }
      };
      exact = png = put(s.src);
      // a crystal structure: a vector picture too (ChemDraw and Office keep it sharp at any size)
      // beside its PNG, which ChemDraw shows where it doesn't read metafiles
      if (s.plate?.crystal) {
        const w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
        try { if (put(dataUrl(itemsToEmf(crystalItems(s.plate.crystal, w, h), { x1: 0, y1: 0, x2: w, y2: h }), 'image/x-emf'))) emf = true; } catch { /* the PNG alone */ }
      }
      // an equation or SVG or WebP picture: ChemDraw gets a PNG of it, at about 300 dpi (the
      // equation itself rides along in its tag, and our own clipboard keeps the original)
      if (!png && /^data:image\//.test(s.src)) {
        const w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1), k = Math.min(300 / 72, 4000 / Math.max(w, h, 1));
        const made = (this.opts.raster ?? rasterPng)(s.src, Math.max(1, w * k), Math.max(1, h * k));
        png = !!made && put(made);
      }
      png ||= emf;
    } else png = exact = ['PNG', 'JPEG', 'GIF', 'BMP', 'EnhancedMetafile', 'WindowsMetafile', 'CompressedEnhancedMetafile', 'CompressedWindowsMetafile'].some((k) => e.hasAttribute(k));
    for (const c of kids(e)) if (c.nodeName === 'objecttag' && [CHART_TAG, MATH_TAG, PICTURE_FX_TAG, ALT_TAG, PLATE_TAG].includes(c.getAttribute('Name') ?? '')) e.removeChild(c);
    if (s.plate) e.appendChild(this.el('objecttag', { TagType: 'String', Name: PLATE_TAG, Value: JSON.stringify(s.plate), Visible: 'no' }));
    if (s.alt) e.appendChild(this.el('objecttag', { TagType: 'String', Name: ALT_TAG, Value: s.alt, Visible: 'no' }));
    if (s.fx) e.appendChild(this.el('objecttag', { TagType: 'String', Name: PICTURE_FX_TAG, Value: JSON.stringify(s.fx), Visible: 'no' }));
    if (s.chart) e.appendChild(this.el('objecttag', { TagType: 'String', Name: CHART_TAG, Value: JSON.stringify(s.chart), Visible: 'no' }));
    if (s.math) e.appendChild(this.el('objecttag', { TagType: 'String', Name: MATH_TAG, Value: JSON.stringify(s.math), Visible: 'no' }));
    if (this.opts.own) {
      if (s.src && !exact) this.set(e, OWN_PICTURE, s.src);
      const c = s.crop;
      this.set(e, OWN_CROP, c && (c.l || c.t || c.r || c.b) ? [c.l, c.t, c.r, c.b].map((v) => +v.toFixed(5)).join(' ') : null);
    }
    return png || (!!this.opts.own && !!s.src);
  }

  /** ChemDraw's FadePercent for a box or oval filled with a white tint of its own colour, or null. */
  private fadeOf(s: Shape): number | null {
    if (!s.filled || (s.kind !== 'rect' && s.kind !== 'oval') || s.fill || !s.fillColor || s.pattern || s.fill2) return null;
    const hex = (c: string) => /^#([0-9a-f]{6})$/i.exec(c)?.[1];
    const ink = hex(s.color ?? '#000000'), fill = hex(s.fillColor);
    if (!ink || !fill) return null;
    const ch = (h: string) => [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
    const c = ch(ink), f = ch(fill);
    // how much white is mixed in, from the channel with the most room
    const k = c.indexOf(Math.min(...c));
    if (c[k] > 250) return null;
    const a = (f[k] - c[k]) / (255 - c[k]);
    if (a <= 0.001 || a >= 0.999) return null;
    // ChemDraw's own value, read with the fill, while the fill is still that tint of this colour
    if (s.fade !== undefined && s.fade > 0 && s.fade < 1000 && tint('#' + ink, 1 - s.fade / 1000).toLowerCase() === '#' + fill.toLowerCase()) return Math.round(s.fade);
    const fade = Math.round((1 - a) * 1000);
    // (it has to be that tint in every channel, as ChemDraw will draw it; rounding in the colours
    // leaves it a little off, so a round number that gives this very tint is the one it was)
    const isTint = (v: number, near: number) => ch(hex(tint('#' + ink, 1 - v / 1000))!).every((x, i) => Math.abs(x - f[i]) <= near);
    const round = Math.round(fade / 10) * 10;
    if (isTint(round, 0)) return round;
    return isTint(fade, 2) ? fade : null;
  }

  private fillShape(g: Element, s: Shape): void {
    for (const k of ['GraphicType', 'LineType', 'RectangleType', 'OvalType', 'SymbolType', 'BracketType', 'Center3D', 'MajorAxisEnd3D', 'MinorAxisEnd3D', 'ArrowType', 'CornerRadius', 'ShadowSize']) g.removeAttribute(k);
    const style = [s.dashed && 'Dashed', s.bold && 'Bold'].filter(Boolean).join(' ') || null;
    const set = (k: string, v: string | null) => this.set(g, k, v);
    // ChemDraw fills with the shape's one colour, so a filled shape is saved in its fill colour
    // (a faded fill as its light tint); the outline colour and fill style ride along in a tag
    // A fill that is the shape's own colour faded towards white is ChemDraw's faded shape: an
    // outline in the full colour with FadePercent (in tenths of a percent of the colour)
    const fade = this.fadeOf(s);
    // (other graphics, such as orbitals, keep ChemDraw's own FadePercent)
    if (fade !== null || s.kind === 'rect' || s.kind === 'oval') set('FadePercent', fade === null ? null : String(fade));
    const fillTo = s.filled && fade === null ? (s.kind === 'ring' ? fillInk(s) : s.fillColor ?? s.color) : undefined;
    const ink = fillTo && s.fill === 'faded' ? tint(fillTo, FADE) : fillTo ?? s.color;
    set('color', this.colorAttr(ink));
    for (const c of kids(g)) if (c.nodeName === 'objecttag' && c.getAttribute('Name') === FILL_TAG) g.removeChild(c);
    if ((s.filled && (s.fill || s.fillColor)) || s.pattern) {
      // (with the colour written beside it: a recolour in ChemDraw wins over the tag)
      const seen = { color: (ink ?? '#000000').toLowerCase() };
      const v = { fill: s.fill, fillColor: s.fillColor, color: s.color, fill2: s.fill2, gradAngle: s.gradAngle, gradRadial: s.gradRadial, pattern: s.pattern, patternColor: s.patternColor, patternSize: s.patternSize, patternTransparency: s.patternTransparency, patternClear: s.patternClear, ...(s.filled ? {} : { filled: false }), seen };
      g.appendChild(this.el('objecttag', { TagType: 'String', Name: FILL_TAG, Value: JSON.stringify(v), Visible: 'no' }));
    }
    for (const c of kids(g)) if (c.nodeName === 'objecttag' && c.getAttribute('Name') === FRAME_TAG) g.removeChild(c);
    if (s.frame) g.appendChild(this.el('objecttag', { TagType: 'String', Name: FRAME_TAG, Value: frameTag(s.frame), Visible: 'no' }));
    // a part of an orbital drawn here (an s orbital, a dz²'s ring): how it was asked for, to change it again
    for (const c of kids(g)) if (c.nodeName === 'objecttag' && c.getAttribute('Name') === ORBITAL_TAG) g.removeChild(c);
    if (s.orb) g.appendChild(this.el('objecttag', { TagType: 'String', Name: ORBITAL_TAG, Value: JSON.stringify(s.orb), Visible: 'no' }));
    const filled = !s.filled || fade !== null ? null : s.fill === 'shaded' ? 'Shaded' : 'Filled';
    // an outline of its own width (a frame pasted from ChemDraw keeps its drawing's width): ChemDraw
    // draws a graphic's lines at its own LineWidth, and bold ones at its BoldWidth
    if (s.lineWidth && s.kind !== 'picture') {
      set(s.bold ? 'BoldWidth' : 'LineWidth', f2(s.lineWidth));
      g.removeAttribute(s.bold ? 'LineWidth' : 'BoldWidth');
    } else for (const k of ['LineWidth', 'BoldWidth']) g.removeAttribute(k);
    set('HashSpacing', s.dashed && s.hashSpacing !== undefined ? f2(s.hashSpacing) : null);
    // corner radius and shadow size are in hundredths of the graphic's line width
    const lwRef = Number(g.getAttribute('LineWidth')) || this.doc.style.lineWidth;
    switch (s.kind) {
      case 'line':
        set('GraphicType', 'Line');
        set('BoundingBox', box(s));
        // ChemDraw has no dotted line: it shows dashes, and the dots come back on opening here
        set('LineType', s.dotted ? [s.bold && 'Bold', 'Dashed'].filter(Boolean).join(' ') : style);
        // (dotted in a tag of our own: ChemDraw and CDX drop attributes they don't know)
        g.removeAttribute(DOTTED_ATTR);
        for (const c of kids(g)) if (c.nodeName === 'objecttag' && c.getAttribute('Name') === DOTTED_TAG) g.removeChild(c);
        if (s.dotted) g.appendChild(this.el('objecttag', { TagType: 'String', Name: DOTTED_TAG, Value: 'yes', Visible: 'no' }));
        break;
      case 'rect':
        set('GraphicType', 'Rectangle');
        // ChemDraw puts a box's shadow toward the first corner it stores, and stores the
        // bottom-right corner first
        set('BoundingBox', s.shadow ? box({ x1: Math.max(s.x1, s.x2), y1: Math.max(s.y1, s.y2), x2: Math.min(s.x1, s.x2), y2: Math.min(s.y1, s.y2) }) : box(s));
        set('RectangleType', [s.rounded && 'RoundEdge', s.shadow && 'Shadow', filled, s.dashed && 'Dashed', s.bold && 'Bold'].filter(Boolean).join(' ') || 'Plain');
        // in hundredths of the line width, as ChemDraw stores them
        set('CornerRadius', s.rounded ? String(Math.round(((s.radius ?? 6 * this.doc.style.lineWidth) / lwRef) * 100)) : null);
        set('ShadowSize', s.shadow ? String(Math.round(((s.shadowSize ?? 4 * this.doc.style.lineWidth) / lwRef) * 100)) : null);
        // a turned box (ChemDraw's diamond is a square turned 45°): its middle and the ends of its
        // two half-axes, turned, as ChemDraw stores them, and the box round its turned corners
        if (s.rot && ((s.rot % 360) + 360) % 360 > 1e-6) {
          const c = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
          const hw = Math.abs(s.x2 - s.x1) / 2, hh = Math.abs(s.y2 - s.y1) / 2;
          const t = (s.rot * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
          const ex = Math.abs(hw * cos) + Math.abs(hh * sin), ey = Math.abs(hw * sin) + Math.abs(hh * cos);
          set('BoundingBox', s.shadow ? box({ x1: c.x + ex, y1: c.y + ey, x2: c.x - ex, y2: c.y - ey }) : box({ x1: c.x - ex, y1: c.y - ey, x2: c.x + ex, y2: c.y + ey }));
          set('Center3D', pt3(c));
          set('MajorAxisEnd3D', pt3({ x: c.x + hw * cos, y: c.y + hw * sin }));
          set('MinorAxisEnd3D', pt3({ x: c.x - hh * sin, y: c.y + hh * cos }));
        }
        break;
      case 'oval': {
        const c = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
        const rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
        // ChemDraw's orbital (an s orbital, a lobe) stays one
        set('GraphicType', s.orbital ? 'Orbital' : 'Oval');
        set('OrbitalType', s.orbital ?? null);
        set('BoundingBox', box(s));
        set('Center3D', pt3(c));
        // a turned oval (an ellipsoid of a crystal structure) has its axes turned: ChemDraw draws
        // an oval along whatever axes it is given
        const t = ((s.rot ?? 0) * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
        set('MajorAxisEnd3D', pt3({ x: c.x + rx * cos, y: c.y + rx * sin }));
        set('MinorAxisEnd3D', pt3({ x: c.x - ry * sin, y: c.y + ry * cos }));
        set('OvalType', [Math.abs(rx - ry) < 0.01 && 'Circle', filled, s.dashed && 'Dashed', s.bold && 'Bold', s.shadow && 'Shadowed'].filter(Boolean).join(' ') || null);
        // in hundredths of the line width, as for a box (and, as there, ours by default when not set)
        set('ShadowSize', s.shadow ? String(Math.round(((s.shadowSize ?? 4 * this.doc.style.lineWidth) / lwRef) * 100)) : null);
        break;
      }
      case 'symbol': {
        set('GraphicType', 'Symbol');
        set('SymbolType', s.symbol ?? 'CirclePlus');
        // a lone pair is its two dots; a radical's dot is the dot and a point 4.5 pt further out from
        // its atom (ChemDraw sizes the dot from that distance)
        if (s.symbol === 'Electron') {
          const near = this.radicalOwner(s) ?? this.doc.atomsNear({ x: s.x1, y: s.y1 }, this.doc.style.bondLength)[0];
          const d = near ? Math.hypot(s.x1 - near.x, s.y1 - near.y) : 0;
          const u = near && d > 0.01 ? { x: (s.x1 - near.x) / d, y: (s.y1 - near.y) / d } : { x: -1, y: 0 };
          set('BoundingBox', `${f2(s.x1)} ${f2(s.y1)} ${f2(s.x1 + 4.5 * u.x)} ${f2(s.y1 + 4.5 * u.y)}`);
        } else if (s.symbol && CHIRAL_FLAGS[s.symbol]) {
          // a chiral flag: its word as text, which ChemDraw draws the box round
          for (const c of kids(g)) if (c.nodeName === 't') g.removeChild(c);
          const word = CHIRAL_FLAGS[s.symbol];
          const size = flagTextSize(s);
          const w = this.measure(word, size);
          // the text box as ChemDraw makes it: 0.895 of the size above the baseline, 0.255 below
          const cx = (s.x1 + s.x2) / 2, base = (s.y1 + s.y2) / 2 + size * 0.32;
          set('BoundingBox', `${f2(cx - w / 2)} ${f2(base)} ${f2(cx + w / 2)} ${f2(base)}`);
          const t = this.el('t', { p: `${f2(cx - w / 2)} ${f2(base)}`, BoundingBox: box({ x1: cx - w / 2, y1: base - 0.895 * size, x2: cx + w / 2, y2: base + 0.255 * size }), LineHeight: 'auto' });
          const sp = this.el('s', { font: this.fontId(), size: f2(size).replace(/\.00$/, ''), color: '0', face: 96 });
          sp.textContent = word;
          t.appendChild(sp);
          g.appendChild(t);
        } else if (s.symbol === 'LonePair' || s.symbol === 'LonePairBar') set('BoundingBox', box(s));
        // a radical ion: the dot, then the middle of the charge's sign (the shape's two points, as read)
        else if (s.symbol === 'RadicalCation' || s.symbol === 'RadicalAnion') set('BoundingBox', `${f2(s.x1)} ${f2(s.y1)} ${f2(s.x2)} ${f2(s.y2)}`);
        else {
          // a charge sign (or a dagger) as ChemDraw stores it: the sign's centre, then a point its width below
          const c = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
          set('BoundingBox', `${f2(c.x)} ${f2(c.y)} ${f2(c.x)} ${f2(c.y + Math.abs(s.x2 - s.x1))}`);
        }
        break;
      }
      case 'bracket': {
        const t = s.bracket === 'round' ? 'Round' : s.bracket === 'curly' ? 'Curly' : 'Square';
        set('GraphicType', 'Bracket');
        set('BracketType', s.pair ? t + 'Pair' : t);
        set('BoundingBox', box(s));
        // a repeat group's label: the usage, and the label text as ChemDraw shows it by the bracket
        set('BracketUsage', s.repeat ? (repeatCount(s.repeat) === null ? 'SRU' : 'MultipleGroup') : null);
        for (const c of kids(g)) if (c.nodeName === 'objecttag' && (c.getAttribute('Name') === 'bracketusage' || c.getAttribute('Name') === 'parameterizedBracketLabel')) g.removeChild(c);
        if (s.repeat) {
          const look = s.repeatLook;
          const size = look?.size || 0.75 * this.doc.style.labelSize;
          const w = this.measure(s.repeat, size);
          const p = repeatLabelPlace(s, size, w);
          const tag = this.el('objecttag', { TagType: 'Unknown', Name: 'bracketusage' });
          const tt = this.el('t', { p: pt(p), BoundingBox: box({ x1: p.x, y1: p.y - CAP * size, x2: p.x + w, y2: p.y }), CaptionLineHeight: 'variable' });
          const run = () => {
            const sp = this.el('s', { font: this.fontId(), size: f2(size).replace(/\.00$/, ''), color: this.colorAttr(look?.color ?? s.color) ?? '0', face: look?.face ?? (repeatCount(s.repeat!) === null ? 2 : 0) });
            sp.textContent = s.repeat!;
            return sp;
          };
          tt.appendChild(run());
          tag.appendChild(tt);
          g.appendChild(tag);
          // ChemDraw 25 keeps the label a second time, hidden, where it is drawn
          const hidden = this.el('objecttag', { TagType: 'Unknown', Name: 'parameterizedBracketLabel', Visible: 'no' });
          const ht = this.el('t', { p: pt(p), Visible: 'no' });
          ht.appendChild(run());
          hidden.appendChild(ht);
          g.appendChild(hidden);
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ reaction steps

  /**
   * ChemDraw's reaction steps (scheme > step), which say what each arrow's starting materials,
   * products and conditions are. Steps kept from the file stay as they were unless their roles
   * changed; every other reaction arrow gets a step with the roles worked out from where things
   * sit, as ChemDraw does (only when the file is being written anyway).
   */
  private writeSteps(): void {
    const doc = this.doc, src = doc.source;
    const stepOf = new Map<Element, Element>();
    if (src && this.all.some((e) => e.nodeName === 'step')) {
      const byId = new Map<string, Element>();
      for (const e of this.all) { const id = e.getAttribute('id'); if (id && !byId.has(id)) byId.set(id, e); }
      for (const st of this.all) {
        if (st.nodeName !== 'step') continue;
        for (const id of (st.getAttribute('ReactionStepArrows') ?? '').split(/\s+/).filter(Boolean)) {
          let e = byId.get(id);
          const newer = e?.nodeName === 'graphic' ? e.getAttribute('SupersededBy') : null;
          if (newer) e = byId.get(newer);
          if (e?.nodeName === 'arrow' && !stepOf.has(e)) stepOf.set(e, st);
        }
      }
    }
    const rewriting = !src || this.changed;
    let items: Item[] | null = null;
    /** Every reaction arrow's roles as worked out, a row's first arrow going on from the row above. */
    let linked: Map<number, StepRoles> | null = null;
    const worked = (r: Arrow): StepRoles => {
      if (!linked) {
        items ??= schemeItems(doc, plainMeasure(doc));
        const all = [...doc.arrows.values()].filter(isReactionArrow).map((a) => ({ arrow: a, roles: a.step ?? interpretArrow(a, items!, doc.style.bondLength) }));
        linkRows(all, items);
        linked = new Map(all.map((x) => [x.arrow.id, x.roles]));
      }
      return linked.get(r.id) ?? interpretArrow(r, items!, doc.style.bondLength);
    };
    const steps: { arrow: Element; roles: StepRoles }[] = [];
    for (const r of doc.arrows.values()) {
      const e = this.source('r', r.id, ['arrow']) ?? this.findArrow(r.id);
      if (!e || !isReactionArrow(r)) continue;
      const old = stepOf.get(e);
      const o = this.orig<Arrow>('r', r.id);
      // a step from the file whose roles weren't changed stays exactly as ChemDraw wrote it
      if (old && o && r.step && deepEqual(r.step, o.step)) { this.fixStepArrow(old, e); this.fillAtomMap(old, r.step); continue; }
      if (!r.step && !rewriting && !old) continue;
      const roles = worked(r);
      if (!isStep(roles) && !r.step) {
        if (old) { old.parentNode?.removeChild(old); this.changed = true; }
        continue;
      }
      if (old) { this.fillStep(old, roles, e); continue; }
      steps.push({ arrow: e, roles });
    }
    if (!steps.length) return;
    // steps that share a structure (one's product is the next one's starting material) make one scheme
    const parent = steps.map((_, i) => i);
    const top = (i: number): number => (parent[i] === i ? i : (parent[i] = top(parent[i])));
    const owner = new Map<string, number>();
    steps.forEach(({ roles }, i) => {
      for (const ref of [...roles.reactants, ...roles.products]) {
        const k = this.stepRef(ref);
        if (!k) continue;
        const j = owner.get(k);
        if (j === undefined) owner.set(k, i);
        else parent[top(i)] = top(j);
      }
    });
    const schemes = new Map<number, Element>();
    steps.forEach(({ arrow, roles }, i) => {
      let sc = schemes.get(top(i));
      if (!sc) { sc = this.el('scheme', { id: this.id() }); this.page.appendChild(sc); schemes.set(top(i), sc); }
      const st = this.el('step', { id: this.id() });
      sc.appendChild(st);
      this.fillStep(st, roles, arrow);
    });
    this.changed = true;
  }

  /** A new arrow's element (written with the arrow's own id). */
  private findArrow(id: number): Element | null {
    for (const e of kids(this.page)) if (e.nodeName === 'arrow' && e.getAttribute('id') === String(id)) return e;
    return null;
  }

  /** The element id a role's reference becomes in the file. */
  private stepRef(ref: string): string | null {
    const id = Number(ref.slice(1));
    switch (ref[0]) {
      case 'a': return this.fragOfAtom.get(id)?.getAttribute('id') ?? null;
      case 'c': return this.doc.captions.has(id) ? this.source('c', id, ['t'])?.getAttribute('id') ?? String(id) : null;
      case 's': return this.doc.shapes.has(id) ? this.source('s', id, ['graphic', 'embeddedobject', 'table', 'group', 'curve'])?.getAttribute('id') ?? String(id) : null;
    }
    return null;
  }

  private fillStep(st: Element, roles: StepRoles, arrow: Element): void {
    const ids = (refs: string[] | undefined) => [...new Set((refs ?? []).map((r) => this.stepRef(r)).filter((x): x is string => !!x))].join(' ');
    const want: [string, string][] = [
      ['ReactionStepReactants', ids(roles.reactants)],
      ['ReactionStepProducts', ids(roles.products)],
      ['ReactionStepPlusses', ids(roles.plusses)],
      ['ReactionStepArrows', this.arrowRef(arrow)],
      ['ReactionStepObjectsAboveArrow', ids(roles.above)],
      // a cycle's step names count as below the arrow in ChemDraw; a tag says which they are
      ['ReactionStepObjectsBelowArrow', ids([...(roles.inside ?? []), ...roles.below])],
    ];
    for (const [k, v] of want) {
      if ((st.getAttribute(k) ?? '') === v) continue;
      this.set(st, k, v);
      this.changed = true;
    }
    this.fillAtomMap(st, roles);
    const inside = ids(roles.inside);
    const tag = kids(st).find((c) => c.nodeName === 'objecttag' && c.getAttribute('Name') === INSIDE_TAG);
    if ((tag?.getAttribute('Value') ?? '') === inside) return;
    if (tag) st.removeChild(tag);
    if (inside) st.appendChild(this.el('objecttag', { TagType: 'String', Name: INSIDE_TAG, Value: inside, Visible: 'no' }));
    this.changed = true;
  }

  /**
   * Atom-atom map numbers (Atom.mapNo) as ChemDraw keeps them on the step: pairs of a reactant's
   * atom and the product atom with the same number (set by hand, so also as the manual map).
   * Left as the file has them while the pairs are the same.
   */
  private fillAtomMap(st: Element, roles: StepRoles): void {
    const atomsOf = (refs: string[]): Atom[] => {
      const frags = new Set(refs.filter((r) => r[0] === 'a').map((r) => this.fragOfAtom.get(Number(r.slice(1)))).filter(Boolean));
      return frags.size ? [...this.doc.atoms.values()].filter((a) => frags.has(this.fragOfAtom.get(a.id))) : [];
    };
    const products = new Map<number, Atom>();
    for (const a of atomsOf(roles.products)) if (a.mapNo && !products.has(a.mapNo)) products.set(a.mapNo, a);
    const pairs: string[] = [];
    for (const a of atomsOf(roles.reactants)) {
      const p = a.mapNo ? products.get(a.mapNo) : undefined;
      if (p) pairs.push(`${this.nodeId(a.id)} ${this.nodeId(p.id)}`);
    }
    const asSet = (v: string | null) => { const x = (v ?? '').trim().split(/\s+/).filter(Boolean), out: string[] = []; for (let i = 0; i + 1 < x.length; i += 2) out.push(`${x[i]} ${x[i + 1]}`); return out.sort().join('|'); };
    const had = st.getAttribute('ReactionStepAtomMap') ?? [st.getAttribute('ReactionStepAtomMapManual'), st.getAttribute('ReactionStepAtomMapAuto')].filter(Boolean).join(' ');
    if (asSet(had) === [...pairs].sort().join('|')) return;
    this.set(st, 'ReactionStepAtomMap', pairs.join(' ') || null);
    this.set(st, 'ReactionStepAtomMapManual', pairs.join(' ') || null);
    st.removeAttribute('ReactionStepAtomMapAuto');
    this.changed = true;
  }

  /** How a step names its arrow: ChemDraw names the older copy it keeps for old versions, when there is one. */
  private arrowRef(arrow: Element): string {
    const legacy = this.legacyOf(arrow).find((g) => g.parentNode);
    return (legacy ?? arrow).getAttribute('id') ?? '';
  }

  /** A kept step still names its arrow after the arrow was redrawn. */
  private fixStepArrow(st: Element, arrow: Element): void {
    const ids = (st.getAttribute('ReactionStepArrows') ?? '').split(/\s+/).filter(Boolean);
    const here = new Set([arrow.getAttribute('id'), ...this.legacyOf(arrow).filter((g) => g.parentNode).map((g) => g.getAttribute('id'))]);
    if (ids.some((x) => here.has(x))) return;
    this.set(st, 'ReactionStepArrows', this.arrowRef(arrow));
    this.changed = true;
  }

  // ------------------------------------------------------------------ tidy references

  /** Drop references to objects that no longer exist (reaction steps, charge symbols, empty groups). */
  /**
   * Groups (Format > Group) as ChemDraw's group elements on the page: each group's structures,
   * captions, arrows and shapes inside one group element. A file's own group is kept while it
   * holds just its members; things taken out of a group go back onto the page.
   */
  /** The element written for a thing: a structure's fragment for an atom. */
  private elementOf(kind: Kind, id: number, ided: (id: number, names: string[]) => Element | null): Element | null {
    if (kind === 'a') return this.fragOfAtom.get(id) ?? null;
    const names = kind === 'c' ? ['t'] : kind === 'r' ? ['arrow', 'graphic', 'curve'] : ['graphic', 'embeddedobject', 'table', 'group', 'curve'];
    return this.source(kind, id, names) ?? (kind === 'r' ? this.findArrow(id) : null) ?? ided(id, names);
  }

  /**
   * Looks up page elements by name and id, built the first time it is asked (only when something
   * isn't found where it was read). By name too, since ids repeat across kinds of element and the
   * font table numbers its fonts from the same small numbers.
   */
  private idedFinder(): (id: number, names: string[]) => Element | null {
    let byId: Map<string, Element> | null = null;
    return (id, names) => {
      if (!byId) {
        byId = new Map();
        for (const e of descendants(this.page)) { const k = e.getAttribute('id'); if (k && !byId.has(`${e.nodeName}:${k}`)) byId.set(`${e.nodeName}:${k}`, e); }
      }
      for (const n of names) { const e = byId.get(`${n}:${id}`); if (e) return e; }
      return null;
    };
  }

  /**
   * The drawing order set with Format > Order (issue #406): each object's place as ChemDraw's Z,
   * and a tag on the page so this program reads the order back. True when anything changed.
   */
  private writeStack(): boolean {
    const doc = this.doc;
    // (the order was read from the file's own Z, so it says so already)
    if (this.unchangedSinceRead()) return false;
    const on = usesStacking(doc);
    let changed = this.pageTag(STACK_TAG, on ? '1' : null);
    if (!on) return changed;
    const ided = this.idedFinder();
    const done = new Set<Element>();
    const kindOf = { shape: 's', structure: 'a', arrow: 'r', caption: 'c' } as const;
    // ChemDraw paints in file order and takes no notice of Z, so what is on the page goes in this
    // order too (a group by its backmost member)
    const place = new Map<Element, number>();
    let next = 0;
    const setZ = (e: Element) => { const z = String(++next); if (e.getAttribute('Z') !== z) { e.setAttribute('Z', z); changed = true; } };
    stackItems(doc).forEach((it, i) => {
      for (const id of it.ids) {
        const e = this.elementOf(kindOf[it.kind], id, ided);
        if (!e || done.has(e)) continue;
        done.add(e);
        setZ(e);
        if (it.kind === 'structure' && e.nodeName === 'fragment') {
          // ChemDraw layers a structure's bonds and atoms by their own Z (none counts as the very
          // back), so they follow the fragment's: bonds in their crossing order, then atoms and marks
          const ks = kids(e);
          const bonds = ks.filter((k) => k.nodeName === 'b').map((k, j) => ({ k, j, z: Number(k.getAttribute('Z')) }));
          bonds.sort((x, y) => (isFinite(x.z) && isFinite(y.z) ? x.z - y.z : 0) || x.j - y.j);
          for (const { k } of bonds) setZ(k);
          for (const k of ks) if (k.nodeName === 'n' || k.nodeName === 'graphic') setZ(k);
        }
        let top: Element | null = e;
        while (top && top.parentNode !== this.page) top = top.parentElement;
        if (top && !place.has(top)) place.set(top, i);
      }
    });
    const onPage = kids(this.page).filter((k) => place.has(k));
    const wanted = [...onPage].sort((a, b) => place.get(a)! - place.get(b)!);
    if (wanted.some((e, i) => e !== onPage[i])) {
      // (in the places they took, so anything else on the page keeps its own)
      const marks = onPage.map((e) => { const m = this.x.createComment(''); this.page.replaceChild(m, e); return m; });
      marks.forEach((m, i) => this.page.replaceChild(wanted[i], m));
      changed = true;
    }
    return changed;
  }

  /**
   * ChemDraw objects this program keeps but doesn't show (plain bracketed groups, chemical
   * properties), for a drawing written afresh (a copy): each one with its ids pointed at the
   * things written now. A name whose thing is gone is dropped, and the object too when nothing
   * it names is left. (A file saved in place still holds them where they were.)
   */
  private writeKept(): void {
    if (!this.doc.kept.length) return;
    const ided = this.idedFinder();
    const idOf = (key: string): string | null => {
      const frag = key.startsWith('frag:');
      const k = frag ? key.slice(5) : key;
      const kind = k[0] as Kind, id = Number(k.slice(1));
      if (!Number.isInteger(id)) return null;
      if (frag) return kind === 'a' ? this.fragOfAtom.get(id)?.getAttribute('id') ?? null : null;
      if (kind === 'a') return this.doc.atoms.has(id) ? this.nodeId(id) : null;
      if (kind === 'b') return this.bondEls.get(id)?.getAttribute('id') ?? null;
      if (kind !== 'c' && kind !== 'r' && kind !== 's') return null;
      if (!(kind === 'c' ? this.doc.captions : kind === 'r' ? this.doc.arrows : this.doc.shapes).has(id)) return null;
      const e = this.elementOf(kind, id, ided);
      return e && this.page.contains(e) ? e.getAttribute('id') : null;
    };
    for (const k of this.doc.kept) {
      let el: Element;
      try {
        const x = new DOMParser().parseFromString(k.xml, 'application/xml');
        if (x.getElementsByTagName('parsererror').length) continue;
        el = this.x.importNode(x.documentElement, true) as Element;
      } catch {
        continue;
      }
      // its names, pointed at what is written now; true when something it names is left
      const repoint = (e: Element): boolean => {
        let named = false, any = false;
        for (const at of Array.from(e.attributes)) {
          if (!REF_ATTR.test(at.name)) continue;
          any = true;
          const ids = at.value.trim().split(/\s+/).filter(Boolean).map((t) => (k.refs[t] ? idOf(k.refs[t]) : null)).filter((v): v is string => !!v);
          if (ids.length) { e.setAttribute(at.name, [...new Set(ids)].join(' ')); named = true; } else e.removeAttribute(at.name);
        }
        return named || !any;
      };
      if (!repoint(el)) continue;
      // a calculated property shows its value in a caption: without the caption it is dropped
      if (el.nodeName === 'chemicalproperty' && !el.hasAttribute('ChemicalPropertyDisplayID')) continue;
      for (const c of descendants(el)) if (c !== el && c.parentNode && !repoint(c)) c.parentNode.removeChild(c);
      for (const c of [el, ...descendants(el)]) if (c.hasAttribute('id')) c.setAttribute('id', String(this.id()));
      this.page.appendChild(el);
      this.changed = true;
    }
  }

  private writeGroups(): void {
    const doc = this.doc;
    const ided = this.idedFinder();
    const elementOf = (kind: Kind, id: number): Element | null => this.elementOf(kind, id, ided);
    const plain = (g: Element | null): g is Element => !!g && g.nodeName === 'group'
      && !kids(g).some((k) => k.nodeName === 'table' || (k.nodeName === 'objecttag' && k.getAttribute('Name') === GEO_TAG));
    // the element that sits on the page (or in a group) for a thing: a structure's fragment, a symbol's too
    const topOf = (e: Element): Element => {
      let t = e;
      while (t.parentElement && t.parentElement !== this.page && !plain(t.parentElement)) t = t.parentElement;
      return t;
    };
    const wanted = new Map<Element, number | undefined>();
    // the groups inside the group, as ChemDraw nested them (only while the outer group is still the one read)
    const nesting = new Map<Element, number[]>();
    const note = (kind: Kind, id: number, grp: number | undefined, path: number[] | undefined) => {
      const e = elementOf(kind, id);
      // (only things on the page can be grouped)
      if (!e || e === this.page || !this.page.contains(e)) return;
      const t = topOf(e);
      if (!wanted.has(t) || grp !== undefined) wanted.set(t, grp);
      if (grp !== undefined && path && path.length > 1 && path[0] === grp && !nesting.has(t)) nesting.set(t, path.slice(1));
    };
    for (const a of doc.atoms.values()) note('a', a.id, a.grp, a.grpPath);
    for (const c of doc.captions.values()) note('c', c.id, c.grp, c.grpPath);
    for (const r of doc.arrows.values()) note('r', r.id, r.grp, r.grpPath);
    for (const s of doc.shapes.values()) note('s', s.id, s.grp, s.grpPath);
    const members = new Map<number, Element[]>();
    for (const [e, g] of wanted) {
      if (g === undefined) {
        // out of any group it was in
        if (plain(e.parentElement)) { this.page.appendChild(e); this.changed = true; }
        continue;
      }
      let list = members.get(g);
      if (!list) members.set(g, (list = []));
      list.push(e);
    }
    // a file's group is kept while it holds just the group's members, at any depth: ChemDraw nests
    // groups (a group of groups), which this program keeps as one group, so the groups inside are
    // left as they are
    const outerOf = (e: Element): Element | null => {
      let o: Element | null = null;
      for (let p = e.parentElement; p && p !== this.page; p = p.parentElement) if (plain(p)) o = p;
      return o;
    };
    const leaves = (g: Element, out: Element[] = []): Element[] => {
      for (const k of kids(g)) {
        // (the old graphic ChemDraw keeps beside an arrow is no member of its own)
        if (k.nodeName === 'objecttag' || k.hasAttribute('SupersededBy')) continue;
        if (plain(k)) leaves(k, out); else out.push(k);
      }
      return out;
    };
    for (const list of members.values()) {
      const outer = outerOf(list[0]);
      const kept = !!outer && list.every((e) => outerOf(e) === outer) && (() => {
        const ls = leaves(outer);
        return ls.length === new Set(list).size && ls.every((k) => list.includes(k));
      })();
      if (kept) continue;
      const g = this.el('group', { id: this.id() });
      // where the first member's old group was (not inside it: that is emptied and dropped)
      const at = outer ?? list[0];
      at.parentNode!.insertBefore(g, at);
      // groups inside it, rebuilt as they were read (a member's place is its path inside the group)
      const inner = new Map<string, Element>();
      const holder = (path: number[]): Element => {
        let at = g;
        for (let i = 1; i <= path.length; i++) {
          const key = path.slice(0, i).join(' ');
          let sub = inner.get(key);
          if (!sub) { sub = this.el('group', { id: this.id() }); at.appendChild(sub); inner.set(key, sub); }
          at = sub;
        }
        return at;
      };
      for (const e of list) {
        const into = holder(nesting.get(e) ?? []);
        into.appendChild(e);
        // an arrow's old graphic goes with it: left behind, ChemDraw draws the arrow twice
        if (e.nodeName === 'arrow') for (const old of this.legacyOf(e)) into.appendChild(old);
      }
      this.changed = true;
    }
  }

  /**
   * Auto-Animate Steps' pieces (things marked to move together in the slide show) in a hidden tag
   * on each thing's element, so a scheme built up step by step keeps its steps through CDXML and
   * PowerPoint (whose drawings are CDXML) and back.
   */
  private writePieces(): void {
    const doc = this.doc;
    const ided = this.idedFinder();
    const put = (kind: Kind, id: number, names: string[], piece: number | undefined) => {
      const was = this.orig<{ piece?: number } & Entity>(kind, id)?.piece;
      if (piece === undefined && was === undefined) return;
      const e = this.source(kind, id, names) ?? (kind === 'r' ? this.findArrow(id) : null) ?? ided(id, names);
      if (!e || !names.includes(e.nodeName)) return;
      const old = kids(e).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === PIECE_TAG);
      const want = piece !== undefined ? String(piece) : null;
      if ((old?.getAttribute('Value') ?? null) === want) return;
      if (old) e.removeChild(old);
      if (want !== null) e.appendChild(this.el('objecttag', { TagType: 'String', Name: PIECE_TAG, Value: want, Visible: 'no' }));
      this.changed = true;
    };
    for (const a of doc.atoms.values()) put('a', a.id, ['n'], a.piece);
    for (const c of doc.captions.values()) put('c', c.id, ['t'], c.piece);
    for (const r of doc.arrows.values()) put('r', r.id, ['arrow', 'graphic'], r.piece);
    for (const s of doc.shapes.values()) put('s', s.id, ['graphic', 'embeddedobject', 'table', 'group', 'curve'], s.piece);
  }

  private cleanUp(): void {
    if (!this.changed) return;
    const all = descendants(this.root);
    const named = (name: string) => all.filter((e) => e.nodeName === name);
    const refs = named('step').length + named('represent').length + named('crossingbond').length + named('chemicalproperty').length + named('bracketedgroup').length;
    const ids = new Set<string>();
    if (refs) for (const e of all) { const id = e.getAttribute('id'); if (id) ids.add(id); }
    for (const st of named('step')) {
      for (const at of Array.from(st.attributes)) {
        if (!at.name.startsWith('ReactionStep')) continue;
        const list = at.value.trim().split(/\s+/).filter(Boolean);
        if (at.name === 'ReactionStepAtomMap') { if (list.some((x) => !ids.has(x))) st.removeAttribute(at.name); continue; }
        const kept = list.filter((x) => ids.has(x));
        if (kept.length !== list.length) this.set(st, at.name, kept.join(' '));
      }
    }
    // a step whose arrow is gone, and a scheme with no steps left
    for (const st of named('step')) if (!(st.getAttribute('ReactionStepArrows') ?? '').trim()) st.parentNode?.removeChild(st);
    for (const sc of named('scheme')) if (!sc.firstElementChild) sc.parentNode?.removeChild(sc);
    for (const r of named('represent')) if (!ids.has(r.getAttribute('object') ?? '')) r.parentNode?.removeChild(r);
    for (const c of named('crossingbond')) if (!ids.has(c.getAttribute('BondID') ?? '')) c.parentNode?.removeChild(c);
    // a calculated property (ChemDraw's formula or mass under a structure): gone with its text, its
    // list trimmed to what is left, and gone with the last of it
    const trim = (e: Element, name: string): number => {
      const list = (e.getAttribute(name) ?? '').trim().split(/\s+/).filter(Boolean);
      const kept = list.filter((x) => ids.has(x));
      if (kept.length !== list.length) this.set(e, name, kept.join(' '));
      return kept.length;
    };
    for (const p of named('chemicalproperty')) {
      const shown = p.getAttribute('ChemicalPropertyDisplayID');
      if ((shown && !ids.has(shown)) || (p.hasAttribute('BasisObjects') && !trim(p, 'BasisObjects'))) p.parentNode?.removeChild(p);
    }
    // a bracketed group (ChemDraw's own, as well as the repeat groups written here): its brackets
    // that are gone, and the group when nothing it holds is left
    for (const bg of named('bracketedgroup')) {
      for (const a of kids(bg)) if (a.nodeName === 'bracketattachment' && !ids.has(a.getAttribute('GraphicID') ?? '')) bg.removeChild(a);
      if (bg.hasAttribute('BracketedObjectIDs') && !trim(bg, 'BracketedObjectIDs')) bg.parentNode?.removeChild(bg);
    }
    // (inner ones first, so a group left holding only empty groups goes too)
    for (const g of named('group').reverse()) if (!g.firstElementChild) g.parentNode?.removeChild(g);
    for (const f of named('fragment')) {
      if (f.parentElement?.nodeName === 'n') continue;
      // a structure with nothing left in it (ChemDraw also keeps lone charge symbols in fragments)
      if (!kids(f).some((c) => c.nodeName === 'n' || c.nodeName === 'graphic')) f.parentNode?.removeChild(f);
    }
  }
}

// ------------------------------------------------------------------ helpers

const DISPLAY: Partial<Record<Bond['display'], string>> = {
  wedge: 'WedgeBegin', hashWedge: 'WedgedHashBegin', hash: 'Hash', bold: 'Bold', dash: 'Dash', wavy: 'Wavy',
  hollowWedge: 'HollowWedgeBegin',
};

/** UTF-8 byte offset of the end of each line (after its line break), as CDXML LineStarts. */
/** Length of a text in UTF-8 bytes (how CDXML counts line starts). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function lineEnds(text: string): number[] {
  const out: number[] = [];
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (ch === '\n') out.push(bytes);
  }
  if (!out.length || out[out.length - 1] !== bytes) out.push(bytes);
  return out;
}

function orderAttr(order: number): string | null {
  return order === 1 ? null : String(order);
}

/**
 * A label's text as runs: formula style (ChemDraw lowers the counts itself), with R numbers
 * raised when the label shows them so and characters raised, lowered or kept on the line by hand.
 */
export function labelRuns(text: string, look: { supDigits: boolean; marks?: string }): TextRun[] {
  const digits = look.supDigits ? /\d+$/.exec(text) : null;
  const out: TextRun[] = [];
  [...text].forEach((ch, i) => {
    const m = look.marks?.[i];
    const base: TextRun = m === '^' || m === '*' ? { text: ch, sup: true } : m === '_' || m === ',' ? { text: ch, sub: true } : m === '=' ? { text: ch } : digits && i >= digits.index ? { text: ch, sup: true } : { text: ch, formula: true };
    // the t of tBu in italics (the alkyl look)
    const r: TextRun = m === '/' || m === '*' || m === ',' ? { ...base, italic: true } : m === '!' ? { text: ch, bold: true } : base;
    const last = out[out.length - 1];
    if (last && !!last.sup === !!r.sup && !!last.sub === !!r.sub && !!last.formula === !!r.formula && !!last.italic === !!r.italic && !!last.bold === !!r.bold) last.text += ch;
    else out.push(r);
  });
  return out.length ? out : [{ text, formula: true }];
}

function faceOf(r: TextRun): number | null {
  return faceFromStyle(r);
}

function nums(v: string | null): number[] {
  return v ? v.trim().split(/\s+/).map(Number) : [];
}

function rgbHex(c: Element): string {
  const h = (k: string) => Math.round(Math.max(0, Math.min(1, Number(c.getAttribute(k) ?? 0))) * 255).toString(16).padStart(2, '0');
  return '#' + h('r') + h('g') + h('b');
}

/** Move an element and everything inside it. */
function shift(e: Element, dx: number, dy: number): void {
  if (!dx && !dy) return;
  for (const name of POSITION_ATTRS) {
    const v = e.getAttribute(name);
    if (v === null) continue;
    const n = nums(v);
    const is3D = name.endsWith('3D');
    const out = n.map((x, i) => (is3D ? (i % 3 === 0 ? x + dx : i % 3 === 1 ? x + dy : x) : i % 2 === 0 ? x + dx : x + dy));
    e.setAttribute(name, out.map((x, i) => (is3D && i % 3 === 2 ? String(x) : f2(x))).join(' '));
  }
  for (const c of kids(e)) shift(c, dx, dy);
}

/** Are two entities equal, ignoring the listed fields? */
/** Attributes that name other objects by id (in kept ChemDraw objects: BracketedObjectIDs, BasisObjects, GraphicID…). */
export const REF_ATTR = /(ID|IDs|Objects)$/;

/** What a closed curve can hold: a path shape with any other setting is written as a design shape. */
const PATH_CURVE_KEYS = new Set(['id', 'grp', 'grpPath', 'stack', 'piece', 'kind', 'geo', 'x1', 'y1', 'x2', 'y2', 'color', 'z', 'filled', 'dashed', 'bold', 'lineWidth']);

function sameExcept(a: object, b: object, skip: string[]): boolean {
  // (which group a thing is in is written by writeGroups, as the file's group elements)
  const ka = Object.keys(a).filter((k) => k !== 'grp' && !skip.includes(k) && (a as any)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => k !== 'grp' && !skip.includes(k) && (b as any)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual((a as any)[k], (b as any)[k])) return false;
  return true;
}

function deepEqual(x: unknown, y: unknown): boolean {
  if (x === y) return true;
  if (typeof x !== 'object' || typeof y !== 'object' || !x || !y) return false;
  if (Array.isArray(x) !== Array.isArray(y)) return false;
  const kx = Object.keys(x).filter((k) => (x as any)[k] !== undefined), ky = Object.keys(y).filter((k) => (y as any)[k] !== undefined);
  if (kx.length !== ky.length) return false;
  return kx.every((k) => deepEqual((x as any)[k], (y as any)[k]));
}

/** The box round `r` turned `deg` degrees (clockwise on the page) about `at`. */
function turnedBox(r: Rect, at: Vec, deg: number): Rect {
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const ps = [[r.x1, r.y1], [r.x2, r.y1], [r.x2, r.y2], [r.x1, r.y2]].map(([x, y]) => ({
    x: at.x + (x - at.x) * cos - (y - at.y) * sin, y: at.y + (x - at.x) * sin + (y - at.y) * cos,
  }));
  return { x1: Math.min(...ps.map((p) => p.x)), y1: Math.min(...ps.map((p) => p.y)), x2: Math.max(...ps.map((p) => p.x)), y2: Math.max(...ps.map((p) => p.y)) };
}
