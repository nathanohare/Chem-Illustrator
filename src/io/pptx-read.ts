// Opening PowerPoint files (.pptx) as slides, from the published Office Open XML standard
// (ECMA-376, PresentationML).
//
// Files saved here come back exactly: structures from the drawing each picture carries, text
// from the settings each text box carries (unless it was changed in PowerPoint, when the
// PowerPoint text is used), and the slide master from its settings. Files from PowerPoint
// come in as editable text (with its formatting, worked out the way PowerPoint does, through
// the slide's layout, master and theme), pictures (with their cropping), and boxes, ovals,
// lines, arrows and tables. What has no place here yet (charts, rotated things) is noted in
// warnings, never refused.

import { drawingInSvg, mergeDrawing, olePrint, picturePrint, type KeptOle, type KeptPicture } from './ole-kept';
import type { Selection } from '../editor/arrange';
import { fillFrameMembers } from '../editor/frames';
import { restoreSteps } from './step-tag';
import { fromDataUrl } from '../render/images';
import type { PinnedComment } from '../document/comments';
import { COMMENT_REL, readCommentAuthors, readLegacyComments, readModernComments } from './pptx-comments';
import { Doc, Caption, Shape, TextRun, ParaStyle, Arrow, Contents, Placeholder, Justify, stripBase, type TableCell, type TableData, type PictureFx, type BackgroundRemoval, type PictureLook, type Frame, type ShapeMath, type Media, type OleMark } from '../model';
import { layoutTable, NOTE_SCALE } from '../table';
import { PPT_STYLE_IDS, slideCellLook, unstyledRuns } from '../deck/table-styles';
import { linesFromBorders, type Borders } from './cdxml-table';
import { turnAbout, normDegrees, DEG, type Vec, type Rect } from '../geom';
import { POINTS, rotation, snapshot, transform, mirrorX, mirrorY } from '../editor/arrange';
import { BULLETS, autoNumLabel, listInfo } from '../text/paragraphs';
import { PackageReader, NS, REL, kids, kid, rAttr, fromEmu, bytesHash } from './ooxml';
import { SLIDE_SIZE_TYPES } from '../deck/deck';
import { readKeptParts, elementXml, type KeptParts } from './kept-parts';
import { linkFromTarget, officeTarget, slideOfLink } from '../links';
import { readCdxml } from './cdxml';
import { cdxToCdxml, isCdx } from './cdx';
import { chemdrawInObject, isChemDraw, CHEMDRAW_PROG } from './ole-object';
import { fitPasted, typicalBondLength } from './fit-drawing';
import type { DocStyle } from '../style';
import { drawingInEmf } from '../render/emf';
import { dataUrl, imageSize } from '../render/images';
import { knownShape, tidyFx } from '../render/picture-fx';
import { applyColorMods, dmlFraction, hslHex, linearHex } from './dml-color';
import { readPictureFx } from './picture-xml';
import { layoutText, caretPos, ASCENT } from '../text/layout';
import { Master, SlideSize, LayoutId, type TemplateArt, type ArtLayer, type KeptRel, type KeptXmlPart, type NotesKept, defaultMaster, textStyles, slideDrawingStyle, slideBackground, slideColours, hasLayout, newLayoutId, deckLayouts, type LayoutDef, type PlaceholderBox, type SectionCount, type DeckSettings, type SlideHF, type DateFormat, showsNumber, showsFooter, showsDate } from '../deck/deck';
import { backgroundColour, isPlain, sameBackground, type Background } from '../deck/background';
import { readFill, readOneFill, type FillContext } from './pptx-background';
import { TAG, PPT_ASCENT, MIME_EXT, arialMeasure, NS_A14, NS_M, swapBox, tableLookKey, savedTableLook } from './pptx-write';
import { ommlToTex, toOmml } from '../document/math';
import { shapeMathPicture, shapeMathSize } from '../deck/equation';
import { GEOS } from '../design/geo';
import { cleanDiagram, textFromShapes } from '../design/diagrams';
import { crystalSrc, type PlateData } from '../design/plates';
import { gluePoint, arrowPoints, boxOf as pointsBox } from '../objects';
import { stackAsRead, type StackItem } from '../editor/stacking';
import { roughBox } from '../deck/split-slide';
import { readEffects } from './pptx-effects';
import { readViewProps, readSlideGuides } from '../deck/guides';
import { readMasterHF } from '../deck/notes-pages';
import { readShowPr, readCustShows } from '../deck/show-setup';
import { NARRATION_NAME } from '../deck/narration';
import { readTransition, readTiming, readMediaTiming, type Transition, type Anim, type AnimTarget } from '../deck/animation';
import { mediaMime } from '../deck/media';
import { readChart } from './office-chart';
import { freshBox, sameBoxData, sizedBox, type ChartBox } from '../sheet/chart-box';
import { chartBoxPng } from '../render/chart-box-paint';
import { canvasTag, readCanvasTag, withCameraMoves, type CanvasData } from '../deck/canvas';
import { slidePrint, type CanvasKeep } from '../deck/canvas-export';
import { textPrint, spPrPrint, slideTablePrint } from './native-print';
import { applyStyle, sliceRuns } from '../richtext';
import { cleanDeckRefs, cleanSlideRefs, type DeckRefs, type SlideRefs } from '../deck/slide-refs';

/** PowerPoint's shapes that are shapes in the library, by PowerPoint's name. */
const GEO_BY_PRST = new Map(GEOS.filter((g) => g.prst).map((g) => [g.prst!, g.id]));
/** PowerPoint shapes that come into slides as plain boxes and ovals (with their text beside them as text boxes). */
const PLAIN_PRST = new Set(['rect', 'roundRect', 'ellipse', 'snip1Rect', 'flowChartProcess', 'flowChartAlternateProcess']);

export interface PptxSlide extends SlideRefs { layout: LayoutId; contents: Contents; notes: string; notesKept?: NotesKept; transition?: Transition; anims?: Anim[]; comments?: PinnedComment[]; background?: Background; hideGraphics?: boolean; hidden?: boolean; hf?: SlideHF; canvas?: CanvasData }

/** How a slide made from a canvas slide's keyframe was marked when saved, and the print of what it holds now. */
interface PartRead { uid: string; index: number; count: number; print: string; now: string; keep?: CanvasKeep }

/**
 * Reading a file: a canvas slide saved as a slide for each keyframe comes back as the canvas
 * (`canvas`), or, for canvases whose slides PowerPoint changed, as those slides (`slides`).
 */
export interface PptxReadOptions { edited?: 'canvas' | 'slides' }
export interface PptxRead {
  size: SlideSize;
  master: Master;
  slides: PptxSlide[];
  /** Things that came in differently or not at all (shown to the person, never blocking). */
  warnings: string[];
  /** Saved from Design mode (opens there again). */
  design: boolean;
  /** The deck's sections, in order (none when the file has none). */
  sections?: SectionCount[];
  /** Set Up Show, and custom shows (naming their slides by their places in the deck). */
  settings?: DeckSettings;
  /** Canvas slides whose keyframes' slides were changed outside (in PowerPoint) since they were saved here. */
  canvasEdited?: number;
  /** Other programs' data in the file (custom XML, custom properties, add-ins' settings), to save back. */
  kept?: KeptParts;
  /** ChemDraw objects as the file has them (by OleMark id), to save back while they stay unchanged. */
  oleKept?: Map<number, KeptOle>;
  /** Structure pictures saved here, as the file has them (by picturePrint), to save back while their structures stay unchanged. */
  picKept?: Map<string, KeptPicture>;
}

/** A plain box or oval that needs a design shape to keep its look: a picture or gradient fill, or effects past a shadow. */
function fancyFill(spPr: Element | null): boolean {
  return !!(kid(spPr, 'blipFill') || kid(spPr, 'gradFill') || kid(spPr, 'sp3d', 'bevelT') || kids(kid(spPr, 'effectLst')).some((k) => k.localName !== 'outerShdw')) || fillClear(spPr) > 0;
}

/** How see-through a shape's plain fill is (its colour's alpha, as Format Shape's Transparency sets it): 0 when solid. */
function fillClear(spPr: Element | null): number {
  const c = kids(kid(spPr, 'solidFill')).find((k) => /Clr$/.test(k.localName)) ?? null;
  const a = kid(c, 'alpha')?.getAttribute('val');
  const v = a == null ? 1 : Number(a) / 100000;
  return Number.isFinite(v) && v < 1 ? +(1 - Math.max(0, v)).toFixed(3) : 0;
}

const EXT_MIME: Record<string, string> = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]));
EXT_MIME.jpg = 'image/jpeg';
EXT_MIME.tif = 'image/tiff';

/** Picture types a web page can show. */
export { imageSize };

/** Picture types a web page can show. */
export const SHOWABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/bmp', 'image/webp', 'image/x-emf']);

// ---------------------------------------------------------------- positions

/** A picture's image (as a data URL), its size in pixels, its cropping, and how far in from each side of its box it sits (fractions of the box). */
interface BlipImage { src: string; px: { w: number; h: number }; crop: Shape['crop'] | null; mime: string; inset?: { l: number; t: number; r: number; b: number } }

/** A picture's box with its insets taken off. */
function inBox<B extends Rect>(box: B, inset: BlipImage['inset']): B {
  if (!inset) return box;
  const w = box.x2 - box.x1, h = box.y2 - box.y1;
  return { ...box, x1: box.x1 + inset.l * w, x2: box.x2 - inset.r * w, y1: box.y1 + inset.t * h, y2: box.y2 - inset.b * h };
}

/** Where a shape's own coordinates land on the slide (groups scale and move what they hold). */
interface Xf { sx: number; sy: number; tx: number; ty: number }
const IDENTITY: Xf = { sx: 1, sy: 1, tx: 0, ty: 0 };
const apply = (t: Xf, x: number, y: number): Vec => ({ x: t.tx + t.sx * x, y: t.ty + t.sy * y });

/** The box of a shape (its a:xfrm or p:xfrm), in points on the slide. */
function boxOf(xfrmEl: Element | null, t: Xf): (Rect & { rot: number; flipH: boolean; flipV: boolean }) | null {
  const off = kid(xfrmEl, 'off'), ext = kid(xfrmEl, 'ext');
  if (!off || !ext) return null;
  const a = apply(t, fromEmu(off.getAttribute('x')), fromEmu(off.getAttribute('y')));
  const w = fromEmu(ext.getAttribute('cx')) * t.sx, h = fromEmu(ext.getAttribute('cy')) * t.sy;
  return {
    x1: a.x, y1: a.y, x2: a.x + w, y2: a.y + h,
    rot: Number(xfrmEl!.getAttribute('rot') ?? 0) / 60000,
    flipH: xfrmEl!.getAttribute('flipH') === '1', flipV: xfrmEl!.getAttribute('flipV') === '1',
  };
}

// ---------------------------------------------------------------- colours

interface Theme { colors: Record<string, string>; major: string; minor: string }

