"""Build the 19F and 31P shift lookup (public/nmr/nmr-fp.dat) from NMRShiftDB2 and NMRexp, and score it.

Usage:
  python3 -I scripts/nmr/train_fp.py WORKDIR [--out public/nmr/nmr-fp.dat]

WORKDIR holds:
  nsdb.jsonl.gz      scripts/nmr/nmrshiftdb2.py output (assigned 19F/31P peaks by symmetry class)
  nmrexp_fp.jsonl    NMRexp 19F/31P lists: {id: 'ex<row>', nuc, file, solvent, peaks}; rows matching
                     the SI test set already left out (exclude-v1)
  codes.jsonl        scripts/nmr/env_codes.ts output for every structure (the app's own codes)
  records-v1.jsonl   SI test set (scored only; its structures are also dropped from training by InChIKey)

Same environment codes and file layout as the 13C/1H lookup (train_lookup.py, lookup.ts), with
sections for '19F' and '31P'. NMRexp lists are unassigned: a list is used when it has as many
distinct shifts as the structure has symmetry-distinct F (or P) atoms. One-atom lists go in
directly; longer ones are matched to atoms by optimal assignment against the table built so far
(two rounds). Held out for scoring: 10% of NMRShiftDB2 records and 5% of NMRexp papers; the
shipped table is rebuilt on everything.

Licence: the table is a produced work of NMRShiftDB2 (nmrshiftdb2 Database License) and NMRexp
(CC BY 4.0, doi 10.5281/zenodo.17296666).
"""
import argparse
import gzip
import json
import os
import sys

import numpy as np
from rdkit import Chem, RDLogger
from scipy.optimize import linear_sum_assignment

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train_lookup as tl  # noqa: E402

RDLogger.DisableLog('rdApp.*')
NUCS = ('19F', '31P')
EL = {'19F': 'F', '31P': 'P'}
RANGE = {'19F': (-320.0, 120.0), '31P': (-300.0, 300.0)}
tl.NUCS = NUCS
tl.SCALE = {'19F': 50.0, '31P': 50.0}
tl.PRUNE_TOL = {'19F': 0.4, '31P': 0.4}
GRID = [{'maxr': mr, 'depth': d, 'decay': dc, 'c': 1.0, 'min_n': 1, 'solvent': s}
        for mr in (4, 5) for d in (0, 1, 2) for dc in (0.2, 0.4) for s in (True, False)]


def key14(smiles):
    m = Chem.MolFromSmiles(smiles)
    try:
        return Chem.MolToInchiKey(m)[:14] if m else None
    except Exception:
        return None


def classes(m, nuc):
    return m.classes(lambda a: m.el[a] == EL[nuc])


def distinct(peaks, nuc):
    lo, hi = RANGE[nuc]
    out = []
    for v in sorted(peaks):
        if not lo <= v <= hi:
            return None
        if not out or abs(v - out[-1]) > 0.005:
            out.append(v)
    return out


def load(work, codes, smiles, si_keys):
    db, ex, si = [], [], []
    for l in gzip.open(os.path.join(work, 'nsdb.jsonl.gz'), 'rt'):
        r = json.loads(l)
        if 'db' + r['id'] not in codes or key14(r['smiles']) in si_keys:
            continue
        try:
            m = tl.Mol('db' + r['id'], r['smiles'], codes)
        except ValueError:
            continue
        first = {}
        for i, rk in enumerate(m.rank):
            first.setdefault(rk, i)
        obs = []
        for s in r['spectra']:
            if s['nuc'] not in NUCS or 'conflict' in s['flags']:
                continue
            lo, hi = RANGE[s['nuc']]
            for shift, _mu, _at, cls in s['peaks']:
                a = first.get(cls)
                if a is not None and m.el[a] == EL[s['nuc']] and lo <= shift <= hi:
                    obs.append((s['nuc'], a, shift, s.get('solvent')))
        if obs:
            db.append((m, obs, tl.paper_bucket(r['id']) < 10))
    for l in open(os.path.join(work, 'nmrexp_fp.jsonl')):
        r = json.loads(l)
        if r['id'] not in codes:
            continue
        if key14(smiles[r['id']]) in si_keys:
            continue
        try:
            m = tl.Mol(r['id'], smiles[r['id']], codes)
        except ValueError:
            continue
        cl = classes(m, r['nuc'])
        pk = distinct(r['peaks'], r['nuc'])
        if not cl or not pk or len(pk) != len(cl):
            continue
        ex.append((m, r, cl, pk, tl.paper_bucket(r['file']) < 5))
    for l in open(os.path.join(work, 'records-v1.jsonl')):
        r = json.loads(l)
        if r.get('tier') not in ('gold', 'silver') or 'si' + r['block_id'] not in codes:
            continue
        try:
            m = tl.Mol('si' + r['block_id'], r['smiles'], codes)
        except ValueError:
            continue
        spectra = r['spectra'] if isinstance(r['spectra'], list) else [dict(v, nuc=k) for k, v in r['spectra'].items()]
        for sp in spectra:
            nuc = sp.get('nuc')
            if nuc not in NUCS:
                continue
            pk = sorted(p[0] for p in sp.get('peaks') or [] if p and p[0] is not None)
            cl = classes(m, nuc)
            if pk and cl:
                si.append((m, nuc, sp.get('solvent'), cl, pk))
    return db, ex, si


