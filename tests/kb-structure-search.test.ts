// @vitest-environment jsdom
// The Knowledge Base's structure search: a SMILES (typed, or the structure selected in the drawing)
// finds that compound, then every compound containing it, from a set of structures the chemistry
// worker keeps ready between searches.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { libraryMatches, structureLibrary, substructureMatches } from '../src/chem/props';
import { KnowledgeBaseWindow, type KnowledgeBaseHost } from '../src/ui/knowledge-base';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
}, 30000);

describe('a set of structures kept for searching', () => {
  it('finds what a one-off substructure search finds, and skips what it can\'t read', () => {
    const mols = ['CC(=O)O', 'not a smiles', 'CC(=O)OC', 'CC(C)=O', 'c1ccccc1C(=O)O', 'OCC'];
    const L = structureLibrary(RDKit, mols);
    for (const q of ['C(=O)[OH]', 'c1ccccc1', 'CC(C)=O', 'CO']) {
      const one = substructureMatches(RDKit, q, mols).results;
      expect(libraryMatches(RDKit, L, q).results, q).toEqual(one.flatMap((x, i) => (x ? [i] : [])));
    }
    expect(libraryMatches(RDKit, L, 'C(').error).toMatch(/read/);
    L.lib.delete();
  });

  it('returns every match of a big set, not only the first thousand', () => {
    const mols = Array.from({ length: 1500 }, (_, i) => 'C'.repeat(1 + (i % 12)) + 'O');
    const L = structureLibrary(RDKit, mols);
    expect(libraryMatches(RDKit, L, 'CO').results).toHaveLength(1500);
    L.lib.delete();
  });
});

// the first search reads every table's structures into a set, a few seconds once the big tables are in
describe('the Knowledge Base window, searched by structure', { timeout: 30000 }, () => {
  afterEach(() => { document.body.replaceChildren(); });

  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 2000 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
    expect(ok()).toBe(true);
  };

  function host(extra: Partial<KnowledgeBaseHost> = {}): KnowledgeBaseHost {
    const canon = (s: string) => { const m = RDKit.get_mol(s); try { return m?.is_valid() ? m.get_smiles() as string : null; } finally { m?.delete(); } };
    let lib: ReturnType<typeof structureLibrary> | null = null;
    let libFor: string[] = [];
    return {
      flash: () => {}, readImported: async () => null, writeImported: async () => {}, pickTable: async () => null, copyText: async () => {}, openUrl: () => {},
      canonical: async (s) => canon(s),
      contains: async (q, smiles) => {
        if (smiles !== libFor) { lib?.lib.delete(); lib = structureLibrary(RDKit, smiles); libFor = smiles; }
        return libraryMatches(RDKit, lib!, q).results;
      },
      ...extra,
    };
  }

  async function openOn(kb: KnowledgeBaseWindow, title: string) {
    if (!HTMLDialogElement.prototype.show) HTMLDialogElement.prototype.show = function () { this.open = true; };
    if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
    await kb.open();
    [...document.querySelectorAll<HTMLButtonElement>('.kb-window .kb-tab')].find((b) => b.firstElementChild?.textContent === title)!.click();
  }

  const shown = () => [...document.querySelectorAll('.kb-window .kb-table tbody tr')].map((tr) => tr.classList.contains('kb-group') ? `# ${tr.textContent}` : tr.querySelector('td')!.textContent);

  it('shows the compound itself, then the ones containing it, each under a heading', async () => {
    const kb = new KnowledgeBaseWindow(host());
    await openOn(kb, 'Solvents');
    const box = document.querySelector<HTMLInputElement>('.kb-window input[type=search]')!;
    box.value = 'O=C(C)C';
    box.dispatchEvent(new Event('input'));
    await until(() => shown().some((t) => t?.startsWith('# Containing')));
    const rows = shown();
    expect(rows.slice(0, 2)).toEqual(['# This compound (1)', 'Acetone']);
    const inside = rows.slice(rows.findIndex((t) => t?.startsWith('# Containing')) + 1);
    expect(inside).toContain('Acetylacetone');
    expect(inside).toContain('2-Butanone');
    expect(inside).not.toContain('Acetone');
    expect(inside).not.toContain('Ethyl acetate');
    expect(document.querySelector('.kb-window .kb-tab.on')!.textContent).toMatch(/^Solvents/);
  });

  it('keeps the compound itself first when a column is sorted', async () => {
    const kb = new KnowledgeBaseWindow(host());
    await openOn(kb, 'Solvents');
    const box = document.querySelector<HTMLInputElement>('.kb-window input[type=search]')!;
    box.value = 'c1ccccc1';
    box.dispatchEvent(new Event('input'));
    await until(() => shown().some((t) => t?.startsWith('# Containing')));
    [...document.querySelectorAll<HTMLElement>('.kb-window .kb-table th')].find((th) => th.textContent?.startsWith('Solvent'))!.click();
    const rows = shown();
    expect(rows.slice(0, 2)).toEqual(['# This compound (1)', 'Benzene']);
    const inside = rows.slice(3) as string[];
    expect(inside).toEqual([...inside].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    expect(inside).toContain('Toluene');
  });

  it('says so when nothing is or contains the structure', async () => {
    const kb = new KnowledgeBaseWindow(host());
    await openOn(kb, 'Solvents');
    const box = document.querySelector<HTMLInputElement>('.kb-window input[type=search]')!;
    box.value = '[Xe](F)(F)(F)F';
    box.dispatchEvent(new Event('input'));
    await until(() => !!document.querySelector('.kb-window .kb-empty')?.textContent?.includes('is or contains'));
  });

  it('searches for the structure selected in the drawing', async () => {
    const said: string[] = [];
    let pick: { smiles: string } | string = 'Select one or more structures in the drawing first.';
    const kb = new KnowledgeBaseWindow(host({ flash: (m) => said.push(m), selected: async () => pick }));
    await openOn(kb, 'Solvents');
    const use = [...document.querySelectorAll<HTMLButtonElement>('.kb-window button')].find((b) => b.textContent === 'Use Selected')!;
    use.click();
    await until(() => said.length === 1);
    expect(said[0]).toMatch(/Select one/);
    pick = { smiles: 'CC#N' };
    use.click();
    await until(() => shown()[1] === 'Acetonitrile');
    expect(document.querySelector<HTMLInputElement>('.kb-window input[type=search]')!.value).toBe('CC#N');
  });

  it('has no Use Selected button where nothing can be selected', async () => {
    const kb = new KnowledgeBaseWindow(host());
    await openOn(kb, 'Solvents');
    expect([...document.querySelectorAll('.kb-window button')].some((b) => b.textContent === 'Use Selected')).toBe(false);
  });
});
