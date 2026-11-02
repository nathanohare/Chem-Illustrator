// The Lab Calculator window: mass, mmol and volume of a compound (neat or as a solution, with
// purity and equivalents), the mass to weigh for a solution, and dilutions. The molecular weight
// comes from the selected structure when there is one; every box can be typed in.

import { amounts, dilution, show, solutionMass, type Given } from '../chem/lab-calc';
import { showDialog } from './dialog-host';

export interface CalcStart {
  /** The compound's name or formula, shown as a heading. */
  label?: string;
  mw?: number;
}

type Unit = { label: string; factor: number };
const MASS: Unit[] = [{ label: 'mg', factor: 1 }, { label: 'g', factor: 1000 }];
const VOL: Unit[] = [{ label: 'mL', factor: 1 }, { label: 'µL', factor: 0.001 }, { label: 'L', factor: 1000 }];
const AMOUNT: Unit[] = [{ label: 'mmol', factor: 1 }, { label: 'µmol', factor: 0.001 }, { label: 'mol', factor: 1000 }];
const CONC: Unit[] = [{ label: 'M', factor: 1 }, { label: 'mM', factor: 0.001 }];

let lastTab = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

interface Box { input: HTMLInputElement; unit?: HTMLSelectElement; units?: Unit[]; row: HTMLElement }

/** A labelled number box with an optional unit picker. */
function box(label: string, units?: Unit[] | string, title?: string): Box {
  const row = el('label', 'ask-row calc-row');
  const name = el('span', '', label);
  if (title) row.title = title;
  const input = el('input');
  input.type = 'number';
  input.step = 'any';
  input.min = '0';
  row.append(name, input);
  const b: Box = { input, row };
  if (typeof units === 'string') row.append(el('span', 'muted', units));
  else if (units) {
    const sel = el('select');
    sel.setAttribute('aria-label', `${label} unit`);
    for (const u of units) sel.add(new Option(u.label));
    row.append(sel);
    b.unit = sel;
    b.units = units;
  }
  return b;
}

const factor = (b: Box) => (b.units ? b.units[b.unit!.selectedIndex].factor : 1);
/** The box's value in the base unit (mg, mmol, mL, M), or undefined when empty. */
const read = (b: Box): number | undefined => { const v = parseFloat(b.input.value); return Number.isFinite(v) ? v * factor(b) : undefined; };
const write = (b: Box, v: number | undefined) => { b.input.value = v === undefined ? '' : show(v / factor(b)); };

