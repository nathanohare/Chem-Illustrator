"""Score predicted 1H multiplicities and coupling constants (j_dump.ts) against the SI test set.

Usage: python3 -I scripts/nmr/j_bench.py records-v1.jsonl j-out.jsonl [--detail]

Per compound, published signals are matched to predicted proton groups through their shifts
(protons expanded and Hungarian-matched, each signal takes the group most of its protons went to).
Scored: signals with a first-order label (s, d, t, q, dd, td, ...), i.e. not m or broad.
Reported: multiplicity exact-match rate, and J MAE over couplings paired by size."""
import collections
import json
import sys

import numpy as np
from scipy.optimize import linear_sum_assignment

OK = {'s', 'd', 't', 'q', 'p', 'quint', 'sext', 'sept', 'dd', 'dt', 'td', 'tt', 'ddd', 'dq', 'qd', 'ddt', 'dtd', 'tdd', 'qt', 'tq', 'dddd'}


def norm(m):
    m = (m or '').strip().lower().replace(' ', '').replace('quint', 'p').replace('quin', 'p')
    return m


def main():
    rec_path, dump_path = sys.argv[1], sys.argv[2]
    detail = '--detail' in sys.argv
    pred = {}
    for l in open(dump_path):
        r = json.loads(l)
        pred[r['id']] = r['groups']
    n_sig = n_mult = 0
    jerr = []
    conf = collections.Counter()
    by_exp = collections.defaultdict(lambda: [0, 0])
    for l in open(rec_path):
        r = json.loads(l)
        gid = 'si' + r['block_id']
        if gid not in pred:
            continue
        sp = next((s for s in r['spectra'] if s['nuc'] == '1H' and s.get('solvent') == 'CDCl3'), None)
        if not sp or not sp.get('signals'):
            continue
        groups = pred[gid]
        P = [(gi, g['shift']) for gi, g in enumerate(groups) for _ in range(g['n'])]
        E = []
        for si, s in enumerate(sp['signals']):
            a, b, m, js, n = s
            if a is None:
                continue
            d = (a + b) / 2 if b is not None else a
            E += [(si, d)] * int(round(n or 1))
        if not P or not E:
            continue
        cost = np.abs(np.array([p[1] for p in P])[:, None] - np.array([e[1] for e in E])[None, :])
        ri, ci = linear_sum_assignment(cost)
        votes = collections.defaultdict(collections.Counter)
        for i, j in zip(ri, ci):
            votes[E[j][0]][P[i][0]] += 1
        for si, v in votes.items():
            a, b, m, js, n = sp['signals'][si]
            m = norm(m)
            if m not in {norm(x) for x in OK}:
                continue
            g = groups[v.most_common(1)[0][0]]
            n_sig += 1
            pm = norm(g['mult'])
            hit = pm == m
            n_mult += hit
            by_exp[m][0] += 1
            by_exp[m][1] += hit
            conf[(m, pm)] += 1
            ej = sorted([abs(x) for x in (js or []) if x is not None], reverse=True)
            pj = sorted(g['j'], reverse=True)
            if ej and pj:
                c = np.abs(np.array(ej)[:, None] - np.array(pj)[None, :])
                a2, b2 = linear_sum_assignment(c)
                jerr += list(c[a2, b2])
    jerr = np.array(jerr)
    print(json.dumps({'signals': n_sig, 'mult_exact': round(n_mult / max(n_sig, 1), 3), 'J_pairs': int(jerr.size),
                      'J_MAE': round(float(jerr.mean()), 2) if jerr.size else None,
                      'J_median': round(float(np.median(jerr)), 2) if jerr.size else None,
                      'J_within_1Hz': round(float((jerr <= 1).mean()), 3) if jerr.size else None}))
    for m, (t, h) in sorted(by_exp.items(), key=lambda x: -x[1][0])[:12]:
        print(f'  {m:5s} {t:6d} {h / t:.2f}')
    if detail:
        for (e, p), c in conf.most_common(25):
            print('   exp', e, 'pred', p, c)


if __name__ == '__main__':
    main()