const PRESET: Record<string, string> = {
  black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00',
  gray: '808080', grey: '808080', darkGray: 'A9A9A9', lightGray: 'D3D3D3', orange: 'FFA500', purple: '800080',
};

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.padStart(6, '0').slice(-6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** The colour in a fill or colour element (srgbClr, schemeClr…, with its changes: lighter, darker, more saturated…). */
function colorIn(el: Element | null, theme: Theme, clrMap: Record<string, string>, ph: string | null = null): string | null {
  if (!el) return null;
  const c = kids(el).find((k) => /Clr$/.test(k.localName));
  if (!c) return null;
  const v = c.getAttribute('val') ?? '';
  let hex: string | null = null;
  switch (c.localName) {
    case 'srgbClr': hex = v; break;
    // (phClr: the colour a theme's fill style is used with)
    case 'schemeClr': hex = v === 'phClr' ? ph : theme.colors[clrMap[v] ?? v] ?? null; break;
    case 'prstClr': hex = PRESET[v] ?? '000000'; break;
    case 'sysClr': hex = c.getAttribute('lastClr') ?? (v === 'window' ? 'FFFFFF' : '000000'); break;
    case 'scrgbClr': hex = linearHex(dmlFraction(c.getAttribute('r')), dmlFraction(c.getAttribute('g')), dmlFraction(c.getAttribute('b'))); break;
    case 'hslClr': hex = hslHex(Number(c.getAttribute('hue') ?? 0), dmlFraction(c.getAttribute('sat')), dmlFraction(c.getAttribute('lum'))); break;
    default: return null;
  }
  if (!hex) return null;
  return applyColorMods(hex, kids(c));
}

/** A styled table read back: cell fills and text colours that only repeat its style are dropped. */
function unstyle(t: TableData): TableData {
  if (!slideCellLook(t, 0, 0)) return t;
  const rows = t.rows.map((row, r) => row.map((cell, c) => {
    const look = slideCellLook(t, r, c);
    const out: TableCell = { ...cell, runs: unstyledRuns(cell.runs, look) };
    if (out.fill && look?.fill && out.fill.toLowerCase() === look.fill.toLowerCase()) delete out.fill;
    return out;
  }));
  return { ...t, rows };
}

// ---------------------------------------------------------------- text formatting, as PowerPoint inherits it

/** List styles to look through, most specific first (the shape's own, its layout's, its master's, the defaults). */
type Chain = (Element | null)[];

const lvlOf = (lst: Element | null, lvl: number) => kid(lst, `lvl${lvl + 1}pPr`);

/** The first value an attribute has along the chain (the run or paragraph first, then each level). */
function inherit(own: Element | null, chain: Chain, lvl: number, get: (el: Element) => string | null, deep = false): string | null {
  const v = own ? get(own) : null;
  if (v !== null) return v;
  for (const lst of chain) {
    const l = lvlOf(lst, lvl);
    if (!l) continue;
    const x = get(deep ? kid(l, 'defRPr') ?? l : l);
    if (x !== null) return x;
  }
  return null;
}

/** The first element of a kind along the chain (bullet, spacing). */
function inheritEl(own: Element | null, chain: Chain, lvl: number, names: string[], deep = false): Element | null {
  const find = (el: Element | null) => kids(el).find((k) => names.includes(k.localName)) ?? null;
  const v = find(own);
  if (v) return v;
  for (const lst of chain) {
    const l = lvlOf(lst, lvl);
    if (!l) continue;
    const x = find(deep ? kid(l, 'defRPr') : l);
    if (x) return x;
  }
  return null;
}

// ---------------------------------------------------------------- the reader

const SKIP_PH = new Set(['dt', 'ftr', 'sldNum', 'hdr', 'sldImg']);

interface PhInfo { type: string; idx: string | null }
const phOf = (sp: Element): PhInfo | null => {
  const ph = kid(sp, sp.localName === 'pic' ? 'nvPicPr' : 'nvSpPr', 'nvPr', 'ph');
  return ph ? { type: ph.getAttribute('type') ?? 'obj', idx: ph.getAttribute('idx') } : null;
};
const isTitle = (t: string) => t === 'title' || t === 'ctrTitle';
const isBody = (t: string) => !isTitle(t) && !SKIP_PH.has(t);

/** Our placeholder kind for PowerPoint's. */
const phKind = (t: string): Placeholder => (isTitle(t) ? 'title' : t === 'subTitle' ? 'subtitle' : 'body');

interface Part { path: string; doc: Document; tree: Element | null }

class Reader {
  private r: PackageReader;
  warnings = new Set<string>();
  private theme: Theme = { colors: {}, major: 'Arial', minor: 'Arial' };
  /** The theme's fill styles (backgrounds can use them) and where the theme is (for its pictures). */
  private themeFills: Element | null = null;
  private themePath: string | null = null;
  private clrMap: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
  /** The master's color map (a layout or slide can override it while it is read: clrMapOvr). */
  private masterClrMap: Record<string, string> = {};
  /** Files saved here: which shapes on the master and layouts are the template's artwork, and what the master was saved as (to see PowerPoint's changes). */
  private artIds: ArtIds | null = null;
  private masterPrint: MasterPrint | null = null;
  private master!: Part;
  private defaultText: Element | null = null;
  private ourMaster: Partial<Master> | null = null;
  /** The layout of the slide being read, when the file says (files saved here). */
  private curLayout: LayoutId | undefined;
  private design = false;
  /** The presentation's references, when this program saved the file. */
  private refs: DeckRefs | undefined;
  /** The slides' parts, the one being read, and the ids slides had here (files saved here), for links. */
  private slidePaths: string[] = [];
  private curPath = '';
  private slideIds = new Map<number, number>();
  private masterOut!: Master;
  private size: SlideSize = { w: 960, h: 540 };
  /** The slide's tables, placed once their titles and footnotes (separate text boxes) are known (`seq`: where the table is in the slide's order). */
  private tables: { key: string | null; table: TableData; frame: Rect; color?: string; seq?: number }[] = [];
  /**
   * Where the objects read from each shape on the slide came from (ids `from` to `to`), in the
   * order the slide lists its shapes, back to front; and the tables' places, which come in last.
   */
  private placed: { from: number; to: number; seq: number }[] = [];
  private tableSeq = new Map<number, number>();
  private tableParts = new Map<string, { title?: Omit<Caption, 'id'>; notes?: Omit<Caption, 'id'> }>();
  /** For a slide with animations: the object made from each PowerPoint shape (by its id). */
  private spidTargets: Map<number, AnimTarget> | null = null;
  /** …and the PowerPoint shape each of the slide's tables came from (by the table's place in `tables`). */
  private tableSpids = new Map<number, number>();
  /** The slide's structures (their box tags, where they went and the ids they got)… */
  private drawn: { box: string; map: (p: Vec) => Vec; from: number; to: number }[] = [];
  /** …and its highlight pictures, matched to their highlights once the structures are in. */
  private highlightPics: { spid: number; x: number; y: number; bond: boolean; box: string }[] = [];

  constructor(bytes: Uint8Array, private options: PptxReadOptions = {}) {
    this.r = new PackageReader(bytes);
  }

  /** Each slide's mark as a keyframe's slide of a canvas slide (null for other slides), by its place. */
  private partsRead: (PartRead | null)[] = [];

  private part(path: string | null): Part | null {
    if (!path) return null;
    const doc = this.r.xml(path);
    if (!doc) return null;
    const cSld = kids(doc.documentElement).find((k) => k.localName === 'cSld') ?? null;
    return { path, doc, tree: kid(cSld, 'spTree') };
  }

  private tagsOf(from: string, holder: Element | null): Record<string, string> {
    const out: Record<string, string> = {};
    for (const t of kids(kid(holder, 'custDataLst'), 'tags')) {
      const rel = this.r.rels(from).get(rAttr(t, 'id') ?? '');
      const doc = rel ? this.r.xml(rel.target) : null;
      if (!doc) continue;
      for (const tag of Array.from(doc.getElementsByTagNameNS(NS.p, 'tag'))) out[tag.getAttribute('name') ?? ''] = tag.getAttribute('val') ?? '';
    }
    return out;
  }

  read(): PptxRead {
    const main = this.r.relOfType('', REL.officeDocument);
    const pres = main ? this.r.xml(main) : null;
    if (!main || !pres) throw new Error('This is not a PowerPoint file (it has no presentation in it).');
    const root = pres.documentElement;
    // a .pptm's (or macro-enabled template's) macros, which a .pptx can't hold
    if ([...this.r.rels(main).values()].some((r) => r.type === REL.vbaProject)) this.warnings.add('This presentation has macros (VBA). They are never run here, and they are left out when it is saved.');
    const sz = kid(root, 'sldSz');
    if (sz) {
      this.size = { w: Math.round(fromEmu(sz.getAttribute('cx'))), h: Math.round(fromEmu(sz.getAttribute('cy'))) };
      // the size's name in Page Setup (Letter, A4...), unless it is the one 10 × 7.5 in is written with anyway
      const type = sz.getAttribute('type');
      if (type && SLIDE_SIZE_TYPES.includes(type) && !(type === 'screen4x3' && this.size.w === 720 && this.size.h === 540)) this.size.type = type;
    }
    this.defaultText = kid(root, 'defaultTextStyle');
    const tags = this.tagsOf(main, root);
    const ours = tags[TAG.master];
    this.design = tags[TAG.design] === '1';
    if (tags[TAG.refs]) {
      try { this.refs = cleanDeckRefs(JSON.parse(tags[TAG.refs])); } catch { /* left without references */ }
    }
    if (ours) {
      try {
        const { artIds, print, ...rest } = JSON.parse(ours) as Partial<Master> & { artIds?: ArtIds; print?: MasterPrint };
        this.ourMaster = rest;
        this.artIds = artIds && typeof artIds === 'object' ? artIds : null;
        this.masterPrint = print && typeof print === 'object' ? print : null;
      } catch { /* use PowerPoint's master */ }
    }
    const rels = this.r.rels(main);
    const slidePaths = kids(kid(root, 'sldIdLst'), 'sldId').map((s) => rels.get(rAttr(s, 'id') ?? '')?.target).filter((p): p is string => !!p && this.r.has(p));
    // the master of the first slide (PowerPoint files can have several; the first one sets the look)
    const firstLayout = slidePaths[0] ? this.r.relOfType(slidePaths[0], REL.slideLayout) : null;
    const masterPath = (firstLayout && this.r.relOfType(firstLayout, REL.slideMaster)) ?? kids(kid(root, 'sldMasterIdLst'), 'sldMasterId').map((m) => rels.get(rAttr(m, 'id') ?? '')?.target)[0] ?? null;
    const master = this.part(masterPath);
    if (!master) throw new Error('This PowerPoint file has no slide master.');
    this.master = master;
    this.readTheme();
    this.masterOut = this.readMaster(slidePaths);
    this.readArt();
    if (!this.ourMaster) {
      // notes pages' and handouts' header and footer, as PowerPoint's masters have them
      const nm = this.r.relOfType(main, REL.notesMaster) ?? this.r.relOfType(main, REL.handoutMaster);
      const hf = readMasterHF(nm ? this.r.xml(nm)?.documentElement : null);
      if (hf && (hf.header || hf.footer || hf.date || !hf.pageNumbers)) this.masterOut.notesHF = hf;
    }
    this.slidePaths = slidePaths;
    let slides = slidePaths.map((p) => this.slide(p));
    this.finishArt();
    // canvas slides saved as a slide for each keyframe, together again
    const joined = joinCanvases(slides, this.partsRead, this.options.edited ?? 'canvas');
    slides = joined.slides;
    const place = (k: number) => (k < 0 ? k : joined.place[k] ?? k);
    placeSlideLinks(slides, new Map([...this.slideIds].map(([id, k]) => [id, place(k)])));
    // the slides' ids in the file (as PowerPoint's sections name them)
    const sldIds = kids(kid(root, 'sldIdLst'), 'sldId').filter((x) => { const t = rels.get(rAttr(x, 'id') ?? '')?.target; return !!t && this.r.has(t); }).map((x) => x.getAttribute('id') ?? '');
    let sections = readSections(root, sldIds);
    if (sections && joined.edited + joined.joined > 0) {
      // the sections count the canvases' slides as one each
      let at = 0;
      sections = sections.map((sec) => {
        const from = at;
        at += sec.count;
        return { ...sec, count: new Set(Array.from({ length: sec.count }, (_, k) => place(from + k))).size };
      });
    }
    if (sections) summaryEnds(slides, sections);
    // Set Up Show, and custom shows
    const props = this.r.relOfType(main, REL.presProps);
    const show = readShowPr(props ? this.r.xml(props)?.documentElement ?? null : null);
    const customShows = readCustShows(root, (rid) => { const t = rels.get(rid)?.target; return t ? place(slidePaths.indexOf(t)) : -1; }, (el) => rAttr(el, 'id'))
      .map((c) => ({ ...c, slides: c.slides.filter((x, k, all) => all.indexOf(x) === k) }));
    const vp = this.r.relOfType(main, REL.viewProps);
    let view = readViewProps(vp ? this.r.xml(vp)?.documentElement : null);
    // PowerPoint 2013 and later keep the guides in presentation.xml (moved there, they are only there)
    const guides = readSlideGuides(root);
    if (guides) view = { ...(view ?? { showGuides: false, snapToGrid: true, grid: 7.2 }), guides };
    const kept = readKeptParts(this.r, { main });
    if (!ours && this.tagsLost()) {
      this.warnings.add(this.recovered
        ? 'This file was saved by a program that leaves out Chem Illustrator\'s own data (LibreOffice, for one): its structures were read from their pictures, and some text and shapes may look a little different.'
        : 'This file was saved by a program that leaves out Chem Illustrator\'s own data (LibreOffice, for one): its structures came in as pictures, and some text and shapes may look a little different.');
    }
    const settings: DeckSettings = { ...(show ? { show } : {}), ...(customShows.length ? { customShows } : {}), ...(view ? { view } : {}), ...(this.refs?.list.length ? { refs: this.refs } : {}) };
    return {
      size: this.size, master: this.masterOut, slides, warnings: [...this.warnings], design: this.design, ...(sections ? { sections } : {}), ...(Object.keys(settings).length ? { settings } : {}),
      ...(joined.edited ? { canvasEdited: joined.edited } : {}),
      ...(kept ? { kept } : {}),
      ...(this.oleKept.size ? { oleKept: this.oleKept } : {}),
      ...(this.picKept.size ? { picKept: this.picKept } : {}),
    };
  }

  private readTheme(): void {
    const map = kid(this.master.doc.documentElement, 'clrMap');
    if (map) for (const a of Array.from(map.attributes)) this.clrMap[a.name] = a.value;
    this.masterClrMap = { ...this.clrMap };
    const themePath = this.r.relOfType(this.master.path, REL.theme);
    const th = themePath ? this.r.xml(themePath) : null;
    const el = kid(th?.documentElement, 'themeElements');
    for (const c of kids(kid(el, 'clrScheme'))) {
      const v = kids(c)[0];
      if (!v) continue;
      this.theme.colors[c.localName] = v.localName === 'sysClr' ? v.getAttribute('lastClr') ?? '000000' : v.getAttribute('val') ?? '000000';
    }
    this.themeFills = kid(el, 'fmtScheme');
    this.themePath = themePath;
    const fonts = kid(el, 'fontScheme');
    this.theme.major = kid(fonts, 'majorFont', 'latin')?.getAttribute('typeface') || 'Arial';
    this.theme.minor = kid(fonts, 'minorFont', 'latin')?.getAttribute('typeface') || 'Arial';
  }

  private color(el: Element | null, ph: Element | null = null): string | null {
    const p = ph ? colorIn(ph, this.theme, this.clrMap)?.slice(1) ?? null : null;
    return colorIn(el, this.theme, this.clrMap, p);
  }

  /** A typeface, with the theme's title and body fonts filled in. */
  private font(face: string | null, title: boolean): string {
    if (!face) return title ? this.theme.major : this.theme.minor;
    if (face.startsWith('+mj')) return this.theme.major;
    if (face.startsWith('+mn')) return this.theme.minor;
    return face;
  }

  /** The slide master, from our settings when this program saved the file, else from PowerPoint's. */
  private readMaster(slidePaths: string[]): Master {
    const m = defaultMaster();
    const logo = this.masterLogo();
    if (this.ourMaster) {
      const out: Master = { ...m, ...this.ourMaster, logo, drawing: { ...m.drawing, ...(this.ourMaster.drawing ?? {}) } };
      // fonts and colors changed in PowerPoint since (the theme's fonts, the master's title color) win over the settings saved here
      const print = this.masterPrint;
      if (print) {
        const now = this.masterLook();
        for (const k of Object.keys(now) as (keyof MasterPrint)[]) {
          if (print[k] === undefined || now[k] === undefined || now[k] === print[k]) continue;
          (out as unknown as Record<string, unknown>)[k] = now[k];
        }
      }
      // gradients and pictures are PowerPoint's own backgrounds, on the master and the title slide's layout
      const fill = this.background(this.master);
      if (fill && !isPlain(fill)) out.fill = fill;
      const title = out.titleSlide && this.layoutPart('title');
      // (a title slide layout with no background of its own has the master's)
      const tfill = title ? this.background(title) ?? out.fill ?? null : null;
      if (out.titleSlide && tfill && !isPlain(tfill)) out.titleSlide = { ...out.titleSlide, fill: tfill };
      return out;
    }
    const look = this.masterLook();
    for (const [k, v] of Object.entries(look)) if (v !== undefined) (m as unknown as Record<string, unknown>)[k] = v;
    const bg = this.background(this.master);
    if (bg && !isPlain(bg)) m.fill = bg;
    // numbers, footer and date: as the slides show them
    let numbers = false, footer = '', date: Element | null = null;
    for (const p of slidePaths) {
      const s = this.part(p);
      for (const sp of kids(s?.tree, 'sp')) {
        const ph = phOf(sp);
        if (ph?.type === 'sldNum') numbers = true;
        if (ph?.type === 'ftr' && !footer) footer = this.plain(sp);
        if (ph?.type === 'dt' && !date) date = sp;
      }
    }
    m.slideNumbers = numbers;
    m.footer = footer;
    if (date) {
      // today's date in one of PowerPoint's forms, or fixed text
      m.dateOn = true;
      const fld = date.getElementsByTagNameNS(NS.a, 'fld')[0];
      const type = fld?.getAttribute('type') ?? '';
      if (/^datetime([1-9]|1[0-3])$/.test(type)) m.dateFormat = type as DateFormat;
      else if (fld) m.dateFormat = 'datetime1';
      else m.dateFixed = this.plain(date);
    }
    m.drawing = slideDrawingStyle();
    m.logo = logo;
    return m;
  }

  /** The master's fonts, title and text sizes and colors, and background color, as PowerPoint has them. */
  private masterLook(): MasterPrint {
    const tx = kid(this.master.doc.documentElement, 'txStyles');
    const title = lvlOf(kid(tx, 'titleStyle'), 0), body = lvlOf(kid(tx, 'bodyStyle'), 0);
    const tR = kid(title, 'defRPr'), bR = kid(body, 'defRPr');
    const size = (r: Element | null) => (r?.getAttribute('sz') ? Number(r.getAttribute('sz')) / 100 : undefined);
    const bg = this.background(this.master);
    return {
      titleFont: this.font(kid(tR, 'latin')?.getAttribute('typeface') ?? null, true),
      bodyFont: this.font(kid(bR, 'latin')?.getAttribute('typeface') ?? null, false),
      titleSize: size(tR), bodySize: size(bR),
      titleBold: tR?.getAttribute('b') === '1',
      titleColor: this.color(kid(tR, 'solidFill')) ?? undefined,
      textColor: this.color(kid(bR, 'solidFill')) ?? undefined,
      background: bg ? backgroundColour(bg).toLowerCase() : undefined,
    };
  }

  /** A slide, layout or master's own background (null when it uses the one behind it). */
  private background(part: Part): Background | null {
    const bg = kid(part.doc.documentElement, 'cSld', 'bg');
    if (!bg) return null;
    const ctx = (from: string): FillContext => ({
      color: (el, ph) => this.color(el, ph),
      picture: (blipFill) => this.blipImage(from, blipFill),
      warn: (w) => this.warnings.add(w),
    });
    const pr = kid(bg, 'bgPr');
    if (pr) return readFill(pr, this.size, ctx(part.path));
    const ref = kid(bg, 'bgRef');
    if (!ref) return null;
    // one of the theme's fill styles, in the colour given
    const idx = Number(ref.getAttribute('idx') ?? 0);
    if (!idx || idx === 1000) return { kind: 'solid', color: '#ffffff' };
    const list = kid(this.themeFills, idx > 1000 ? 'bgFillStyleLst' : 'fillStyleLst');
    const style = kids(list)[(idx > 1000 ? idx - 1001 : idx - 1)];
    const got = style ? readOneFill(style, this.size, ctx(this.themePath ?? part.path), ref) : null;
    if (got) return got;
    const c = this.color(ref);
    return c ? { kind: 'solid', color: c } : null;
  }

  /** The layout part used by slides of one of our layouts (files saved here have one of each). */
  private layoutPart(id: LayoutId): Part | null {
    for (const rel of this.r.rels(this.master.path).values()) {
      const p = this.part(rel.target);
      if (p && p.doc.documentElement.localName === 'sldLayout' && p.doc.documentElement.getAttribute('type') === ({ title: 'title', 'title-content': 'obj', 'two-content': 'twoObj', 'title-only': 'titleOnly', blank: 'blank' } as const)[id]) return p;
    }
    return null;
  }

  /**
   * The logo: the picture named Logo on the master of a file saved here (a PowerPoint
   * template's pictures stay where it has them, with the rest of its artwork).
   */
  private masterLogo(): Master['logo'] {
    const pics = kids(this.master.tree, 'pic');
    const pic = this.ourMaster ? pics.find((p) => kid(p, 'nvPicPr', 'cNvPr')?.getAttribute('name') === 'Logo') : null;
    if (!pic) return null;
    const img = this.image(this.master.path, pic);
    if (!img) return null;
    return { src: img.src, px: img.px };
  }

  /**
   * Whether a structure picture saved here has lost the tags that carry its drawing (a program
   * other than PowerPoint saved the file and dropped every tag, keeping the picture and its name).
   */
  private tagsLost(): boolean {
    return this.slidePaths.some((path) => {
      if (!/name="Structure \d+"/.test(this.r.text(path) ?? '')) return false;
      const doc = this.part(path)?.doc;
      return !!doc && Array.from(doc.getElementsByTagNameNS(NS.p, 'pic')).some((pic) =>
        /^Structure \d+$/.test(kid(pic, 'nvPicPr', 'cNvPr')?.getAttribute('name') ?? '') && !kid(pic, 'nvPicPr', 'nvPr', 'custDataLst'));
    });
  }

  /** The text of a shape as plain text (paragraphs on lines of their own). */
  private plain(sp: Element): string {
    return kids(kid(sp, 'txBody'), 'p').map((p) => kids(p).filter((k) => k.localName === 'r' || k.localName === 'fld' || k.localName === 'br').map((k) => (k.localName === 'br' ? '\n' : kid(k, 't')?.textContent ?? '')).join('')).join('\n');
  }

  // ---------------------------------------------------------------- the template's artwork

  /** The template's artwork and theme (from PowerPoint's master and layouts, or kept by a file saved here). */
  private art: TemplateArt | null = null;
  /** Which layout part each of our layouts took its artwork from, and that artwork (to tell two layouts' artwork apart). */
  private artFrom = new Map<LayoutId, { path: string; key: string }>();
  /** Each layout part's artwork, once read. */
  private layers = new Map<string, ArtLayer | null>();

  /**
   * The template's theme, color map and master artwork: everything on a PowerPoint master that
   * isn't a placeholder, or what a file saved here marked as the template's.
   */
  private readArt(): void {
    const ids = this.artIds;
    if (this.ourMaster && !ids) return; // made here, with no template's artwork
    const art: TemplateArt = { size: { ...this.size } };
    if (this.themePath && (!this.ourMaster || ids?.theme)) {
      const t = this.keepPart(this.themePath);
      if (t) art.theme = t;
    }
    if (!sameMap(this.masterClrMap, USUAL_CLRMAP)) art.clrMap = { ...this.masterClrMap };
    const only = (list: number[] | undefined) => { const set = new Set(list ?? []); return (el: Element) => set.has(shapeId(el)); };
    const master = this.artLayer(this.artShapes(this.master, ids ? only(ids.master) : () => true));
    if (master) art.master = master;
    this.art = art;
    if (!ids) return;
    // a file saved here: its layouts are ours, in order, each with the artwork marked as its own
    const rels = this.r.rels(this.master.path);
    const parts = kids(kid(this.master.doc.documentElement, 'sldLayoutIdLst'), 'sldLayoutId').map((x) => rels.get(rAttr(x, 'id') ?? '')?.target);
    deckLayouts(this.masterOut).forEach((def, i) => {
      const part = this.part(parts[i] ?? null);
      if (!part) return;
      const hide = /^(0|false)$/.test(part.doc.documentElement.getAttribute('showMasterSp') ?? '');
      const clrMap = this.overrideOf(part);
      const layer = this.artLayer(this.artShapes(part, only(ids.layouts?.[def.id])), clrMap ?? undefined);
      if (!layer && !hide && !clrMap) return;
      art.layouts = { ...art.layouts, [def.id]: { ...(layer ?? { contents: emptyContents(), xml: [], rels: [] }), ...(hide ? { hideMaster: true } : {}), ...(clrMap ? { clrMap } : {}) } };
    });
  }

  /** The deck's master gets the artwork read (and layouts no slide uses keep theirs, for slides added later). */
  private finishArt(): void {
    const art = this.art;
    if (!art) return;
    if (!this.ourMaster) {
      const known: Record<string, LayoutId> = { title: 'title', obj: 'title-content', twoObj: 'two-content', titleOnly: 'title-only', blank: 'blank' };
      for (const rel of this.r.rels(this.master.path).values()) {
        const part = rel.type === REL.slideLayout ? this.part(rel.target) : null;
        const id = part ? known[part.doc.documentElement.getAttribute('type') ?? ''] : undefined;
        if (!part || !id || this.artFrom.has(id)) continue;
        this.claimArt(id, part);
      }
    }
    if (art.master || art.layouts || art.theme || art.clrMap) this.masterOut.art = art;
  }

  /**
   * The layout a slide gets, given the artwork of its PowerPoint layout: the layout found for it,
   * unless another PowerPoint layout of the same kind (a second Title and Content with a picture
   * on it) gave that one other artwork, when it becomes a layout of its own.
   */
  private artLayout(layout: Part | null, id: LayoutId): LayoutId {
    if (!this.art || this.ourMaster || !layout) return id;
    const had = this.artFrom.get(id);
    if (!had) { this.claimArt(id, layout); return id; }
    if (had.path === layout.path || had.key === this.artKey(layout)) return id;
    const own = this.customLayout(layout, true);
    if (!own || own === id) return id;
    if (!this.artFrom.has(own)) this.claimArt(own, layout);
    return own;
  }

  /** One of our layouts takes a PowerPoint layout's artwork. */
  private claimArt(id: LayoutId, layout: Part): void {
    this.artFrom.set(id, { path: layout.path, key: this.artKey(layout) });
    const layer = this.layoutLayer(layout);
    if (layer && this.art) this.art.layouts = { ...this.art.layouts, [id]: layer };
  }

  private artKey(layout: Part): string {
    const l = this.layoutLayer(layout);
    return l ? JSON.stringify([l.xml, !!l.hideMaster, l.clrMap ?? null]) : '';
  }

  /**
   * A PowerPoint layout's artwork: its own, after its master's when that is another master than
   * the deck's (whose artwork then isn't shown with it); null when it adds nothing.
   */
  private layoutLayer(layout: Part): ArtLayer | null {
    if (this.layers.has(layout.path)) return this.layers.get(layout.path)!;
    const hide = /^(0|false)$/.test(layout.doc.documentElement.getAttribute('showMasterSp') ?? '');
    const mp = this.r.relOfType(layout.path, REL.slideMaster);
    const other = mp && mp !== this.master.path ? this.part(mp) : null;
    const clrMap = this.overrideOf(layout);
    const shapes = [...(other && !hide ? this.artShapes(other, () => true) : []), ...this.artShapes(layout, () => true)];
    const layer = this.artLayer(shapes, clrMap ?? undefined);
    const out = layer || hide || other || clrMap
      ? { ...(layer ?? { contents: emptyContents(), xml: [], rels: [] }), ...(hide || other ? { hideMaster: true } : {}), ...(clrMap ? { clrMap } : {}) }
      : null;
    this.layers.set(layout.path, out);
    return out;
  }

  /** A layout's or slide's own color map (clrMapOvr), when it has one. */
  private overrideOf(part: Part): Record<string, string> | null {
    const o = kid(part.doc.documentElement, 'clrMapOvr', 'overrideClrMapping');
    if (!o) return null;
    const map: Record<string, string> = {};
    for (const a of Array.from(o.attributes)) if (!a.name.includes(':') && a.name !== 'xmlns') map[a.name] = a.value;
    return Object.keys(map).length && !sameMap(map, this.masterClrMap) ? map : null;
  }

  /** The shapes on a master or layout that aren't placeholders (and that `pick` takes), each with its part. */
  private artShapes(part: Part, pick: (el: Element) => boolean): { part: Part; el: Element }[] {
    return kids(part.tree).filter((el) => ART_SHAPES.has(el.localName) && !isPlaceholder(el) && pick(el)).map((el) => ({ part, el }));
  }

  /**
   * Artwork as kept (each shape's XML, its pictures and links beside it) and as drawn here (read
   * as a slide's shapes are, in their order). Shapes pointing at parts that can't be kept
   * (charts, embedded objects) are left out. Null when there are none.
   */
  private artLayer(shapes: { part: Part; el: Element }[], clrMap?: Record<string, string>): ArtLayer | null {
    const xml: string[] = [], rels: KeptRel[] = [];
    const kept: { part: Part; el: Element }[] = [];
    for (const sh of shapes) {
      const x = this.keepXml(sh.part.path, sh.el, rels);
      if (x === null) { this.warnings.add('Some of the template\'s objects (charts, embedded objects) were left off its slide master.'); continue; }
      xml.push(x);
      kept.push(sh);
    }
    if (!xml.length) return null;
    return { contents: this.artContents(kept, clrMap), xml, rels };
  }

  /** Artwork read as a slide's shapes are, for drawing here (in its own color map); what it can't show here isn't warned about, as the file keeps it. */
  private artContents(shapes: { part: Part; el: Element }[], clrMap?: Record<string, string>): Contents {
    const doc = new Doc();
    doc.style = { ...this.masterOut.drawing };
    const saved = { warnings: this.warnings, clrMap: this.clrMap, curPath: this.curPath, tables: this.tables, placed: this.placed, drawn: this.drawn, highlightPics: this.highlightPics, spidTargets: this.spidTargets };
    this.warnings = new Set();
    if (clrMap) this.clrMap = { ...this.clrMap, ...clrMap };
    this.tables = [];
    this.tableParts.clear();
    this.tableSeq.clear();
    this.geoIds.clear();
    this.placed = [];
    this.drawn = [];
    this.highlightPics = [];
    this.spidTargets = null;
    try {
      doc.bulk(() => {
        for (const { part, el } of shapes) {
          this.curPath = part.path;
          this.element(part, null, el, IDENTITY, doc);
        }
        this.placeTables(doc);
        this.stackAsPlaced(doc);
      });
    } finally {
      Object.assign(this, saved);
    }
    return doc.contents();
  }

  /**
   * A shape's XML to keep, with each relationship it uses written as `__REL_n__` (rels[n] kept
   * beside it: a picture's bytes, or a link's target). Links to slides and tags are taken off;
   * null when it uses a part that can't be kept.
   */
  private keepXml(from: string, el: Element, rels: KeptRel[]): string | null {
    const copy = el.cloneNode(true) as Element;
    // the part's namespace declarations, on the copy: its prefixes stay as they were (r:embed, and
    // the ones an mc:AlternateContent's Requires names), declared once
    const XMLNS = 'http://www.w3.org/2000/xmlns/';
    const root = el.ownerDocument.documentElement;
    if (root !== el) for (const a of Array.from(root.attributes)) if (a.namespaceURI === XMLNS && !copy.hasAttribute(a.name)) copy.setAttributeNS(XMLNS, a.name, a.value);
    for (const [k, v] of [['a', NS.a], ['r', NS.r], ['p', NS.p]]) if (!copy.hasAttribute(`xmlns:${k}`)) copy.setAttributeNS(XMLNS, `xmlns:${k}`, v);
    const map = this.r.rels(from);
    const drop: Element[] = [];
    for (const e of [copy, ...Array.from(copy.getElementsByTagName('*'))]) {
      for (const a of Array.from(e.attributes)) {
        if (a.namespaceURI !== NS.r || !a.value) continue;
        const rel = map.get(a.value);
        let kept: KeptRel | null = null;
        if (rel?.external) kept = { type: rel.type, target: rel.target, external: true };
        else if (rel && /\/(image|hdphoto)$/.test(rel.type)) {
          const bytes = this.r.bytes(rel.target);
          const ext = rel.target.split('.').pop()!.toLowerCase();
          if (bytes) kept = { type: rel.type, data: dataUrl(bytes, EXT_MIME[ext] ?? 'application/octet-stream'), ext };
        }
        if (kept) { rels.push(kept); e.setAttributeNS(NS.r, a.name, `__REL_${rels.length - 1}__`); continue; }
        // a link to a slide, or tags: they come off; anything else can't be kept
        if (e.localName === 'hlinkClick' || e.localName === 'hlinkHover' || e.localName === 'hlinkMouseOver') drop.push(e);
        else if (e.localName === 'tags' && e.parentElement?.localName === 'custDataLst') drop.push(e.parentElement);
        else return null;
      }
    }
    for (const e of drop) e.parentNode?.removeChild(e);
    return elementXml(copy);
  }

  /** A part kept whole (the theme), with its pictures. */
  private keepPart(path: string): KeptXmlPart | null {
    let doc: Document | null = null;
    try { doc = this.r.xml(path); } catch { doc = null; }
    if (!doc) return null;
    const rels: KeptRel[] = [];
    const xml = this.keepXml(path, doc.documentElement, rels);
    return xml === null ? null : { xml, rels };
  }

  // ---------------------------------------------------------------- slides

  private slide(path: string): PptxSlide {
    const s = this.part(path)!;
    const layoutPath = this.r.relOfType(path, REL.slideLayout);
    const layout = this.part(layoutPath);
    // theme colors go through the slide's color map: its own, else its layout's, else the master's
    this.clrMap = { ...this.masterClrMap, ...((layout && this.overrideOf(layout)) ?? {}), ...(this.overrideOf(s) ?? {}) };
    const tags = this.tagsOf(path, kid(s.doc.documentElement, 'cSld'));
    this.curPath = path;
    this.partsRead[this.slidePaths.indexOf(path)] = readPart(tags[TAG.canvasPart], tags[TAG.canvasKeep], s.tree);
    if (tags[TAG.slideId]) this.slideIds.set(Number(tags[TAG.slideId]), this.slidePaths.indexOf(path));
    const doc = new Doc();
    doc.style = { ...this.masterOut.drawing };
    // files saved here say which layout each slide has; a title slide can have its own colours
    this.curLayout = tags[TAG.layout] as LayoutId | undefined;
    this.tables = [];
    this.tableParts.clear();
    this.geoIds.clear();
    const root = s.doc.documentElement;
    this.spidTargets = kids(root, 'timing').length ? new Map() : null;
    this.tableSpids.clear();
    this.drawn = [];
    this.highlightPics = [];
    this.placed = [];
    this.tableSeq.clear();
    doc.bulk(() => {
      this.tree(s, layout, s.tree, IDENTITY, doc);
      this.placeTables(doc);
      // things stacked as PowerPoint stacks them (a white box over part of a scheme stays over it)
      this.stackAsPlaced(doc);
      // a scheme saved over several pictures (a Smart Scheme built step by step, each step a
      // picture): its steps are joined up again, and its frame finds what it surrounds
      if (tags[TAG.steps]) restoreSteps(doc, tags[TAG.steps]);
      fillFrameMembers(doc);
    });
    const id = (tags[TAG.layout] as LayoutId | undefined) ?? this.artLayout(layout, this.layoutId(layout, doc));
    this.clrMap = { ...this.masterClrMap };
    const warn = (w: string) => this.warnings.add(w);
    const transition = readTransition(root, warn);
    const targets = this.spidTargets;
    if (targets) {
      this.findHighlights(doc, targets);
      // how the videos and sounds play
      const how = readMediaTiming(root);
      doc.bulk(() => {
        for (const [spid, m] of how) {
          const t = targets.get(spid);
          const sh = t?.kind === 'shape' ? doc.shapes.get(t.id) : undefined;
          if (!sh?.video) continue;
          const next: Media = { ...sh.video, ...m };
          if (next.once === false) delete next.once;
          doc.updateShape(sh.id, { video: next });
        }
      });
    }
    let anims = targets ? readTiming(root, (spid) => targets.get(spid) ?? null, warn) : [];
    this.spidTargets = null;
    const comments = this.comments(path);
    const lay: LayoutId = hasLayout(this.masterOut, id) ? id : 'title-content';
    // the background PowerPoint shows (the slide's, else its layout's, else the master's): the slide's own when ours would differ
    const shown = this.background(s) ?? (layout ? this.background(layout) : null) ?? slideBackground(this.masterOut, lay);
    const background = sameBackground(shown, slideBackground(this.masterOut, lay)) ? undefined : shown;
    const hideGraphics = /^(0|false)$/.test(root.getAttribute('showMasterSp') ?? '');
    // Hide Slide: PowerPoint's show="0"
    const hidden = /^(0|false)$/.test(root.getAttribute('show') ?? '');
    // the slide number, footer and date it shows, where they differ from what the master says
    const has = (t: string) => kids(s.tree, 'sp').some((sp) => phOf(sp)?.type === t);
    const m = this.masterOut;
    const own: SlideHF = {};
    if (has('sldNum') !== showsNumber(m, lay)) own.number = has('sldNum');
    if (m.footer.trim() && has('ftr') !== showsFooter(m, lay)) own.footer = has('ftr');
    if (has('dt') !== showsDate(m, lay)) own.date = has('dt');
    const hf = Object.keys(own).length ? own : undefined;
    // a canvas slide saved here
    const canvas = readCanvasTag(tags[TAG.canvas]);
    // its keyframe moves (which PowerPoint can't hold) back among its animations
    if (canvas) anims = withCameraMoves(anims, tags[TAG.canvas]);
    // Turn in 3-D (written for PowerPoint as a Spin of next to nothing): its views back
    if (tags[TAG.turn3d]) anims = withTurns(anims, tags[TAG.turn3d]);
    // the references its lines show (the lines themselves are made again from them)
    let refs: SlideRefs = {};
    if (tags[TAG.slideRefs]) {
      try { refs = cleanSlideRefs(JSON.parse(tags[TAG.slideRefs])); } catch { /* none */ }
    }
    // what its ChemDraw objects read as, with the slide finished
    for (const [id, k] of this.oleKept) if (!k.print) Object.assign(k, olePrint(doc, oleItems(doc, id)));
    // and its structure pictures, by what they show
    for (const p of this.picPending.splice(0)) {
      const sel = {
        atoms: new Set([...p.sel.atoms].filter((id) => doc.atoms.has(id))), bonds: new Set([...p.sel.bonds].filter((id) => doc.bonds.has(id))),
        captions: new Set([...p.sel.captions].filter((id) => doc.captions.has(id))), arrows: new Set([...p.sel.arrows].filter((id) => doc.arrows.has(id))), shapes: new Set([...p.sel.shapes].filter((id) => doc.shapes.has(id))),
      };
      const got = picturePrint(doc, sel);
      this.picKept.set(got.print, { svg: p.svg, png: p.png, x: got.x, y: got.y, frame: p.frame });
    }
    return {
      ...refs,
      layout: lay, contents: doc.contents(), ...this.notes(path),
      ...(background ? { background } : {}), ...(hideGraphics ? { hideGraphics } : {}), ...(hidden ? { hidden } : {}), ...(hf ? { hf } : {}),
      ...(transition && (transition.kind !== 'none' || transition.advanceAfter) ? { transition } : {}), ...(anims.length ? { anims } : {}),
      ...(comments.length ? { comments } : {}), ...(canvas ? { canvas } : {}),
    };
  }

  /** The slide's comments (PowerPoint's of either kind). */
  private authors: Map<string, string> | null = null;
  private comments(path: string): PinnedComment[] {
    const main = this.r.relOfType('', REL.officeDocument) ?? '';
    if (!this.authors) {
      this.authors = new Map();
      try {
        this.authors = readCommentAuthors(this.r.xml(this.r.relOfType(main, COMMENT_REL.authors) ?? ''));
        for (const [k, v] of readCommentAuthors(this.r.xml(this.r.relOfType(main, COMMENT_REL.modernAuthors) ?? ''))) this.authors.set(k, v);
      } catch { /* names left blank */ }
    }
    try {
      const legacy = this.r.relOfType(path, COMMENT_REL.comments);
      const modern = this.r.relOfType(path, COMMENT_REL.modernComments);
      const out = readLegacyComments(legacy ? this.r.xml(legacy) : null, this.authors);
      return [...out, ...readModernComments(modern ? this.r.xml(modern) : null, this.authors, out.length)];
    } catch {
      this.warnings.add('Some comments could not be read and were left out.');
      return [];
    }
  }

  /** PowerPoint's custom layouts read so far (by their part), as layouts of the deck's master. */
  private ownLayouts = new Map<string, LayoutId>();

  /**
   * One of PowerPoint's custom layouts as a layout of the master: its name and its title and text
   * placeholders where it puts them (or where the master does). Null when it has none.
   */
  private customLayout(layout: Part, force = false): LayoutId | null {
    const got = this.ownLayouts.get(layout.path);
    if (got !== undefined && (!force || got !== 'blank')) return got;
    const boxes: PlaceholderBox[] = [];
    for (const sp of kids(layout.tree, 'sp')) {
      const ph = phOf(sp);
      if (!ph || SKIP_PH.has(ph.type) || !(isTitle(ph.type) || ph.type === 'subTitle' || ph.type === 'body' || ph.type === 'obj')) continue;
      const own = kid(sp, 'spPr', 'xfrm');
      const xf = own ?? this.inherited(null, ph).map((e) => kid(e, 'spPr', 'xfrm')).find((x) => x) ?? null;
      const b = boxOf(xf, IDENTITY);
      if (!b) continue;
      const kind = phKind(ph.type);
      if (kind === 'title' && boxes.some((x) => x.ph === 'title')) continue;
      const algn = kid(sp, 'txBody', 'lstStyle', 'lvl1pPr')?.getAttribute('algn') ?? kid(sp, 'txBody', 'p', 'pPr')?.getAttribute('algn');
      const r = (v: number) => +v.toFixed(4);
      boxes.push({ ph: kind, x: r(b.x1 / this.size.w), y: r(b.y1 / this.size.h), w: r((b.x2 - b.x1) / this.size.w), h: r((b.y2 - b.y1) / this.size.h), justify: algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : 'left' });
    }
    if (!force && !boxes.length && !kids(layout.tree, 'sp').length) { this.ownLayouts.set(layout.path, 'blank'); return 'blank'; }
    if (!force && !boxes.length) return null;
    const m = this.masterOut;
    const list = [...deckLayouts(m), ...(m.layouts ?? [])];
    const def: LayoutDef = { id: newLayoutId(list), name: kid(layout.doc.documentElement, 'cSld')?.getAttribute('name') || 'Custom Layout', boxes };
    m.layouts = [...(m.layouts ?? []), def];
    this.ownLayouts.set(layout.path, def.id);
    return def.id;
  }

  /** Our layout for PowerPoint's, by its type or else by the text boxes on the slide. */
  private layoutId(layout: Part | null, doc: Doc): LayoutId {
    const t = layout?.doc.documentElement.getAttribute('type') ?? '';
    // PowerPoint's own custom layouts become layouts of the master, with their names and placeholders
    if (layout && (t === 'cust' || t === '') && !this.ourMaster) {
      const own = this.customLayout(layout);
      if (own) return own;
    }
    const known: Record<string, LayoutId> = {
      title: 'title', secHead: 'title', obj: 'title-content', tx: 'title-content', txAndObj: 'two-content', objAndTx: 'two-content',
      twoObj: 'two-content', twoTxTwoObj: 'two-content', twoColTx: 'two-content', titleOnly: 'title-only', blank: 'blank',
    };
    if (known[t]) return known[t];
    const phs = [...doc.captions.values()].map((c) => c.ph);
    const bodies = phs.filter((p) => p === 'body').length;
    if (phs.includes('subtitle')) return 'title';
    if (bodies >= 2) return 'two-content';
    if (bodies === 1) return 'title-content';
    return phs.includes('title') ? 'title-only' : 'blank';
  }

  /** A slide's speaker notes: their text, and PowerPoint's text body with its formatting, to save back while they are unchanged. */
  private notes(path: string): { notes: string; notesKept?: NotesKept } {
    const np = this.r.relOfType(path, REL.notesSlide);
    const n = this.part(np);
    if (!n || !np) return { notes: '' };
    const body = kids(n.tree, 'sp').find((sp) => phOf(sp)?.type === 'body');
    const notes = body ? this.plain(body).replace(/\s+$/, '') : '';
    const tx = kid(body, 'txBody');
    if (!notes || !tx) return { notes };
    // (worth keeping when there is more to it than plain paragraphs)
    const plainOnly = kids(tx, 'p').every((p) => kids(p).every((k) => (k.localName === 'r' && kids(kid(k, 'rPr')).length === 0 && ![...(kid(k, 'rPr')?.attributes ?? [])].some((a) => !['lang', 'dirty', 'altLang', 'smtClean'].includes(a.localName))) || k.localName === 'endParaRPr'));
    if (plainOnly) return { notes };
    const rels: KeptRel[] = [];
    const xml = this.keepXml(np, tx, rels);
    return xml === null ? { notes } : { notes, notesKept: { text: notes, xml, rels } };
  }

  /** Everything in a shape tree (a slide, or a group). */
  private tree(s: Part, layout: Part | null, tree: Element | null, t: Xf, doc: Doc): void {
    for (const el of kids(tree)) this.element(s, layout, el, t, doc);
  }

  private element(s: Part, layout: Part | null, el: Element, t: Xf, doc: Doc): void {
    if (el.localName === 'AlternateContent') { this.elementOnly(s, layout, el, t, doc); return; }
    // note what each PowerPoint shape became, for the slide's animations
    const mark = doc.idMark, tables = this.tables.length;
    // and where it is in the slide's stacking order (a group's members after the group)
    const seq = this.placed.length;
    this.placed.push({ from: mark, to: mark, seq });
    this.elementOnly(s, layout, el, t, doc);
    this.placed[seq].to = doc.idMark;
    for (let k = tables; k < this.tables.length; k++) this.tables[k].seq ??= seq;
    this.nameNew(el, doc, mark);
    if (!this.spidTargets) return;
    const spid = Number(el.getElementsByTagNameNS(NS.p, 'cNvPr')[0]?.getAttribute('id'));
    if (!Number.isFinite(spid)) return;
    if (this.tables.length > tables) { this.tableSpids.set(tables, spid); return; }
    let first: AnimTarget | null = null;
    const look = (kind: AnimTarget['kind'], ids: Iterable<number>) => { for (const id of ids) if (id >= mark && (!first || id < first.id)) first = { kind, id }; };
    look('atom', doc.atoms.keys());
    look('caption', doc.captions.keys());
    look('arrow', doc.arrows.keys());
    look('shape', doc.shapes.keys());
    if (first && !this.spidTargets.has(spid)) this.spidTargets.set(spid, first);
  }

  private elementOnly(s: Part, layout: Part | null, el: Element, t: Xf, doc: Doc): void {
    switch (el.localName) {
      case 'sp': if (!this.ourConnector(s, el, t, doc) && !this.equation(s, layout, el, t, doc)) this.shape(s, layout, el, t, doc); break;
      case 'pic': this.pictureEl(s, layout, el, t, doc); break;
      case 'cxnSp': if (!this.ourConnector(s, el, t, doc)) this.line(el, kid(el, 'spPr'), t, doc); break;
      case 'grpSp': {
        const x = kid(el, 'grpSpPr', 'xfrm');
        const off = kid(x, 'off'), ext = kid(x, 'ext'), chOff = kid(x, 'chOff'), chExt = kid(x, 'chExt');
        let inner = t;
        if (off && ext && chOff && chExt) {
          const k = (a: Element, b: Element, attr: string) => (Number(b.getAttribute(attr)) ? Number(a.getAttribute(attr)) / Number(b.getAttribute(attr)) : 1);
          const sx = t.sx * k(ext, chExt, 'cx'), sy = t.sy * k(ext, chExt, 'cy');
          const o = apply(t, fromEmu(off.getAttribute('x')), fromEmu(off.getAttribute('y')));
          inner = { sx, sy, tx: o.x - sx * fromEmu(chOff.getAttribute('x')), ty: o.y - sy * fromEmu(chOff.getAttribute('y')) };
        }
        const gb = boxOf(x, t), before = doc.idMark;
        // one of our diagrams: its shapes come in as they are, then the frame that keeps its text goes round them
        const diagramTag = this.tagsOf(s.path, kid(el, 'nvGrpSpPr', 'nvPr'))[TAG.diagram];
        const hadShapes = new Set(doc.shapes.keys()), hadArrows = new Set(doc.arrows.keys());
        this.tree(s, layout, el, inner, doc);
        if (diagramTag && off && ext) this.diagramFrame(diagramTag, off, ext, t, doc, hadShapes, hadArrows);
        // a group stays a group (one level deep, as ours are: groups in it join it)
        else groupNew(doc, before);
        // a flipped or turned group: everything in it flipped, then turned, together about the group's middle
        if (gb) poseNew(doc, before, gb);
        break;
      }
      case 'graphicFrame': this.frame(s, el, t, doc); break;
      case 'AlternateContent': {
        // the version for programs that don't know the newer form, else the newer one; but an
        // equation (Office Math in a text box) comes in from the newer form, to edit here
        const fb = kids(el, 'Fallback')[0];
        const choices = kids(el, 'Choice');
        // an equation (a14:m) and PowerPoint 2016's newer charts (histograms, box charts) are read from their choice: their fallback is only a picture
        const choice = choices.find((c) => c.getElementsByTagNameNS(NS_A14, 'm').length || Array.from(c.getElementsByTagNameNS('*', 'graphicData')).some((g) => /chartex/.test(g.getAttribute('uri') ?? '')));
        const branch = choice ?? (fb && kids(fb).length ? fb : choices[0]);
        // a zoom PowerPoint made: its picture (the fallback) is read as a zoom, coming back or not
        const zm = choices.map((c) => c.getElementsByTagNameNS('*', 'zmPr')[0]).find((z) => z);
        this.zoomBack = zm ? /^(1|true)$/.test(zm.getAttribute('returnToParent') ?? '') : null;
        // a Summary Zoom's pictures are its parts (each playing its section); a section zoom is read as a slide zoom
        this.zoomSummary = choices.some((c) => c.getElementsByTagNameNS('*', 'summaryZm').length);
        if (choices.some((c) => c.getElementsByTagNameNS('*', 'sectionZm').length)) this.warnings.add('Section zooms came in as zooms to their sections\' first slides.');
        for (const k of kids(branch)) this.element(s, layout, k, t, doc);
        this.zoomBack = null;
        this.zoomSummary = false;
        break;
      }
      default: break;
    }
  }

  /**
   * The name PowerPoint's Selection Pane shows for a shape (when it isn't one PowerPoint made up,
   * "Picture 3"), and whether it is hidden, given to what the shape became here.
   */
  private nameNew(el: Element, doc: Doc, mark: number): void {
    const nv = kids(el).find((k) => /^nv/.test(k.localName));
    const c = kid(nv ?? null, 'cNvPr');
    if (!c) return;
    const name = c.getAttribute('name')?.trim() ?? '';
    const hidden = c.getAttribute('hidden') === '1' || c.getAttribute('hidden') === 'true';
    const shapes = [...doc.shapes.values()].filter((x) => x.id >= mark);
    const caps = [...doc.captions.values()].filter((x) => x.id >= mark);
    if (hidden) {
      for (const x of shapes) doc.updateShape(x.id, { hidden: true });
      for (const x of caps) doc.updateCaption(x.id, { hidden: true });
    }
    if (!name || el.localName === 'grpSp' || PPT_NAME.test(name)) return;
    if (shapes.length === 1) doc.updateShape(shapes[0].id, { name });
    else if (!shapes.length && caps.length === 1) doc.updateCaption(caps[0].id, { name });
  }

  /**
   * An equation (PowerPoint's Office Math in a text box): one to change in the equation window,
   * its LaTeX as typed here when PowerPoint has not changed it. Its box is the equation's own size,
   * where PowerPoint shows it in the text box. False when the text box holds no equation.
   */
  private equation(s: Part, layout: Part | null, sp: Element, t: Xf, doc: Doc): boolean {
    const m = sp.getElementsByTagNameNS(NS_A14, 'm')[0];
    const maths = m ? Array.from(m.getElementsByTagNameNS(NS_M, 'oMath')) : [];
    const frame = boxOf(kid(sp, 'spPr', 'xfrm'), t);
    if (!maths.length || !frame) return false;
    const fromFile = maths.map((x) => ommlToTex(x)).join(' \\quad ');
    if (!fromFile.trim()) return false;
    const rPr = m.getElementsByTagNameNS(NS.a, 'rPr')[0] ?? null;
    const sz = Number(rPr?.getAttribute('sz'));

    let ours: ShapeMath | null = null;
    try {
      const tag = this.tagsOf(s.path, kid(sp, 'nvSpPr', 'nvPr'))[TAG.math];
      ours = tag ? JSON.parse(tag) as ShapeMath : null;
    } catch { ours = null; }
    // the LaTeX typed here, unless PowerPoint's copy says something else now
    const same = !!ours?.tex && texOfOmml(ours.tex) === fromFile;
    const math: ShapeMath = {
      tex: same ? ours!.tex : fromFile,
      size: same ? ours!.size : sz > 0 ? sz / 100 : 18,
      color: this.color(kid(rPr, 'solidFill')) ?? ours?.color ?? slideColours(this.masterOut, this.curLayout ?? 'title-content').textColor,
      font: ours?.font ?? this.masterOut.bodyFont,
    };
    // saved here: the box it had; made or changed in PowerPoint: the equation's own size at its text size, in the middle of its text box
    const nat = shapeMathSize(math, arialMeasure);
    const k = sz > 0 ? sz / 100 / math.size : 1;
    const cx = (frame.x1 + frame.x2) / 2, cy = (frame.y1 + frame.y2) / 2;
    let box: Rect = same ? frame : { x1: cx - (nat.w * k) / 2, y1: cy - (nat.h * k) / 2, x2: cx + (nat.w * k) / 2, y2: cy + (nat.h * k) / 2 };
    // text typed beside the equation in the same box ("+c" after it): the box comes in as text,
    // with room left where the equation is, and the equation goes in that room
    const words = Array.from(sp.getElementsByTagNameNS(NS.a, 't')).filter((x) => !x.closest('oMath, oMathPara') && (x.textContent ?? '').trim());
    if (words.length && m.closest('p')?.parentElement?.localName === 'txBody') {
      this.inlineMath = { w: nat.w * k, h: nat.h * k, at: null };
      this.shape(s, layout, sp, t, doc);
      const at = this.inlineMath.at as { x: number; y: number } | null;
      this.inlineMath = null;
      if (at) box = { x1: at.x, y1: at.y - (nat.h * k) / 2, x2: at.x + nat.w * k, y2: at.y + (nat.h * k) / 2 };
    }
    doc.addShape({ kind: 'picture', x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2, src: shapeMathPicture(math, arialMeasure), px: { w: Math.round(nat.w), h: Math.round(nat.h) }, math, ...turn(frame) });
    return true;
  }

  /**
   * An equation with text beside it in one PowerPoint text box, while that box's text is read:
   * its size, and where its middle-left comes on the slide (set once the text is laid out).
   */
  private inlineMath: { w: number; h: number; at: { x: number; y: number } | null } | null = null;

  /** The invisible frame of a diagram saved here, round the shapes its group brought in, keeping its text (with any words changed in PowerPoint). */
  private diagramFrame(tag: string, off: Element, ext: Element, t: Xf, doc: Doc, hadShapes: Set<number>, hadArrows: Set<number>): void {
    let saved: { s?: Partial<Shape> } | null;
    try { saved = JSON.parse(tag); } catch { return; }
    const diagram = cleanDiagram(saved?.s?.diagram);
    if (!diagram) return;
    const shapes = [...doc.shapes.keys()].filter((id) => !hadShapes.has(id));
    const arrows = [...doc.arrows.keys()].filter((id) => !hadArrows.has(id));
    const o = apply(t, fromEmu(off.getAttribute('x')), fromEmu(off.getAttribute('y')));
    const box = { x1: o.x, y1: o.y, x2: o.x + t.sx * fromEmu(ext.getAttribute('cx')), y2: o.y + t.sy * fromEmu(ext.getAttribute('cy')) };
    const frame: Frame = { atoms: [], captions: [], arrows, shapes, padX: 0, padY: 0, fit: true };
    const made = doc.addShape({ kind: 'geo', geo: 'rect', ...box, filled: false, lineWidth: 0, color: '#000000', name: 'Diagram', frame, diagram: { ...diagram, w: box.x2 - box.x1, h: box.y2 - box.y1 } });
    const text = textFromShapes(doc, made);
    if (text !== diagram.text) doc.updateShape(made.id, { diagram: { ...made.diagram!, text } });
  }

  /** Tables, charts, and objects from other programs (ChemDraw) in PowerPoint. */
  private frame(s: Part, el: Element, t: Xf, doc: Doc): void {
    const data = kid(el, 'graphic', 'graphicData');
    const uri = data?.getAttribute('uri') ?? '';
    if (/table$/.test(uri)) { this.table(s, el, t); return; }
    if (/chart/.test(uri)) { this.chart(s, el, data!, t, doc); return; }
    if (/drawingml\/2006\/diagram$/.test(uri) && this.smartArt(s, el, data!, t, doc)) return;
    // an object from another program: PowerPoint keeps a picture of it, which comes in as a picture
    const find = (e: Element | null): Element | null => {
      if (!e) return null;
      if (e.localName === 'pic') return e;
      for (const k of kids(e)) {
        const f = find(k);
        if (f) return f;
      }
      return null;
    };
    const ole = data ? Array.from(data.getElementsByTagNameNS(NS.p, 'oleObj'))[0] : undefined;
    // a ChemDraw object: its drawing comes in as structures, kept as a ChemDraw object when saved
    if (ole && isChemDraw(ole.getAttribute('progId') ?? '') && this.chemdrawObject(s, el, ole, t, doc)) return;
    const pic = find(data);
    if (!pic) { this.warnings.add('Some objects from other programs had no picture and were left out.'); return; }
    const box = boxOf(kid(el, 'xfrm'), t);
    const img = this.image(s.path, pic);
    if (!img || !box) return;
    if (/ChemDraw/i.test(ole?.getAttribute('progId') ?? '')) this.warnings.add('Some ChemDraw objects could not be read and came in as pictures.');
    doc.addShape({ kind: 'picture', x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2, src: img.src, px: img.px, ...(img.crop ? { crop: img.crop } : {}), ...turn(box) });
  }

  /**
   * SmartArt: the shapes and text PowerPoint last drew it with (its diagram drawing part), in the
   * frame's place. False when the file has no drawing of it.
   */
  private smartArt(s: Part, el: Element, data: Element, t: Xf, doc: Doc): boolean {
    const off = kid(el, 'xfrm', 'off');
    if (!off) return false;
    const rels = this.r.rels(s.path);
    // the drawing: named from the diagram's data part, else the slide's only one
    const dm = rAttr(kid(data, 'relIds'), 'dm');
    const dataPath = dm ? rels.get(dm)?.target : undefined;
    let dataDoc: Document | null = null;
    try { dataDoc = dataPath ? this.r.xml(dataPath) : null; } catch { dataDoc = null; }
    const relId = dataDoc?.getElementsByTagNameNS('*', 'dataModelExt')[0]?.getAttribute('relId') ?? '';
    const drawings = [...rels.values()].filter((r) => /\/diagramDrawing$/.test(r.type ?? ''));
    const path = rels.get(relId)?.target ?? (drawings.length === 1 ? drawings[0].target : undefined);
    let drawing: Document | null = null;
    try { drawing = path ? this.r.xml(path) : null; } catch { drawing = null; }
    const tree = drawing?.getElementsByTagNameNS('*', 'spTree')[0];
    if (!path || !drawing || !tree) return false;
    // its shapes are placed from the frame's corner
    const o = apply(t, fromEmu(off.getAttribute('x')), fromEmu(off.getAttribute('y')));
    this.tree({ path, doc: drawing, tree }, null, tree, { sx: t.sx, sy: t.sy, tx: o.x, ty: o.y }, doc);
    this.warnings.add('SmartArt came in as shapes and text.');
    return true;
  }

  /**
   * A ChemDraw object (an OLE object whose CONTENTS stream is ChemDraw's CDX): its drawing, sized
   * and placed as PowerPoint shows the object, each part marked (OleMark) so the slide saves it
   * back as a ChemDraw object. One saved here and not changed in ChemDraw since comes back from
   * the drawing kept with it, with everything ChemDraw has no place for. False when there is
   * no drawing to read (the object's picture then comes in instead).
   */
  private chemdrawObject(s: Part, el: Element, ole: Element, t: Xf, doc: Doc): boolean {
    const box = boxOf(kid(el, 'xfrm'), t);
    const target = this.r.rels(s.path).get(rAttr(ole, 'id') ?? '')?.target;
    const bin = target ? this.r.bytes(target) : null;
    const cdx = bin ? chemdrawInObject(bin) : null;
    if (!box || !cdx) return false;
    const prog = ole.getAttribute('progId') || CHEMDRAW_PROG;
    const from = doc.idMark;
    const tags = this.tagsOf(s.path, kid(el, 'nvGraphicFramePr', 'nvPr'));
    if (tags[TAG.cdxml] && tags[TAG.oleCdx] === bytesHash(cdx)) {
      if (!this.drawing(tags[TAG.cdxml], tags[TAG.box], box, doc)) return false;
      // one of ours saved as a ChemDraw object by the setting: a plain structure again
      if (tags[TAG.oleOwn] === '1') return true;
    } else {
      let text: string, src: Doc;
      try {
        text = isCdx(cdx) ? cdxToCdxml(cdx) : new TextDecoder().decode(cdx);
        src = readCdxml(text).doc;
      } catch {
        return false;
      }
      const placed = placeChemdraw(src, text, box, { w: fromEmu(ole.getAttribute('imgW')), h: fromEmu(ole.getAttribute('imgH')) }, doc.style);
      if (!placed) return false;
      mergeDrawing(doc, src, placed);
    }
    const mark = { id: ++this.oleCount, prog };
    markOle(doc, from, mark);
    const preview = this.olePreview(s.path, el);
    if (preview && bin) {
      const nv = kid(el, 'nvGraphicFramePr', 'cNvPr');
      this.oleKept.set(mark.id, {
        bin, ...preview, print: '', x: 0, y: 0, frame: { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 },
        imgW: ole.getAttribute('imgW') ?? '', imgH: ole.getAttribute('imgH') ?? '', objectName: ole.getAttribute('name') ?? '',
        name: nv?.getAttribute('name') ?? '', descr: nv?.getAttribute('descr') ?? '',
        ...(tags[TAG.cdxml] && tags[TAG.oleCdx] === bytesHash(cdx) ? { cdxmlTag: tags[TAG.cdxml], boxTag: tags[TAG.box] ?? '' } : {}),
      });
    }
    return true;
  }
  private oleCount = 0;
  private oleKept = new Map<number, KeptOle>();
  private picKept = new Map<string, KeptPicture>();
  /** This slide's structure pictures to keep, with what came from each (printed once the slide is read). */
  private picPending: { sel: Selection; svg: Uint8Array; png: Uint8Array; frame: Rect }[] = [];
  /** Structures brought back from inside their pictures, the file's tags being gone. */
  private recovered = 0;

  /** The picture PowerPoint shows for an object, as its file has it. */
  private olePreview(from: string, el: Element): Pick<KeptOle, 'picture' | 'pictureExt' | 'svg' | 'crop'> | null {
    const pic = Array.from(el.getElementsByTagNameNS(NS.p, 'pic'))[0];
    const fill = pic ? kid(pic, 'blipFill') : null;
    const blip = fill ? kid(fill, 'blip') : null;
    if (!fill || !blip) return null;
    const rels = this.r.rels(from);
    const target = rels.get(rAttr(blip, 'embed') ?? '')?.target;
    const picture = target ? this.r.bytes(target) : null;
    if (!target || !picture) return null;
    const svgEl = blip.getElementsByTagNameNS('http://schemas.microsoft.com/office/drawing/2016/SVG/main', 'svgBlip')[0];
    const svgTarget = svgEl && rels.get(rAttr(svgEl, 'embed') ?? '')?.target;
    const svg = svgTarget ? this.r.bytes(svgTarget) : null;
    const src = kid(fill, 'srcRect');
    const cut = (k: string) => Math.max(0, Number(src?.getAttribute(k) ?? 0) / 100000);
    return { picture, pictureExt: target.split('.').pop()!.toLowerCase(), ...(svg ? { svg } : {}), ...(src ? { crop: { l: cut('l'), t: cut('t'), r: cut('r'), b: cut('b') } } : {}) };
  }

  /**
   * A chart: PowerPoint's own (its numbers from what PowerPoint cached), or ours when it charts the
   * same numbers and (in files with its print) is still the same type, with the same look.
   */
  private chart(s: Part, el: Element, data: Element, t: Xf, doc: Doc): void {
    const box = boxOf(kid(el, 'xfrm'), t);
    const ref = kid(data, 'chart');
    const path = ref ? this.r.rels(s.path).get(rAttr(ref, 'id') ?? '')?.target : undefined;
    if (!box || !path) return;
    const w = box.x2 - box.x1, h = box.y2 - box.y1;
    const got = readChart(this.r, path, w, h);
    if (!got) { this.warnings.add('Some charts could not be read and were left out.'); return; }
    let kept: (ChartBox & { pr?: unknown }) | null = null;
    try {
      const tag = this.tagsOf(s.path, kid(el, 'nvGraphicFramePr', 'nvPr'))[TAG.chart];
      kept = tag ? JSON.parse(tag) as ChartBox : null;
    } catch { kept = null; }
    const pr = kept?.pr;
    if (kept) delete kept.pr;
    const ours = kept?.chart && Array.isArray(kept.cells) && sameBoxData(kept, got.box) && (typeof pr !== 'string' || pr === got.print);
    const chosen = sizedBox(ours ? freshBox(kept!) : got.box, w, h);
    if (chosen === got.box && got.partial) this.warnings.add('Some charts mix chart types (a line over columns, a second axis): they show as one type.');
    const alt = kid(el, 'nvGraphicFramePr', 'cNvPr')?.getAttribute('descr')?.trim();
    doc.addShape({ kind: 'picture', x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2, src: chartBoxPng(chosen, w, h), px: { w: chosen.chart.w, h: chosen.chart.h }, chart: chosen, ...(alt ? { alt } : {}) });
  }

  /** A picture's image (as a data URL), its size in pixels and its cropping. */
  private image(from: string, pic: Element): BlipImage | null {
    const fill = kid(pic, 'blipFill');
    return fill ? this.blipImage(from, fill) : null;
  }

  /** The picture of a blipFill (a picture's, or a background's). */
  private blipImage(from: string, fill: Element): BlipImage | null {
    const blip = kid(fill, 'blip');
    if (!blip) return null;
    const rels = this.r.rels(from);
    // PowerPoint shows the SVG when there is one; so do we
    const svg = blip.getElementsByTagNameNS('http://schemas.microsoft.com/office/drawing/2016/SVG/main', 'svgBlip')[0];
    const target = (svg && rels.get(rAttr(svg, 'embed') ?? '')?.target) || rels.get(rAttr(blip, 'embed') ?? '')?.target;
    if (!target) {
      if (rAttr(blip, 'link')) this.warnings.add('Pictures linked to files outside the PowerPoint file were left out.');
      return null;
    }
    const bytes = this.r.bytes(target);
    if (!bytes) return null;
    const mime = EXT_MIME[target.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';
    if (!SHOWABLE.has(mime)) this.warnings.add('Some pictures (old Windows WMF metafiles, or TIFF) can\'t be shown here yet; they are kept and saved back as they were.');
    const src = kid(fill, 'srcRect');
    const v = (k: string) => Number(src?.getAttribute(k) ?? 0) / 100000 || 0;
    const f = (k: string) => Math.max(0, v(k));
    const crop = src ? { l: f('l'), t: f('t'), r: f('r'), b: f('b') } : null;
    // less than nothing cut off a side: the picture sits in from that side of its box
    const across = 1 - v('l') - v('r'), down = 1 - v('t') - v('b');
    const inset = src && across > 0 && down > 0 && ['l', 't', 'r', 'b'].some((k) => v(k) < 0)
      ? { l: Math.max(0, -v('l')) / across, t: Math.max(0, -v('t')) / down, r: Math.max(0, -v('r')) / across, b: Math.max(0, -v('b')) / down }
      : undefined;
    return { src: dataUrl(bytes, mime), px: imageSize(bytes, mime) ?? { w: 100, h: 100 }, crop: crop && (crop.l || crop.t || crop.r || crop.b) ? crop : null, mime, ...(inset ? { inset } : {}) };
  }

  /** The drawing inside a picture (a metafile) copied from Chem Illustrator, with the area it covered. */
  private emfDrawing(from: string, pic: Element): { cdxml: string; box: string } | null {
    const target = this.r.rels(from).get(rAttr(kid(pic, 'blipFill', 'blip'), 'embed') ?? '')?.target;
    if (!target || !/\.emf$/i.test(target)) return null;
    const bytes = this.r.bytes(target);
    const cdxml = bytes ? drawingInEmf(bytes) : null;
    if (!cdxml) return null;
    try {
      const b = readCdxml(cdxml).doc.bounds();
      return b ? { cdxml, box: [b.x1, b.y1, b.x2, b.y2].join(' ') } : null;
    } catch {
      return null;
    }
  }

  private pictureEl(s: Part, layout: Part | null, el: Element, t: Xf, doc: Doc): void {
    // a picture put in a placeholder (the picture button in a content placeholder) can have no
    // place of its own: it fills its layout's (or master's) placeholder, as a placeholder's text does
    const own = kid(el, 'spPr', 'xfrm');
    const ph = own ? null : phOf(el);
    const xfrm = own ?? (ph ? this.inherited(layout, ph).map((e) => kid(e, 'spPr', 'xfrm')).find((x) => x) ?? null : null);
    const box = boxOf(xfrm, own ? t : IDENTITY);
    if (!box) return;
    const tags = this.tagsOf(s.path, kid(el, 'nvPicPr', 'nvPr'));
    if (tags[TAG.highlight]) {
      // a highlight's own picture: the structure's drawing has the highlight, so only its animation is wanted
      const spid = Number(kid(el, 'nvPicPr', 'cNvPr')?.getAttribute('id'));
      try {
        const h = JSON.parse(tags[TAG.highlight]);
        if (Number.isFinite(spid) && Number.isFinite(h.x) && Number.isFinite(h.y)) this.highlightPics.push({ spid, x: h.x, y: h.y, bond: !!h.bond, box: String(h.box ?? '') });
        return;
      } catch { /* not ours after all: read it as a picture */ }
    }
    if (tags[TAG.cdxml]) {
      // the drawing kept with the picture, while PowerPoint still shows the picture written with it
      // (after Change Picture there, the new picture comes in); turned and flipped as PowerPoint shows it
      if (this.showsOurPicture(s.path, el, tags[TAG.picPrint])) {
        const mark = doc.idMark;
        if (this.drawing(tags[TAG.cdxml], tags[TAG.box], box, doc)) {
          poseNew(doc, mark, box);
          if (pictureStyled(el)) this.warnings.add('Cropping, recoloring, borders and effects PowerPoint put on structures were left off: they came in as structures.');
          else this.keepPicture(s.path, el, doc, mark, box);
          return;
        }
      } else this.warnings.add('Structures whose picture was changed in PowerPoint came in as that picture.');
    } else {
      // a structure whose tags another program's save dropped (LibreOffice's): the drawing rides inside its SVG too
      const svg = this.svgBytes(s.path, el);
      const inside = svg ? drawingInSvg(svg) : null;
      const mark = doc.idMark;
      if (inside && this.drawing(inside.cdxml, inside.box, box, doc)) {
        poseNew(doc, mark, box);
        this.recovered++;
        if (!pictureStyled(el)) this.keepPicture(s.path, el, doc, mark, box);
        return;
      }
    }
    // a picture pasted into PowerPoint from Chem Illustrator: the drawing rides inside it
    const inside = this.emfDrawing(s.path, el);
    if (inside && this.drawing(inside.cdxml, inside.box, box, doc)) return;
    const img = this.image(s.path, el);
    if (!img) return;
    const look = this.pictureLook(kid(el, 'spPr'));
    const video0 = this.videoOf(s.path, kid(el, 'nvPicPr', 'nvPr'));
    // recorded narration (Slide Show > Record), as we name it
    const video = video0?.audio && kid(el, 'nvPicPr', 'cNvPr')?.getAttribute('name') === NARRATION_NAME ? { ...video0, narration: true } : video0;
    const fx = this.pictureFx(s.path, el, img, tags[TAG.picture], tags[TAG.pictureOrig]);
    // a picture cut to a shape has the shape's outline, not rounded corners
    if (fx?.shape && look) delete look.round;
    // a click on it in the show: a zoom (ours, or PowerPoint's, from its fallback picture) or a link
    const click = video ? null : this.hlinkOf(kid(el, 'nvPicPr', 'cNvPr', 'hlinkClick'));
    let zoom: Shape['zoom'] | undefined;
    if (tags[TAG.zoom]) {
      try { const z = JSON.parse(tags[TAG.zoom]); if (z && typeof z === 'object' && z.zoom) zoom = { ...(z.zoom.back ? { back: true } : {}), ...(typeof z.zoom.to === 'string' ? { to: z.zoom.to } : {}), ...(z.zoom.summary ? { summary: true } : {}) }; } catch { /* a plain link */ }
    } else if (this.zoomBack !== null && click) zoom = { ...(this.zoomBack ? { back: true } : {}), ...(this.zoomSummary ? { summary: true } : {}) };
    const alt = kid(el, 'nvPicPr', 'cNvPr')?.getAttribute('descr')?.trim();
    const at = inBox(box, img.inset);
    // a crystal structure: drawn again from its data, at the size it has on the slide
    let plate: PlateData | undefined;
    try {
      const got = tags[TAG.plate] ? JSON.parse(tags[TAG.plate]) as PlateData : undefined;
      if (got?.kind === 'crystal' && got.crystal && Array.isArray(got.crystal.atoms)) plate = { ...got, w: at.x2 - at.x1, h: at.y2 - at.y1 };
    } catch { plate = undefined; }
    if (plate) { img.src = crystalSrc(plate.crystal!, plate.w, plate.h); img.px = { w: Math.round(plate.w), h: Math.round(plate.h) }; img.crop = undefined; }
    doc.addShape({
      ...(plate ? { plate } : {}),
      kind: 'picture', x1: at.x1, y1: at.y1, x2: at.x2, y2: at.y2, src: img.src, px: img.px, ...(img.crop ? { crop: img.crop } : {}), ...(look && Object.keys(look).length ? { look } : {}), ...(fx ? { fx } : {}), ...(video ? { video } : {}), ...(alt ? { alt } : {}),
      ...(click ? { link: click } : {}), ...(zoom && click ? { zoom } : {}), ...turn(box),
    });
  }

  /**
   * A picture's Picture Format settings. When PowerPoint worked sharpening or Remove Background
   * into the picture and kept the original as its layer, the original comes in (`img` changed to
   * it) with the settings; without the original they stay worked in, and are not done again.
   */
  private pictureFx(from: string, pic: Element, img: { src: string; px: { w: number; h: number }; mime: string }, tag: string | undefined, origTag?: string): PictureFx | undefined {
    const blip = kid(pic, 'blipFill', 'blip');
    const got = readPictureFx(blip, kid(pic, 'spPr'));
    if (got.dropped) this.warnings.add('Some picture effects (artistic effects, saturation, color temperature) were left off.');
    // ours: the original kept beside the picture, named by the tag with what was worked in
    let t: { tol?: unknown; orig?: unknown; fx?: { bg?: unknown; sharpen?: unknown }; print?: unknown } = {};
    try { if (tag) t = JSON.parse(tag) ?? {}; } catch { /* not ours */ }
    // the original kept for another picture (changed in PowerPoint since): this one has its own look
    if (typeof t.print === 'string') {
      const target = this.r.rels(from).get(rAttr(blip, 'embed') ?? '')?.target;
      const bytes = target ? this.r.bytes(target) : null;
      if (!bytes || bytesHash(bytes) !== t.print) t = {};
    }
    let layer = got.layer;
    let fx = got.fx;
    if (!layer && typeof t.orig === 'string' && t.fx && typeof t.fx === 'object') {
      const bg = t.fx.bg && typeof t.fx.bg === 'object' ? t.fx.bg as BackgroundRemoval : undefined;
      const sharpen = typeof t.fx.sharpen === 'number' ? Math.max(-1, Math.min(1, t.fx.sharpen)) : undefined;
      if (bg || sharpen) {
        layer = t.orig;
        fx = { ...fx, ...(bg ? { bg: { ...(Array.isArray(bg.keep) ? { keep: bg.keep } : {}), ...(Array.isArray(bg.drop) ? { drop: bg.drop } : {}) } } : {}), ...(sharpen ? { sharpen } : {}) };
      }
    }
    if (!fx) return undefined;
    // the original: in our tag (files saved since), or a picture beside it (older files; PowerPoint
    // drops it when it saves, and gives its id to some other part)
    let bytes: Uint8Array | null = null, mime: string | undefined;
    if (layer === 'tag') {
      try { if (origTag) ({ bytes, mime } = fromDataUrl(origTag)); } catch { /* lost */ }
    } else if (layer) {
      const rel = this.r.rels(from).get(layer);
      const target = rel && /\/image$/.test(rel.type ?? '') ? rel.target : undefined;
      bytes = target ? this.r.bytes(target) : null;
      mime = target ? EXT_MIME[target.split('.').pop()!.toLowerCase()] : undefined;
    }
    if (bytes && mime && SHOWABLE.has(mime) && !img.mime.includes('svg')) {
      img.src = dataUrl(bytes, mime);
      img.px = imageSize(bytes, mime) ?? img.px;
      img.mime = mime;
    } else {
      delete fx.sharpen;
      delete fx.bg;
    }
    if (fx.bg && typeof t.tol === 'number' && t.tol > 0 && t.tol <= 1) fx.bg.tol = t.tol;
    return tidyFx(fx);
  }

  /**
   * The video or sound a picture stands for (PowerPoint's media link, else its video or audio
   * link), with its trim and fades, if the file is inside the PowerPoint file and plays here.
   * Until the slide's timing says otherwise it starts when clicked and plays once, as
   * PowerPoint's own.
   */
  private videoOf(from: string, nvPr: Element | null): Shape['video'] | undefined {
    if (!nvPr) return undefined;
    const media = nvPr.getElementsByTagNameNS('http://schemas.microsoft.com/office/powerpoint/2010/main', 'media')[0];
    const vf = kid(nvPr, 'videoFile'), af = kid(nvPr, 'audioFile');
    if (!media && !vf && !af) return undefined;
    const audio = !!af && !vf;
    const rels = this.r.rels(from);
    const target = (media && rels.get(rAttr(media, 'embed') ?? '')?.target) || (vf && rels.get(rAttr(vf, 'link') ?? '')?.target) || (af && rels.get(rAttr(af, 'link') ?? '')?.target);
    const bytes = target ? this.r.bytes(target) : null;
    const type = target ? mediaMime(target) : null;
    if (!target || !bytes || !type) {
      this.warnings.add(audio ? 'Sounds other than MP3, M4A, WAV, AAC and OGG files inside the PowerPoint file came in as their icons.' : 'Videos other than MP4, MOV and WebM files inside the PowerPoint file came in as their first picture.');
      return undefined;
    }
    const m: Media = { src: dataUrl(bytes, type.mime), ...(type.audio ? { audio: true } : {}), start: 'click', once: true };
    const P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main';
    const trim = media?.getElementsByTagNameNS(P14, 'trim')[0], fade = media?.getElementsByTagNameNS(P14, 'fade')[0];
    // times as MS-PPTX writes them (ST_UniversalTimeOffset): a number and a unit, milliseconds when there is none
    const UNIT: Record<string, number> = { h: 3600, min: 60, s: 1, ms: 0.001, 'µs': 1e-6, us: 1e-6, ns: 1e-9 };
    const sec = (el: Element | undefined, ...names: string[]) => {
      const raw = names.map((a) => el?.getAttribute(a)).find((x) => x != null)?.trim() ?? '';
      const m = /^(\d+(?:\.\d+)?)\s*(h|min|s|ms|µs|us|ns)?$/.exec(raw);
      const v = m ? Number(m[1]) * UNIT[m[2] ?? 'ms'] : NaN;
      return Number.isFinite(v) && v > 0 ? +v.toFixed(3) : undefined;
    };
    // (inDur and outDur: what this program wrote before v0.1.136)
    const parts = { trimStart: sec(trim, 'st'), trimEnd: sec(trim, 'end'), fadeIn: sec(fade, 'in', 'inDur'), fadeOut: sec(fade, 'out', 'outDur') };
    for (const [k, v] of Object.entries(parts)) if (v !== undefined) (m as unknown as Record<string, number>)[k] = v;
    return m;
  }

  /**
   * A picture's border, rounded corners and shadow. A shadow is read as soft or hard by its blur;
   * PowerPoint's other picture effects (glow, bevels, reflections) are left off.
   */
  private pictureLook(spPr: Element | null): PictureLook | undefined {
    if (!spPr) return undefined;
    const look: PictureLook = {};
    const geom = kid(spPr, 'prstGeom');
    if (geom?.getAttribute('prst') === 'roundRect') {
      const gd = kids(kid(geom, 'avLst')).find((g) => g.getAttribute('name') === 'adj');
      const v = /val\s+(-?\d+)/.exec(gd?.getAttribute('fmla') ?? '');
      look.round = Math.max(0, Math.min(0.5, (v ? Number(v[1]) : 16667) / 100000));
    } else if (geom && geom.getAttribute('prst') !== 'rect' && !knownShape(geom.getAttribute('prst') ?? '')) this.warnings.add('Pictures cut to shapes other than the usual ones came in as rectangles.');
    const ln = kid(spPr, 'ln');
    if (ln && !kid(ln, 'noFill')) {
      const c = this.color(kid(ln, 'solidFill'));
      if (c) {
        look.line = +fromEmu(Number(ln.getAttribute('w') ?? 9525)).toFixed(2);
        look.lineColor = c;
      }
    }
    const fx = kid(spPr, 'effectLst');
    const sh = kid(fx, 'outerShdw');
    if (sh) look.shadow = fromEmu(Number(sh.getAttribute('blurRad') ?? 0)) >= 1 ? 'soft' : 'hard';
    if (fx && kids(fx).some((k) => k.localName !== 'outerShdw')) this.warnings.add('Picture effects other than shadows (glow, soft edges, reflections) were left off.');
    return Object.keys(look).length ? look : undefined;
  }

  /**
   * Whether a structure's picture is still the one written with its drawing: its SVG or its PNG
   * has the print kept with it (files from before the prints were kept are taken as they are).
   */
  /** A picture's SVG (PowerPoint 2016's svgBlip), if it has one. */
  private svgBytes(from: string, pic: Element): Uint8Array | null {
    const blip = kid(pic, 'blipFill', 'blip');
    const svg = blip?.getElementsByTagNameNS('http://schemas.microsoft.com/office/drawing/2016/SVG/main', 'svgBlip')[0];
    const target = svg ? this.r.rels(from).get(rAttr(svg, 'embed') ?? '')?.target : undefined;
    return target ? this.r.bytes(target) : null;
  }

  /**
   * A structure picture as the file has it, kept to save back while its structure stays as read
   * (not when PowerPoint turned or flipped it: the structure is turned here, and drawn again).
   */
  private keepPicture(from: string, pic: Element, doc: Doc, mark: number, box: Rect & { rot: number; flipH: boolean; flipV: boolean }): void {
    if (box.flipH || box.flipV || Math.abs(normDegrees(box.rot)) > 1e-6) return;
    const svg = this.svgBytes(from, pic);
    const target = this.r.rels(from).get(rAttr(kid(pic, 'blipFill', 'blip'), 'embed') ?? '')?.target;
    const png = target && /\.png$/i.test(target) ? this.r.bytes(target) : null;
    if (!svg || !png) return;
    const ids = <T extends { id: number }>(m: Map<number, T>) => new Set([...m.values()].filter((x) => x.id >= mark).map((x) => x.id));
    this.picPending.push({ sel: { atoms: ids(doc.atoms), bonds: ids(doc.bonds), captions: ids(doc.captions), arrows: ids(doc.arrows), shapes: ids(doc.shapes) }, svg, png, frame: { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 } });
  }

  private showsOurPicture(from: string, pic: Element, print: string | undefined): boolean {
    if (!print) return true;
    const prints = new Set(print.split(' '));
    const blip = kid(pic, 'blipFill', 'blip');
    if (!blip) return false;
    const rels = this.r.rels(from);
    const svg = blip.getElementsByTagNameNS('http://schemas.microsoft.com/office/drawing/2016/SVG/main', 'svgBlip')[0];
    return [svg ? rAttr(svg, 'embed') : null, rAttr(blip, 'embed')].some((id) => {
      const target = id ? rels.get(id)?.target : undefined;
      const bytes = target ? this.r.bytes(target) : null;
      return !!bytes && prints.has(bytesHash(bytes));
    });
  }

  /** A structure or scheme saved here: its drawing, moved and sized as the picture now is. */
  private drawing(cdxml: string, boxTag: string | undefined, now: Rect, doc: Doc): boolean {
    let src: Doc;
    try {
      src = readCdxml(cdxml).doc;
    } catch {
      return false;
    }
    const was = (boxTag ?? '').split(' ').map(Number);
    let map = (p: Vec): Vec => p;
    if (was.length === 4 && was.every(Number.isFinite)) {
      const [x1, y1, x2, y2] = was;
      const sx = (now.x2 - now.x1) / Math.max(1e-6, x2 - x1), sy = (now.y2 - now.y1) / Math.max(1e-6, y2 - y1);
      // resized in PowerPoint: keep the proportions, centred where the picture is
      const k = Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01 ? 1 : Math.min(sx, sy);
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, nx = (now.x1 + now.x2) / 2, ny = (now.y1 + now.y2) / 2;
      map = (p) => ({ x: nx + (p.x - cx) * k, y: ny + (p.y - cy) * k });
    }
    const from = doc.idMark;
    mergeDrawing(doc, src, map);
    this.drawn.push({ box: boxTag ?? '', map, from, to: doc.idMark });
    return true;
  }

  /** Each highlight picture's highlight: the highlighted atom (or bond) nearest where it was, in its structure. */
  private findHighlights(doc: Doc, targets: Map<number, AnimTarget>): void {
    for (const h of this.highlightPics) {
      const d = this.drawn.find((x) => x.box === h.box);
      if (!d) continue;
      const at = d.map({ x: h.x, y: h.y });
      let best: AnimTarget | null = null, far = Infinity;
      const near = (x: number, y: number, t: AnimTarget) => { const r = Math.hypot(x - at.x, y - at.y); if (r < far) { far = r; best = t; } };
      if (h.bond) {
        for (const b of doc.bonds.values()) {
          const p = doc.atoms.get(b.a1), q = doc.atoms.get(b.a2);
          if (b.highlight && b.id >= d.from && b.id < d.to && p && q) near((p.x + q.x) / 2, (p.y + q.y) / 2, { kind: 'highlight', id: b.id, bond: true });
        }
      } else for (const a of doc.atoms.values()) if (a.highlight && a.id >= d.from && a.id < d.to) near(a.x, a.y, { kind: 'highlight', id: a.id });
      if (best) targets.set(h.spid, best);
    }
  }

  /**
   * The slide's objects stacked in the order PowerPoint stacks them: the order its shapes are
   * listed, back to front (things from one shape keep their own order among themselves). Left
   * to the usual layers when nothing that overlaps would come out the other way round.
   */
  private stackAsPlaced(doc: Doc): void {
    const placed = this.placed;
    const seqOf = (id: number): number => {
      const t = this.tableSeq.get(id);
      if (t !== undefined) return t;
      // the innermost shape it came from (a group's members are listed after the group)
      let best = Infinity;
      for (let k = placed.length - 1; k >= 0; k--) {
        const p = placed[k];
        if (id >= p.from && id < p.to) { best = p.seq; break; }
      }
      return best;
    };
    const rank = (it: StackItem) => Math.min(...it.ids.map(seqOf));
    const boxes = new Map<StackItem, Rect | null>();
    const box = (it: StackItem) => {
      if (!boxes.has(it)) boxes.set(it, roughBox(doc, it));
      return boxes.get(it)!;
    };
    stackAsRead(doc, rank, (a, b) => {
      const p = box(a), q = box(b);
      return !!p && !!q && p.x1 < q.x2 && q.x1 < p.x2 && p.y1 < q.y2 && q.y1 < p.y2;
    });
  }

  // ---------------------------------------------------------------- shapes and text

  /** The layout's and master's matching placeholders, for a placeholder on a slide. */
  private inherited(layout: Part | null, ph: PhInfo): Element[] {
    const out: Element[] = [];
    const match = (tree: Element | null, byIdx: boolean) => kids(tree, 'sp').find((sp) => {
      const p = phOf(sp);
      if (!p) return false;
      if (byIdx && ph.idx !== null && p.idx === ph.idx) return true;
      return isTitle(ph.type) ? isTitle(p.type) : p.type === ph.type || (ph.type === 'subTitle' && p.type === 'body' && !byIdx) || (isBody(ph.type) && p.type === 'body' && !byIdx);
    });
    const l = match(layout?.tree ?? null, true) ?? match(layout?.tree ?? null, false);
    if (l) out.push(l);
    const lp = l ? phOf(l)! : ph;
    const m = kids(this.master.tree, 'sp').find((sp) => {
      const p = phOf(sp);
      return !!p && (isTitle(lp.type) ? isTitle(p.type) : SKIP_PH.has(lp.type) ? p.type === lp.type : p.type === 'body');
    });
    if (m) out.push(m);
    return out;
  }

  private shape(s: Part, layout: Part | null, sp: Element, t: Xf, doc: Doc): void {
    const ph = phOf(sp);
    if (ph && SKIP_PH.has(ph.type)) return; // slide numbers, footers and dates come from the master
    // reference lines saved here are made again from the references
    if (!ph && this.tagsOf(s.path, kid(sp, 'nvSpPr', 'nvPr'))[TAG.refLines]) return;
    const from = ph ? this.inherited(layout, ph) : [];
    const spPr = kid(sp, 'spPr');
    const xfrm = kid(spPr, 'xfrm') ?? from.map((e) => kid(e, 'spPr', 'xfrm')).find((x) => x) ?? null;
    const box = boxOf(xfrm, xfrm && kid(spPr, 'xfrm') ? t : IDENTITY);
    if (!box) return;
    const prst = kid(spPr, 'prstGeom')?.getAttribute('prst') ?? (kid(spPr, 'custGeom') ? 'cust' : 'rect');
    if (!ph && /line|Connector/i.test(prst)) { this.line(sp, spPr, t, doc); return; }
    if (!ph) {
      // a design shape saved here, or a PowerPoint shape that is one (in designs, boxes and ovals too)
      const geoTag = this.tagsOf(s.path, kid(sp, 'nvSpPr', 'nvPr'))[TAG.geo];
      if (geoTag || (GEO_BY_PRST.has(prst) && (this.design || !PLAIN_PRST.has(prst) || fancyFill(spPr)))) {
        if (this.geoShape(sp, spPr, prst, box, geoTag, doc, s.path)) return;
      }
    }
    const hasText = !!this.plain(sp).trim();
    if (!ph) {
      const look = this.look(sp, spPr);
      if (look.fill || look.line) {
        if (!['rect', 'roundRect', 'ellipse', 'snip1Rect', 'flowChartProcess', 'flowChartAlternateProcess'].includes(prst)) this.warnings.add('Some PowerPoint shapes came in as boxes.');
        const sh: Omit<Shape, 'id'> = {
          kind: prst === 'ellipse' ? 'oval' : 'rect', x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2,
          color: look.fill ?? look.line ?? '#000000', ...turn(box), ppt: true,
        };
        if (look.fill) sh.filled = true;
        if (look.fill && look.shaded) sh.fill = 'shaded';
        // a filled shape with an outline of another colour keeps both
        if (look.fill && look.line && look.line.toLowerCase() !== look.fill.toLowerCase()) { sh.color = look.line; sh.fillColor = look.fill; }
        // (a dashed outline whenever one is drawn: round no fill, or round a fill of its own color)
        if (look.dashed && (!look.fill || sh.fillColor)) sh.dashed = true;
        if (!look.fill && look.width > 1.75 * doc.style.lineWidth) sh.bold = true;
        if (prst === 'roundRect') {
          sh.rounded = true;
          const adj = kid(spPr, 'prstGeom', 'avLst', 'gd')?.getAttribute('fmla')?.match(/val\s+(-?\d+)/);
          sh.radius = (Number(adj?.[1] ?? 16667) / 100000) * Math.min(box.x2 - box.x1, box.y2 - box.y1);
        }
        doc.addShape(sh);
      }
      if (!hasText) return;
    }
    const tags = this.tagsOf(s.path, kid(sp, 'nvSpPr', 'nvPr'));
    // text running down or up: read as text in the box the other way round, turned a quarter more
    const vert = kid(sp, 'txBody', 'bodyPr')?.getAttribute('vert');
    const quarter = vert === 'vert' || vert === 'eaVert' ? 90 : vert === 'vert270' ? -90 : 0;
    const tbox = quarter ? { ...box, ...swapBox(box), rot: box.rot + quarter } : box;
    let c = this.ourText(tags[TAG.text], sp, tbox, ph, from) ?? turned(this.text(sp, tbox, ph, from), tbox);
    if (c && quarter) c = { ...c, dir: quarter > 0 ? 'vert' : 'vert270' };
    // a table's title or footnotes, saved here as a text box beside it
    const part = (() => {
      try { return tags[TAG.tablePart] ? JSON.parse(tags[TAG.tablePart]) as { key: string; part: 'title' | 'notes' } : null; } catch { return null; }
    })();
    if (c && part && (part.part === 'title' || part.part === 'notes')) {
      const got = this.tableParts.get(String(part.key)) ?? {};
      got[part.part] = c;
      this.tableParts.set(String(part.key), got);
      return;
    }
    if (c) doc.addCaption(c);
  }

  /**
   * A design shape: as saved here (moved and sized as it now is, with PowerPoint's text if that
   * was changed there), or made from a PowerPoint shape of the same kind.
   */
  /** The design shapes read on this slide: their number when saved → their number now (for connectors). */
  private geoIds = new Map<number, number>();
  /** Reading a zoom PowerPoint made: whether the show comes back from it (null: not a zoom). */
  private zoomBack: boolean | null = null;
  /** Reading a Summary Zoom PowerPoint made. */
  private zoomSummary = false;

  /** A connector saved here: the arrow, stuck to the same shapes, where PowerPoint now has it. */
  private ourConnector(s: Part, el: Element, t: Xf, doc: Doc): boolean {
    const tag = this.tagsOf(s.path, kid(el, el.localName === 'sp' ? 'nvSpPr' : 'nvCxnSpPr', 'nvPr'))[TAG.connector];
    if (!tag) return false;
    let saved: { a?: Omit<Arrow, 'id'>; pr?: unknown } | null;
    try { saved = JSON.parse(tag); } catch { return false; }
    const a = saved?.a;
    if (!a || !a.tail || !a.head) return false;
    const arrow: Omit<Arrow, 'id'> = { ...a };
    // its line recoloured, made thicker or dashed in PowerPoint (in files with a print of the line
    // as written: native-print.ts): PowerPoint's colour, width and dashes
    const spPr = kid(el, 'spPr');
    if (typeof saved?.pr === 'string' && saved.pr !== spPrPrint(spPr, 'look')) {
      const look = this.look(el, spPr);
      if (look.line && look.line.toLowerCase() !== '#000000') arrow.color = look.line; else delete arrow.color;
      if (Math.abs(look.width - doc.style.lineWidth) > 0.05) arrow.lineWidth = +look.width.toFixed(2); else delete arrow.lineWidth;
      if (look.dashed || look.dotted) arrow.line = 'dashed';
      else if (arrow.line === 'dashed') arrow.line = 'solid';
    }
    // a straight one moved in PowerPoint goes where it is now
    const box = boxOf(kid(kid(el, 'spPr'), 'xfrm'), t);
    if (box && a.sweep && !a.elbow) {
      // a curved one: its ends go where the curve's box now is
      const was = pointsBox(arrowPoints(a, 32));
      const at = (p: { x: number; y: number }) => ({
        x: box.x1 + (was.x2 > was.x1 ? ((p.x - was.x1) / (was.x2 - was.x1)) * (box.x2 - box.x1) : 0),
        y: box.y1 + (was.y2 > was.y1 ? ((p.y - was.y1) / (was.y2 - was.y1)) * (box.y2 - box.y1) : 0),
      });
      arrow.tail = at(a.tail);
      arrow.head = at(a.head);
    } else if (box && !a.elbow) {
      arrow.tail = { x: box.flipH ? box.x2 : box.x1, y: box.flipV ? box.y2 : box.y1 };
      arrow.head = { x: box.flipH ? box.x1 : box.x2, y: box.flipV ? box.y1 : box.y2 };
    }
    const glue = (g: Arrow['from']) => {
      const id = g ? this.geoIds.get(g.shape) : undefined;
      return g && id !== undefined ? { shape: id, port: g.port } : undefined;
    };
    arrow.from = glue(a.from);
    arrow.to = glue(a.to);
    if (!arrow.from) delete arrow.from;
    if (!arrow.to) delete arrow.to;
    const r = doc.addArrow(arrow);
    // stuck ends sit on their shapes' connection points
    const patch: Partial<Arrow> = {};
    const at = (g: NonNullable<Arrow['from']>) => { const sh = doc.shapes.get(g.shape); return sh ? gluePoint(sh, g.port) : null; };
    if (arrow.from) { const p = at(arrow.from); if (p) patch.tail = p; }
    if (arrow.to) { const p = at(arrow.to); if (p) patch.head = p; }
    if (patch.tail || patch.head) doc.updateArrow(r.id, patch);
    return true;
  }

  private geoShape(sp: Element, spPr: Element | null, prst: string, box: Rect & { rot: number }, tag: string | undefined, doc: Doc, from: string): boolean {
    let saved: { s: Partial<Shape>; plain: string; sid?: unknown; pr?: { g?: unknown; l?: unknown; t?: unknown } } | null = null;
    try { saved = tag ? JSON.parse(tag) : null; } catch { saved = null; }
    const where = { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2, rot: turn(box).rot };
    const now = this.plain(sp);
    const theirText = () => {
      if (!now.trim()) return undefined;
      const c = this.text(sp, box, null, []);
      return c ? { runs: c.runs, ...(c.paras ? { paras: c.paras } : {}) } : undefined;
    };
    // a picture fill's picture is in the file, not the tag
    const blip = kid(spPr, 'blipFill');
    const pic = blip ? this.blipImage(from, blip) : null;
    const picFill = (was?: Shape['picFill']): Shape['picFill'] | undefined => {
      if (!pic) return undefined;
      const amt = kid(blip, 'blip', 'alphaModFix')?.getAttribute('amt');
      const transparency = was?.transparency ?? (amt ? +(1 - Number(amt) / 100000).toFixed(3) : 0);
      return { src: pic.src, px: pic.px, ...(transparency ? { transparency } : {}) };
    };
    // PowerPoint's own shape, from its markup (as `outline` when PowerPoint's isn't one of ours)
    const native = (outline?: string): Omit<Shape, 'id'> | null => {
      const geo = GEO_BY_PRST.get(prst) ?? outline;
      if (!geo) return null;
      const look = this.look(sp, spPr);
      const sh: Omit<Shape, 'id'> = { kind: 'geo', geo, ...where, color: look.line ?? look.fill ?? '#000000' };
      // an action button, or any shape with an action on a click
      const click = this.hlinkOf(kid(sp, 'nvSpPr', 'cNvPr', 'hlinkClick'));
      if (click) sh.link = click;
      if (look.fill) { sh.filled = true; sh.fillColor = look.fill; }
      const clear = look.fill ? fillClear(spPr) : 0;
      if (clear) sh.transparency = clear;
      const grad = kid(spPr, 'gradFill');
      const stops = grad ? kids(kid(grad, 'gsLst'), 'gs').sort((a, b) => Number(a.getAttribute('pos') ?? 0) - Number(b.getAttribute('pos') ?? 0)) : [];
      if (grad && stops.length >= 2) {
        // a gradient: its first and last colours, across at its angle or out from the middle
        sh.fill = 'gradient';
        sh.fillColor = this.color(stops[0]) ?? sh.fillColor;
        sh.fill2 = this.color(stops[stops.length - 1]) ?? '#ffffff';
        const lin = kid(grad, 'lin');
        if (kid(grad, 'path')) sh.gradRadial = true;
        else sh.gradAngle = Math.round(Number(lin?.getAttribute('ang') ?? 5400000) / 60000) % 360;
      } else if (look.shaded) sh.fill = 'shaded';
      const pf = picFill();
      if (pf) sh.picFill = pf;
      Object.assign(sh, this.effects(spPr));
      sh.lineWidth = look.line ? +look.width.toFixed(2) : 0;
      if (look.dashed) sh.dashed = true;
      const t = theirText();
      if (t) {
        sh.text = t;
        const c = this.text(sp, box, null, []);
        if (c?.justify && c.justify !== 'center') sh.textAlign = c.justify;
        const anchor = kid(sp, 'txBody', 'bodyPr')?.getAttribute('anchor');
        if (!anchor || anchor === 't') sh.textValign = 'top';
        else if (anchor === 'b') sh.textValign = 'bottom';
      }
      return sh;
    };
    // a shape saved here, as saved, with what PowerPoint has changed (when the file has prints of
    // it as written: see native-print.ts) taken from PowerPoint
    if (saved?.s && saved.s.kind === 'geo') {
      const pr = saved.pr && typeof saved.pr === 'object' ? saved.pr : null;
      const sid = saved.sid;
      // changed to another shape in PowerPoint (Change Shape): PowerPoint's shape (a shape not in
      // the library: read as PowerPoint's shapes are, with a warning)
      const reshaped = typeof pr?.g === 'string' && pr.g !== spPrPrint(spPr, 'geom');
      let sh: Omit<Shape, 'id'> | null = reshaped ? native() : null;
      if (reshaped && !sh) return false;
      if (!sh) {
        sh = { ...saved.s, ...where, kind: 'geo' } as Omit<Shape, 'id'>;
        // its fill, outline or effects changed in PowerPoint: PowerPoint's look, the rest as saved
        const theirs = typeof pr?.l === 'string' && pr.l !== spPrPrint(spPr, 'look', kid(sp, 'style')) ? native(saved.s.geo) : null;
        if (theirs) {
          const out = sh as Record<string, unknown>, from = theirs as Record<string, unknown>;
          for (const k of GEO_LOOK_KEYS) { delete out[k]; if (from[k] !== undefined) out[k] = from[k]; }
        }
        const pf = picFill(sh.picFill);
        if (pf) sh.picFill = pf; else delete sh.picFill;
        if (now !== saved.plain || (typeof pr?.t === 'string' && pr.t !== textPrint(kid(sp, 'txBody')))) {
          const t = theirText();
          if (t) sh.text = t; else delete sh.text;
        }
        // its link taken away or changed in PowerPoint (or to a slide deleted there), unless PowerPoint has no place for it
        const was = this.asSaved(sh.link);
        if (was === GONE || (pr && was !== null && (was ?? null) !== this.hlinkOf(kid(sp, 'nvSpPr', 'cNvPr', 'hlinkClick')))) {
          const link = this.hlinkOf(kid(sp, 'nvSpPr', 'cNvPr', 'hlinkClick'));
          if (link) sh.link = link; else delete sh.link;
        }
      }
      const made = doc.addShape(sh);
      if (typeof sid === 'number') this.geoIds.set(sid, made.id);
      return true;
    }
    const sh = native();
    if (!sh) return false;
    doc.addShape(sh);
    return true;
  }

  /** A shape's glow, soft edges, reflection, bevel and shadow, as PowerPoint has them. */
  private effects(spPr: Element | null): Partial<Shape> {
    const alphaOf = (el: Element | null) => {
      const a = el ? Array.from(el.getElementsByTagNameNS(NS.a, 'alpha'))[0] : undefined;
      return a ? Number(a.getAttribute('val') ?? 100000) / 100000 : 1;
    };
    const out: Partial<Shape> = readEffects(spPr, (el) => this.color(el), alphaOf);
    const sh = kid(spPr, 'effectLst', 'outerShdw');
    if (sh) {
      out.shadow = true;
      const n = (a: string) => Number(sh.getAttribute(a) ?? 0);
      out.shadowSize = +(fromEmu(String(n('dist'))) || 3).toFixed(2);
      const blur = fromEmu(String(n('blurRad')));
      if (blur) out.shadowBlur = +blur.toFixed(2);
      out.shadowAngle = Math.round(n('dir') / 60000) % 360;
      const c = this.color(sh);
      if (c && c.toLowerCase() !== '#000000') out.shadowColor = c;
      out.shadowOpacity = +alphaOf(Array.from(sh.children)[0] ?? null).toFixed(3);
    }
    return out;
  }

  /**
   * A PowerPoint table: its cells (with their text, joined cells and rules) and column widths.
   * A table saved here comes back as it was when PowerPoint has not changed its text.
   */
  private table(s: Part, el: Element, t: Xf): void {
    const frame = boxOf(kid(el, 'xfrm'), t);
    const tbl = kid(el, 'graphic', 'graphicData', 'tbl');
    if (!frame || !tbl) return;
    const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => fromEmu(g.getAttribute('w')) * t.sx);
    const m = cols.length;
    if (!m) return;
    const rows: TableCell[][] = [];
    const borders: Borders[][] = [];
    let lines = false;
    let color: string | undefined;
    const width = (tcPr: Element | null, side: string): number => {
      const e = kid(tcPr, side);
      if (!e || kid(e, 'noFill')) return 0;
      const fill = kid(e, 'solidFill');
      if (!fill) return 0;
      lines = true;
      color ??= this.color(fill) ?? undefined;
      return fromEmu(e.getAttribute('w') ?? 12700);
    };
    for (const tr of kids(tbl, 'tr')) {
      const tcs = kids(tr, 'tc');
      const row: TableCell[] = [];
      const bs: Borders[] = [];
      for (let c = 0; c < m; c++) {
        const tc = tcs[c];
        const tcPr = kid(tc ?? null, 'tcPr');
        // (a cell covered by a joined one shows none of its own lines)
        if (!tc || tc.getAttribute('hMerge') === '1' || tc.getAttribute('vMerge') === '1') { bs.push({ left: 0, top: 0, bottom: 0, right: 0 }); row.push({ runs: [] }); continue; }
        bs.push({ left: width(tcPr, 'lnL'), top: width(tcPr, 'lnT'), bottom: width(tcPr, 'lnB'), right: width(tcPr, 'lnR') });
        const cap = this.text(tc, { x1: 0, y1: 0, x2: cols[c], y2: 100 }, null, []);
        const cell: TableCell = { runs: cap?.runs ?? [] };
        const down = Number(tc.getAttribute('rowSpan') ?? 1);
        if (down > 1) cell.rowSpan = down;
        const fill = this.color(kid(tcPr, 'solidFill'));
        if (fill) cell.fill = fill;
        if (cap?.paras) cell.paras = cap.paras;
        if (cap && kid(kid(tc, 'txBody'), 'p', 'pPr')?.getAttribute('algn')) cell.align = cap.justify;
        const span = Number(tc.getAttribute('gridSpan') ?? 1);
        if (span > 1) cell.span = Math.min(span, m - c);
        row.push(cell);
      }
      rows.push(row);
      borders.push(bs);
    }
    if (!rows.length) return;
    rows.forEach((row, r) => row.forEach((c) => { if (c.rowSpan !== undefined) { if (c.rowSpan > rows.length - r) c.rowSpan = rows.length - r; if (c.rowSpan < 2) delete c.rowSpan; } }));
    // the size most of the text is in becomes the table's
    const sizes = new Map<number, number>();
    for (const row of rows) for (const c of row) for (const r of c.runs) if (r.size !== undefined && r.text.trim()) sizes.set(r.size, (sizes.get(r.size) ?? 0) + r.text.length);
    const size = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0];
    const plainRows = rows.map((row) => row.map((c) => ({ ...c, runs: c.runs.map((r) => { if (r.size !== size) return r; const { size: _, ...rest } = r; return rest; }) })));
    const style = kid(tbl, 'tblPr', 'tableStyleId')?.textContent?.trim() ?? '';
    const pr = kid(tbl, 'tblPr');
    const flag = (k: string) => pr?.getAttribute(k) === '1' || pr?.getAttribute(k) === 'true';
    const head = flag('firstRow') ? 1 : 0;
    let read: TableData = { cols, rows: plainRows, head, lines: 'acs' };
    if (size !== undefined) read.size = size;
    const ours = PPT_STYLE_IDS[style];
    if (ours) {
      // one of the styles kept here: the cells' fills and text colours that only repeat it go
      read = unstyle({ ...read, style: ours, look: { total: flag('lastRow'), bandRows: flag('bandRow'), firstCol: flag('firstCol'), lastCol: flag('lastCol'), bandCols: flag('bandCol') } });
    } else {
      if (style === '{5940675A-B579-460E-94D1-54222C63F5DA}') read.lines = 'grid';
      else if (style && style !== '{2D5ABB26-0587-4C30-8999-92F81FD0307C}') {
        // a PowerPoint style: its fills and text colours, under any lines the cells give themselves
        const baked = this.bakeStyle(read, style, { firstRow: !!head, lastRow: flag('lastRow'), band1H: flag('bandRow'), band1V: flag('bandCol'), firstCol: flag('firstCol'), lastCol: flag('lastCol') });
        read = baked.table;
        if (!lines) color = baked.line;
      }
      if (lines) read = { ...read, ...linesFromBorders(borders) };
    }
    // what was saved here, when the table still has its rows and columns (and its text, for its formatting)
    const tags = this.tagsOf(s.path, kid(el, 'nvGraphicFramePr', 'nvPr'));
    let saved: { key: string; table: TableData; plain: string[][]; pt?: unknown; pf?: unknown } | null = null;
    try { saved = tags[TAG.table] ? JSON.parse(tags[TAG.table]) : null; } catch { saved = null; }
    // prints of the table as written (files from before them have none): its cells' text and how
    // it looks, and its cells' lines and fills (native-print.ts)
    const printNow = slideTablePrint(tbl);
    // a new style picked in PowerPoint, or a fill changed there: PowerPoint's table, with our key (title and footnotes)
    const lookNow = tableLookKey(style, ['firstRow', 'firstCol', 'lastCol', 'lastRow', 'bandRow', 'bandCol'].filter(flag), kids(tbl, 'tr').map((tr) => {
      const tcs = kids(tr, 'tc');
      return Array.from({ length: m }, (_, c) => this.color(kid(kid(tcs[c] ?? null, 'tcPr'), 'solidFill')) ?? undefined);
    }));
    if (saved?.table && saved.table.rows.length === rows.length && saved.table.cols.length === m && (lookNow !== savedTableLook(saved.table) || (typeof saved.pf === 'string' && saved.pf !== printNow.frame))) {
      this.tables.push({ key: String(saved.key), table: read, frame, color });
      return;
    }
    if (saved?.table && saved.table.rows.length === rows.length && saved.table.cols.length === m) {
      // (text bolded, coloured or resized in PowerPoint, its words the same, is PowerPoint's)
      const same = JSON.stringify(rows.map((row) => row.map((c) => c.runs.map((r) => r.text).join('')))) === JSON.stringify(saved.plain) &&
        (typeof saved.pt !== 'string' || saved.pt === printNow.text);
      // columns PowerPoint has resized keep their new widths
      const widths = saved.table.cols.map((w, k) => (Math.abs(w - cols[k]) > 0.5 ? cols[k] : w));
      const own = same ? saved.table.rows : rows.map((row) => row.map((c) => ({ ...c, runs: c.runs.map((r) => { if (r.size !== (saved!.table.size ?? undefined)) return r; const { size: _, ...rest } = r; return rest; }) })));
      const { title: _t, notes: _n, ...rest } = saved.table;
      const table = { ...rest, cols: widths, rows: own };
      // text changed in PowerPoint carries the style's colours written out on it
      this.tables.push({ key: String(saved.key), table: same ? table : unstyle(table), frame, color });
      return;
    }
    this.tables.push({ key: saved ? String(saved.key) : null, table: read, frame, color });
  }

  /**
   * A table in a PowerPoint style not kept here: the style's fills and text colours (from the
   * file's table styles) written onto the cells, and its inside lines as a grid.
   */
  private bakeStyle(t: TableData, id: string, on: Record<string, boolean>): { table: TableData; line?: string } {
    const def = kids(this.r.xml(this.r.relOfType(this.r.relOfType('', REL.officeDocument) ?? '', REL.tableStyles) ?? '')?.documentElement ?? null, 'tblStyle')
      .find((e) => e.getAttribute('styleId') === id);
    if (!def) {
      this.warnings.add('A table\'s PowerPoint style wasn\'t in the file, so its colors were left out (pick a style in the Style panel).');
      return { table: t };
    }
    const n = t.rows.length, m = t.cols.length;
    const head = on.firstRow ? 1 : 0;
    // PowerPoint's order: the whole table, bands, then the marked-out columns and rows on top
    const partsAt = (r: number, c: number): string[] => {
      const out = ['wholeTbl'];
      const body = r >= head && !(on.lastRow && r === n - 1);
      if (on.band1H && body) out.push((r - head) % 2 === 0 ? 'band1H' : 'band2H');
      const k = c - (on.firstCol ? 1 : 0);
      if (on.band1V && body && !(on.firstCol && c === 0) && !(on.lastCol && c === m - 1)) out.push(k % 2 === 0 ? 'band1V' : 'band2V');
      if (on.lastCol && c === m - 1) out.push('lastCol');
      if (on.firstCol && c === 0) out.push('firstCol');
      if (on.lastRow && r === n - 1) out.push('lastRow');
      if (head && r === 0) out.push('firstRow');
      return out;
    };
    const inside = kid(def, 'wholeTbl', 'tcStyle', 'tcBdr');
    const insideLines = ['insideH', 'insideV'].map((k) => this.styleLine(kid(inside, k))).filter((x): x is string => !!x);
    const rows = t.rows.map((row, r) => row.map((cell, c) => {
      let fill: string | undefined, color: string | undefined, bold: boolean | undefined;
      for (const name of partsAt(r, c)) {
        const p = kid(def, name);
        if (!p) continue;
        const f = this.styleFill(kid(p, 'tcStyle'));
        if (f !== undefined) fill = f ?? undefined;
        const tx = kid(p, 'tcTxStyle');
        if (tx) {
          // its colour, or the one its font reference gives
          const tc = this.color(tx) ?? this.color(kid(tx, 'fontRef'));
          if (tc) color = tc;
          if (tx.getAttribute('b') === 'on') bold = true;
          else if (tx.getAttribute('b') === 'off') bold = undefined;
        }
      }
      const out: TableCell = { ...cell };
      if (fill && out.fill === undefined) out.fill = fill;
      if (color || bold) out.runs = cell.runs.map((x) => ({ ...x, ...(color && x.color === undefined ? { color } : {}), ...(bold && x.bold === undefined ? { bold: true } : {}) }));
      return out;
    }));
    return { table: { ...t, rows, lines: insideLines.length ? 'grid' : 'none' }, ...(insideLines.length ? { line: insideLines[0] } : {}) };
  }

  /**
   * A table style part's fill: its own colour, or one of the theme's fill styles in the colour
   * its fillRef gives; null for no fill, undefined when the part doesn't say.
   */
  private styleFill(tcStyle: Element | null): string | null | undefined {
    const f = kid(tcStyle, 'fill');
    if (f) {
      if (kid(f, 'noFill')) return null;
      const solid = kid(f, 'solidFill');
      if (solid) return this.solidOnWhite(solid);
      const stops = [...(kid(f, 'gradFill', 'gsLst')?.children ?? [])];
      if (stops.length) return this.solidOnWhite(stops[Math.floor(stops.length / 2)]);
    }
    const ref = kid(tcStyle, 'fillRef');
    if (!ref) return undefined;
    const idx = Number(ref.getAttribute('idx') ?? 0);
    if (!idx) return null;
    // the theme's fill style, with its placeholder colour (phClr) the one given here
    const style = kids(kid(this.themeFills, idx > 1000 ? 'bgFillStyleLst' : 'fillStyleLst'))[idx > 1000 ? idx - 1001 : idx - 1];
    if (style?.localName === 'noFill') return null;
    if (style?.localName === 'solidFill') return this.solidOnWhite(style, ref);
    const stops = [...(kid(style ?? null, 'gsLst')?.children ?? [])];
    if (stops.length) return this.solidOnWhite(stops[Math.floor(stops.length / 2)], ref);
    return this.solidOnWhite(ref);
  }

  /** A table style's line (a border side): the colour of its own line or of the theme line it refers to; null for none. */
  private styleLine(side: Element | null): string | null {
    const ln = kid(side, 'ln');
    if (ln) return kid(ln, 'noFill') ? null : this.color(kid(ln, 'solidFill'));
    const ref = kid(side, 'lnRef');
    if (!ref || !Number(ref.getAttribute('idx') ?? 0)) return null;
    return this.color(ref);
  }

  /** A colour with its see-through amount (alpha) mixed with the white of the slide under it. */
  private solidOnWhite(el: Element, ph: Element | null = null): string | null {
    const hex = this.color(el, ph);
    if (!hex) return null;
    const clr = kids(el).find((k) => /Clr$/.test(k.localName));
    const a = clr ? kids(clr).find((k) => k.localName === 'alpha') : undefined;
    if (!a) return hex;
    const f = Math.max(0, Math.min(1, Number(a.getAttribute('val') ?? 100000) / 100000));
    const [r, g, b] = hexToRgb(hex.slice(1));
    return rgbHex(r * f + 255 * (1 - f), g * f + 255 * (1 - f), b * f + 255 * (1 - f));
  }

  /** Put the slide's tables on it, with the titles and footnotes saved beside them. */
  private placeTables(doc: Doc): void {
    const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
    const runsOf = (c: Omit<Caption, 'id'> | undefined, size: number) =>
      c?.runs.filter((r) => r.text).map((r) => { if (r.size === undefined || !near(r.size, size)) return r; const { size: _, ...rest } = r; return rest; });
    for (const tb of this.tables) {
      const table = { ...tb.table };
      const parts = tb.key !== null ? this.tableParts.get(tb.key) : undefined;
      if (tb.key !== null) this.tableParts.delete(tb.key);
      const size = table.size ?? doc.style.captionSize;
      const title = runsOf(parts?.title, size), notes = runsOf(parts?.notes, size * NOTE_SCALE);
      if (title?.length) table.title = title;
      if (notes?.length) table.notes = notes;
      const lay = layoutTable(table, doc.style.captionSize, arialMeasure);
      const x1 = tb.frame.x1, y1 = tb.frame.y1 - lay.ys[0];
      const sh: Omit<Shape, 'id'> = { kind: 'table', x1, y1, x2: x1 + lay.width, y2: y1 + lay.height, table };
      if (tb.color && tb.color.toLowerCase() !== '#000000') sh.color = tb.color;
      const made = doc.addShape(sh);
      if (tb.seq !== undefined) this.tableSeq.set(made.id, tb.seq);
      const spid = this.tableSpids.get(this.tables.indexOf(tb));
      if (spid !== undefined) this.spidTargets?.set(spid, { kind: 'shape', id: made.id });
    }
    // titles and footnotes whose table was deleted in PowerPoint stay as text
    for (const p of this.tableParts.values()) for (const c of [p.title, p.notes]) if (c) doc.addCaption(c);
  }

  /** Text saved here, when PowerPoint has not changed it, moved to where its box now is. */
  /**
   * A PowerPoint link as ours: a web page, e-mail or file; a jump to a slide (as #slide-n=its
   * place, made into the slide's id once the deck has its slides); first/last/next/previous.
   * Links that run programs or macros are left out.
   */
  private hlinkOf(el: Element | null): string | null {
    if (!el) return null;
    const action = el.getAttribute('action') ?? '';
    const jump = /^ppaction:\/\/hlinkshowjump\?jump=(\w+)/.exec(action)?.[1];
    if (jump) return ({ firstslide: '#first', lastslide: '#last', nextslide: '#next', previousslide: '#prev', lastslideviewed: '#return', endshow: '#end' } as Record<string, string>)[jump] ?? null;
    const rel = this.r.rels(this.curPath).get(rAttr(el, 'id') ?? '');
    if (!rel) return null;
    if (action.startsWith('ppaction://hlinksldjump')) {
      const i = this.slidePaths.indexOf(rel.target);
      return i < 0 ? null : `#slide-n=${i}`;
    }
    if (action && !action.startsWith('ppaction://hlinkfile')) {
      this.warnings.add('Links that run programs or macros were left out.');
      return null;
    }
    return rel.external ? linkFromTarget(rel.target) : null;
  }

  /**
   * How PowerPoint shows linked text: underlined, in the theme's link colour, or in the text's own
   * colour when the link says so (hlinkClr val="tx", which PowerPoint 2019 and later write).
   */
  private linkLook(click: Element | null, own: string | undefined): { underline: true; color: string } {
    const tx = click ? Array.from(click.getElementsByTagNameNS('*', 'hlinkClr')).some((e) => e.getAttribute('val') === 'tx') : false;
    if (tx && own) return { underline: true, color: own };
    const hex = this.theme.colors[this.clrMap.hlink ?? 'hlink'];
    return { underline: true, color: hex ? `#${hex}` : HLINK };
  }

  /** The links PowerPoint has on a shape's text, as stretches of its plain text (see plain). */
  private linksIn(sp: Element): { from: number; to: number; link: string; click: Element }[] {
    const out: { from: number; to: number; link: string; click: Element }[] = [];
    let at = 0;
    kids(kid(sp, 'txBody'), 'p').forEach((p, pi) => {
      if (pi > 0) at++;
      for (const k of kids(p)) {
        if (k.localName === 'br') { at++; continue; }
        if (k.localName !== 'r' && k.localName !== 'fld') continue;
        const n = (kid(k, 't')?.textContent ?? '').length;
        const click = kid(k, 'rPr', 'hlinkClick');
        const link = this.hlinkOf(click);
        if (link && click && n) {
          const last = out[out.length - 1];
          if (last && last.to === at && last.link === link) last.to += n;
          else out.push({ from: at, to: at + n, link, click });
        }
        at += n;
      }
    });
    return out;
  }

  /** The slides' ids saved with them here → their places in the deck. */
  private placeOfId: Map<number, number> | null = null;

  /** A slide's place in the deck from the id saved with it here (-1: none has it). */
  private slideById(id: number): number {
    if (!this.placeOfId) {
      this.placeOfId = new Map();
      this.slidePaths.forEach((p, i) => {
        const v = this.tagsOf(p, kid(this.part(p)?.doc.documentElement ?? null, 'cSld'))[TAG.slideId];
        if (v) this.placeOfId!.set(Number(v), i);
      });
    }
    return this.placeOfId.get(id) ?? -1;
  }

  /**
   * One of our links as it was saved for PowerPoint: a slide by its place now, or the link itself;
   * null when PowerPoint can't hold it (kept only in our tag); GONE when it went to a slide that is
   * no longer in the file (deleted in PowerPoint, which took the link away with it).
   */
  private asSaved(link: string | undefined): string | null | undefined | typeof GONE {
    if (!link) return undefined;
    const id = slideOfLink(link);
    if (id !== null) {
      const i = this.slideById(id);
      return i < 0 ? GONE : `#slide-n=${i}`;
    }
    if (SHOW_JUMPS.has(link)) return link;
    return link.startsWith('#') ? null : linkFromTarget(officeTarget(link));
  }

  /**
   * Links added, changed or taken away in PowerPoint on text saved here (its words unchanged),
   * put on our copy of the text. Text whose words don't line up with PowerPoint's is left as saved.
   */
  private relink(runs: TextRun[], sp: Element, plain: string): TextRun[] {
    if (runs.map((r) => r.text).join('') !== plain) return runs;
    const theirs = this.linksIn(sp);
    const at = (i: number) => theirs.find((l) => l.from <= i && i < l.to);
    /** Whether PowerPoint left a run's link (from `from` to `to`) as it was saved. */
    const kept = (r: TextRun, from: number, to: number) => {
      const was = this.asSaved(r.link);
      // a link to a slide deleted since: not kept (its slide's id may now be another slide's)
      if (was === GONE) return false;
      for (let i = from; i < to; i++) {
        if (r.text[i - from] === '\n') continue;
        const l = at(i)?.link;
        if (was === null ? l !== undefined : l !== was) return false;
      }
      return true;
    };
    let pos = 0;
    if (runs.every((r) => { const ok = kept(r, pos, pos + r.text.length); pos += r.text.length; return ok; })) return runs;
    // cut our runs where PowerPoint's links start and end, and give each piece PowerPoint's link
    const cuts = new Set(theirs.flatMap((l) => [l.from, l.to]));
    const out: TextRun[] = [];
    pos = 0;
    for (const r of runs) {
      let start = 0;
      for (let i = 1; i <= r.text.length; i++) {
        if (i < r.text.length && !cuts.has(pos + i)) continue;
        const piece: TextRun = { ...r, text: r.text.slice(start, i) };
        if (!kept(piece, pos + start, pos + i)) {
          const l = at(pos + start);
          if (!l) delete piece.link;
          else {
            piece.link = l.link;
            if (!r.link) Object.assign(piece, this.linkLook(l.click, r.color));
          }
        }
        out.push(piece);
        start = i;
      }
      pos += r.text.length;
    }
    return merge(out);
  }

  /**
   * Links saved here that PowerPoint has no place for (kept only in our tag), put back on
   * PowerPoint's runs of the same text where PowerPoint has no link of its own.
   */
  private ownLinks(runs: TextRun[], saved: TextRun[] | undefined): TextRun[] {
    if (!Array.isArray(saved) || saved.map((r) => r.text).join('') !== runs.map((r) => r.text).join('')) return runs;
    let out = runs, pos = 0;
    for (const r of saved) {
      const end = pos + r.text.length;
      if (r.link && this.asSaved(r.link) === null && !sliceRuns(out, pos, end).some((x) => x.link)) out = applyStyle(out, pos, end, { link: r.link });
      pos = end;
    }
    return out;
  }

  /**
   * Text saved here, as it was made here while PowerPoint has not changed it: its words the same,
   * and (in files with a print) how they look the same. Text whose words are the same but which was
   * formatted in PowerPoint (bold, a colour, a size) is read as PowerPoint has it, keeping what
   * PowerPoint has no place for. Null: read the text as PowerPoint's own.
   */
  private ourText(tag: string | undefined, sp: Element, box: Rect & { rot: number }, ph: PhInfo | null, from: Element[]): Omit<Caption, 'id'> | null {
    if (!tag) return null;
    let saved: { c: Caption; plain: string; at?: number[]; o?: number[]; pr?: string };
    try {
      saved = JSON.parse(tag);
    } catch {
      return null;
    }
    const now = this.plain(sp);
    if (now !== saved.plain) return null;
    if (typeof saved.pr === 'string' && saved.pr !== textPrint(kid(sp, 'txBody'))) {
      const theirs = turned(this.text(sp, box, ph, from), box);
      if (!theirs) return null;
      // what PowerPoint has no place for: groups, order, steps, ties to structures, chemistry
      const own: Partial<Caption> = {};
      for (const k of OWN_CAPTION_KEYS) if (saved.c?.[k] !== undefined) (own as Record<string, unknown>)[k] = saved.c[k];
      return { ...theirs, ...own, runs: this.ownLinks(theirs.runs, saved.c?.runs) };
    }
    const c: Omit<Caption, 'id'> & { id?: number } = { ...saved.c };
    delete c.id;
    if (Array.isArray(c.runs)) c.runs = this.relink(c.runs, sp, now);
    if (saved.at?.length === 4 && saved.o?.length === 2) {
      // where the text starts in its box, turned with the box about the box's middle (as PowerPoint turns it)
      const [, , w, h] = saved.at;
      const mid = { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
      const a = turnAbout({ x: box.x1 + saved.o[0], y: box.y1 + saved.o[1] }, mid, box.rot ?? 0);
      c.x = a.x;
      c.y = a.y;
      const rot = normDegrees(box.rot ?? 0);
      if (rot) c.rot = rot; else delete c.rot;
      const nw = box.x2 - box.x1, nh = box.y2 - box.y1;
      if (c.wrap !== undefined && Math.abs(nw - w) > 0.5) c.wrap = nw;
      if ((c.ph || c.fit) && Math.abs(nh - h) > 0.5) c.boxH = nh;
    } else if (saved.at?.length === 4) {
      const [x, y, w, h] = saved.at;
      c.x += box.x1 - x;
      c.y += box.y1 - y;
      const nw = box.x2 - box.x1, nh = box.y2 - box.y1;
      if (c.wrap !== undefined && Math.abs(nw - w) > 0.5) c.wrap = nw;
      if ((c.ph || c.fit) && Math.abs(nh - h) > 0.5) c.boxH = nh;
    }
    return c;
  }

  /** How a shape is filled and outlined (its own settings, else its theme style). */
  private look(sp: Element, spPr: Element | null): { fill: string | null; line: string | null; width: number; dashed: boolean; dotted?: boolean; shaded: boolean } {
    const style = kid(sp, 'style');
    let fill: string | null = null;
    let shaded = false;
    if (kid(spPr, 'solidFill')) fill = this.color(kid(spPr, 'solidFill'));
    else if (kid(spPr, 'gradFill')) {
      // shaded: light to the full colour (the last stop)
      const stops = [...(kid(spPr, 'gradFill', 'gsLst')?.children ?? [])];
      fill = this.color(stops[stops.length - 1] ?? null);
      shaded = true;
    } else if (kid(spPr, 'pattFill')) {
      fill = this.color(kid(spPr, 'pattFill', 'fgClr'));
      this.warnings.add('Patterned fills came in as plain colors.');
    } else if (!kid(spPr, 'noFill') && !kid(spPr, 'blipFill')) {
      const ref = kid(style, 'fillRef');
      if (ref && ref.getAttribute('idx') !== '0') fill = this.color(ref);
    }
    const ln = kid(spPr, 'ln');
    let line: string | null = null;
    if (kid(ln, 'solidFill')) line = this.color(kid(ln, 'solidFill'));
    else if (!kid(ln, 'noFill')) {
      const ref = kid(style, 'lnRef');
      if (ref && ref.getAttribute('idx') !== '0') line = this.color(ref);
    }
    const w = ln?.getAttribute('w');
    const dash = kid(ln, 'prstDash')?.getAttribute('val');
    return { fill, line, width: w ? fromEmu(w) : 0.75, dashed: !!dash && dash !== 'solid', dotted: dash === 'sysDot' || dash === 'dot', shaded };
  }

  /** A line or connector: an arrow when it has a head, else a line. */
  private line(el: Element, spPr: Element | null, t: Xf, doc: Doc): void {
    const box = boxOf(kid(spPr, 'xfrm'), t);
    if (!box) return;
    const look = this.look(el, spPr);
    if (!look.line) return;
    const prst = kid(spPr, 'prstGeom')?.getAttribute('prst') ?? 'line';
    if (!/^(line|straightConnector1)$/.test(prst)) this.warnings.add('Bent and curved connectors came in straight.');
    const mid = { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
    // a turned line: its ends turned about the middle of its box
    const a = turnAbout({ x: box.flipH ? box.x2 : box.x1, y: box.flipV ? box.y2 : box.y1 }, mid, box.rot);
    const b = turnAbout({ x: box.flipH ? box.x1 : box.x2, y: box.flipV ? box.y1 : box.y2 }, mid, box.rot);
    const ln = kid(spPr, 'ln');
    const end = (n: string) => {
      const e = kid(ln, n);
      const type = e?.getAttribute('type');
      return type && type !== 'none' ? e : null;
    };
    // PowerPoint's "head end" is the start of the line and its "tail end" the end
    const atStart = end('headEnd'), atEnd = end('tailEnd');
    if (atStart || atEnd) {
      const lw = look.width;
      const head = atEnd ?? atStart!;
      const len = { sm: 0.6, med: 1, lg: 1.5 }[head.getAttribute('len') ?? 'med'] ?? 1;
      const wid = { sm: 0.6, med: 1, lg: 1.5 }[head.getAttribute('w') ?? 'med'] ?? 1;
      const [tail, tip] = atEnd ? [a, b] : [b, a];
      const arrow: Omit<Arrow, 'id'> = {
        tail, head: tip, headStyle: 'full', tailStyle: atStart && atEnd ? 'full' : 'none',
        headType: head.getAttribute('type') === 'arrow' ? 'angle' : 'solid',
        line: look.dashed ? 'dashed' : 'solid', noGo: false, equilibrium: false, sweep: 0,
        headLength: Math.max(lw, 0.5) * 10 * len, headWidth: Math.max(lw, 0.5) * 2.5 * wid, ppt: true,
      };
      if (look.line.toLowerCase() !== '#000000') arrow.color = look.line;
      if (Math.abs(lw - doc.style.lineWidth) > 0.05) arrow.lineWidth = lw;
      doc.addArrow(arrow);
      return;
    }
    const sh: Omit<Shape, 'id'> = { kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ppt: true };
    if (look.line.toLowerCase() !== '#000000') sh.color = look.line;
    if (look.dashed) sh.dashed = true;
    if (look.dotted) sh.dotted = true;
    if (look.width > 1.75 * doc.style.lineWidth) sh.bold = true;
    doc.addShape(sh);
  }

  /** PowerPoint text as a caption, with the formatting PowerPoint would show. */
  private text(sp: Element, box: Rect, ph: PhInfo | null, from: Element[]): Omit<Caption, 'id'> | null {
    const body = kid(sp, 'txBody');
    const title = !!ph && isTitle(ph.type);
    const txStyles = kid(this.master.doc.documentElement, 'txStyles');
    const chain: Chain = [kid(body, 'lstStyle'), ...from.map((e) => kid(e, 'txBody', 'lstStyle'))];
    // (the shape's own part of the chain, and its style's text color and font: not a placeholder's)
    const ownChain = chain.slice();
    const fontRef = ph ? null : kid(sp, 'style', 'fontRef');
    if (ph) chain.push(kid(txStyles, title ? 'titleStyle' : 'bodyStyle'));
    else chain.push(this.defaultText, kid(txStyles, 'otherStyle'));
    const bodyPrs = [kid(body, 'bodyPr'), ...from.map((e) => kid(e, 'txBody', 'bodyPr'))];
    const bp = (k: string) => bodyPrs.map((b) => b?.getAttribute(k) ?? null).find((v) => v !== null) ?? null;
    // a text box that shrinks its text to fit keeps its own sizes (it is shrunk here as there);
    // a placeholder's text comes in at the size PowerPoint shrank it to
    const shrinks = !ph && !!kid(bodyPrs[0], 'normAutofit');
    const scale = shrinks ? 1 : Number(kid(bodyPrs[0], 'normAutofit')?.getAttribute('fontScale') ?? 100000) / 100000;
    const kind = ph ? phKind(ph.type) : null;
    const base = kind ? textStyles(this.masterOut, this.curLayout)[kind] : undefined;

    const runs: TextRun[] = [];
    const paras: ParaStyle[] = [];
    let lineSpacing: number | undefined, lineHeight: number | undefined;
    const ps = kids(body, 'p');
    let mathAt = -1;
    ps.forEach((p, pi) => {
      const pPr = kid(p, 'pPr');
      const lvl = Math.max(0, Math.min(8, Number(pPr?.getAttribute('lvl') ?? 0)));
      const para: ParaStyle = {};
      const algn = inherit(pPr, chain, lvl, (e) => e.getAttribute('algn'));
      const align: Justify = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' || algn === 'dist' ? 'justify' : 'left';
      para.align = align;
      const bullet = inheritEl(pPr, chain, lvl, ['buNone', 'buChar', 'buAutoNum', 'buBlip']);
      const list = bullet?.localName === 'buChar' || bullet?.localName === 'buBlip' ? 'bullet' : bullet?.localName === 'buAutoNum' ? 'number' : undefined;
      if (list) {
        para.list = list;
        if (lvl) para.level = lvl;
        // its own bullet, or numbering, when not the level's usual
        if (bullet!.localName === 'buChar') {
          const font = inheritEl(pPr, chain, lvl, ['buFont', 'buFontTx']);
          const ch = bulletChar(bullet!.getAttribute('char') ?? '', font?.localName === 'buFont' ? font.getAttribute('typeface') ?? '' : '');
          if (ch && ch !== BULLETS[lvl % BULLETS.length]) para.bullet = ch;
        } else if (list === 'number') {
          const type = bullet!.getAttribute('type') ?? '';
          if (type !== ['arabicPeriod', 'alphaLcPeriod', 'romanLcPeriod'][lvl % 3] && autoNumLabel(type, 1)) para.numType = type;
          const at = Number(bullet!.getAttribute('startAt'));
          if (Number.isInteger(at) && at > 1) para.startAt = at;
        }
      }
      if (pi === 0) {
        const ls = inheritEl(pPr, chain, lvl, ['lnSpc']);
        const pct = kid(ls, 'spcPct')?.getAttribute('val'), fixed = kid(ls, 'spcPts')?.getAttribute('val');
        if (fixed) lineHeight = Number(fixed) / 100;
        else if (pct && Number(pct) !== 100000) lineSpacing = Number(pct) / 100000;
        const red = shrinks ? 0 : Number(kid(bodyPrs[0], 'normAutofit')?.getAttribute('lnSpcReduction') ?? 0) / 100000;
        if (red) lineSpacing = (lineSpacing ?? 1) * (1 - red);
      }
      const marL = fromEmu(inherit(pPr, chain, lvl, (e) => e.getAttribute('marL')));
      const indent = fromEmu(inherit(pPr, chain, lvl, (e) => e.getAttribute('indent')));
      // our lists put the marker one step in per level; anything further in is extra indent
      const pieces = kids(p).filter((k) => k.localName === 'r' || k.localName === 'fld' || k.localName === 'br' || (k.localName === 'm' && k.namespaceURI === NS_A14 && !!this.inlineMath));
      const firstSize = (() => {
        const rPr = kid(pieces.find((k) => k.localName !== 'br'), 'rPr');
        const v = inherit(rPr, chain, lvl, (e) => e.getAttribute('sz'), true) ?? kid(p, 'endParaRPr')?.getAttribute('sz') ?? null;
        return (v ? Number(v) / 100 : 18) * scale;
      })();
      // space before and after: in points, or in lines of the paragraph's first size (a line being 1.2 sizes)
      const pts = (names: string[]) => {
        const el = inheritEl(pPr, chain, lvl, names);
        const v = kid(el, 'spcPts')?.getAttribute('val'), pct = kid(el, 'spcPct')?.getAttribute('val');
        return v ? Number(v) / 100 : pct ? Math.round((Number(pct) / 100000) * firstSize * 1.2 * 100) / 100 : null;
      };
      const before = pts(['spcBef']), after = pts(['spcAft']);
      if (before) para.spaceBefore = before;
      if (after) para.spaceAfter = after;
      const extra = (list ? marL + indent : marL) - (list ? lvl * 1.6 * firstSize : 0);
      if (extra > 1) para.indent = +extra.toFixed(2);
      if (pi > 0) runs.push({ text: '\n' });
      paras.push(para);
      for (const k of pieces) {
        if (k.localName === 'br') {
          runs.push({ text: '\n' });
          paras.push(list ? { ...para, cont: true } : { ...para });
          continue;
        }
        if (k.localName === 'm') {
          // the equation's room: en spaces as wide as it (it is drawn over them)
          const size = Math.round(firstSize * 10) / 10;
          mathAt = runs.reduce((n, r) => n + r.text.length, 0);
          runs.push({ text: '\u2002'.repeat(Math.max(1, Math.ceil(this.inlineMath!.w / (size / 2)))), size });
          continue;
        }
        const rPr = kid(k, 'rPr');
        const get = (a: string) => inherit(rPr, chain, lvl, (e) => e.getAttribute(a), true);
        const r: TextRun = { text: kid(k, 't')?.textContent ?? '' };
        // a slide number or date field stays one (PowerPoint fills it in again)
        const ftype = k.localName === 'fld' ? k.getAttribute('type') ?? '' : '';
        if (/^(slidenum|datetime\d*)$/.test(ftype)) r.field = ftype;
        const sz = get('sz');
        r.size = (sz ? Number(sz) / 100 : 18) * scale;
        r.size = Math.round(r.size * 10) / 10;
        if (get('b') === '1' || get('b') === 'true') r.bold = true;
        if (get('i') === '1' || get('i') === 'true') r.italic = true;
        const u = get('u');
        if (u && u !== 'none') r.underline = true;
        // (a double line through as a single one)
        const strike = get('strike');
        if (strike && strike !== 'noStrike') r.strike = true;
        const cap = get('cap');
        if (cap === 'all') r.allCaps = true;
        else if (cap === 'small') r.smallCaps = true;
        const hl = this.color(inheritEl(rPr, chain, lvl, ['highlight'], true));
        if (hl) r.highlight = hl;
        const lang = get('lang');
        if (lang && lang !== 'en-US') r.lang = lang;
        const spc = Number(get('spc') ?? 0);
        if (spc) r.spacing = spc / 100;
        if (get('kern') === '0') r.noKern = true;
        const bl = Number(get('baseline') ?? 0);
        if (bl < 0) r.sub = true;
        else if (bl > 0) r.sup = true;
        // a shape's own text formatting, then its style's (fontRef: the white text on a filled
        // shape), then the deck's
        const fillEl = inheritEl(rPr, ownChain, lvl, ['solidFill'], true) ?? (fontRef?.firstElementChild ? fontRef : null) ?? inheritEl(null, chain.slice(ownChain.length), lvl, ['solidFill'], true);
        r.color = this.color(fillEl) ?? '#000000';
        // the Font box's text effects: no fill, a see-through fill, an outline, a shadow
        if (rPr) {
          if (kid(rPr, 'noFill')) r.noFill = true;
          const a = kid(rPr, 'solidFill')?.querySelector('alpha')?.getAttribute('val');
          if (a && Number(a) < 100000) r.transparency = Math.round((1 - Number(a) / 100000) * 100) / 100;
          const ln = kid(rPr, 'ln');
          const lnCol = ln && !kid(ln, 'noFill') ? this.color(kid(ln, 'solidFill')) : undefined;
          if (lnCol) {
            r.outline = lnCol;
            const w = Number(ln!.getAttribute('w') ?? 0);
            if (w && Math.abs(w / 12700 - 0.75) > 0.01) r.outlineW = Math.round((w / 12700) * 100) / 100;
          }
          if (kid(rPr, 'effectLst')?.querySelector('outerShdw')) r.shadow = true;
        }
        const styleFont = fontRef?.getAttribute('idx') === 'major' ? '+mj-lt' : fontRef?.getAttribute('idx') === 'minor' ? '+mn-lt' : null;
        r.font = this.font(inheritEl(rPr, ownChain, lvl, ['latin'], true)?.getAttribute('typeface') ?? styleFont ?? inheritEl(null, chain.slice(ownChain.length), lvl, ['latin'], true)?.getAttribute('typeface') ?? null, title);
        const link = this.hlinkOf(kid(rPr, 'hlinkClick'));
        if (link) {
          r.link = link;
          Object.assign(r, this.linkLook(kid(rPr, 'hlinkClick'), r.color));
        }
        runs.push(r);
      }
    });
    // a list's start kept only where it starts again (PowerPoint puts it on every item)
    paras.forEach((p, i) => {
      if (!p.startAt) return;
      const at = p.startAt, n = listInfo(paras)[i].n;
      delete p.startAt;
      if (listInfo(paras)[i].n !== n) p.startAt = at;
    });
    if (!ph && !runs.some((r) => r.text.trim())) return null;
    // formatting the master gives is left to the master; plain text keeps what it needs
    let out = merge(runs);
    if (base) out = stripBase(out, base);
    else out = out.map((r) => {
      const x = { ...r };
      if (x.color === '#000000') delete x.color;
      if (x.font === 'Arial') delete x.font;
      return x;
    });
    // the box: inside its margins
    const ins = (k: string, d: number) => {
      const v = bp(k);
      return v === null ? d : fromEmu(v);
    };
    const l = ins('lIns', 7.2), tI = ins('tIns', 3.6), rI = ins('rIns', 7.2), bI = ins('bIns', 3.6);
    const w = box.x2 - box.x1 - l - rI;
    const justify: Justify = paras[0]?.align ?? 'left';
    for (const p of paras) if (p.align === justify) delete p.align;
    const c: Omit<Caption, 'id'> = { x: box.x1 + l, y: 0, runs: out, justify };
    if (paras.some((p) => Object.keys(p).length)) c.paras = paras;
    if (lineHeight) c.lineHeight = lineHeight;
    else if (lineSpacing) c.lineSpacing = +lineSpacing.toFixed(3);
    const wrapNone = bp('wrap') === 'none';
    const sizeFor = base?.size ?? this.masterOut.drawing.captionSize;
    const full = base ? { ...c, runs: out.map((r) => ({ ...base, ...dropUndefined(r) }) as TextRun) } : c;
    if (!wrapNone || ph) c.wrap = Math.max(1, w);
    else {
      const natural = layoutText(full, sizeFor, arialMeasure).boxWidth;
      if (justify !== 'left' || natural > w) c.wrap = Math.max(w, natural);
    }
    const numCol = Number(bp('numCol') ?? 1);
    if (numCol > 1 && c.wrap !== undefined) {
      c.cols = Math.min(16, Math.round(numCol));
      const gap = fromEmu(bp('spcCol') ?? 0);
      if (gap > 0) c.colGap = +gap.toFixed(2);
    }
    if (!kind) {
      if (shrinks) c.fit = 'shrink';
      else if (kid(bodyPrs[0], 'noAutofit')) c.fit = 'fixed';
      if (c.fit) c.boxH = Math.max(1, box.y2 - box.y1 - tI - bI);
    }
    if (kind) {
      c.ph = kind;
      c.boxH = box.y2 - box.y1;
      if (!c.runs.some((r) => r.text.trim())) {
        c.runs = [];
        c.paras = kind === 'body' ? [{ list: 'bullet' }] : undefined;
        if (!c.paras) delete c.paras;
      }
    }
    const lay = layoutText({ ...full, wrap: c.wrap }, sizeFor, arialMeasure);
    const first = lay.lines[0] ? lay.lines[0].ascent / ASCENT : sizeFor;
    const anchor = bp('anchor') ?? 't';
    const room = box.y2 - box.y1 - tI - bI;
    const height = lay.lines.length ? lay.box.y2 - lay.box.y1 : 0;
    const shift = anchor === 'ctr' ? (room - height) / 2 : anchor === 'b' ? room - height : 0;
    c.y = box.y1 + tI + shift + PPT_ASCENT * first;
    if (this.inlineMath && mathAt >= 0 && lay.lines.length) {
      const at = caretPos(lay, mathAt), line = lay.lines[at.line];
      const size = line.size || sizeFor;
      this.inlineMath.at = { x: c.x + at.x, y: c.y + line.y - lay.lines[0].y - size * 0.3 };
    }
    return c;
  }
}

/** PowerPoint's own link colour, for a theme without one. */
const HLINK = '#0563C1';
/** Our links PowerPoint keeps as show jumps. */
const SHOW_JUMPS = new Set(['#first', '#last', '#next', '#prev', '#return', '#end']);
/** A link saved here to a slide that is no longer in the file. */
const GONE = Symbol('gone');
/** A design shape's look: taken from PowerPoint when its fill, outline or effects were changed there. */
const GEO_LOOK_KEYS = ['color', 'filled', 'fill', 'fillColor', 'fill2', 'gradAngle', 'gradRadial', 'pattern', 'patternColor', 'patternSize', 'patternTransparency', 'patternClear', 'fade', 'transparency', 'lineWidth', 'bold', 'dashed', 'dotted', 'hashSpacing', 'shadow', 'shadowBetween', 'shadowSize', 'shadowBlur', 'shadowAngle', 'shadowColor', 'shadowOpacity', 'glow', 'softEdge', 'reflection', 'bevel', 'picFill'] as const;
/** A text box's settings PowerPoint has no place for, kept from our tag when PowerPoint's text is read. */
const OWN_CAPTION_KEYS = ['piece', 'ole', 'grp', 'grpPath', 'stack', 'attach', 'ignoreWarnings', 'chem'] as const;

const dropUndefined = (r: TextRun): Partial<TextRun> => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined));

