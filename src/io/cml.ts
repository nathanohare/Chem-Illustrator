// Chemical Markup Language (CML), as Chem4Word keeps structures in Word files.
//
// Chem4Word (the free Chemistry Add-in for Word) stores each structure as a custom XML part
// holding a CML document, and shows it in the text through a content control whose tag is the
// part's id (c4w:customXmlPartGuid). Reading the CML lets those structures open here as
// drawings; writing it again after a structure is changed here keeps Chem4Word able to edit it.
//
// Written from the CML schema (xml-cml.org: molecule, atomArray/atom with elementType, x2, y2,
// formalCharge, isotopeNumber; bondArray/bond with atomRefs2, order, bondStereo) and Chem4Word's
// published notes on its use of CML (CML.md in its Apache-licensed repository: the c4w
// namespace, customXmlPartGuid, S/D/T/A bond orders and W/H/S stereo marks).

import type { Atom, Bond, Contents } from '../model';
import { PARTIAL } from '../model';
import { elementNumber, SYMBOLS } from '../chem/elements';
import { bytesHash, xml } from './ooxml';

export const CML_NS = 'http://www.xml-cml.org/schema';
export const C4W_NS = 'http://www.chem4word.com/cml';
/** Chem4Word's usual bond length, in its CML coordinates. */
const C4W_BOND = 20;

/** Elements in any namespace by local name, below `el`. */
function all(el: Element | Document, name: string): Element[] {
  return Array.from(el.getElementsByTagNameNS('*', name));
}

function parse(text: string): Element | null {
  try {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
    return doc.documentElement;
  } catch {
    return null;
  }
}

/** Whether a custom XML part's root is a CML document. */
export function isCml(root: Element | null | undefined): boolean {
  return !!root && root.namespaceURI === CML_NS;
}

/** The structure's id in a Chem4Word CML document (c4w:customXmlPartGuid), or ''. */
export function cmlGuid(text: string): string {
  const root = parse(text);
  if (!isCml(root)) return '';
  const g = all(root!, 'customXmlPartGuid')[0];
  return g?.textContent?.trim() ?? '';
}

/** The molecule element an element is inside (the nearest), or null. */
function moleculeOf(el: Element): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) if (p.localName === 'molecule') return p;
  return null;
}

const ORDERS: Record<string, number> = { S: 1, D: 2, T: 3, A: 1.5, partial01: PARTIAL, partial12: 1.5, partial23: 2, hbond: PARTIAL, other: PARTIAL };

/**
 * The atoms and bonds of a CML document, at its own coordinates (y down, as Chem4Word keeps
 * them); null when it has none. Atoms that are a group (Chem4Word's functional groups: OMe, Ph,
 * CO2Et) keep their name as the label.
 */
export function readCml(text: string): Contents | null {
  const root = parse(text);
  if (!root || !isCml(root)) return null;
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  // atom ids are looked up in the bond's own molecule first: two molecules can both have an a1
  const ids = new Map<string, number>();
  const idsIn = new Map<Element, Map<string, number>>();
  let next = 1;
  for (const a of all(root, 'atom')) {
    const x = Number(a.getAttribute('x2')), y = Number(a.getAttribute('y2'));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const type = a.getAttribute('elementType') ?? 'C';
    const z = elementNumber(type);
    const id = next++;
    const key = a.getAttribute('id') ?? `#${id}`;
    if (!ids.has(key)) ids.set(key, id);
    const mol = moleculeOf(a);
    if (mol) { if (!idsIn.has(mol)) idsIn.set(mol, new Map()); idsIn.get(mol)!.set(key, id); }
    atoms.push({
      id, x, y, z: z ?? 6, label: z === undefined ? type : null,
      charge: Math.round(Number(a.getAttribute('formalCharge') ?? 0)) || 0,
      isotope: Math.round(Number(a.getAttribute('isotopeNumber') ?? 0)) || (type === 'D' ? 2 : type === 'T' ? 3 : 0),
      just: 'auto',
    });
  }
  if (!atoms.length) return null;
  for (const b of all(root, 'bond')) {
    const [r1, r2] = (b.getAttribute('atomRefs2') ?? '').trim().split(/\s+/);
    const look = (ref: string) => { for (let m = moleculeOf(b); m; m = moleculeOf(m)) { const got = idsIn.get(m)?.get(ref); if (got !== undefined) return got; } return ids.get(ref); };
    const a1 = look(r1), a2 = look(r2);
    if (a1 === undefined || a2 === undefined || a1 === a2) continue;
    const o = b.getAttribute('order') ?? 'S';
    const order = ORDERS[o] ?? (Number.isFinite(Number(o)) && Number(o) > 0 ? Math.min(4, Number(o)) : 1);
    const stereo = all(b, 'bondStereo')[0]?.textContent?.trim() ?? '';
    const display: Bond['display'] = stereo === 'W' ? 'wedge' : stereo === 'H' ? 'hashWedge' : stereo === 'S' ? 'wavy' : stereo === 'Thick' ? 'bold' : order === PARTIAL ? 'dash' : 'solid';
    bonds.push({ id: next++, a1, a2, order, display, dpos: 'auto' });
  }
  return { atoms, bonds, captions: [], arrows: [], shapes: [] };
}

