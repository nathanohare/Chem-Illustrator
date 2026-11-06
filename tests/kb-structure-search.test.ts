// @vitest-environment jsdom
// The Knowledge Base's structure search: a SMILES (typed, or the structure selected in the drawing)
// finds that compound, then every compound containing it, from a set of structures the chemistry
// worker keeps ready between searches.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { libraryMatches, structureLibrary, substructureMatches } from '../src/chem/props';
import { KnowledgeBaseWindow, type KbDrawing, type KnowledgeBaseHost } from '../src/ui/knowledge-base';
import { joinAttachment } from '../src/kb/tables';
import type { Contents } from '../src/model';

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

describe('a group drawn on an attachment point, searched on the ring it sits on', () => {
  const canon = (s: string | null) => { const m = RDKit.get_mol(s ?? ''); try { return m?.is_valid() ? m.get_smiles() as string : null; } finally { m?.delete(); } };
  it('joins the attachment point to the ring, wherever it is written', () => {
    expect(canon(joinAttachment('*C(F)(F)F', 'c1ccccc1'))).toBe(canon('FC(F)(F)c1ccccc1'));
    expect(canon(joinAttachment('CO[*]', 'c1ccccc1'))).toBe(canon('COc1ccccc1'));
    expect(canon(joinAttachment('C1CCC(*)CC1', 'c1ccccc1'))).toBe(canon('C1CCC(CC1)c1ccccc1'));
    expect(canon(joinAttachment('[1*]N(=O)=O', 'c1ccccc1'))).toBe(canon('O=[N+]([O-])c1ccccc1'));
  });
  it('joins only a drawing with one attachment point', () => {
    expect(joinAttachment('CCO', 'c1ccccc1')).toBeNull();
    expect(joinAttachment('*CC*', 'c1ccccc1')).toBeNull();
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
    await openOn(kb, 'Reagent Safety');
    const box = document.querySelector<HTMLInputElement>('.kb-window input[type=search]')!;
    box.value = 'O=C(C)C';
    box.dispatchEvent(new Event('input'));
    await until(() => shown().some((t) => t?.startsWith('# Containing')));
    const rows = shown();
    expect(rows.slice(0, 2)).toEqual(['# This compound (1)', 'Acetone']);
    const inside = rows.slice(rows.findIndex((t) => t?.startsWith('# Containing')) + 1);
    expect(inside).toContain('2-Octanone');
    expect(inside).toContain('Methyl vinyl ketone');
    expect(inside).not.toContain('Acetone');
    expect(inside).not.toContain('Ethyl acetate');
    expect(document.querySelector('.kb-window .kb-tab.on')!.textContent).toMatch(/^Reagent Safety/);
  });

  it('keeps the compound itself first when a column is sorted', async () => {
    const kb = new KnowledgeBaseWindow(host());
    await openOn(kb, 'Physical Constants');
    const box = document.querySelector<HTMLInputElement>('.kb-window input[type=search]')!;
    box.value = 'c1ccccc1';
    box.dispatchEvent(new Event('input'));
    await until(() => shown().some((t) => t?.startsWith('# Containing')));
    [...document.querySelectorAll<HTMLElement>('.kb-window .kb-table th')].find((th) => th.textContent?.startsWith('Compound'))!.click();
    const rows = shown();
    expect(rows.slice(0, 2)).toEqual(['# This compound (1)', 'Benzene']);
    const inside = rows.slice(3) as string[];
    expect(inside).toEqual([...inside].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    expect(inside).toContain('1,2-Dichlorobenzene');
  });

  it('says so when nothing is or contains the structure', async () => {
    const kb = new KnowledgeBaseWindow(host());
    await openOn(kb, 'Physical Constants');
    const box = document.querySelector<HTMLInputElement>('.kb-window input[type=search]')!;
    box.value = '[Xe](F)(F)(F)F';
    box.dispatchEvent(new Event('input'));
    await until(() => !!document.querySelector('.kb-window .kb-empty')?.textContent?.includes('is or contains'));
  });

  it('searches for the structure selected in the drawing', async () => {
    const said: string[] = [];
    let pick: { smiles: string } | string = 'Select one or more structures in the drawing first.';
    const kb = new KnowledgeBaseWindow(host({ flash: (m) => said.push(m), selected: async () => pick }));
    await openOn(kb, 'Physical Constants');
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
    await openOn(kb, 'Physical Constants');
    expect([...document.querySelectorAll('.kb-window button')].some((b) => b.textContent === 'Use Selected')).toBe(false);
  });

  describe('drawn in the Draw window', () => {
    const drawing = (n: number) => ({ atoms: Array.from({ length: n }, (_, i) => ({ id: i + 1 })), bonds: [], captions: [], arrows: [], shapes: [] }) as unknown as Contents;

    /** The drawing tools, as the program lends them: what was drawn is set by the test. */
    function tools(selection: Contents | string = 'Select a structure in the drawing before opening Draw.') {
      const calls: string[] = [];
      let tool: string | number = 'bond-single';
      let session: ((c: Contents | null) => void) | null = null;
      const t = {
        calls,
        now: null as Contents | null,
        area: null as (() => DOMRect | null) | null,
        start: (c, area, done) => { calls.push(`start ${c?.atoms.length ?? 0}`); t.now = c; t.area = area; session = done; },
        finish: (keep) => { calls.push(`finish ${keep}`); const s = session; session = null; s?.(keep ? t.now ?? drawing(0) : null); },
        tool: (x) => { tool = x; calls.push(`tool ${x}`); },
        current: () => tool,
        selection: () => selection,
        smiles: async (c, on) => {
          if (on) { calls.push(`smiles on ${on}`); return { smiles: 'FC(F)(F)c1ccccc1' }; }
          return c.atoms.length === 6 ? { smiles: 'c1ccccc1' } : 'The structure couldn\'t be read (check its valences).';
        },
        group: () => drawing(2),
      } satisfies KbDrawing & Record<string, unknown>;
      return t;
    }
    const win = () => document.querySelector<HTMLElement>('.kb-window .kb-draw');
    const press = (label: string, inside: ParentNode = document) => [...inside.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label || b.title === label)!.click();

    it('opens over the table with bond, ring and atom buttons that pick the drawing tools', async () => {
      const t = tools();
      const kb = new KnowledgeBaseWindow(host({ drawing: t }));
      await openOn(kb, 'Physical Constants');
      const head = document.querySelector('.kb-window .kb-head')!;
      expect([...head.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Draw…']);
      press('Draw…');
      expect(win()).not.toBeNull();
      expect(t.calls).toEqual(['start 0']);
      expect(t.area!()).not.toBeNull();
      press('Benzene ring', win()!);
      press('N', win()!);
      expect(t.calls.slice(1)).toEqual(['tool ring-benzene', 'tool 7']);
      expect([...win()!.querySelectorAll('.kb-draw-tools button.on')].map((b) => b.textContent)).toEqual(['N']);
    });

    it('searches for what was drawn, and opens with it again', async () => {
      const t = tools();
      const kb = new KnowledgeBaseWindow(host({ drawing: t }));
      await openOn(kb, 'Physical Constants');
      press('Draw…');
      t.now = drawing(6);
      press('Search', win()!);
      await until(() => shown()[1] === 'Benzene');
      expect(win()).toBeNull();
      expect(document.querySelector<HTMLInputElement>('.kb-window input[type=search]')!.value).toBe('c1ccccc1');
      press('Draw…');
      expect(t.calls.at(-1)).toBe('start 6');
    });

    it('keeps the window open when nothing is drawn, and says why a drawing can\'t be searched', async () => {
      const said: string[] = [];
      const t = tools();
      const kb = new KnowledgeBaseWindow(host({ drawing: t, flash: (m) => said.push(m) }));
      await openOn(kb, 'Physical Constants');
      press('Draw…');
      press('Search', win()!);
      await until(() => said.length === 1);
      expect(said[0]).toMatch(/Draw a structure/);
      expect(win()).not.toBeNull();
      t.now = drawing(3);
      press('Search', win()!);
      await until(() => said.length === 2);
      expect(said[1]).toMatch(/couldn't be read/);
      expect(document.querySelector<HTMLInputElement>('.kb-window input[type=search]')!.value).toBe('');
    });

    it('cancels without searching, and stops drawing when the Knowledge Base closes', async () => {
      const t = tools();
      const kb = new KnowledgeBaseWindow(host({ drawing: t }));
      await openOn(kb, 'Physical Constants');
      press('Draw…');
      t.now = drawing(6);
      press('Cancel', win()!);
      expect(win()).toBeNull();
      expect(document.querySelector<HTMLInputElement>('.kb-window input[type=search]')!.value).toBe('');
      press('Draw…');
      expect(t.calls.at(-1)).toBe('start 0');
      kb.close();
      expect(t.calls.at(-1)).toBe('finish false');
    });

    it('starts again empty (Clear) or from the structure selected in the drawing (Use Selected)', async () => {
      const said: string[] = [];
      const none = tools();
      const kb = new KnowledgeBaseWindow(host({ drawing: none, flash: (m) => said.push(m) }));
      await openOn(kb, 'Physical Constants');
      press('Draw…');
      press('Use Selected', win()!);
      expect(said[0]).toMatch(/Select a structure/);
      kb.close();
      const t = tools(drawing(6));
      const kb2 = new KnowledgeBaseWindow(host({ drawing: t }));
      await openOn(kb2, 'Physical Constants');
      press('Draw…');
      press('Use Selected', win()!);
      expect(t.calls).toEqual(['start 0', 'finish false', 'start 6']);
      press('Clear', win()!);
      expect(t.calls.slice(3)).toEqual(['finish false', 'start 0']);
      expect(win()).not.toBeNull();
    });

    it('starts from an attachment point on Hammett Constants, and searches the group on its ring', async () => {
      const t = tools();
      const kb = new KnowledgeBaseWindow(host({ drawing: t }));
      await openOn(kb, 'Hammett Constants');
      press('Draw…');
      expect(win()!.querySelector('.kb-draw-title')!.textContent).toMatch(/^Draw a Group to Search/);
      expect(t.calls).toEqual(['start 2']);
      t.now = drawing(5);
      press('Search', win()!);
      await until(() => shown()[0] === '# This compound (1)');
      expect(document.querySelectorAll('.kb-window .kb-table tbody tr')[1].children[1].textContent).toBe('CF₃');
      expect(t.calls.at(-1)).toBe('smiles on c1ccccc1');
      expect(document.querySelector('.kb-window .kb-tab.on')!.textContent).toMatch(/^Hammett Constants/);
      expect(document.querySelector<HTMLInputElement>('.kb-window input[type=search]')!.value).toBe('FC(F)(F)c1ccccc1');
      // the group is kept for the next time; Clear goes back to the attachment point
      press('Draw…');
      expect(t.calls.at(-1)).toBe('start 5');
      press('Clear', win()!);
      expect(t.calls.slice(-2)).toEqual(['finish false', 'start 2']);
    });
  });
});

describe('tables read whole, without a search', () => {
  afterEach(() => { document.body.replaceChildren(); });
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 500 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
    expect(ok()).toBe(true);
  };
  const host = (): KnowledgeBaseHost => ({
    flash: () => {}, readImported: async () => null, writeImported: async () => {}, pickTable: async () => null, copyText: async () => {}, openUrl: () => {},
    canonical: async () => null, contains: async () => null,
    drawing: { start: () => {}, finish: () => {}, tool: () => {}, current: () => 'bond-single', selection: () => '', smiles: async () => '', group: () => ({ atoms: [], bonds: [], captions: [], arrows: [], shapes: [] }) },
  });
  const tab = (title: string) => [...document.querySelectorAll<HTMLButtonElement>('.kb-window .kb-tab')].find((b) => b.firstElementChild?.textContent === title)!;
  const box = () => document.querySelector<HTMLInputElement>('.kb-window input[type=search]')!;
  const drawBtn = () => [...document.querySelectorAll<HTMLButtonElement>('.kb-window .kb-head button')].find((b) => b.textContent === 'Draw…')!;

  it('hides the search box and Draw… on Solvents and Miscibility, which show every row whatever was typed', async () => {
    if (!HTMLDialogElement.prototype.show) HTMLDialogElement.prototype.show = function () { this.open = true; };
    const kb = new KnowledgeBaseWindow(host());
    await kb.open();
    tab('Reagent Safety').click();
    box().value = 'acetone';
    box().dispatchEvent(new Event('input'));
    await until(() => tab('Reagent Safety').lastElementChild!.textContent !== '5559');
    expect(box().hidden).toBe(false);
    expect(drawBtn().hidden).toBe(false);
    expect(tab('Solvents').lastElementChild!.textContent).toBe('64');
    expect(tab('Solvents').classList.contains('none')).toBe(false);
    tab('Solvents').click();
    expect(box().hidden).toBe(true);
    expect(drawBtn().hidden).toBe(true);
    expect(document.querySelector('.kb-window .refs-edit .muted')!.textContent).toBe('64 rows');
    tab('Miscibility').click();
    expect(box().hidden).toBe(true);
    expect(document.querySelectorAll('.kb-window .kb-mx-row')).toHaveLength(31);
    expect(document.querySelector('.kb-window .hit')).toBeNull();
    // back on a table that is searched, the search is still there
    tab('Reagent Safety').click();
    expect(box().hidden).toBe(false);
    expect(box().value).toBe('acetone');
  });

  it('gives Solvents no ICH class filter, and explains Hammett\'s Attached through filter', async () => {
    if (!HTMLDialogElement.prototype.show) HTMLDialogElement.prototype.show = function () { this.open = true; };
    const kb = new KnowledgeBaseWindow(host());
    await kb.open();
    tab('Solvents').click();
    expect(document.querySelectorAll('.kb-window .kb-filters label')).toHaveLength(0);
    expect(document.querySelector('.kb-window .kb-table thead')!.textContent).toContain('ICH class');
    tab('Hammett Constants').click();
    const label = document.querySelector('.kb-window .kb-filters label')!;
    expect(label.firstElementChild!.textContent).toBe('Attached through');
    expect(label.querySelector<HTMLElement>('.info-icon')!.dataset.tip).toMatch(/bonds the group to the benzene ring/);
    expect([...label.querySelectorAll('option')].map((o) => o.textContent)).toContain('Oxygen');
  });
});