/** Join neighbouring runs formatted alike (a paragraph break joins the run before it). */
/**
 * Links to slides as their places (#slide-n=2): links PowerPoint made are read that way, and links
 * kept in our own tags name the slide's id when it was saved (#slide=7), turned into its place here.
 */
function placeSlideLinks(slides: PptxSlide[], ids: Map<number, number>): void {
  for (const s of slides) {
    const json = JSON.stringify(s.contents);
    if (!json.includes('"#slide=')) continue;
    s.contents = JSON.parse(json.replace(/"#slide=(\d+)"/g, (all, id) => {
      const i = ids.get(Number(id));
      return i === undefined || i < 0 ? all : `"#slide-n=${i}"`;
    }));
  }
}

function merge(runs: TextRun[]): TextRun[] {
  const same = (a: TextRun, b: TextRun) => {
    const ka = Object.keys(a).filter((k) => k !== 'text'), kb = Object.keys(b).filter((k) => k !== 'text');
    return ka.length === kb.length && ka.every((k) => (a as unknown as Record<string, unknown>)[k] === (b as unknown as Record<string, unknown>)[k]);
  };
  const out: TextRun[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (r.text === '\n' && last) last.text += '\n';
    else if (last && same(last, r)) last.text += r.text;
    else out.push({ ...r });
  }
  return out.filter((r) => r.text !== '');
}