/** Bonds' median length (for scaling between this app's points and Chem4Word's units). */
function medianBond(c: Contents): number {
  const at = new Map(c.atoms.map((a) => [a.id, a]));
  const lens = c.bonds.map((b) => { const p = at.get(b.a1), q = at.get(b.a2); return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 0; }).filter((l) => l > 0).sort((a, b) => a - b);
  return lens.length ? lens[Math.floor(lens.length / 2)] : 0;
}

const ORDER_OUT: [number, string][] = [[PARTIAL, 'partial01'], [1, 'S'], [1.5, 'A'], [2, 'D'], [3, 'T']];
const STEREO_OUT: Partial<Record<Bond['display'], string>> = { wedge: 'W', hashWedge: 'H', wavy: 'S', bold: 'Thick' };

/** An atom's CML elementType: its element, unless its label names a group (a label that is just the element with hydrogens, NH2 or OH, is the element). */
function cmlElementType(a: Atom): string {
  const label = a.label?.trim();
  const own = SYMBOLS[a.z] || 'C';
  if (!label) return own;
  if (elementNumber(label) !== undefined) return label;
  const bare = label.replace(/H\d*/g, '').replace(/[+\-−\d]+$/, '');
  return bare === own || bare === '' ? own : label;
}

/**
 * A molecule's chemistry, for telling whether a structure is still the same one: each atom's
 * type, charge and isotope with its bonds (order and stereo mark) and neighbors. Moving or
 * turning a structure keeps it; changing an atom, a bond or a wedge does not.
 */
function chemSig(atoms: { key: string; type: string; charge: number; iso: number }[], bonds: { a: string; b: string; order: string; stereo: string }[]): string {
  const at = new Map(atoms.map((a) => [a.key, a]));
  const own = (a: { type: string; charge: number; iso: number }) => `${a.type}${a.charge || ''}${a.iso ? `@${a.iso}` : ''}`;
  const near = new Map<string, string[]>(atoms.map((a) => [a.key, []]));
  for (const b of bonds) {
    const p = at.get(b.a), q = at.get(b.b);
    if (!p || !q) continue;
    near.get(b.a)!.push(`${b.order}${b.stereo}>${own(q)}`);
    near.get(b.b)!.push(`${b.order}${b.stereo}<${own(p)}`);
  }
  return atoms.map((a) => `${own(a)}[${near.get(a.key)!.sort().join(',')}]`).sort().join(';');
}

