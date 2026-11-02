"""NMR benchmark: score a shift predictor on the SI test set, per class.

Usage: python3 -I scripts/nmr/benchmark.py nmrshiftdb2.jsonl.gz records.jsonl OUT_report.json [OUT_report.md]

Predictor here is the phase 0 baseline: a sphere-environment (HOSE-like) lookup over
NMRShiftDB2's experimental, non-conflicting spectra (Morgan environments of radius 4 down
to 0; the median of the deepest matching sphere). Later phases plug their predictors
into predict_13c / predict_1h.

Scoring (SI lists are rarely assigned to atoms):
- 13C: one predicted value per symmetry-unique carbon against the printed peaks, paired
  by optimal one-to-one matching (Hungarian); "(2C)" peaks count twice.
- 1H: one predicted value per proton (each heavy atom's prediction repeated by its H
  count) against the printed signals repeated by their integrals (ranges use the
  midpoint); unmatched predicted protons (often OH/NH not observed) are ignored.
MAE is over matched atoms, pooled per class; a compound counts in every class it is
tagged with. Only gold and silver records are scored. Large errors: >10 ppm 13C, >1 ppm 1H.
Reference numbers: the same lookup scored on a 10% held-out split of NMRShiftDB2.
"""
import gzip
import json
import random
import statistics
import sys
from collections import defaultdict

import numpy as np
from rdkit import Chem, RDLogger
from rdkit.Chem import rdFingerprintGenerator
from scipy.optimize import linear_sum_assignment

RDLogger.DisableLog('rdApp.*')
MAXR = 4
GEN = rdFingerprintGenerator.GetMorganGenerator(radius=MAXR, includeRedundantEnvironments=True)
BIG = {'13C': 10.0, '1H': 1.0}


def env_keys(mol):
    ao = rdFingerprintGenerator.AdditionalOutput()
    ao.AllocateBitInfoMap()
    GEN.GetSparseCountFingerprint(mol, additionalOutput=ao)
    keys = defaultdict(dict)
    for bit, hits in ao.GetBitInfoMap().items():
        for atom, rad in hits:
            keys[atom][rad] = bit
    return keys


class Lookup:
    def __init__(self):
        self.tab = {'13C': defaultdict(list), '1H': defaultdict(list)}
        self.med = None

    def add(self, nuc, keys, val):
        for r, bit in keys.items():
            self.tab[nuc][(r, bit)].append(val)

    def freeze(self):
        self.med = {n: {k: statistics.median(v) for k, v in t.items()} for n, t in self.tab.items()}

    def predict(self, nuc, keys):
        for r in range(MAXR, -1, -1):
            v = self.med[nuc].get((r, keys.get(r)))
            if v is not None:
                return v, r
        return None, -1


def load_db(path):
    out = []
    for l in gzip.open(path, 'rt'):
        r = json.loads(l)
        mol = Chem.MolFromSmiles(r['smiles'])
        if mol is None:
            continue
        sp = [s for s in r['spectra'] if s['nuc'] in ('13C', '1H') and 'conflict' not in s['flags']]
        if sp:
            out.append((r, mol, sp))
    return out


def train(rows):
    lk = Lookup()
    for r, mol, sps in rows:
        # the stored SMILES has its own atom order: map stored symmetry classes to it
        rank = list(Chem.CanonicalRankAtoms(mol, breakTies=False))
        cls_atom = {}
        for a in mol.GetAtoms():
            cls_atom.setdefault(rank[a.GetIdx()], a.GetIdx())
        keys = env_keys(mol)
        for s in sps:
            for shift, _m, _at, cls in s['peaks']:
                a = cls_atom.get(cls)
                if a is None:
                    continue
                el = mol.GetAtomWithIdx(a).GetAtomicNum()
                if (s['nuc'] == '13C' and el == 6) or (s['nuc'] == '1H' and mol.GetAtomWithIdx(a).GetTotalNumHs() > 0):
                    lk.add(s['nuc'], keys[a], shift)
    lk.freeze()
    return lk


def match(pred, exp):
    if not pred or not exp:
        return []
    cost = np.abs(np.subtract.outer(np.array(pred), np.array(exp)))
    r, c = linear_sum_assignment(cost)
    return list(cost[r, c])


def predict_13c(lk, mol, keys):
    rank = list(Chem.CanonicalRankAtoms(mol, breakTies=False))
    seen, pred, spheres = set(), [], []
    for a in mol.GetAtoms():
        if a.GetAtomicNum() != 6 or rank[a.GetIdx()] in seen:
            continue
        seen.add(rank[a.GetIdx()])
        v, r = lk.predict('13C', keys[a.GetIdx()])
        if v is not None:
            pred.append(v)
            spheres.append(r)
    return pred, spheres, len(seen)


def predict_1h(lk, mol, keys):
    pred, spheres, n = [], [], 0
    for a in mol.GetAtoms():
        h = a.GetTotalNumHs()
        if not h:
            continue
        n += h
        v, r = lk.predict('1H', keys[a.GetIdx()])
        if v is not None:
            pred += [v] * h
            spheres += [r] * h
    return pred, spheres, n


def exp_13c(sp):
    out = []
    for p in sp.get('peaks') or []:
        k = p[3] if len(p) > 3 and isinstance(p[3], (int, float)) and p[3] and p[3] < 10 else 1
        out += [p[0]] * int(k)
    return out