/**
 * Size a ChemDraw object's drawing (changes `src`) as PowerPoint shows the object, in `box`, and
 * return the move that puts it there; null when it has nothing in it. ChemDraw makes the object
 * the drawing's BoundingBox plus a small margin, and PowerPoint keeps that size as imgW and imgH,
 * so the scale is the box's size over that one (labels and lines too, as PowerPoint scales the
 * picture); without them, the drawing's own size is used.
 */
export function placeChemdraw(src: Doc, cdxml: string, box: Rect, img: { w: number; h: number }, style: DocStyle): ((p: Vec) => Vec) | null {
  const own = src.bounds();
  if (!own) return null;
  const m = /<CDXML\b[^>]*?\sBoundingBox="([^"]+)"/.exec(cdxml);
  const bb = m ? m[1].trim().split(/\s+/).map(Number) : [];
  const was = bb.length === 4 && bb.every(Number.isFinite) && bb[2] > bb[0] && bb[3] > bb[1] ? { x1: bb[0], y1: bb[1], x2: bb[2], y2: bb[3] } : own;
  const w = box.x2 - box.x1, h = box.y2 - box.y1;
  const iw = img.w > 0 ? img.w : was.x2 - was.x1, ih = img.h > 0 ? img.h : was.y2 - was.y1;
  const k = Math.min(w / Math.max(1e-6, iw), h / Math.max(1e-6, ih));
  const L = typicalBondLength(src);
  // labels, lines and text grow or shrink with it; a drawing with no bonds keeps its size
  const ks = L && Number.isFinite(k) && k > 0 ? k : 1;
  fitPasted(src, style, L ? L * ks : undefined);
  const cx = ((was.x1 + was.x2) / 2) * ks, cy = ((was.y1 + was.y2) / 2) * ks;
  const nx = (box.x1 + box.x2) / 2, ny = (box.y1 + box.y2) / 2;
  return (p) => ({ x: p.x - cx + nx, y: p.y - cy + ny });
}

