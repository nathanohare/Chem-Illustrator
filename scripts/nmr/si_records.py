"""Turn AI readings of SI blocks into checked test-set records.

Usage: python3 -I scripts/nmr/si_records.py blocks.jsonl READINGS_DIR OUT_records.jsonl [REPORT.json]

For every reading that is not skipped:
1. Structure: OPSIN (the app's own name reader) on the printed name; the reader's own
   SMILES is the fallback. When both exist and disagree, the one whose formula matches
   the printed HRMS/analysis formula wins.
2. Checks: formula (from the printed neutral formula or the HRMS ion with its adduct
   removed), 1H integration total against the structure's H count (allowing missing
   OH/NH/SH protons), 13C peak count against symmetry-unique carbons (allowing extra
   lines from C-F/C-P splitting), and field consistency (13C field near 1H field / 4).
3. Tier: "gold" when formula matches (or none printed and structure is from OPSIN) and
   every 1H/13C list present passes exactly; "silver" when the 13C list is within one
   carbon, misses up to 20% of carbons (overlaps), has extra C-F/C-P lines, or the 1H list
   misses only exchangeable protons or is off by one proton (formula confirmed, 15+ H);
   else "fail" with reasons.
4. Class tags from classes.py.
Records keep DOI, licence, block id and the reading so any value can be traced to its source.
"""
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict

from rdkit import Chem, RDLogger
from rdkit.Chem.rdMolDescriptors import CalcMolFormula

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import classes  # noqa: E402

RDLogger.DisableLog('rdApp.*')
HERE = os.path.dirname(os.path.abspath(__file__))
EXCH = Chem.MolFromSmarts('[OX2H1,NX3H1,NX3H2,NX4H,nH1,SX2H1,OX2H1-0,NH3+,NH2+,NH+]')


def parse_formula(f):
    if not f:
        return None
    f = re.sub(r'[\s\[\]()]', '', str(f))
    f = re.sub(r'[+\-−–•·]+$', '', f)  # charge sign only; a digit before it belongs to the element
    f = f.replace('·', '').replace('•', '')
    if not re.fullmatch(r'(?:[A-Z][a-z]?\d*)+', f):
        return None
    c = Counter()
    for el, n in re.findall(r'([A-Z][a-z]?)(\d*)', f):
        c[el] += int(n) if n else 1
    return c


ADDUCT = {'h': Counter({'H': 1}), 'na': Counter({'Na': 1}), 'k': Counter({'K': 1}), 'nh4': Counter({'N': 1, 'H': 4}),
          'li': Counter({'Li': 1}), 'ag': Counter({'Ag': 1})}


def neutral_from_hrms(f, ion):
    c = parse_formula(f)
    if c is None:
        return None
    ion = (ion or '').lower().replace(' ', '').replace('−', '-').replace('–', '-')
    m = re.search(r'm([+-])(\d*)(h|na|k|nh4|li|ag)\b', ion) or re.search(r'm([+-])(\d*)(h|na|k|nh4|li|ag)', ion)
    if m:
        sign, k, ad = m.group(1), int(m.group(2) or 1), m.group(3)
        for el, n in ADDUCT[ad].items():
            c[el] += (-n if sign == '+' else n) * k
    return Counter({k: v for k, v in c.items() if v})


def mol_formula(mol):
    return parse_formula(CalcMolFormula(mol))


def formula_status(mol, rd):
    mfs = [mol_formula(mol)]
    frags = Chem.GetMolFrags(mol, asMols=True)
    if len(frags) > 1:
        # salts: the HRMS ion is usually the organic cation (or anion) alone
        frags = sorted(frags, key=lambda m: -m.GetNumHeavyAtoms())
        mfs.append(mol_formula(frags[0]))
        big = [f for f in frags if f.GetNumHeavyAtoms() > 1]
        if len(big) > 1:
            c = Counter()
            for f in big:
                c += mol_formula(f)
            mfs.append(c)
    want = parse_formula(rd.get('formula'))
    cands = []
    if want:
        cands.append(want)
    if rd.get('hrms_formula'):
        n = neutral_from_hrms(rd['hrms_formula'], rd.get('hrms_ion'))
        if n:
            cands.append(n)
            # many papers print the protonated or sodiated formula without saying so
            for ad in ('h', 'na', 'k'):
                alt = parse_formula(rd['hrms_formula'])
                if alt:
                    for el, k in ADDUCT[ad].items():
                        alt[el] -= k
                    cands.append(Counter({k: v for k, v in alt.items() if v}))
            cands.append(parse_formula(rd['hrms_formula']))
    if not cands:
        return 'none'
    return 'match' if any(c == mf for c in cands if c for mf in mfs) else 'mismatch'


