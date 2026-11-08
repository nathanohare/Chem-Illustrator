"""Fit the diastereotopic CH2 split (src/chem/nmr/proton3d.ts) on NMRShiftDB2 and export it for the app.

Usage: python3 -I scripts/nmr/proton3d_fit.py TERMS.jsonl.gz TOPO.jsonl OUT.json [--si SI_TERMS_GLOB SI_TOPO.jsonl SI_PROBLEMS.pkl]

TERMS: proton3d_dump.ts output (per CH2: measured shifts, the 3-D terms of both protons).
TOPO: proton3d_topo.ts output (the app's own structure features and diastereotopic flags).

The model predicts only the SIZE of the gap between the two protons: spectra list CH2 shifts per
carbon, so which proton is which is unknown, and a direction model tested on assigned protons
(Dickson et al. 2025) was right only about 70% of the time. Inputs (ch2Features): the absolute
difference and the mean of the two protons' terms, and the structure features. Gradient-boosted
trees, trained on every diastereotopic CH2: a CH2 listed with one shift counts as a gap of 0 (most
are truly close together; leaving them out made the SI score worse). Structures are split 80/20 by
id hash for a held-out score; the shipped trees are refitted on everything.

Output: {base, max, trees: [{f, t, l, r, v}]} read by treeSplit() in proton3d.ts (f = -1 at a leaf).
"""
import gzip
import hashlib
import json
import sys

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

MAX = 1.5      # cap on the gap, ppm
PARAMS = dict(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=20, random_state=0)


def features(fa, fb, topo):
    fa, fb = np.asarray(fa, float), np.asarray(fb, float)
    return np.concatenate([np.abs(fa - fb), (fa + fb) / 2, np.asarray(topo, float)])


def load(terms_path, topo_path):
    topo = {}
    for l in open(topo_path):
        r = json.loads(l)
        topo[r['id']] = r
    X, y, held = [], [], []
    op = gzip.open if terms_path.endswith('.gz') else open
    with op(terms_path, 'rt') as f:
        for l in f:
            r = json.loads(l)
            t = topo.get(r['id'])
            if not t:
                continue
            dia = set(t['dia'])
            ho = int(hashlib.md5(r['id'].encode()).hexdigest(), 16) % 5 == 0
            for c in r['ch2']:
                if c['c'] not in dia or not c['terms'] or any(v is None for tt in c['terms'] for v in tt):
                    continue
                s = c['shifts']
                X.append(features(*c['terms'], t['topo'][str(c['c'])]))
                y.append(abs(s[0] - s[1]) if len(s) == 2 else 0.0)
                held.append(ho)
    return np.array(X), np.array(y), np.array(held)


def export(m):
    trees = []
    for it in m._predictors:
        nd = it[0].nodes
        trees.append({'f': [int(v) if not leaf else -1 for v, leaf in zip(nd['feature_idx'], nd['is_leaf'])],
                      't': [float(v) for v in nd['num_threshold']],
                      'l': [int(v) for v in nd['left']], 'r': [int(v) for v in nd['right']],
                      'v': [round(float(v), 6) for v in nd['value']]})
    return {'base': float(np.ravel(m._baseline_prediction)[0]), 'max': MAX, 'trees': trees}


def tree_predict(ex, x):
    s = ex['base']
    for t in ex['trees']:
        n = 0
        while t['f'][n] >= 0:
            n = t['l'][n] if x[t['f'][n]] <= t['t'][n] else t['r'][n]
        s += t['v'][n]
    return max(0.0, min(ex['max'], s))


def main():
    X, y, held = load(sys.argv[1], sys.argv[2])
    two = y > 0.005
    print(f'{len(y)} diastereotopic CH2, {int(two.sum())} with two different shifts')
    m = HistGradientBoostingRegressor(**PARAMS).fit(X[~held], y[~held])
    p = np.clip(m.predict(X[held]), 0, MAX)
    print(f'held-out, two-shift CH2: MAE {np.mean(np.abs(p[two[held]] - y[held & two])):.3f} ppm '
          f'(typical gap {np.mean(np.abs(np.median(y[~held & two]) - y[held & two])):.3f}); one-shift CH2: mean predicted gap {p[~two[held]].mean():.3f}')
    full = HistGradientBoostingRegressor(**PARAMS).fit(X, y)
    ex = export(full)
    worst = max(abs(tree_predict(ex, x) - float(np.clip(full.predict(x[None])[0], 0, MAX))) for x in X[:500])
    print(f'exported {len(ex["trees"])} trees; largest difference from sklearn on 500 rows {worst:.2e} ppm')
    json.dump(ex, open(sys.argv[3], 'w'), separators=(',', ':'))


if __name__ == '__main__':
    main()