/** What belongs to one ChemDraw object on a slide. */
function oleItems(doc: Doc, id: number): Selection {
  const atoms = new Set<number>(), captions = new Set<number>(), arrows = new Set<number>(), shapes = new Set<number>(), bonds = new Set<number>();
  for (const a of doc.atoms.values()) if (a.ole?.id === id) atoms.add(a.id);
  for (const b of doc.bonds.values()) if (atoms.has(b.a1) && atoms.has(b.a2)) bonds.add(b.id);
  for (const c of doc.captions.values()) if (c.ole?.id === id) captions.add(c.id);
  for (const r of doc.arrows.values()) if (r.ole?.id === id) arrows.add(r.id);
  for (const sh of doc.shapes.values()) if (sh.ole?.id === id) shapes.add(sh.id);
  return { atoms, bonds, captions, arrows, shapes };
}

/** Mark everything added to `doc` since id `from` as part of one ChemDraw object. */
function markOle(doc: Doc, from: number, ole: OleMark): void {
  const to = doc.idMark;
  const mine = (id: number) => id >= from && id < to;
  for (const a of [...doc.atoms.values()]) if (mine(a.id)) doc.updateAtom(a.id, { ole });
  for (const c of [...doc.captions.values()]) if (mine(c.id)) doc.updateCaption(c.id, { ole });
  for (const r of [...doc.arrows.values()]) if (mine(r.id)) doc.updateArrow(r.id, { ole });
  for (const sh of [...doc.shapes.values()]) if (mine(sh.id)) doc.updateShape(sh.id, { ole });
}

