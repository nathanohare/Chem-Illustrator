// Chemistry > Insert Property Column…: pick the properties to work out from a column of structures
// (or SMILES). Each becomes a column of its own that fills itself in for every row.

import { PROPERTIES } from '../sheet/properties';
import { COMMON_ADDUCTS } from '../chem/hrms';

export interface PropertyChoice {
  /** The sheet function, e.g. MW. */
  name: string;
  /** HRMS: the ion, e.g. [M+Na]+. */
  adduct?: string;
}

/** Hammett columns: what each holds, as HAMMETT's second argument. */
export type HammettColumn = 'group' | 'sigma' | 'F' | 'R' | 'sm' | 'sp';

export interface HammettChoice {
  /** The reference position, as HAMMETT's third argument ("wavy", "star", "1"…). */
  ref: string;
  columns: HammettColumn[];
  /** Ortho groups take σp (Hammett's own values don't cover them). */
  orthoSp: boolean;
}

/** A structure with its reference position and ring places marked, for the Hammett section. */
export interface HammettPicture {
  canvas: HTMLCanvasElement;
  /** Its size on screen, in CSS pixels. */
  w: number;
  h: number;
  /** Where the attachment point is, in those pixels. */
  ref: { x: number; y: number };
  /** The o, m and p labels, placed just outside the ring. */
  marks: { x: number; y: number; text: string }[];
}

export interface HammettSetup {
  /** The reference positions the column's structures offer (value, label), most used first. */
  refs(col: number): { value: string; label: string }[];
  /** A picture of the first structure with this reference position, and a line on how many have it. */
  look(col: number, ref: string, w: number, h: number): { picture: HammettPicture | null; note: string };
}

export interface PropertyDialogOptions {
  /** Columns that hold structures or SMILES, by number, with their header text. */
  columns: { col: number; label: string }[];
  /** The column picked to start with. */
  col: number;
  /** For the Hammett constants section. */
  hammett?: HammettSetup;
}

export interface PropertyAnswer {
  col: number;
  props: PropertyChoice[];
  hammett?: HammettChoice;
}

const HAMMETT_BOXES: { value: HammettColumn; html: string; on: boolean }[] = [
  { value: 'group', html: 'Group (4-OCH<sub>3</sub>, 3-Cl…)', on: true },
  { value: 'sigma', html: 'σ (σ<sub><i>m</i></sub> or σ<sub><i>p</i></sub>)', on: true },
  { value: 'F', html: '<i>F</i> (field)', on: true },
  { value: 'R', html: '<i>R</i> (resonance)', on: true },
  { value: 'sm', html: 'σ<sub><i>m</i></sub>', on: false },
  { value: 'sp', html: 'σ<sub><i>p</i></sub>', on: false },
];

const PIC_W = 190, PIC_H = 120;

