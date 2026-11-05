// Other programs' data in Office files, kept so that saving a file here doesn't throw it away.
//
// Word, PowerPoint and Excel files carry data that add-ins and templates put there and that
// nothing here reads: custom XML parts (Chem4Word keeps each structure's CML in one, SharePoint
// and templates their fields' data), custom document properties (File > Properties > Custom),
// document variables, and the settings of Office add-ins (their task panes and the values they
// store with the document, in webextensions/). Opening a file collects them as they are, and
// saving writes them back unchanged, so the program that made them still finds them.
//
// Content controls round text (Word's w:sdt, used by Chem4Word, templates and forms) are kept
// by the Word reader and writer themselves: the runs and paragraphs inside carry the control's
// id, and ContentControl here holds its properties as Word wrote them.
//
// Written from the Office Open XML standard (ECMA-376 Part 1: custom XML data, custom file
// properties, content controls; Part 2: packages) and Microsoft's published description of add-in
// settings in documents ([MS-OWEXML]).
//
// The document's properties (File > Info: title, author, when it was made...) and Word's and
// Excel's theme are kept the same way: as the file had them, brought up to date where saving
// changes them, as Office does.

import { REL, kids, xml, type Package, type PackageReader } from './ooxml';
import { dataUrl, fromDataUrl } from '../render/images';
import { CUSTOM_PROPS_FMTID } from './docx-base';
import { reviewAuthor } from '../document/revisions';

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
export const KEPT_REL = {
  customXml: R + 'customXml',
  customXmlProps: R + 'customXmlProps',
  customProps: R + 'custom-properties',
  /** Office add-ins' task panes, and through them each add-in's stored settings. */
  addinPanes: 'http://schemas.microsoft.com/office/2011/relationships/webextensiontaskpanes',
  /** Add-ins in a document without a task pane (content add-ins and the like) hang from the main part. */
  addin: 'http://schemas.microsoft.com/office/2011/relationships/webextension',
};
const ITEM_PROPS_CT = 'application/vnd.openxmlformats-officedocument.customXmlProperties+xml';
const CUSTOM_PROPS_CT = 'application/vnd.openxmlformats-officedocument.custom-properties+xml';

/**
 * A content control's properties as the file had them: w:sdtPr's children but its id, split
 * where the id goes (after its formatting, name and tag, before the rest, as the standard orders
 * them), and w:sdtEndPr's.
 */
export interface ContentControl {
  head: string;
  rest: string;
  end?: string;
}

/** A custom XML part: its XML, and its properties part (the item's id, which data bindings point at, and its schemas). */
export interface KeptXml {
  xml: string;
  props?: string;
}

/** Parts kept whole with their relationships to each other (an add-in's task pane and settings). */
export interface KeptTree {
  /** Where it hangs: from the package ('') or from the main part ('main'), by which relationship. */
  from: '' | 'main';
  type: string;
  path: string;
  /** Each part: XML as text, anything else (a picture) as a data URL. */
  parts: { path: string; xml?: string; data?: string; type?: string }[];
  /** Their relationships, with the ids the parts' XML refers to them by. */
  rels: { from: string; type: string; target: string; external?: boolean; id?: string }[];
}

/**
 * The document's properties as the file had them: docProps/core.xml's (title, creator, created...)
 * by element name, and the ones a person types in docProps/app.xml (Company, Manager...).
 */
export interface KeptProps {
  core: Record<string, string>;
  app: Record<string, string>;
}

export interface KeptParts {
  xml?: KeptXml[];
  /** Custom document properties (<property> elements), other than the ones this app writes itself. */
  props?: string[];
  /** Word's document variables (settings' w:docVars), as the element. */
  vars?: string;
  trees?: KeptTree[];
  docProps?: KeptProps;
  /**
   * The theme part as the file had it (Word and Excel), written back while the theme isn't changed
   * here, so its fonts for each script, effects and the rest are kept. `look` is the theme as read
   * here (to tell whether it was changed).
   */
  theme?: { xml: string; look?: string };
}

const serializer = () => new XMLSerializer();

/** An element as XML text (with the namespaces it uses declared on it). */
export function elementXml(el: Element): string {
  return serializer().serializeToString(el);
}