def h_status(mol, sp):
    total = sum(a.GetTotalNumHs() for a in mol.GetAtoms())
    exch = len({m[0] for m in mol.GetSubstructMatches(EXCH)})
    exch_h = sum(mol.GetAtomWithIdx(i).GetTotalNumHs() for i in {m[0] for m in mol.GetSubstructMatches(EXCH)})
    got = 0
    for s in sp.get('signals') or []:
        if not isinstance(s, list) or len(s) < 5:
            return 'bad_list', total
        if s[4] is None:
            return 'no_integrals', total
        got += s[4]
    if abs(got - total) < 0.01:
        return 'match', total
    if exch and total - exch_h - 0.01 <= got < total:
        return 'match_minus_exchangeable', total
    return f'mismatch({got:g}/{total})', total


def c_status(mol, sp, has_f_or_p):
    rank = list(Chem.CanonicalRankAtoms(mol, breakTies=False))
    unique = len({rank[a.GetIdx()] for a in mol.GetAtoms() if a.GetAtomicNum() == 6})
    peaks = sp.get('peaks') or []
    n = 0
    for p in peaks:
        if not isinstance(p, list) or not p:
            return 'bad_list', unique
        n += p[3] if len(p) > 3 and isinstance(p[3], (int, float)) and p[3] and p[3] < 10 else 1
    # a coupled carbon printed with its J counts once; extra lines only if printed as separate values
    if n == unique:
        return 'match', unique
    if abs(n - unique) == 1 and unique >= 6:
        return 'close', unique
    if 0.8 * unique <= n < unique:
        return 'missing_some', unique  # overlapping or unobserved carbons; matching scores what is printed
    if has_f_or_p and unique < n <= unique * 2:
        return 'extra_lines_cf_cp', unique
    return f'mismatch({n}/{unique})', unique


def pick_structure(rd, opsin):
    cands = []
    if opsin and opsin.get('ok'):
        m = Chem.MolFromSmiles(opsin['smiles'])
        if m is not None:
            cands.append(('opsin', m))
    if rd.get('smiles'):
        m = Chem.MolFromSmiles(rd['smiles'])
        if m is not None:
            cands.append(('reader', m))
    if not cands:
        return None, None, None
    scored = [(src, m, formula_status(m, rd)) for src, m in cands]
    for want in ('match', 'none', 'mismatch'):
        for src, m, fs in scored:
            if fs == want:
                agree = None
                if len(cands) == 2:
                    agree = Chem.MolToInchiKey(cands[0][1]) == Chem.MolToInchiKey(cands[1][1])
                return src, m, (fs, agree)
    return None, None, None


