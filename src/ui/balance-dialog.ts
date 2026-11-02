// The Check Balance window: each element counted on the left and right of a reaction arrow, what
// the products are short of (or have too much of), and a choice to count the reagents written
// over the arrow or only the starting materials drawn before it.

import { checkBalance, type BalanceSpecies } from '../chem/balance';
import { chargeText } from '../chem/formula';
import { showDialog } from './dialog-host';

export interface BalanceInput {
  starting: BalanceSpecies[];
  reagents: BalanceSpecies[];
  products: BalanceSpecies[];
  /** Species that could not be read as compounds (named in a note). */
  unread: string[];
}

/** Subscript the digits of a formula for showing (C7H6O2 → C₇H₆O₂). */
const sub = (f: string) => f.replace(/(?<=[A-Za-z)])(\d+)/g, (d) => [...d].map((c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)]).join(''));

export function showBalance(input: BalanceInput, reagentsCount = true): Promise<void> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'ask balance-dialog';
    d.setAttribute('aria-label', 'Check balance');
    const form = document.createElement('form');
    form.method = 'dialog';
    const h = document.createElement('h2');
    h.textContent = 'Check Balance';
    const verdict = document.createElement('p');
    verdict.className = 'balance-verdict';
    verdict.setAttribute('role', 'status');
    const table = document.createElement('table');
    table.className = 'balance-table';
    const opt = document.createElement('label');
    opt.className = 'ask-row ask-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = reagentsCount;
    const optText = document.createElement('span');
    optText.textContent = 'Count the reagents written over and under the arrow';
    opt.append(box, optText);
    const note = document.createElement('p');
    note.className = 'muted small';
    const buttons = document.createElement('p');
    buttons.className = 'ask-buttons';
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'primary';
    ok.textContent = 'Close';
    buttons.append(ok);
    form.append(h, verdict, table, opt, note, buttons);
    d.append(form);

    const draw = () => {
      const left = box.checked ? [...input.starting, ...input.reagents] : input.starting;
      const b = checkBalance(left, input.products);
      const row = (cells: string[], head = false) => {
        const tr = document.createElement('tr');
        for (const c of cells) { const td = document.createElement(head ? 'th' : 'td'); td.textContent = c; tr.append(td); }
        return tr;
      };
      table.replaceChildren(row(['Element', 'Left', 'Right', 'Difference'], true));
      for (const r of b.rows) {
        const tr = row([r.element, String(r.left), String(r.right), r.left === r.right ? '' : (r.right > r.left ? '+' : '−') + Math.abs(r.right - r.left)]);
        if (r.left !== r.right) tr.classList.add('off');
        table.append(tr);
      }
      if (b.leftCharge || b.rightCharge) {
        const q = (n: number) => (n ? chargeText(n).trim() : '0');
        const tr = row(['Charge', q(b.leftCharge), q(b.rightCharge), b.leftCharge === b.rightCharge ? '' : q(b.rightCharge - b.leftCharge)]);
        if (b.leftCharge !== b.rightCharge) tr.classList.add('off');
        table.append(tr);
      }
      const parts: string[] = [];
      if (b.balanced) parts.push('Balanced: every atom on the left is on the right.');
      else {
        if (b.missing) parts.push(`The products are short of ${sub(b.missing)}${b.missingName ? ` (${b.missingName}?)` : ''}.`);
        if (b.extra) parts.push(`The products have ${sub(b.extra)} more than the left side${b.extraName ? ` (${b.extraName}?)` : ''}.`);
        if (!b.missing && !b.extra) parts.push('The atoms balance but the charges do not.');
      }
      verdict.textContent = parts.join(' ');
      verdict.classList.toggle('ok', b.balanced);
      note.textContent = [
        input.unread.length ? `Not counted (not read as a compound): ${input.unread.join(', ')}.` : '',
        'Each species is counted once; draw by-products such as water or salts to balance a step.',
      ].filter(Boolean).join(' ');
    };
    box.addEventListener('change', draw);
    draw();
    const done = () => { if (d.open) d.close(); d.remove(); resolve(); };
    form.addEventListener('submit', (e) => { e.preventDefault(); done(); });
    d.addEventListener('close', done);
    showDialog(d);
    ok.focus();
  });
}
