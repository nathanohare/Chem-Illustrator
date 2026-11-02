// HAMMETT(B2, "sigma", "[NH2:1]c1ccc(*)cc1"): a Hammett constant of the group(s) a structure has
// at the marked ring positions of a core (src/chem/hammett-match.ts), from Hansch, Leo and Taft,
// Chem. Rev. 1991, 91, 165, Table I (src/kb/hammett.ts). With several marked positions the values
// are added up (Σσ, ΣF, ΣR), as Hammett's additivity has it.
//
// What can be asked for:
//   "sigma" (σ)   σm for a meta group, σp for a para one (ortho: blank, or σp with "ortho=sp")
//   "sm", "sp"    σm or σp whatever the position
//   "F", "R"      the field and resonance parameters (Swain–Lupton, as modified by Hansch et al.)
//   "group"       the group as chemists write it (OCH3, NO2), H for none

import type { HammettResult, HammettSite } from '../chem/hammett-match';
import { HAMMETT } from '../kb/hammett';
import { CellError, ERR, Value } from './values';

export type HammettWhat = 'sigma' | 'sm' | 'sp' | 'F' | 'R' | 'group';

/** The quantities HAMMETT gives, with their column headings and help. */
export const HAMMETT_QUANTITIES: { what: HammettWhat; label: string; help: string }[] = [
  { what: 'group', label: 'Group', help: 'The group at the marked position (OCH3, Cl…)' },
  { what: 'sigma', label: 'σ', help: 'σm for a meta group, σp for a para one' },
  { what: 'F', label: 'F', help: 'Field parameter F' },
  { what: 'R', label: 'R', help: 'Resonance parameter R' },
  { what: 'sm', label: 'σm', help: 'σm, whatever the position' },
  { what: 'sp', label: 'σp', help: 'σp, whatever the position' },
];

/** What is asked for, from the ways it may be written ("σ", "sigma_p", "σp"…); null when unknown. */
export function hammettWhat(text: string): HammettWhat | null {
  const t = text.trim().replace(/σ/g, 's').replace(/[\s_-]/g, '').toLowerCase();
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
    if (s.place === 'ipso') return ERR.na('A marked position is the reaction centre\'s own ring atom');
  }
  if (what === 'group') {
    const g = (s: HammettSite) => HAMMETT[s.row].group;
    return sites.length === 1 ? g(sites[0]) : sites.map((s) => `${PLACE_PREFIX[s.place]}-${g(s)}`).join(', ');
  }
  let sum = 0;
  for (const s of sites) {
    const h = HAMMETT[s.row];
    if (what === 'F') sum += h.F;
    else if (what === 'R') sum += h.R;
    else if (what === 'sm') sum += h.sm;
    else if (what === 'sp') sum += h.sp;
    else if (s.place === 'meta') sum += h.sm;
    else if (s.place === 'para' || orthoSp) sum += h.sp;
    else return ERR.na('Hammett σ is for meta and para groups: an ortho group has none (give "ortho=sp" to use σp)');
  }
  return Math.round(sum * 1000) / 1000;
}
