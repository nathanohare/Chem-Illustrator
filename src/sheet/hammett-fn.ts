// HAMMETT(B2, "sigma", "wavy"): a Hammett constant of the groups on a structure's benzene ring,
// counted from its reference position: an attachment point drawn on the structure ("wavy",
// "star", or a numbered diamond's number), or a core in SMILES with * where the group changes
// (src/chem/hammett-match.ts). Values from Hansch, Leo and Taft, Chem. Rev. 1991, 91, 165,
// Tables I and V (src/kb/hammett.ts). Several groups add up (Σσ, ΣF, ΣR), as Hammett's additivity has it.
//
// What can be asked for:
//   "sigma" (σ)   σm for a meta group, σp for a para one (ortho: blank, or σp with "ortho=sp")
//   "sm", "sp"    σm or σp whatever the position
//   "sp+", "sp-"  σp⁺ or σp⁻ (Hansch, Leo and Taft's Table V), whatever the position
//   "F", "R"      the field and resonance parameters (Swain–Lupton, as modified by Hansch et al.)
//   "group"       the group as chemists write it (OCH3, NO2), H for none

import { H_ROW, type HammettResult, type HammettSite } from '../chem/hammett-match';
import { HAMMETT } from '../kb/hammett';
import { CellError, ERR, Value } from './values';

export type HammettWhat = 'sigma' | 'sm' | 'sp' | 'spPlus' | 'spMinus' | 'F' | 'R' | 'group';

/** The quantities HAMMETT gives, with their column headings and help. */
export const HAMMETT_QUANTITIES: { what: HammettWhat; label: string; help: string }[] = [
  { what: 'group', label: 'Group', help: 'The group at the marked position (OCH3, Cl…)' },
  { what: 'sigma', label: 'σ', help: 'σm for a meta group, σp for a para one' },
  { what: 'F', label: 'F', help: 'Field parameter F' },
  { what: 'R', label: 'R', help: 'Resonance parameter R' },
  { what: 'sm', label: 'σm', help: 'σm, whatever the position' },
  { what: 'sp', label: 'σp', help: 'σp, whatever the position' },
  { what: 'spPlus', label: 'σp⁺', help: 'σp⁺ (Brown–Okamoto), for positive charge in conjugation with the group' },
  { what: 'spMinus', label: 'σp⁻', help: 'σp⁻, for negative charge in conjugation with the group' },
];

/** What is asked for, from the ways it may be written ("σ", "sigma_p", "σp"…); null when unknown. */
export function hammettWhat(text: string): HammettWhat | null {
  const sign = /[+⁺]\s*$/.test(text) ? '+' : /[-−⁻]\s*$/.test(text) && !/[\s_]-\s*$/.test(text) ? '-' : '';
  const t = text.trim().replace(/σ/g, 's').replace(/[+⁺\-−⁻]\s*$/, '').replace(/[\s_-]/g, '').toLowerCase();
  if (sign) return t === 's' || t === 'sp' || t === 'sigma' || t === 'sigmap' || t === 'para' ? (sign === '+' ? 'spPlus' : 'spMinus') : null;
  if (t === 's' || t === 'sigma') return 'sigma';
  if (t === 'sm' || t === 'sigmam' || t === 'meta') return 'sm';
  if (t === 'sp' || t === 'sigmap' || t === 'para') return 'sp';
  if (t === 'f' || t === 'field') return 'F';
  if (t === 'r' || t === 'resonance') return 'R';
  if (t === 'group' || t === 'substituent' || t === 'x') return 'group';
  return null;
}

/** Ortho groups get σp (rather than no value) when the fourth argument says so: "sp", "σp" or "ortho=sp". */
export function orthoAsPara(text: string): boolean {
  const t = text.trim().replace(/σ/g, 's').replace(/^ortho\s*=\s*/i, '').replace(/[\s_-]/g, '').toLowerCase();
  return t === 'sp' || t === 'sigmap' || t === 'para';
}

const PLACE_PREFIX: Record<HammettSite['place'], string> = { ipso: 'i', ortho: 'o', meta: 'm', para: 'p' };

/** The value of one HAMMETT formula from the groups found. */
export function hammettValue(res: HammettResult | CellError, what: HammettWhat, orthoSp = false): Value | CellError {
  if (res instanceof CellError) return res;
  if ('error' in res) return ERR.na(res.error);
  const { sites } = res;
  for (const s of sites) {
    if (s.fused) return ERR.na(`The ${s.place} position is part of a fused ring: no single-group Hammett constant applies`);
    if (s.row < 0) return ERR.na(`The ${s.place} group (${s.smiles}) isn't in the Hammett table: Knowledge Base > Hammett Constants lists the groups, and Import Table adds more`);
    if (s.place === 'ipso') return ERR.na('A marked position is the reaction center\'s own ring atom');
  }
  if (what === 'group') {
    const g = (s: HammettSite) => HAMMETT[s.row].group;
    if (sites.length === 1 && (sites[0].row === H_ROW || sites[0].locant === undefined)) return g(sites[0]);
    // 4-OCH3, or 3-Cl, 4-Cl (locants from the reference position); m-Cl for a core's positions
    return sites.map((s) => `${s.locant ?? PLACE_PREFIX[s.place]}-${g(s)}`).join(', ');
  }
  let sum = 0;
  for (const s of sites) {
    const h = HAMMETT[s.row];
    let key: 'sm' | 'sp' | 'spPlus' | 'spMinus' | 'F' | 'R';
    if (what !== 'sigma') key = what;
    else if (s.place === 'meta') key = 'sm';
    else if (s.place === 'para' || orthoSp) key = 'sp';
    else return ERR.na('Hammett σ is for meta and para groups: an ortho group has none (give "ortho=sp" to use σp)');
    const v = h[key];
    if (v === null || v === undefined) return ERR.na(`The table has no ${HAMMETT_QUANTITIES.find((q) => q.what === key)?.label ?? key} for ${h.group}`);
    sum += v;
  }
  return Math.round(sum * 1000) / 1000;
}
