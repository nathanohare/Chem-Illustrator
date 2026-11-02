// The Analysis panel's CAS RN line: the structure's CAS Registry Number, shown straight away when
// it is in your Compound Library or was looked up before, else a Find button (it sends the
// structure, as SMILES, to PubChem). A CAS caption button puts the number under the structure.

import type { CasFound } from '../chem/cas';
import type { TextRun } from '../model';

export type CasState = { kind: 'idle' } | { kind: 'busy' } | CasFound;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FIND_TIP = 'Look up this structure\'s CAS Registry Number: in your Compound Library, then on PubChem, the free NIH database (sends the structure as SMILES)';

/** The CAS RN row of structure i's table, and the caption button for the panel's buttons (when there is a number). */
export function casHtml(state: CasState, i: number): { row: string; button: string } {
  const find = (label: string) => `<button type="button" class="an-cas-find" data-cas="${i}" title="${FIND_TIP}">${label}</button>`;
  const row = (td: string, title = '') => `<tr class="an-cas"><th${title ? ` title="${esc(title)}"` : ''}>CAS RN</th><td>${td}</td></tr>`;
  if (state.kind === 'idle') return { row: row(find('Find')), button: '' };
  if (state.kind === 'busy') return { row: row('<span class="muted">Looking it up…</span>'), button: '' };
  if (state.kind === 'none') return { row: row(`<span class="muted" title="${esc(state.message)}">None found</span> ${find('Again')}`), button: '' };
  if (state.kind === 'error') return { row: row(`<span class="warn">${esc(state.message)}</span> ${find('Try again')}`), button: '' };
  const [main, ...more] = state.cas;
  const also = more.length ? `Also listed: ${more.slice(0, 6).join(', ')}${more.length > 6 ? '…' : ''}. ` : '';
  const from = state.from === 'your Compound Library' ? 'library' : state.from;
  return {
    row: row(`<span class="cas-num" title="${esc(`${also}${state.name ? `${state.name}, from` : 'From'} ${state.from}.`)}">${esc(main)}</span> <span class="muted">(${esc(from)})</span>`),
    button: `<button type="button" data-insert="cas:${i}" title="Put the CAS RN under the structure; it follows the structure and can be edited like any text">CAS caption</button>`,
  };
}

/** The caption the CAS caption button puts under a structure. */
export function casRuns(cas: string): TextRun[] {
  return [{ text: `CAS RN ${cas}` }];
}