export interface KeptReadOptions {
  /** The main part (word/document.xml, ppt/presentation.xml, xl/workbook.xml). */
  main: string;
  /** Custom XML parts this app reads itself (its own data): not kept. */
  ours?: (root: Element) => boolean;
  /** Custom properties this app writes itself (Zotero's preferences): not kept. */
  ownProp?: (name: string) => boolean;
  /** Keep the main part's theme (Word and Excel). */
  theme?: boolean;
  /** Other parts hanging from the main part, by relationship type, kept whole with the parts they lead to (Word's building blocks, its list of people). */
  trees?: string[];
}

/** Everything another program left in the file that this app doesn't read; undefined when there is none. */
export function readKeptParts(pkg: PackageReader, opts: KeptReadOptions): KeptParts | undefined {
  const out: KeptParts = {};
  // custom XML parts, in the order the main part lists them (any it doesn't list after)
  const items: string[] = [];
  for (const r of pkg.rels(opts.main).values()) if (r.type === KEPT_REL.customXml && !r.external) items.push(r.target);
  for (const name of pkg.names()) if (/^customXml\/item\d+\.xml$/i.test(name) && !items.includes(name)) items.push(name);
  const xmlParts: KeptXml[] = [];
  for (const path of items) {
    const text = pkg.text(path);
    if (text === null) continue;
    let root: Element | null = null;
    try { root = pkg.xml(path)?.documentElement ?? null; } catch { root = null; }
    if (!root || opts.ours?.(root)) continue;
    const propsPath = pkg.relOfType(path, KEPT_REL.customXmlProps);
    const props = propsPath ? pkg.text(propsPath) : null;
    xmlParts.push({ xml: text, ...(props ? { props } : {}) });
  }
  if (xmlParts.length) out.xml = xmlParts;
  // custom document properties
  const propsPath = pkg.relOfType('', KEPT_REL.customProps);
  let propsRoot: Element | null = null;
  try { propsRoot = propsPath ? pkg.xml(propsPath)?.documentElement ?? null : null; } catch { propsRoot = null; }
  const props = kids(propsRoot, 'property').filter((p) => !opts.ownProp?.(p.getAttribute('name') ?? '')).map(elementXml);
  if (props.length) out.props = props;
  // add-ins' task panes and settings, from the package and from the main part
  const trees: KeptTree[] = [];
  for (const [from, part] of [['', ''], ['main', opts.main]] as const) {
    for (const r of pkg.rels(part).values()) {
      if (r.external || (r.type !== KEPT_REL.addinPanes && r.type !== KEPT_REL.addin && !(from === 'main' && opts.trees?.includes(r.type)))) continue;
      const tree = readTree(pkg, r.target);
      if (tree) trees.push({ from, type: r.type, path: r.target, ...tree });
    }
  }
  if (trees.length) out.trees = trees;
  const docProps = readDocProps(pkg);
  if (docProps) out.docProps = docProps;
  if (opts.theme) {
    // (a theme with pictures of its own, which would need their parts too, is made afresh)
    const path = pkg.relOfType(opts.main, REL.theme);
    let ok = false;
    try { ok = !!path && !!pkg.xml(path) && !pkg.rels(path).size; } catch { ok = false; }
    const text = ok && path ? pkg.text(path) : null;
    if (text) out.theme = { xml: text };
  }
  return Object.keys(out).length ? out : undefined;
}

const CORE_NS = {
  cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
};
/** The core properties (ECMA-376 Part 2 §8.3.2) with their namespaces' prefixes, in the order Office writes them. */
const CORE_PROPS: [keyof typeof CORE_NS, string][] = [
  ['dc', 'title'], ['dc', 'subject'], ['dc', 'creator'], ['cp', 'keywords'], ['dc', 'description'], ['cp', 'lastModifiedBy'],
  ['cp', 'revision'], ['cp', 'lastPrinted'], ['dcterms', 'created'], ['dcterms', 'modified'], ['cp', 'category'],
  ['cp', 'contentStatus'], ['dc', 'language'], ['dc', 'identifier'], ['cp', 'version'],
];
/** The extended properties a person types in (File > Properties); the rest are counts made afresh on each save. */
const APP_KEPT = ['Template', 'Manager', 'Company', 'HyperlinkBase'];

