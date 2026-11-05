"""Fit the diastereotopic CH2 split (src/chem/nmr/proton3d.ts) on NMRShiftDB2.

Usage: python3 -I scripts/nmr/proton3d_fit.py TERMS.jsonl[.gz] [OUT.json]

TERMS is the output of proton3d_dump.ts: per structure, per sp3 CH2 the measured shifts (one or
two), whether OpenChemLib calls the two protons diastereotopic, and the 3-D terms of each proton.
The split is d = w . (terms_a - terms_b). Spectra do not say which proton is which, so the loss
is on the size of the split only: (|d| - |measured|)^2, solved by alternating the sign of each
pair with a ridge fit (several starts). Diastereotopic CH2 reported with one shift count with a
lower weight (they may be unresolved, or simply listed once). Structures are split 80/20 by id
hash for a held-out score; the final weights are refitted on everything.
"""
import gzip
import hashlib
import json
import sys

import numpy as np

TERMS = ['ring', 'co', 'cc', 'triple', 'field', 'field2', 'steric', 'stericH', 'anti', 'syn', 'close', 'lonepair']
SINGLE_WEIGHT = 0.3   # weight of a diastereotopic CH2 listed with one shift (target split 0)
RIDGE = 1e-2
MAX = 1.5             # cap on the split, ppm
# The loss cannot tell which proton is downfield, so the overall sign is fixed by a case with a
# known direction: in a chair, the axial proton (close to the 1,3-diaxial hydrogens, large stericH)
# is upfield of the equatorial one by about 0.5 ppm (Pretsch, Structure Determination of Organic
# Compounds). Checked on locked chairs (trans-decalin, tert-butylcyclohexanes, 5a-androstane).
KNOWN_SIGN = {'stericH': -1.0}


def load(path):
    op = gzip.open if path.endswith('.gz') else open
    X, y, wt, held = [], [], [], []
    with op(path, 'rt') as f:
        for line in f:
            r = json.loads(line)
            ho = int(hashlib.md5(r['id'].encode()).hexdigest(), 16) % 5 == 0
            for c in r['ch2']:
                if not c['dia'] or not c['terms']:
                    continue
                fa, fb = (np.asarray([np.nan if v is None else v for v in t], float) for t in c['terms'])
                if not (np.isfinite(fa).all() and np.isfinite(fb).all()):
                    continue  # conformer build gave no usable geometry
                s = c['shifts']
                X.append(fa - fb)
                y.append(abs(s[0] - s[1]) if len(s) == 2 else 0.0)
                wt.append(1.0 if len(s) == 2 else SINGLE_WEIGHT)
                held.append(ho)
    return np.array(X), np.array(y), np.array(wt), np.array(held)


def fit(X, y, wt, starts=8, iters=50, seed=0):
    """Alternate: fix each pair's sign, ridge-fit w, re-assign signs from the fit."""
    sc = X.std(0) + 1e-12
    Z = X / sc
    rng = np.random.default_rng(seed)
    best = None
    for k in range(starts):
        sign = rng.choice([-1.0, 1.0], len(y)) if k else np.sign(Z @ np.linalg.lstsq(Z * wt[:, None] ** .5, y * wt ** .5, rcond=None)[0] + 1e-9)
        for _ in range(iters):
            A = Z * wt[:, None] ** .5
            b = sign * y * wt ** .5
            w = np.linalg.solve(A.T @ A + RIDGE * len(y) * np.eye(Z.shape[1]), A.T @ b)
            d = Z @ w
            new = np.where(d >= 0, 1.0, -1.0)
            if np.array_equal(new, sign):
                break
            sign = new
        loss = np.sum(wt * (np.abs(Z @ w) - y) ** 2)
        if best is None or loss < best[0]:
            best = (loss, w / sc)
    w = best[1]
    z = sum(KNOWN_SIGN[t] * w[TERMS.index(t)] * sc[TERMS.index(t)] for t in KNOWN_SIGN)
    return -w if z < 0 else w


def score(X, y, wt, w, label):
    d = np.clip(np.abs(X @ w), 0, MAX)
    two = y > 0.005   # reported as two different shifts
    mae2 = np.mean(np.abs(d[two] - y[two])) if two.any() else float('nan')
    base2 = np.mean(y[two]) if two.any() else float('nan')  # predicting no split
    one = ~two
    mae1 = np.mean(d[one]) if one.any() else float('nan')
    # does the model rank larger splits higher?
    rho = np.corrcoef(np.argsort(np.argsort(d[two])), np.argsort(np.argsort(y[two])))[0, 1] if two.sum() > 2 else float('nan')
    print(f'{label:10s} two-shift n={two.sum():5d}  MAE {mae2:.3f} (no split {base2:.3f})  rank corr {rho:.2f}  |  one shift or equal n={one.sum():5d} mean split {mae1:.3f}')
    return {'n2': int(two.sum()), 'mae2': mae2, 'nosplit2': base2, 'rank': rho, 'n1': int(one.sum()), 'split1': mae1}


def main():
    X, y, wt, held = load(sys.argv[1])
    print(f'{len(y)} diastereotopic CH2 ({int((y > 0.005).sum())} with two different shifts)')
    w = fit(X[~held], y[~held], wt[~held])
    rep = {'train': score(X[~held], y[~held], wt[~held], w, 'train'), 'held-out': score(X[held], y[held], wt[held], w, 'held-out')}
    wall = fit(X, y, wt)
    out = {'terms': TERMS, 'w': [float(v) for v in wall], 'max': MAX, 'report': rep}
    for t, v in zip(TERMS, wall):
        print(f'  {t:9s} {v: .4g}')
    if len(sys.argv) > 2:
        json.dump(out, open(sys.argv[2], 'w'), indent=1)


if __name__ == '__main__':
    main()