/** Read a PowerPoint file. Throws only when the file is not a PowerPoint file at all. */
/** LaTeX as it comes back from the Office Math written for it (to tell whether PowerPoint has changed an equation). */
function texOfOmml(tex: string): string {
  const doc = new DOMParser().parseFromString(`<m:oMath xmlns:m="${NS_M}">${toOmml(tex)}</m:oMath>`, 'application/xml');
  return ommlToTex(doc.documentElement);
}

export function readPptx(bytes: Uint8Array, options: PptxReadOptions = {}): PptxRead {
  return new Reader(bytes, options).read();
}

/** A slide's mark as a keyframe's slide (its tags), with the print of what it holds now. */
function readPart(tag: string | undefined, keep: string | undefined, tree: Element | null): PartRead | null {
  if (!tag) return null;
  try {
    const o = JSON.parse(tag) as Partial<PartRead>;
    if (typeof o.uid !== 'string' || !Number.isInteger(o.index) || !Number.isInteger(o.count) || typeof o.print !== 'string') return null;
    let k: CanvasKeep | undefined;
    if (keep) {
      const c = JSON.parse(keep) as CanvasKeep;
      // the canvas's keyframes as a tag gives them, so only sound ones come back
      const canvas = c?.canvas ? readCanvasTag(canvasTag(c.canvas)) : null;
      if (canvas && c.contents && Array.isArray(c.contents.atoms)) k = { ...c, canvas, notes: typeof c.notes === 'string' ? c.notes : '' };
    }
    return { uid: o.uid, index: o.index!, count: o.count!, print: o.print, now: tree ? slidePrint(tree) : '', ...(k ? { keep: k } : {}) };
  } catch {
    return null;
  }
}