def exp_1h(sp):
    out = []
    for s in sp.get('signals') or []:
        mid = (s[0] + s[1]) / 2 if s[1] is not None else s[0]
        out += [mid] * int(round(s[4] or 1))
    return out


def summarise(errs):
    if not errs:
        return None
    return {'atoms': len(errs), 'MAE': round(float(np.mean(errs)), 3), 'RMSE': round(float(np.sqrt(np.mean(np.square(errs)))), 3)}


def main():
    db_p, rec_p, out_p = sys.argv[1:4]
    md_p = sys.argv[4] if len(sys.argv) > 4 else None
    rows = load_db(db_p)
    random.seed(7)
    random.shuffle(rows)
    nt = len(rows) // 10
    held, tr = rows[:nt], rows[nt:]
    lk = train(tr)
    rep = {'predictor': 'phase0 sphere lookup (NMRShiftDB2, radius 4..0)', 'train_compounds': len(tr)}
    # reference: held-out NMRShiftDB2, assigned, per atom
    ref = {'13C': [], '1H': []}
    for r, mol, sps in held:
        rank = list(Chem.CanonicalRankAtoms(mol, breakTies=False))
        cls_atom = {}
        for a in mol.GetAtoms():
            cls_atom.setdefault(rank[a.GetIdx()], a.GetIdx())
        keys = env_keys(mol)
        for s in sps:
            for shift, _m, _at, cls in s['peaks']:
                a = cls_atom.get(cls)
                if a is None:
                    continue
                v, _r = lk.predict(s['nuc'], keys[a])
                if v is not None:
                    ref[s['nuc']].append(abs(v - shift))
    rep['nmrshiftdb2_heldout'] = {n: summarise(e) for n, e in ref.items()}
    # SI test set
    recs = [json.loads(l) for l in open(rec_p)]
    recs = [r for r in recs if r.get('tier') in ('gold', 'silver')]
    seen = set()
    by_class = {n: defaultdict(list) for n in ('13C', '1H')}
    by_solvent = {n: defaultdict(list) for n in ('13C', '1H')}
    by_tier = {n: defaultdict(list) for n in ('13C', '1H')}
    allerr = {'13C': [], '1H': []}
    per = []
    for r in recs:
        mol = Chem.MolFromSmiles(r['smiles'])
        if mol is None:
            continue
        keys = env_keys(mol)
        for sp in r['spectra']:
            nuc = sp['nuc']
            if nuc not in ('13C', '1H'):
                continue
            k = (r['inchikey'], nuc, sp.get('solvent'))
            if k in seen:
                continue
            seen.add(k)
            if nuc == '13C':
                pred, _sph, _n = predict_13c(lk, mol, keys)
                e = match(pred, exp_13c(sp))
            else:
                pred, _sph, _n = predict_1h(lk, mol, keys)
                e = match(pred, exp_1h(sp))
            if not e:
                continue
            allerr[nuc] += e
            for c in r['classes'] or ['other']:
                by_class[nuc][c] += e
            by_solvent[nuc][sp.get('solvent') or 'unknown'] += e
            by_tier[nuc][r['tier']] += e
            per.append({'block_id': r['block_id'], 'inchikey': r['inchikey'], 'nuc': nuc, 'mae': round(float(np.mean(e)), 3), 'n': len(e)})
    rep['si_test'] = {
        'compounds': len({r['inchikey'] for r in recs}),
        'overall': {n: dict(summarise(e) or {}, big_error_pct=round(100 * sum(x > BIG[n] for x in e) / len(e), 2) if e else None)
                    for n, e in allerr.items()},
        'by_class': {n: {c: summarise(e) for c, e in sorted(d.items())} for n, d in by_class.items()},
        'by_solvent': {n: {c: summarise(e) for c, e in sorted(d.items(), key=lambda x: -len(x[1]))[:8]} for n, d in by_solvent.items()},
        'by_tier': {n: {c: summarise(e) for c, e in d.items()} for n, d in by_tier.items()},
    }
    rep['worst_spectra'] = sorted(per, key=lambda x: -x['mae'])[:25]
    json.dump(rep, open(out_p, 'w'), indent=1)
    if md_p:
        lines = ['| Class | 1H atoms | 1H MAE (ppm) | 13C atoms | 13C MAE (ppm) |', '|---|---|---|---|---|']
        cls = sorted(set(by_class['1H']) | set(by_class['13C']))
        for c in cls:
            h = summarise(by_class['1H'].get(c, [])) or {}
            cc = summarise(by_class['13C'].get(c, [])) or {}
            lines.append(f"| {c} | {h.get('atoms', 0)} | {h.get('MAE', '')} | {cc.get('atoms', 0)} | {cc.get('MAE', '')} |")
        o = rep['si_test']['overall']
        lines.append(f"| **All SI test compounds** | {o['1H'].get('atoms')} | {o['1H'].get('MAE')} | {o['13C'].get('atoms')} | {o['13C'].get('MAE')} |")
        hr = rep['nmrshiftdb2_heldout']
        lines.append(f"| NMRShiftDB2 held-out (reference) | {hr['1H']['atoms']} | {hr['1H']['MAE']} | {hr['13C']['atoms']} | {hr['13C']['MAE']} |")
        open(md_p, 'w').write('\n'.join(lines) + '\n')
    print(json.dumps({k: rep[k] for k in ('nmrshiftdb2_heldout',)}, indent=1))
    print(json.dumps(rep['si_test']['overall'], indent=1))


if __name__ == '__main__':
    main()