/** The file's document properties (null when it has none). */
function readDocProps(pkg: PackageReader): KeptProps | null {
  const root = (type: string): Element | null => {
    const path = pkg.relOfType('', type);
    try { return path ? pkg.xml(path)?.documentElement ?? null : null; } catch { return null; }
  };
  const core: Record<string, string> = {}, app: Record<string, string> = {};
  for (const el of kids(root(REL.coreProps))) {
    const v = el.textContent ?? '';
    if (v.trim() && CORE_PROPS.some(([pre, name]) => name === el.localName && CORE_NS[pre] === el.namespaceURI)) core[el.localName] = v;
  }
  for (const el of kids(root(REL.extendedProps))) {
    const v = el.textContent ?? '';
    if (v.trim() && APP_KEPT.includes(el.localName)) app[el.localName] = v;
  }
  return Object.keys(core).length || Object.keys(app).length ? { core, app } : null;
}

/** The entries that have a value (a value or null), so that undefined ones keep what the file had. */
const defined = (o: Record<string, string | null | undefined> = {}) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined));

const PROPS_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export interface CorePropsOptions {
  /** Properties set here (by element name): a value, or null to leave one out. Those not named (or undefined) are kept from the file. */
  set?: Record<string, string | null | undefined>;
  /** What a file with no properties of its own (a new one) starts with. */
  fresh?: Record<string, string>;
  /** Who is saving: the name changes are made under here (left out when there is none). */
  by?: string;
  /** The time of the save (now). */
  now?: string;
}

/**
 * docProps/core.xml for a save: the file's own properties kept, as Office keeps them, with the
 * ones set here put in, and what Office brings up to date on each save: when the file was
 * modified, who modified it and its revision number. A file with no creation date is made now,
 * and a new file's author is whoever saves it.
 */
export function corePropsXml(kept: KeptProps | undefined, opts: CorePropsOptions = {}): string {
  const now = opts.now ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const by = (opts.by ?? reviewAuthor()).trim();
  const v: Record<string, string | null | undefined> = { ...(kept ? kept.core : opts.fresh), ...defined(opts.set) };
  const rev = kept?.core.revision?.trim();
  if (rev && /^\d{1,9}$/.test(rev)) v.revision = String(Number(rev) + 1);
  v.lastModifiedBy = by || null;
  // a new file is made by whoever saves it first, as in Office
  if (!kept && by && !v.creator) v.creator = by;
  v.created = v.created || now;
  v.modified = now;
  const body = CORE_PROPS.map(([pre, name]) => {
    const val = v[name];
    if (!val) return '';
    const type = pre === 'dcterms' ? ' xsi:type="dcterms:W3CDTF"' : '';
    return `<${pre}:${name}${type}>${xml(val)}</${pre}:${name}>`;
  }).join('');
  return `${PROPS_HEAD}<cp:coreProperties xmlns:cp="${CORE_NS.cp}" xmlns:dc="${CORE_NS.dc}" xmlns:dcterms="${CORE_NS.dcterms}" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${body}</cp:coreProperties>`;
}

/**
 * docProps/app.xml for a save: this app's name and `counts` (the program's own elements, such as
 * Slides), with the properties a person types in (Company, Manager...) kept from the file; `set`
 * (a value, or null to leave one out; undefined keeps the file's) wins over the file's.
 */
