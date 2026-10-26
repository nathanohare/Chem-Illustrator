// @vitest-environment jsdom
//
// Ring templates drawn with an aromatic circle (tropylium, with its charge in the middle of the
// ring) go to the chemistry engine as a structure it can read.

import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { Doc } from '../src/model';
import { TEMPLATES, freePlacement, placeTemplate, templateById } from '../src/chem/templates';
import { toMolfile } from '../src/chem/molfile';

let RDKit: any;
beforeAll(async () => { RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')(); });

function read(id: string) {
  const doc = new Doc();
  doc.edit('Template', () => placeTemplate(doc, templateById(id)!, freePlacement({ x: 200, y: 200 }, doc.style.bondLength)));
  const m = RDKit.get_mol(toMolfile(doc, [...doc.atoms.keys()]).molblock);
  try {
    return m && m.is_valid() ? m.get_smiles() as string : null;
  } finally { m?.delete?.(); }
}

describe('circled ring templates', () => {
  const canon = (smi: string) => { const m = RDKit.get_mol(smi); try { return m.get_smiles(); } finally { m.delete(); } };

  it('tropylium reads as C7H7+ and cyclopentadienide as C5H5−', () => {
    expect(read('tropylium')).toBe(canon('[CH+]1C=CC=CC=C1'));
    expect(read('cyclopentadienide')).toBe(canon('[CH-]1C=CC=C1'));
  });

  it('every template with a circle can be read', () => {
    // the perspective Cp rings are ligands for a metal (a C5H5 radical on their own)
    const bad = TEMPLATES.filter((t) => t.circle?.length && !t.id.startsWith('persp-cp')).filter((t) => !read(t.id)).map((t) => t.id);
    expect(bad).toEqual([]);
  });
});