export function showLabCalculator(start: CalcStart = {}): Promise<void> {
  return new Promise((resolve) => {
    const d = el('dialog', 'ask calc-dialog');
    d.setAttribute('aria-label', 'Lab calculator');
    const form = el('form');
    form.method = 'dialog';
    form.append(el('h2', '', 'Lab Calculator'));
    const tabs = el('div', 'calc-tabs');
    tabs.setAttribute('role', 'tablist');
    const pages: HTMLElement[] = [];
    const tabButtons: HTMLButtonElement[] = [];
    const page = (name: string) => {
      const b = el('button', '', name);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      const p = el('div', 'calc-page');
      p.setAttribute('role', 'tabpanel');
      const n = pages.length;
      b.addEventListener('click', () => pick(n));
      tabs.append(b);
      tabButtons.push(b);
      pages.push(p);
      return p;
    };
    const pick = (n: number) => {
      lastTab = n;
      pages.forEach((p, i) => { p.hidden = i !== n; tabButtons[i].setAttribute('aria-selected', String(i === n)); });
    };

    // ---- Amounts: one compound, any one quantity typed, the rest follow
    const a = page('Amounts');
    // (formula digits lowered: C7H6O2 → C₇H₆O₂)
    if (start.label) a.append(el('p', 'calc-compound', start.label.replace(/(?<=[A-Za-z)])(\d+)/g, (d) => [...d].map((c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)]).join(''))));
    const mw = box('Mol. wt.', 'g/mol');
    const density = box('Density', 'g/mL', 'For the volume of the neat liquid');
    const molarity = box('Solution', CONC, 'The concentration of a solution of it, for the volume of solution (n-BuLi in hexanes, say)');
    const purity = box('Purity', '%', 'Purity or weight percent; the mass to weigh is the mass of the reagent as bought');
    purity.input.max = '100';
    const props = el('div', 'calc-group');
    props.append(mw.row, density.row, molarity.row, purity.row);
    const limiting = box('Limiting reagent', AMOUNT, 'The amount of the limiting reagent, for working from equivalents');
    const equiv = box('Equivalents', 'equiv');
    const eq = el('div', 'calc-group');
    eq.append(limiting.row, equiv.row);
    const mass = box('Mass', MASS);
    const mmol = box('Amount', AMOUNT);
    const neat = box('Volume (neat)', VOL);
    const soln = box('Volume of solution', VOL);
    const out = el('div', 'calc-group calc-results');
    out.append(mass.row, mmol.row, neat.row, soln.row);
    const aNote = el('p', 'muted small');
    aNote.setAttribute('role', 'status');
    a.append(props, eq, out, aNote);
    if (start.mw) mw.input.value = start.mw.toFixed(2);
    purity.input.value = '100';

    let given: Given = 'mmol';
    const sources: [Box, Given][] = [[mass, 'mass'], [mmol, 'mmol'], [neat, 'volume'], [soln, 'solution']];
    const solveAmounts = () => {
      const src = sources.find(([, g]) => g === given)![0];
      const value = read(src);
      for (const [b] of sources) b.row.classList.toggle('calc-given', b === src);
      if (value === undefined) { for (const [b] of sources) if (b !== src) write(b, undefined); aNote.textContent = ''; return; }
      const r = amounts({ mw: read(mw) ?? 0, density: read(density), molarity: read(molarity), purity: read(purity), given, value });
      if (!r) {
        for (const [b] of sources) if (b !== src) write(b, undefined);
        aNote.textContent = given === 'volume' ? 'A volume of the neat liquid needs its molecular weight and density.' : given === 'solution' ? 'A volume of solution needs its concentration.' : 'A mass needs the molecular weight.';
        return;
      }
      if (src !== mass) write(mass, Number.isFinite(r.massMg) ? r.massMg : undefined);
      if (src !== mmol) write(mmol, r.mmol);
      if (src !== neat) write(neat, r.neatMl);
      if (src !== soln) write(soln, r.solutionMl);
      const lim = read(limiting);
      if (lim && document.activeElement !== equiv.input) write(equiv, r.mmol / lim);
      aNote.textContent = '';
    };
    for (const [b, g] of sources) {
      b.input.addEventListener('input', () => { given = g; solveAmounts(); });
      b.unit?.addEventListener('change', solveAmounts);
    }
    for (const b of [mw, density, molarity, purity]) {
      b.input.addEventListener('input', solveAmounts);
      b.unit?.addEventListener('change', solveAmounts);
    }
    const fromEquiv = () => {
      const lim = read(limiting), e = read(equiv);
      if (lim === undefined || e === undefined) return;
      given = 'mmol';
      write(mmol, lim * e);
      solveAmounts();
    };
    equiv.input.addEventListener('input', fromEquiv);
    limiting.input.addEventListener('input', fromEquiv);
    limiting.unit!.addEventListener('change', fromEquiv);

    // ---- Make a solution: the mass to weigh out
    const s = page('Make a Solution');
    const sConc = box('Concentration', CONC);
    const sVol = box('Volume', VOL);
    const sMw = box('Mol. wt.', 'g/mol');
    const sPurity = box('Purity', '%');
    const sMass = box('Weigh out', MASS);
    sMass.input.readOnly = true;
    sMass.row.classList.add('calc-answer');
    const sGroup = el('div', 'calc-group');
    sGroup.append(sConc.row, sVol.row, sMw.row, sPurity.row);
    const sOut = el('div', 'calc-group calc-results');
    sOut.append(sMass.row);
    s.append(sGroup, sOut, el('p', 'muted small', 'Dissolve, then make up to the volume in a volumetric flask.'));
    if (start.mw) sMw.input.value = start.mw.toFixed(2);
    sPurity.input.value = '100';
    const solveSolution = () => {
      const c = read(sConc), v = read(sVol), m = read(sMw);
      write(sMass, c !== undefined && v !== undefined && m ? solutionMass(c, v, m, read(sPurity) || 100) : undefined);
    };
    for (const b of [sConc, sVol, sMw, sPurity, sMass]) { b.input.addEventListener('input', solveSolution); b.unit?.addEventListener('change', solveSolution); }

    // ---- Dilution: c1·V1 = c2·V2, leave one blank
    const dl = page('Dilution');
    const c1 = box('Stock concentration (c₁)', CONC);
    const v1 = box('Stock volume (V₁)', VOL);
    const c2 = box('Final concentration (c₂)', CONC);
    const v2 = box('Final volume (V₂)', VOL);
    const dGroup = el('div', 'calc-group');
    dGroup.append(c1.row, v1.row, c2.row, v2.row);
    const dNote = el('p', 'muted small', 'Leave one box empty and it is worked out (c₁V₁ = c₂V₂).');
    dNote.setAttribute('role', 'status');
    dl.append(dGroup, dNote);
    const dBoxes = { c1, v1, c2, v2 };
    let blank: keyof typeof dBoxes | null = null;
    const solveDilution = (typed?: keyof typeof dBoxes) => {
      if (typed && blank === typed) blank = null;
      const vals = Object.fromEntries(Object.entries(dBoxes).map(([k, b]) => [k, k === blank ? undefined : read(b)]));
      const r = dilution(vals);
      if (!r) {
        if (blank) { write(dBoxes[blank], undefined); dBoxes[blank].row.classList.remove('calc-answer'); blank = null; }
        return;
      }
      const k = (Object.keys(dBoxes) as (keyof typeof dBoxes)[]).find((x) => vals[x] === undefined)!;
      blank = k;
      for (const [n, b] of Object.entries(dBoxes)) b.row.classList.toggle('calc-answer', n === k);
      write(dBoxes[k], r[k]);
    };
    for (const [k, b] of Object.entries(dBoxes) as [keyof typeof dBoxes, Box][]) {
      b.input.addEventListener('input', () => solveDilution(k));
      b.unit?.addEventListener('change', () => solveDilution());
    }

    const buttons = el('p', 'ask-buttons');
    const close = el('button', 'primary', 'Close');
    close.type = 'submit';
    buttons.append(close);
    form.append(tabs, ...pages, buttons);
    d.append(form);
    pick(lastTab);
    d.addEventListener('close', () => { d.remove(); resolve(); });
    showDialog(d);
    (lastTab === 0 ? (start.mw ? mmol : mw) : lastTab === 1 ? sConc : c1).input.focus();
  });
}
