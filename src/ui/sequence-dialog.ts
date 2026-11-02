// Insert > Structure from Sequence: type a peptide's sequence (one-letter or three-letter codes),
// pick its ends, and press Insert for the whole structure. What the sequence was read as shows
// under it while typing (H-Ala-Gly-…-OH), and anything that can't be read says why.

import { addInfo } from './info-tip';
import { C_TERMINI, N_TERMINI, parsePeptide, peptideName, peptideTemplate, type CTerminus, type NTerminus } from '../chem/biopolymer';
import type { Template } from '../chem/templates';

const N_NAMES: Record<NTerminus, string> = { H: 'H (free amine)', Ac: 'Ac (acetyl)', Boc: 'Boc', Fmoc: 'Fmoc', Cbz: 'Cbz (Z)', Bz: 'Bz (benzoyl)' };
const C_NAMES: Record<CTerminus, string> = { OH: 'OH (acid)', NH2: 'NH₂ (amide)', OMe: 'OMe', OEt: 'OEt', OtBu: 'OtBu', OBn: 'OBn' };

export class SequenceDialog {
  private last = '';
  private nTerm: NTerminus = 'H';
  private cTerm: CTerminus = 'OH';
  private lowercaseD = true;

  /** `insert` puts the structure in the drawing, or returns why it could not. */
  constructor(private insert: (t: Template) => string | null) {}

  open(): void {
    const d = document.createElement('dialog');
    d.className = 'ask name-dialog sequence-dialog';
    const form = document.createElement('form');
    const h = document.createElement('h2');
    h.textContent = 'Structure from Sequence';
    addInfo(h, 'Type a peptide in one-letter codes (GLYPHS) or three-letter codes (Boc-Ala-D-Phe-OMe). Spaces, numbers and a FASTA header line are skipped. It is drawn N-terminus on the left, side chains in turn up and down.');
    const input = document.createElement('textarea');
    input.className = 'name-input sequence-input';
    input.rows = 3;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('aria-label', 'Peptide sequence');
    input.value = this.last;

    const select = <T extends string>(label: string, values: readonly T[], names: Record<T, string>, value: T) => {
      const l = document.createElement('label');
      l.className = 'sequence-end';
      const s = document.createElement('select');
      for (const v of values) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = names[v];
        s.append(o);
      }
      s.value = value;
      l.append(label + ' ', s);
      return { l, s };
    };
    const nSel = select('N-terminus', N_TERMINI, N_NAMES, this.nTerm);
    const cSel = select('C-terminus', C_TERMINI, C_NAMES, this.cTerm);
    const ends = document.createElement('p');
    ends.className = 'sequence-ends';
    ends.append(nSel.l, cSel.l);
    const dLabel = document.createElement('label');
    const dBox = document.createElement('input');
    dBox.type = 'checkbox';
    dBox.checked = this.lowercaseD;
    dLabel.append(dBox, ' Small letters are D-amino acids (aFa is L-Ala, D-Phe, L-Ala)');
    const opts = document.createElement('p');
    opts.className = 'sequence-opts';
    opts.append(dLabel);

    const status = document.createElement('p');
    status.className = 'name-status';
    status.setAttribute('role', 'status');
    const buttons = document.createElement('p');
    buttons.className = 'ask-buttons';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'primary';
    ok.textContent = 'Insert';
    buttons.append(cancel, ok);
    form.append(h, input, ends, opts, status, buttons);
    d.append(form);

    /** The sequence read now, with the ends it was given (written in it, or picked). */
    const read = () => {
      const p = parsePeptide(input.value, dBox.checked);
      const nTerm = p.nTerm ?? (nSel.s.value as NTerminus), cTerm = p.cTerm ?? (cSel.s.value as CTerminus);
      return { p, nTerm, cTerm };
    };
    const show = () => {
      status.classList.remove('error');
      if (!input.value.trim()) { status.textContent = ''; return; }
      const { p, nTerm, cTerm } = read();
      if (p.problems.length) { status.textContent = p.problems.join(' '); status.classList.add('error'); return; }
      status.textContent = `${peptideName(p.residues, { nTerm, cTerm })} · ${p.residues.length} residue${p.residues.length === 1 ? '' : 's'}`;
    };
    const close = () => { if (d.open) d.close(); d.remove(); };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const { p, nTerm, cTerm } = read();
      if (!p.residues.length || p.problems.length) {
        status.textContent = p.problems.join(' ') || 'Type a sequence, such as GLYP or Boc-Ala-Phe-OMe.';
        status.classList.add('error');
        input.focus();
        return;
      }
      this.last = input.value;
      this.nTerm = nSel.s.value as NTerminus;
      this.cTerm = cSel.s.value as CTerminus;
      this.lowercaseD = dBox.checked;
      const err = this.insert(peptideTemplate(p.residues, { nTerm, cTerm }));
      if (err === null) { close(); return; }
      status.textContent = err;
      status.classList.add('error');
    });
    // Enter inserts (Shift+Enter for a new line, as in a long pasted sequence)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });
    for (const el of [input, nSel.s, cSel.s, dBox]) el.addEventListener('input', show);
    cancel.addEventListener('click', close);
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
    show();
    input.focus();
    input.select();
  }
}