/**
 * The slides with each canvas slide saved as a slide for each keyframe put back together: a run of
 * slides marked with one canvas, starting with the one that carries the canvas itself. Unless the
 * run was changed outside since (`edited`: a slide gone, added, moved or altered) and those
 * slides are wanted as they are. `place` says where each slide read went.
 */
function joinCanvases(slides: PptxSlide[], parts: (PartRead | null)[], want: 'canvas' | 'slides'): { slides: PptxSlide[]; place: number[]; edited: number; joined: number } {
  if (!parts.some((p) => p?.keep)) return { slides, place: slides.map((_, i) => i), edited: 0, joined: 0 };
  const out: PptxSlide[] = [];
  const place: number[] = [];
  let edited = 0, joined = 0;
  for (let i = 0; i < slides.length;) {
    const first = parts[i];
    if (!first?.keep || first.index !== 0) { place[i] = out.length; out.push(slides[i]); i++; continue; }
    let j = i + 1;
    while (j < slides.length && parts[j]?.uid === first.uid && !parts[j]?.keep) j++;
    const run = parts.slice(i, j) as PartRead[];
    const changed = run.length !== first.count || run.some((p, k) => p.index !== k || p.print !== p.now);
    if (changed) edited++;
    if (changed && want === 'slides') {
      for (let k = i; k < j; k++) { place[k] = out.length; out.push(slides[k]); }
      i = j;
      continue;
    }
    joined++;
    const keep = first.keep, s = slides[i];
    for (let k = i; k < j; k++) place[k] = out.length;
    out.push({
      layout: keep.layout, contents: keep.contents, notes: keep.notes, canvas: keep.canvas,
      ...(keep.anims?.length ? { anims: keep.anims } : {}),
      ...(keep.transition ? { transition: keep.transition } : {}), ...(keep.background ? { background: keep.background } : {}),
      ...(keep.hideGraphics ? { hideGraphics: true } : {}), ...(keep.hidden ? { hidden: true } : {}),
      ...(s.comments?.length ? { comments: s.comments } : {}), ...(s.hf ? { hf: s.hf } : {}),
    });
    i = j;
  }
  return { slides: out, place, edited, joined };
}