/** Ask which properties to add. Null when cancelled. */
export function askProperties(opts: PropertyDialogOptions): Promise<PropertyAnswer | null> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'ask prop-dialog';
    d.setAttribute('aria-label', 'Insert property columns');
    const form = document.createElement('form');
    form.method = 'dialog';
    form.innerHTML = `<h2 data-info="Each property gets a column that works itself out from the structure in the same row, and updates when the structure changes. Type over any value to replace it; Reset to Calculated puts it back.">Insert property columns</h2>
      <label class="ask-row"><span>Structures in</span><select name="col"></select></label>
      <div class="prop-list" role="group" aria-label="Properties"></div>
      <section class="hm-section" aria-label="Hammett constants" hidden>
        <h3>Hammett constants <span class="muted">(Hansch, Leo and Taft, Chem. Rev. 1991)</span></h3>
        <div class="hm-body">
          <div class="hm-pic" aria-hidden="true"></div>
          <div>
            <label class="hm-row"><span>Reference position</span><select name="hm-ref"></select></label>
            <p class="hm-note"></p>
            <div class="hm-cols" role="group" aria-label="Hammett columns"></div>
            <label class="hm-row"><span>Ortho groups</span><select name="hm-ortho"><option value="">Leave blank (#N/A)</option><option value="sp">Use σp</option></select></label>
          </div>
        </div>
      </section>
      <p class="ask-buttons"><button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">Insert</button></p>`;
    const colSel = form.querySelector<HTMLSelectElement>('select[name=col]')!;
    for (const c of opts.columns) colSel.add(new Option(c.label, String(c.col), false, c.col === opts.col));
    const list = form.querySelector<HTMLDivElement>('.prop-list')!;
    const picked = new Set(['FORMULA', 'MW']);
    for (const [name, def] of Object.entries(PROPERTIES)) {
      const row = document.createElement('label');
      row.className = 'prop-row';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = name;
      box.checked = picked.has(name);
      const text = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = def.label;
      text.append(b, ' ', Object.assign(document.createElement('span'), { className: 'muted', textContent: def.help.replace(/:.*$/, '') }));
      row.append(box, text);
      if (name === 'HRMS') {
        const ion = document.createElement('input');
        ion.name = 'adduct';
        ion.value = '[M+H]+';
        ion.setAttribute('list', 'prop-adducts');
        ion.className = 'prop-adduct';
        ion.setAttribute('aria-label', 'Ion');
        ion.title = 'The ion: [M+H]+, [M+Na]+, [M-H]-, [M+2H]2+, [2M+Na]+… (any adduct can be typed)';
        ion.addEventListener('input', () => { box.checked = true; });
        const dl = document.createElement('datalist');
        dl.id = 'prop-adducts';
        for (const a of COMMON_ADDUCTS) dl.append(new Option(a));
        row.append(ion, dl);
      }
      list.append(row);
    }
    // Hammett constants, counted from an attachment point on a benzene ring
    const hm = opts.hammett;
    const sec = form.querySelector<HTMLElement>('.hm-section')!;
    const refSel = form.querySelector<HTMLSelectElement>('select[name=hm-ref]')!;
    const pic = form.querySelector<HTMLDivElement>('.hm-pic')!;
    const note = form.querySelector<HTMLParagraphElement>('.hm-note')!;
    const hmCols = form.querySelector<HTMLDivElement>('.hm-cols')!;
    for (const h of HAMMETT_BOXES) {
      const row = document.createElement('label');
      const box = Object.assign(document.createElement('input'), { type: 'checkbox', value: h.value });
      const text = document.createElement('span');
      text.innerHTML = h.html;
      row.append(box, text);
      hmCols.append(row);
    }
    const hmBoxes = [...hmCols.querySelectorAll<HTMLInputElement>('input')];
    const showLook = () => {
      if (!hm || !refSel.value) return;
      const got = hm.look(Number(colSel.value), refSel.value, PIC_W, PIC_H);
      note.textContent = got.note;
      pic.replaceChildren();
      const p = got.picture;
      pic.hidden = !p;
      if (!p) return;
      p.canvas.style.width = `${p.w}px`;
      p.canvas.style.height = `${p.h}px`;
      p.canvas.style.left = `${(PIC_W - p.w) / 2}px`;
      p.canvas.style.top = `${(PIC_H - p.h) / 2}px`;
      const dx = (PIC_W - p.w) / 2, dy = (PIC_H - p.h) / 2;
      const ring = Object.assign(document.createElement('div'), { className: 'hm-ref' });
      ring.style.left = `${p.ref.x + dx}px`;
      ring.style.top = `${p.ref.y + dy}px`;
      pic.append(p.canvas, ring);
      for (const m of p.marks) {
        const t = Object.assign(document.createElement('i'), { className: 'hm-pos', textContent: m.text });
        t.style.left = `${m.x + dx}px`;
        t.style.top = `${m.y + dy}px`;
        pic.append(t);
      }
    };
    const showRefs = (first: boolean) => {
      if (!hm) return;
      const refs = hm.refs(Number(colSel.value));
      const was = refSel.value;
      refSel.replaceChildren();
      const found = refs.length > 0;
      const offer = found ? refs : [{ value: 'wavy', label: '〰 Wavy bond' }, { value: 'star', label: '* Star' }, { value: '1', label: '◆ Numbered 1' }];
      for (const r of offer) refSel.add(new Option(r.label, r.value, false, r.value === was));
      sec.hidden = false;
      if (first && found) {
        // structures with attachment points are most likely here for their Hammett constants
        for (const b of hmBoxes) b.checked = HAMMETT_BOXES.find((h) => h.value === b.value)!.on;
        for (const b of list.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) b.checked = false;
      }
      showLook();
    };
    refSel.addEventListener('change', showLook);
    colSel.addEventListener('change', () => showRefs(false));
    showRefs(true);

    d.append(form);
    document.body.append(d);
    const finish = (v: PropertyAnswer | null) => { d.remove(); resolve(v); };
    form.querySelector('[data-act=cancel]')!.addEventListener('click', () => { d.close(); finish(null); });
    d.addEventListener('cancel', () => finish(null));
    d.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const props: PropertyChoice[] = [];
      for (const box of list.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) {
        if (!box.checked) continue;
        const adduct = box.value === 'HRMS' ? form.querySelector<HTMLInputElement>('input[name=adduct]')!.value.trim() || '[M+H]+' : undefined;
        props.push({ name: box.value, adduct });
      }
      const columns = hmBoxes.filter((b) => b.checked).map((b) => b.value as HammettColumn);
      const hammett = hm && columns.length ? { ref: refSel.value, columns, orthoSp: form.querySelector<HTMLSelectElement>('select[name=hm-ortho]')!.value === 'sp' } : undefined;
      d.close();
      finish(props.length || hammett ? { col: Number(colSel.value), props, hammett } : null);
    });
    d.showModal();
  });
}