def main():
    blocks_p, rdir, outp = sys.argv[1:4]
    report_p = sys.argv[4] if len(sys.argv) > 4 else None
    blocks = {}
    for l in open(blocks_p):
        b = json.loads(l)
        blocks[b['block_id']] = b
    readings = []
    for f in sorted(glob.glob(os.path.join(rdir, '*.jsonl'))):
        for l in open(f):
            l = l.strip()
            if not l:
                continue
            try:
                r = json.loads(l)
            except json.JSONDecodeError:
                continue
            if r.get('id') in blocks:
                readings.append(r)
    # last reading of an id wins (second readings are appended later)
    by_id = {}
    for r in readings:
        by_id[r['id']] = r
    names = [r.get('name') or '' for r in by_id.values()]
    with tempfile.TemporaryDirectory() as td:
        json.dump(names, open(os.path.join(td, 'n.json'), 'w'))
        subprocess.run(['node', os.path.join(HERE, 'opsin_names.mjs'), os.path.join(td, 'n.json'), os.path.join(td, 'o.json')], check=True)
        opsin = json.load(open(os.path.join(td, 'o.json')))
    stats = Counter()
    fails = Counter()
    out = []
    for (bid, rd), op in zip(by_id.items(), opsin):
        b = blocks[bid]
        stats['readings'] += 1
        if rd.get('skip'):
            stats['skipped'] += 1
            continue
        src, mol, fsag = pick_structure(rd, op)
        rec = {'block_id': bid, 'pmcid': b['pmcid'], 'doi': b['doi'], 'license': b['license'], 'label': rd.get('label'),
               'name': rd.get('name'), 'structure_source': src, 'reading_flags': rd.get('flags') or [], 'spectra': []}
        if mol is None:
            stats['no_structure'] += 1
            rec['tier'] = 'fail'
            rec['reasons'] = ['no_structure']
            fails['no_structure'] += 1
            out.append(rec)
            continue
        fs, agree = fsag
        rec['smiles'] = Chem.MolToSmiles(mol)
        rec['inchikey'] = Chem.MolToInchiKey(mol)
        rec['formula'] = CalcMolFormula(mol)
        rec['formula_check'] = fs
        rec['opsin_reader_agree'] = agree
        rec['classes'] = classes.tags(mol, b.get('query_class'))
        syms = {a.GetSymbol() for a in mol.GetAtoms()}
        reasons, silver = [], False
        if fs == 'mismatch':
            reasons.append('formula_mismatch')
        if fs == 'none' and src == 'reader' and agree is not True:
            reasons.append('structure_unverified')
        h_mhz = None
        for sp in rd.get('spectra') or []:
            nuc = sp.get('nuc')
            entry = {k: sp.get(k) for k in ('nuc', 'mhz', 'solvent', 'temp_K', 'decoupled', 'signals', 'peaks', 'flags')}
            if nuc == '1H':
                st, _ = h_status(mol, sp)
                entry['check'] = st
                h_mhz = h_mhz or sp.get('mhz')
                if st == 'match_minus_exchangeable':
                    silver = True
                elif st.startswith('mismatch') and fs == 'match' and _ > 0:
                    got = float(st[st.index('(') + 1:st.index('/')])
                    if abs(got - _) <= 1 and _ >= 15:
                        entry['check'] = 'close'
                        silver = True
                    else:
                        reasons.append('1H_mismatch')
                elif st != 'match' and not st.startswith('mismatch'):
                    reasons.append('1H_' + st.split('(')[0])
                elif st.startswith('mismatch') and fs != 'match':
                    reasons.append('1H_mismatch')
            elif nuc == '13C':
                st, _ = c_status(mol, sp, bool(syms & {'F', 'P'}))
                entry['check'] = st
                if st in ('close', 'extra_lines_cf_cp', 'missing_some'):
                    silver = True
                elif st != 'match':
                    reasons.append('13C_' + st.split('(')[0])
                if sp.get('mhz') and sp['mhz'] > 260:
                    entry.setdefault('flags', [])
                    entry['flags'] = (entry['flags'] or []) + ['field_inconsistent']
            else:
                entry['check'] = 'not_checked'
            if any(f in (sp.get('flags') or []) for f in ('mixture', 'list_truncated', 'minor_isomer')):
                reasons.append('list_' + '_'.join(f for f in sp['flags'] if f in ('mixture', 'list_truncated', 'minor_isomer')))
            rec['spectra'].append(entry)
        if 'two_compounds' in (rd.get('flags') or []):
            silver = True
        if not any(s['nuc'] in ('1H', '13C') for s in rec['spectra']):
            reasons.append('no_1H_or_13C')
        rec['tier'] = 'fail' if reasons else ('silver' if silver else 'gold')
        rec['reasons'] = reasons
        for r_ in reasons:
            fails[r_] += 1
        stats['tier_' + rec['tier']] += 1
        stats['structure_' + str(src)] += 1
        out.append(rec)
    with open(outp, 'w') as f:
        for r in out:
            f.write(json.dumps(r) + '\n')
    good = [r for r in out if r['tier'] in ('gold', 'silver')]
    rep = {'stats': dict(stats), 'fail_reasons': dict(fails.most_common()),
           'unique_compounds_gold_silver': len({r['inchikey'] for r in good}),
           'papers_gold_silver': len({r['pmcid'] for r in good}),
           'class_counts_gold_silver': dict(Counter(c for r in {r['inchikey']: r for r in good}.values() for c in r['classes']))}
    print(json.dumps(rep, indent=1))
    if report_p:
        json.dump(rep, open(report_p, 'w'), indent=1)


if __name__ == '__main__':
    main()