/** The names PowerPoint (and this program) give shapes on their own: "Picture 3", "TextBox 12". */
const PPT_NAME = /^(Picture|Rectangle|Oval|Line|TextBox|Text Box|Title|Text Placeholder|Content Placeholder|Subtitle|Table|Chart|Equation|Animation|Straight Connector|Straight Arrow Connector|Elbow Connector|Curved Arrow|Connector|Freeform|Group|Diagram|Structure|Highlight|Graphic|Object|Shape|Google Shape|Footer|Slide Number|Date|Rounded Rectangle|Ellipse|Isosceles Triangle|Right Arrow|Arrow)( Placeholder)? \d+$/i;

/** Files saved here: the shapes (by id) on the master and each layout that are the template's artwork, and whether the theme is the template's. */
export interface ArtIds { theme?: boolean; master?: number[]; layouts?: Record<string, number[]> }

/** What a file saved here wrote as the master's fonts, sizes and colors (PowerPoint's changes to them win when it is read). */
export interface MasterPrint { titleFont?: string; bodyFont?: string; titleSize?: number; bodySize?: number; titleBold?: boolean; titleColor?: string; textColor?: string; background?: string }

/** PowerPoint's usual color map: light backgrounds, dark text. */
const USUAL_CLRMAP: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink' };
const sameMap = (a: Record<string, string>, b: Record<string, string>) => Object.keys({ ...a, ...b }).every((k) => (a[k] ?? k) === (b[k] ?? k));

/** The kinds of shape a master or layout draws. */
const ART_SHAPES = new Set(['sp', 'pic', 'cxnSp', 'grpSp', 'graphicFrame', 'AlternateContent']);

/** Whether a shape is a placeholder (its p:nvPr has a p:ph). */
function isPlaceholder(el: Element): boolean {
  const nv = kids(el).find((k) => /^nv/.test(k.localName)) ?? null;
  return !!kid(nv, 'nvPr', 'ph');
}

/** A shape's id (its cNvPr's, a group's own), or -1. */
function shapeId(el: Element): number {
  const target = el.localName === 'AlternateContent' ? kids(kids(el, 'Choice')[0] ?? null)[0] ?? null : el;
  const nv = kids(target).find((k) => /^nv/.test(k.localName)) ?? null;
  const v = Number(kid(nv, 'cNvPr')?.getAttribute('id'));
  return Number.isFinite(v) ? v : -1;
}

const emptyContents = (): Contents => new Doc().contents();

/** Everything added to a drawing since `mark` turned `deg` degrees clockwise about `c`, text and shapes included. */
function turnNew(doc: Doc, mark: number, c: Vec, deg: number): void {
  const ids = <T extends { id: number }>(m: Map<number, T>) => new Set([...m.values()].filter((x) => x.id >= mark).map((x) => x.id));
  const sel = { atoms: ids(doc.atoms), bonds: ids(doc.bonds), captions: ids(doc.captions), arrows: ids(doc.arrows), shapes: ids(doc.shapes) };
  const snap = snapshot(doc, sel, POINTS);
  transform(doc, snap, rotation(c, deg * DEG), false, { deg, which: () => true, shapes: true });
}

/**
 * A structure's drawing (everything added since `mark`) flipped and turned as PowerPoint shows
 * its picture: flipped in the picture's box, then turned about its middle.
 */
function poseNew(doc: Doc, mark: number, box: Rect & { rot: number; flipH: boolean; flipV: boolean }): void {
  const c = { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
  if (box.flipH || box.flipV) {
    const ids = <T extends { id: number }>(m: Map<number, T>) => new Set([...m.values()].filter((x) => x.id >= mark).map((x) => x.id));
    const sel = { atoms: ids(doc.atoms), bonds: ids(doc.bonds), captions: ids(doc.captions), arrows: ids(doc.arrows), shapes: ids(doc.shapes) };
    if (box.flipH) transform(doc, snapshot(doc, sel, POINTS), mirrorX(c.x), true);
    if (box.flipV) transform(doc, snapshot(doc, sel, POINTS), mirrorY(c.y), true);
  }
  const rot = normDegrees(box.rot);
  if (Math.abs(rot) > 1e-6) turnNew(doc, mark, c, rot);
}

/**
 * A bullet as text: the character, or for a symbol font's (Wingdings, Symbol) the character it
 * shows there; empty for one with no such character.
 */
function bulletChar(ch: string, font: string): string {
  if (!ch) return '';
  // (symbol fonts' characters may be written in the private use area, at F000 on)
  const c = ch.codePointAt(0)! >= 0xf000 && ch.codePointAt(0)! <= 0xf0ff ? String.fromCodePoint(ch.codePointAt(0)! - 0xf000) : ch;
  if (/^wingdings$/i.test(font)) return ({ '§': '■', n: '■', l: '●', q: '❑', v: '❖', Ø: '➢', ü: '✓', þ: '☑', è: '➔', w: '◆', u: '◆', o: '□' } as Record<string, string>)[c] ?? '';
  if (/^symbol$/i.test(font)) return ({ '·': '•', '-': '–', '®': '→', '¨': '♦', 'Þ': '⇒' } as Record<string, string>)[c] ?? '';
  if (/^(wingdings 2|wingdings 3|webdings|marlett)$/i.test(font)) return '';
  if (/^courier new$/i.test(font) && c === 'o') return '○';
  return c;
}

/** Everything added to a drawing since `mark` put in one group of its own, when it is two things or more. */
function groupNew(doc: Doc, mark: number): void {
  const fresh = <T extends { id: number }>(m: Map<number, T>) => [...m.values()].filter((x) => x.id >= mark);
  const atoms = fresh(doc.atoms), captions = fresh(doc.captions), arrows = fresh(doc.arrows), shapes = fresh(doc.shapes);
  // (a structure counts once)
  const seen = new Set<number>();
  let things = captions.length + arrows.length + shapes.length;
  for (const a of atoms) {
    if (seen.has(a.id)) continue;
    things++;
    for (const x of doc.fragmentOf(a.id)) seen.add(x);
  }
  if (things < 2) return;
  let top = 0;
  for (const m of [doc.atoms, doc.captions, doc.arrows, doc.shapes] as Map<number, { grp?: number }>[]) for (const e of m.values()) if (e.grp !== undefined && e.grp > top) top = e.grp;
  const grp = top + 1;
  for (const a of atoms) doc.updateAtom(a.id, { grp });
  for (const c of captions) doc.updateCaption(c.id, { grp });
  for (const r of arrows) doc.updateArrow(r.id, { grp });
  for (const sh of shapes) doc.updateShape(sh.id, { grp });
}

/** Whether PowerPoint has cropped, recolored, outlined or put effects on a picture. */
function pictureStyled(pic: Element): boolean {
  const fill = kid(pic, 'blipFill'), blip = kid(fill, 'blip'), spPr = kid(pic, 'spPr');
  const src = kid(fill, 'srcRect');
  const cropped = !!src && ['l', 't', 'r', 'b'].some((k) => Number(src.getAttribute(k) ?? 0) !== 0);
  // a blip's own effects (recolor, brightness, artistic effects); its extLst only holds the SVG and such
  const recolored = kids(blip).some((k) => k.localName !== 'extLst');
  const ln = kid(spPr, 'ln');
  const outlined = !!ln && !kid(ln, 'noFill');
  const geom = kid(spPr, 'prstGeom')?.getAttribute('prst');
  return cropped || recolored || outlined || !!kid(spPr, 'effectLst')?.firstElementChild || (!!geom && geom !== 'rect');
}

/** A shape's turn as ours keeps it (left out when it isn't turned). */
function turn(box: { rot: number }): { rot?: number } {
  const rot = normDegrees(box.rot);
  return Math.abs(rot) > 1e-6 ? { rot } : {};
}

/** A PowerPoint text box turned in its box: the text starts where the turn takes its first line. */
function turned(c: Omit<Caption, 'id'> | null, box: Rect & { rot: number }): Omit<Caption, 'id'> | null {
  const rot = normDegrees(box.rot);
  if (!c || !rot) return c;
  const a = turnAbout(c, { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 }, rot);
  return { ...c, x: a.x, y: a.y, rot };
}

/**
 * A Summary Zoom PowerPoint made plays each part's section: the part runs on to the section's
 * last slide (zoom.to) before coming back.
 */
function summaryEnds(slides: PptxSlide[], sections: SectionCount[]): void {
  const last = new Map<number, number>();
  let at = 0;
  for (const sec of sections) { if (sec.count > 1) last.set(at, at + sec.count - 1); at += sec.count; }
  for (const s of slides) {
    for (const sh of s.contents.shapes ?? []) {
      const i = /^#slide-n=(\d+)$/.exec(sh.link ?? '')?.[1];
      const end = i === undefined ? undefined : last.get(Number(i));
      if (sh.zoom?.summary && !sh.zoom.to && end !== undefined) sh.zoom = { ...sh.zoom, to: `#slide-n=${end}` };
    }
  }
}

/** PowerPoint 2010's sections (p14:sectionLst in presentation.xml), as runs of slides in order. */
function readSections(root: Element, sldIds: string[]): SectionCount[] | undefined {
  const lst = Array.from(root.getElementsByTagNameNS('*', 'sectionLst'))[0];
  if (!lst) return undefined;
  const at = new Map(sldIds.map((id, i) => [id, i]));
  const out: SectionCount[] = [];
  for (const sec of kids(lst, 'section')) {
    const ids = kids(kid(sec, 'sldIdLst'), 'sldId').map((x) => at.get(x.getAttribute('id') ?? '')).filter((i): i is number => i !== undefined);
    out.push({ name: sec.getAttribute('name') ?? 'Untitled Section', count: ids.length });
  }
  return out.length ? out : undefined;
}

/** Turn in 3-D animations back from the Spins of next to nothing PowerPoint was given, with their views from the tag. */
export function withTurns(anims: Anim[], tag: string): Anim[] {
  let views: unknown;
  try { views = JSON.parse(tag); } catch { return anims; }
  if (!Array.isArray(views)) return anims;
  let k = 0;
  return anims.map((a) => {
    if (a.effect !== 'spin' || a.turn !== 0 || k >= views.length) return a;
    const v = views[k++];
    const { turn: _, ...rest } = a;
    return { ...rest, effect: 'turn3d', ...(Array.isArray(v) && v.length === 9 && v.every((x) => typeof x === 'number') ? { view: v as number[] } : {}) };
  });
}
