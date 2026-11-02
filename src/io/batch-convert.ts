// File > Export > Batch Convert: many drawings or structure files turned into one other format at
// once (CDXML, CDX, molfile, SVG, PNG or a SMILES list), saved in a zip or a folder. Each record of
// an SD file and each line of a SMILES file becomes a file of its own.

import { Doc } from '../model';
import type { DocStyle } from '../style';
import { readCdxml } from './cdxml';
import { writeCdxml } from './cdxml-write';
import { cdxToCdxml, cdxmlToCdx } from './cdx';
import { addMolfile, toMolfile } from '../chem/molfile';
import { allSpecies } from '../chem/species';
import { recordPicture, pictureCanvas, canvasPng, pictureSvg } from '../render/picture';
import { pngWithDpi } from '../render/emf-read';

export type BatchFormat = 'cdxml' | 'cdx' | 'mol' | 'svg' | 'png' | 'smi';

/** What can be read: ChemDraw drawings, molfiles, SD files and SMILES lists. */
export const BATCH_INPUTS = ['cdxml', 'cdx', 'mol', 'sdf', 'sd', 'smi', 'smiles'];

export const BATCH_FORMATS: { value: BatchFormat; label: string }[] = [
  { value: 'cdxml', label: 'CDXML (ChemDraw XML, opens here and in ChemDraw)' },
  { value: 'cdx', label: 'CDX (binary ChemDraw)' },
  { value: 'mol', label: 'Molfile (V2000, for databases and other programs)' },
  { value: 'svg', label: 'SVG picture (stays sharp)' },
  { value: 'png', label: 'PNG picture' },
  { value: 'smi', label: 'SMILES list (one file: SMILES and name on each line)' },
];

export interface BatchItem { name: string; doc: Doc }

export interface BatchDeps {
  /** The style molfiles and SMILES are drawn in (the current drawing style). */
  style: DocStyle;
  smilesToMol(smiles: string): Promise<string | null>;
  molToSmiles(molblock: string): Promise<string | null>;
}

/** The records of an SD file, each with the name on its first line (or "" when it has none). */
export function splitSdf(text: string): { name: string; molblock: string }[] {
  const out: { name: string; molblock: string }[] = [];
  // (a record's first line, its name, may be blank, so only the line ending after $$$$ goes)
  for (const body of text.replace(/\r\n?/g, '\n').split(/^\$\$\$\$[ \t]*\n?/m)) {
    const end = body.indexOf('M  END');
    if (end < 0) continue;
    const molblock = body.slice(0, end + 6) + '\n';
    out.push({ name: molblock.split('\n')[0].trim(), molblock });
  }
  return out;
}

/** The lines of a SMILES file: the SMILES, then an optional name after a space or tab. */
export function splitSmilesList(text: string): { name: string; smiles: string }[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const m = /^(\S+)(?:\s+(.*))?$/.exec(l)!; return { smiles: m[1], name: (m[2] ?? '').trim() }; })
    .filter((x) => !/^smiles$/i.test(x.smiles));
}

/** A file name safe on Windows and Mac, made different from the ones used already. */
export function uniqueName(stem: string, ext: string, used: Set<string>): string {
  const clean = stem.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').slice(0, 120) || 'structure';
  let name = `${clean}.${ext}`;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${clean} (${i}).${ext}`;
  used.add(name.toLowerCase());
  return name;
}

const stemOf = (file: string) => file.replace(/\.[^.\\/]+$/, '');
const extensionOf = (file: string) => /\.([^.\\/]+)$/.exec(file)?.[1].toLowerCase() ?? '';

function molDoc(molblock: string, style: DocStyle): Doc | null {
  const d = new Doc();
  d.style = { ...style };
  try {
    d.bulk(() => { addMolfile(d, molblock, 0, 0); });
  } catch {
    return null;
  }
  return d.atoms.size ? d : null;
}

/**
 * The drawings in one file: one for a drawing or molfile, one per record of an SD file or line of
 * a SMILES file. Records that can't be read are counted in `failed`.
 */
export async function readBatchFile(file: string, bytes: Uint8Array, deps: BatchDeps): Promise<{ items: BatchItem[]; failed: number }> {
  const ext = extensionOf(file), stem = stemOf(file);
  const text = () => new TextDecoder().decode(bytes);
  const items: BatchItem[] = [];
  let failed = 0;
  if (ext === 'cdx') items.push({ name: stem, doc: readCdxml(cdxToCdxml(bytes)).doc });
  else if (ext === 'cdxml') items.push({ name: stem, doc: readCdxml(text()).doc });
  else if (ext === 'mol') { const d = molDoc(text(), deps.style); if (d) items.push({ name: stem, doc: d }); else failed++; }
  else if (ext === 'sdf' || ext === 'sd') {
    splitSdf(text()).forEach((r, i) => {
      const d = molDoc(r.molblock, deps.style);
      if (d) items.push({ name: r.name || `${stem}_${i + 1}`, doc: d }); else failed++;
    });
  } else if (ext === 'smi' || ext === 'smiles') {
    let i = 0;
    for (const r of splitSmilesList(text())) {
      i++;
      const mb = await deps.smilesToMol(r.smiles).catch(() => null);
      const d = mb ? molDoc(mb, deps.style) : null;
      if (d) items.push({ name: r.name || `${stem}_${i}`, doc: d }); else failed++;
    }
  } else failed++;
  return { items, failed };
}

/** One drawing in the chosen format. Null when there is nothing to write (an empty drawing). */
export async function writeBatchItem(it: BatchItem, format: Exclude<BatchFormat, 'smi'>, dpi = 300): Promise<Uint8Array | string | null> {
  const d = it.doc;
  switch (format) {
    case 'cdxml': return writeCdxml(d);
    case 'cdx': return cdxmlToCdx(writeCdxml(d));
    case 'mol': return d.atoms.size ? toMolfile(d, d.atoms.keys(), it.name, { species: allSpecies(d) }).molblock : null;
    case 'svg': { const p = recordPicture(d, 4); return p ? pictureSvg(p) : null; }
    case 'png': {
      const p = recordPicture(d, 4);
      if (!p) return null;
      const { canvas, dpi: got } = pictureCanvas(d, p, dpi);
      return pngWithDpi(new Uint8Array(await (await canvasPng(canvas)).arrayBuffer()), got);
    }
  }
}

/** A line of a SMILES list for one drawing (null when it has no structure, or one SMILES can't show). */
export async function smilesLine(it: BatchItem, deps: BatchDeps): Promise<string | null> {
  const d = it.doc;
  if (!d.atoms.size) return null;
  const { molblock, unknownLabels } = toMolfile(d, d.atoms.keys(), '', { species: allSpecies(d) });
  if (unknownLabels.length) return null;
  const smi = await deps.molToSmiles(molblock).catch(() => null);
  return smi ? `${smi}\t${it.name}` : null;
}