export function appPropsXml(kept: KeptProps | undefined, counts = '', set: Record<string, string | null | undefined> = {}): string {
  const v: Record<string, string | null | undefined> = { ...kept?.app, ...defined(set) };
  const tag = (k: string) => (v[k] ? `<${k}>${xml(v[k]!)}</${k}>` : '');
  return `${PROPS_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `${tag('Template')}<Application>Chem Illustrator</Application>${counts}${APP_KEPT.slice(1).map(tag).join('')}</Properties>`;
}

/** A part and the XML parts it leads to, with their relationships; null when the part isn't there. */
export function readTree(pkg: PackageReader, start: string): Pick<KeptTree, 'parts' | 'rels'> | null {
  const parts: KeptTree['parts'] = [];
  const rels: KeptTree['rels'] = [];
  const seen = new Set<string>();
  const visit = (path: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    const bytes = pkg.bytes(path);
    if (!bytes) return;
    const type = pkg.contentType(path);
    const isXml = /\.xml$/i.test(path) || /xml$/i.test(type ?? '');
    parts.push({ path, ...(isXml ? { xml: pkg.text(path) ?? '' } : { data: dataUrl(bytes, type ?? 'application/octet-stream') }), ...(type ? { type } : {}) });
    if (!isXml) return;
    for (const [id, r] of pkg.rels(path)) {
      rels.push({ from: path, type: r.type, target: r.target, ...(r.external ? { external: true } : {}), ...(id ? { id } : {}) });
      if (!r.external) visit(r.target);
    }
  };
  visit(start);
  return parts.length ? { parts, rels } : null;
}

/** The target of a relationship from one part to another, relative to the first ("../customXml/item2.xml"). */
export function relativeTarget(from: string, to: string): string {
  const a = from.split('/').slice(0, -1), b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}

export interface KeptWriteOptions {
  main: string;
  /** The number of the first custom XML part to write (customXml/itemN.xml), after the app's own. */
  firstItem: number;
  /** Custom properties the app writes itself, as [name, value] (Zotero's preferences), put first. */
  ownProps?: [string, string][];
  /** Custom XML parts to write in place of the kept ones (by index), such as Chem4Word's CML redrawn here. */
  replaceXml?: Map<number, string>;
}

/** Write kept parts back into a package being saved. */
export function writeKeptParts(pkg: Package, kept: KeptParts | undefined, opts: KeptWriteOptions): void {
  kept?.xml?.forEach((x, i) => {
    const n = opts.firstItem + i;
    const path = `customXml/item${n}.xml`;
    pkg.add(path, opts.replaceXml?.get(i) ?? x.xml);
    pkg.relate(opts.main, KEPT_REL.customXml, relativeTarget(opts.main, path));
    if (x.props) {
      pkg.add(`customXml/itemProps${n}.xml`, x.props, ITEM_PROPS_CT);
      pkg.relate(path, KEPT_REL.customXmlProps, `itemProps${n}.xml`);
    }
  });
  // custom properties: the app's own first, then the kept ones, numbered afresh
  const own = opts.ownProps ?? [];
  const keptProps = kept?.props ?? [];
  if (own.length || keptProps.length) {
    let pid = 2;
    const body = own.map(([name, value]) => `<property fmtid="${CUSTOM_PROPS_FMTID}" pid="${pid++}" name="${xml(name)}"><vt:lpwstr>${xml(value)}</vt:lpwstr></property>`)
      .concat(keptProps.map((p) => p.replace(/\spid="\d+"/, ` pid="${pid++}"`)));
    pkg.relate('', KEPT_REL.customProps, 'docProps/custom.xml');
    pkg.add('docProps/custom.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${body.join('')}</Properties>`, CUSTOM_PROPS_CT);
  }
  for (const tree of kept?.trees ?? []) writeTree(pkg, tree, opts.main);
}

/** Write a kept part and the parts it leads to, and relate it from where it hangs: the relationship's id (null when its path is taken). */
export function writeTree(pkg: Package, tree: KeptTree, main: string): string | null {
  if (pkg.has(tree.path)) return null;
  // a part whose name the saved file already uses (a picture in word/media) goes under a name of its own
  const at = new Map<string, string>();
  for (const p of tree.parts) {
    let path = p.path;
    for (let n = 1; pkg.has(path) || [...at.values()].includes(path); n++) path = p.path.replace(/(\.[^./]*)?$/, (ext) => `_kept${n}${ext}`);
    at.set(p.path, path);
  }
  for (const p of tree.parts) pkg.add(at.get(p.path)!, p.xml ?? fromDataUrl(p.data ?? 'data:application/octet-stream,').bytes, p.type);
  // (with the ids the parts' XML refers to them by)
  for (const r of tree.rels) {
    const from = at.get(r.from) ?? r.from;
    if (r.external) pkg.relate(from, r.type, r.target, true, r.id);
    else if (at.has(r.target)) pkg.relate(from, r.type, relativeTarget(from, at.get(r.target)!), false, r.id);
  }
  const from = tree.from === 'main' ? main : '';
  return pkg.relate(from, tree.type, from ? relativeTarget(from, tree.path) : tree.path);
}
