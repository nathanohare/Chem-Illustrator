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

import { kids, xml, type Package, type PackageReader } from './ooxml';
import { dataUrl, fromDataUrl } from '../render/images';
import { CUSTOM_PROPS_FMTID } from './docx-base';

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
  rels: { from: string; type: string; target: string; external?: boolean }[];
}

export interface KeptParts {
  xml?: KeptXml[];
  /** Custom document properties (<property> elements), other than the ones this app writes itself. */
  props?: string[];
  /** Word's document variables (settings' w:docVars), as the element. */
  vars?: string;
  trees?: KeptTree[];
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
      if (r.external || (r.type !== KEPT_REL.addinPanes && r.type !== KEPT_REL.addin)) continue;
      const tree = readTree(pkg, r.target);
      if (tree) trees.push({ from, type: r.type, path: r.target, ...tree });
    }
  }
  if (trees.length) out.trees = trees;
  return Object.keys(out).length ? out : undefined;
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
    for (const r of pkg.rels(path).values()) {
      rels.push({ from: path, type: r.type, target: r.target, ...(r.external ? { external: true } : {}) });
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
  for (const p of tree.parts) pkg.add(p.path, p.xml ?? fromDataUrl(p.data ?? 'data:application/octet-stream,').bytes, p.type);
  for (const r of tree.rels) {
    if (r.external) pkg.relate(r.from, r.type, r.target, true);
    else if (tree.parts.some((p) => p.path === r.target)) pkg.relate(r.from, r.type, relativeTarget(r.from, r.target));
  }
  const from = tree.from === 'main' ? main : '';
  return pkg.relate(from, tree.type, from ? relativeTarget(from, tree.path) : tree.path);
}