def build(db, ex_assigned, maxr, use_held):
    t = tl.Table(maxr)
    for m, obs, held in db:
        if held and not use_held:
            continue
        for nuc, a, v, solv in obs:
            t.add(nuc, m.codes[a], v, 1.0, solv)
    for m, nuc, solv, pairs in ex_assigned:
        for a, v in pairs:
            t.add(nuc, m.codes[a], v, 1.0, solv)
    t.freeze()
    return t


def match(t, m, nuc, solv, cl, pk, p):
    pred = []
    for c in cl:
        h = t.predict(nuc, m.codes[c[0]], solv, p)
        pred.append(h[0] if h else np.nan)
    pred = np.array(pred)
    if np.isnan(pred).all():
        return None, None
    cost = np.abs(np.subtract.outer(np.nan_to_num(pred, nan=1e4), np.array(pk)))
    r, c = linear_sum_assignment(cost)
    return list(zip(r, c)), pred


def assign(t, ex, p, use_held):
    out = []
    for m, r, cl, pk, held in ex:
        if held and not use_held:
            continue
        if len(cl) == 1:
            out.append((m, r['nuc'], r['solvent'], [(cl[0][0], pk[0])]))
            continue
        if t is None:
            continue
        pairs, pred = match(t, m, r['nuc'], r['solvent'], cl, pk, p)
        if pairs is None or any(np.isnan(pred[i]) for i, _ in pairs):
            continue
        err = np.mean([abs(pred[i] - pk[j]) for i, j in pairs])
        if err > (8.0 if r['nuc'] == '19F' else 10.0):
            continue
        out.append((m, r['nuc'], r['solvent'], [(cl[i][0], pk[j]) for i, j in pairs]))
    return out


def score(t, db, ex, si, p):
    res = {}
    for nuc in NUCS:
        e_db = [abs(t.predict(nuc, m.codes[a], s, p)[0] - v) for m, obs, held in db if held for n, a, v, s in obs
                if n == nuc and t.predict(nuc, m.codes[a], s, p)]
        e_ex, miss = [], 0
        for m, r, cl, pk, held in ex:
            if not held or r['nuc'] != nuc:
                continue
            pairs, pred = match(t, m, nuc, r['solvent'], cl, pk, p)
            if pairs is None:
                miss += 1
                continue
            e_ex += [abs(pred[i] - pk[j]) for i, j in pairs if not np.isnan(pred[i])]
        e_si, si_miss = [], 0
        for m, n, solv, cl, pk in si:
            if n != nuc:
                continue
            pairs, pred = match(t, m, nuc, solv, cl, pk, p)
            if pairs is None:
                si_miss += 1
                continue
            e_si += [abs(pred[i] - pk[j]) for i, j in pairs if not np.isnan(pred[i])]
        f = lambda e: {'mae': round(float(np.mean(e)), 3), 'median': round(float(np.median(e)), 3), 'within_2': round(float(np.mean(np.array(e) <= 2)), 3),
                       'within_5': round(float(np.mean(np.array(e) <= 5)), 3), 'n': len(e)} if e else None
        res[nuc] = {'nmrshiftdb2_held': f(e_db), 'nmrexp_held': f(e_ex), 'nmrexp_no_hit': miss, 'si': f(e_si), 'si_no_hit': si_miss}
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('work')
    ap.add_argument('--out')
    a = ap.parse_args()
    codes = tl.load_codes(os.path.join(a.work, 'codes.jsonl'))
    smiles = {}
    for l in open(os.path.join(a.work, 'smiles.jsonl')):
        r = json.loads(l)
        smiles[r['id']] = r['smiles']
    si_keys = {key14(s) for k, s in smiles.items() if k.startswith('si')} - {None}
    db, ex, si = load(a.work, codes, smiles, si_keys)
    print(f'NMRShiftDB2 records {len(db)}, NMRexp lists usable {len(ex)} (one atom {sum(len(e[2]) == 1 for e in ex)}), SI spectra {len(si)}')
    p0 = {'maxr': 5, 'depth': 1, 'decay': 0.35, 'c': 1.0, 'min_n': 1, 'solvent': True}
    t = None
    for rnd in range(3):
        asg = assign(t, ex, p0, False)
        t = build(db, asg, 5, False)
        print(f'round {rnd}: {len(asg)} NMRexp lists in', json.dumps(score(t, db, ex, [], p0)))
    best = {}
    for nuc in NUCS:
        rows = []
        for p in GRID:
            s = score(t, db, ex, [], p)[nuc]
            rows.append((s['nmrexp_held']['mae'] + (s['nmrshiftdb2_held'] or {'mae': 0})['mae'], p))
        rows.sort(key=lambda x: x[0])
        best[nuc] = rows[0][1]
        print(nuc, 'best params', best[nuc], round(rows[0][0], 3))
    print('held-out and SI with best params:')
    for nuc in NUCS:
        print(nuc, json.dumps(score(t, db, ex, si, best[nuc])[nuc]))
    if a.out:
        asg = assign(t, ex, best['19F'], True)
        full = build(db, asg, 5, True)
        dropped = tl.prune(full, tl.PRUNE_TOL)
        for nuc in NUCS:
            print(nuc, 'after pruning, SI', json.dumps(score(full, db, ex, si, best[nuc])[nuc]['si']), 'dropped', dropped[nuc])
        secs = tl.export_table(full, a.out, best, {'sources': {'nmrshiftdb2': len(db), 'nmrexp': len(asg)}})
        print('wrote', a.out, os.path.getsize(a.out), 'bytes,', len(secs), 'sections')


if __name__ == '__main__':
    main()