/** Chem4Word's own data on each molecule of a CML document (its names, formulae and labels), by the molecule's chemistry. */
function keptNames(text: string | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const root = text ? parse(text) : null;
  if (!root || !isCml(root)) return out;
  const ser = new XMLSerializer();
  for (const m of all(root, 'molecule')) {
    const arr = Array.from(m.children).find((k) => k.localName === 'atomArray');
    if (!arr) continue;
    const atoms = Array.from(arr.children).filter((k) => k.localName === 'atom').map((a) => ({
      key: a.getAttribute('id') ?? '', type: a.getAttribute('elementType') ?? 'C',
      charge: Math.round(Number(a.getAttribute('formalCharge') ?? 0)) || 0, iso: Math.round(Number(a.getAttribute('isotopeNumber') ?? 0)) || 0,
    }));
    const bondArr = Array.from(m.children).find((k) => k.localName === 'bondArray');
    const bonds = bondArr ? Array.from(bondArr.children).filter((k) => k.localName === 'bond').map((b) => {
      const [a, z] = (b.getAttribute('atomRefs2') ?? '').trim().split(/\s+/);
      const o = b.getAttribute('order') ?? 'S';
      return { a, b: z, order: ({ '1': 'S', '2': 'D', '3': 'T' } as Record<string, string>)[o] ?? o, stereo: all(b, 'bondStereo')[0]?.textContent?.trim() ?? '' };
    }) : [];
    const names = Array.from(m.children).filter((k) => k.localName === 'name' || k.localName === 'formula' || k.localName === 'label').map((k) => ser.serializeToString(k).replace(/ xmlns(:\w+)?="[^"]*"/g, '').replace(/<(\/?)(?!\w+:)(\w+)/g, '<$1cml:$2'));
    if (names.length) out.set(chemSig(atoms, bonds), names);
  }
  return out;
}

/**
 * A drawing's atoms and bonds as a Chem4Word CML document carrying the structure's id, at
 * Chem4Word's scale: each connected structure a molecule of its own. Labels that are not an
 * element's symbol go out as Chem4Word's functional groups, by name. With the CML it replaces
 * (`old`), a molecule that is still the same chemistry keeps Chem4Word's names and formulae.
 */
export function writeCml(c: Contents, guid: string, old?: string): string {
  const names = keptNames(old);
  const L = medianBond(c);
  const k = L > 0 ? C4W_BOND / L : 1;
  const num = (v: number) => String(Math.round(v * k * 1e4) / 1e4);
  // connected structures, each a molecule
  const parent = new Map<number, number>(c.atoms.map((a) => [a.id, a.id]));
  const find = (x: number): number => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  for (const b of c.bonds) if (parent.has(b.a1) && parent.has(b.a2)) parent.set(find(b.a1), find(b.a2));
  const groups = new Map<number, Atom[]>();
  for (const a of c.atoms) { const r = find(a.id); groups.set(r, [...(groups.get(r) ?? []), a]); }
  const out: string[] = [];
  let m = 0;
  const atomId = new Map<number, string>();
  for (const atoms of groups.values()) {
    m++;
    const inMol = new Set(atoms.map((a) => a.id));
    const atomXml = atoms.map((a) => {
      const id = `a${atomId.size + 1}`;
      atomId.set(a.id, id);
      const sym = cmlElementType(a);
      const charge = a.charge ? ` formalCharge="${a.charge}"` : '';
      const iso = a.isotope ? ` isotopeNumber="${a.isotope}"` : '';
      return `<cml:atom id="${id}" elementType="${xml(sym)}" x2="${num(a.x)}" y2="${num(a.y)}"${charge}${iso}/>`;
    });
    const bonds = c.bonds.filter((b) => inMol.has(b.a1) && inMol.has(b.a2));
    const bondXml = bonds.map((b, i) => {
      const order = ORDER_OUT.find(([v]) => Math.abs(v - b.order) < 1e-6)?.[1] ?? (b.order >= 3 ? 'T' : 'S');
      const stereo = STEREO_OUT[b.display];
      return `<cml:bond id="m${m}.b${i + 1}" atomRefs2="${atomId.get(b.a1)} ${atomId.get(b.a2)}" order="${order}"${stereo ? `><cml:bondStereo>${stereo}</cml:bondStereo></cml:bond>` : '/>'}`;
    });
    const sig = chemSig(atoms.map((a) => ({ key: atomId.get(a.id)!, type: cmlElementType(a), charge: a.charge || 0, iso: a.isotope || 0 })),
      bonds.map((b) => ({ a: atomId.get(b.a1)!, b: atomId.get(b.a2)!, order: ORDER_OUT.find(([v]) => Math.abs(v - b.order) < 1e-6)?.[1] ?? (b.order >= 3 ? 'T' : 'S'), stereo: STEREO_OUT[b.display] ?? '' })));
    const own = names.get(sig) ?? [];
    names.delete(sig);
    out.push(`<cml:molecule id="m${m}">${own.join('')}<cml:atomArray>${atomXml.join('')}</cml:atomArray>${bondXml.length ? `<cml:bondArray>${bondXml.join('')}</cml:bondArray>` : ''}</cml:molecule>`);
  }
  return `<?xml version="1.0" encoding="utf-8"?>\n<cml:cml xmlns:conventions="http://www.xml-cml.org/convention/" xmlns:cml="${CML_NS}" xmlns:cmlDict="http://www.xml-cml.org/dictionary/cml/" xmlns:nameDict="http://www.xml-cml.org/dictionary/cml/name/" xmlns:c4w="${C4W_NS}" conventions="convention:molecular"><c4w:customXmlPartGuid>${xml(guid)}</c4w:customXmlPartGuid>${out.join('')}</cml:cml>`;
}

/** A fingerprint of a drawing's contents, to tell later whether it was changed. */
export function contentsSig(c: Contents): string {
  return bytesHash(new TextEncoder().encode(JSON.stringify(c)));
}
