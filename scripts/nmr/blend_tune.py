"""Tune how the app blends the lookup and the networks (inverse-variance weights), on NMRBank papers
held out from both (the lookup's 5% tuning papers); then score the blend on the SI test set.

Usage:
  python3 -I scripts/nmr/blend_tune.py WORK inputs   # writes WORK/data/blend-in-{tune,si}.jsonl
  node blend_dump.mjs nmr-hose.dat nmr-net.dat blend-in-X.jsonl blend-X.jsonl   (for tune and si)
  python3 -I scripts/nmr/blend_tune.py WORK tune [--report r.json]

Blend per atom: sigma_lookup = base * g[radius group] + b * spread; sigma_net = base * (1 + d * sd / base);
value = inverse-variance mean. Radius groups: 0-1, 2-3, 4-5. Coordinate descent, errors clipped
(13C 20, 1H 2 ppm) while tuning as train_lookup.py does.
"""
import argparse
import json
import os
import sys

import numpy as np
from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train_lookup as tl  # noqa: E402

RDLogger.DisableLog('rdApp.*')
BASE = {'13C': 2.0, '1H': 0.17}
GRID_G = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0, 1e6]
GRID_B = [0.0, 0.25, 0.5, 1.0, 2.0]
GRID_D = [0.0, 0.5, 1.0, 2.0, 4.0]


def write_inputs(d):
    tune = []
    for l in open(d + 'nmrbank06.jsonl'):
        r = json.loads(l)
        if tl.paper_bucket(r['pmcid'] or r['id']) < 5:
            sol = {r.get('c13', {}).get('solvent'), r.get('h1', {}).get('solvent')}
            tune.append({'id': r['id'], 'smiles': r['smiles'], 'solvents': sorted(s for s in sol if s) or [None]})
    si = []
    for l in open(d + 'records-v1.jsonl'):
        r = json.loads(l)
        if r.get('tier') in ('gold', 'silver') and r.get('smiles'):
            sol = {sp.get('solvent') for sp in r['spectra'] if sp['nuc'] in tl.NUCS}
            si.append({'id': 'si' + r['block_id'], 'smiles': r['smiles'], 'solvents': sorted(s for s in sol if s) or [None]})
    for name, rows in (('tune', tune), ('si', si)):
        with open(d + f'blend-in-{name}.jsonl', 'w') as f:
            for r in rows:
                f.write(json.dumps(r) + '\n')
    print(json.dumps({'tune': len(tune), 'si': len(si)}))


def classes(smiles):
    mol = Chem.MolFromSmiles(smiles)
    rank = list(Chem.CanonicalRankAtoms(mol, breakTies=False))
    cls = {}
    for i, rk in enumerate(rank):
        cls.setdefault(rk, []).append(i)
    return list(cls.values()), Descriptors.MolWt(mol)


def problems(d, name):
    """(nucleus, per-class candidate arrays, class sizes for 1H, experimental list, mw, classes tag)."""
    dump = {}
    for l in open(d + f'blend-{name}.jsonl'):
        r = json.loads(l)
        dump[(r['id'], r['solvent'])] = r
    out = []
    if name == 'tune':
        rows = []
        for l in open(d + 'nmrbank06.jsonl'):
            r = json.loads(l)
            if tl.paper_bucket(r['pmcid'] or r['id']) < 5:
                specs = []
                if 'c13' in r:
                    specs.append(('13C', r['c13'].get('solvent'), [v for v, _k in r['c13']['peaks']]))
                if 'h1' in r and all(s[2] is not None for s in r['h1']['signals']):
                    h = []
                    for a, b, n in r['h1']['signals']:
                        h += [((a + b) / 2 if b is not None else a)] * int(round(n))
                    specs.append(('1H', r['h1'].get('solvent'), h))
                rows.append((r['id'], r['smiles'], specs, None))
    else:
        rows, seen = [], set()
        for l in open(d + 'records-v1.jsonl'):
            r = json.loads(l)
            if r.get('tier') not in ('gold', 'silver') or not r.get('smiles'):
                continue
            specs = []
            for sp in r['spectra']:
                k = (r['inchikey'], sp['nuc'], sp.get('solvent'))
                if sp['nuc'] not in tl.NUCS or k in seen:
                    continue
                seen.add(k)
                specs.append((sp['nuc'], sp.get('solvent'), tl.exp_13c_si(sp) if sp['nuc'] == '13C' else tl.exp_1h_si(sp)))
            rows.append(('si' + r['block_id'], r['smiles'], specs, r.get('classes')))
    for id_, smi, specs, tags in rows:
        try:
            cls, mw = classes(smi)
        except Exception:
            continue
        for nuc, solv, exp in specs:
            dm = dump.get((id_, solv)) or dump.get((id_, None))
            if dm is None or not exp:
                continue
            k = 0 if nuc == '13C' else 1
            look, net, reps = [], [], []
            for c in cls:
                a = c[0]
                if (nuc == '13C' and dm['el'][a] != 'C') or (nuc == '1H' and dm['h'][a] == 0):
                    continue
                L = dm['look'][a][k]
                N = dm['net'][a]
                look.append(L if L else [np.nan, 0, 0, 0])
                net.append([N[2 * k], N[2 * k + 1]])
                reps.append(1 if nuc == '13C' else dm['h'][a] * len(c))
            if look:
                out.append((nuc, np.array(look, dtype=float), np.array(net, dtype=float), np.array(reps), np.array(exp, dtype=float), mw, tags))
    return out


def blend(look, net, p, nuc):
    base = BASE[nuc]
    grp = np.where(look[:, 2] >= 4, 2, np.where(look[:, 2] >= 2, 1, 0))
    sl = base * np.array(p['g'])[grp] + p['b'] * look[:, 1]
    sn = base * (1 + p['d'] * net[:, 1] / base)
    wl, wn = 1 / sl ** 2, 1 / sn ** 2
    wl = np.where(np.isnan(look[:, 0]), 0, wl)
    return (np.nan_to_num(look[:, 0]) * wl + net[:, 0] * wn) / (wl + wn)


def errors(probs, nuc, p):
    e = []
    for n, look, net, reps, exp, _mw, _t in probs:
        if n != nuc:
            continue
        v = blend(look, net, p, nuc)
        _, err = tl.hungarian(list(np.repeat(v, reps)), list(exp))
        e += err
    return np.array(e)


def calibrate(probs, nuc, p):
    """Expected absolute error as c0 + c1 * (ensemble spread), fitted to binned errors (clipped)."""
    sd_all, err_all = [], []
    for n, look, net, reps, exp, _mw, _t in probs:
        if n != nuc:
            continue
        v = blend(look, net, p, nuc)
        pairs, err = tl.hungarian(list(np.repeat(v, reps)), list(exp))
        sds = np.repeat(net[:, 1], reps)
        for (i, _j), e in zip(pairs, err):
            sd_all.append(sds[i])
            err_all.append(min(e, tl.CLIP[nuc]))
    sd_all, err_all = np.array(sd_all), np.array(err_all)
    qs = np.quantile(sd_all, np.linspace(0, 1, 11))
    xs, ys = [], []
    for lo, hi in zip(qs[:-1], qs[1:]):
        m = (sd_all >= lo) & (sd_all <= hi)
        if m.sum() > 20:
            xs.append(sd_all[m].mean())
            ys.append(err_all[m].mean())
    if len(xs) < 2 or np.ptp(xs) == 0:
        return {'c0': round(float(err_all.mean()), 4), 'c1': 0.0, 'bins': list(zip(xs, ys))}
    c1, c0 = np.polyfit(xs, ys, 1)
    return {'c0': round(float(c0), 4), 'c1': round(float(max(c1, 0)), 4), 'bins': [[round(x, 4), round(y, 4)] for x, y in zip(xs, ys)]}


def tune(probs, nuc):
    clip = tl.CLIP[nuc]
    p = {'g': [1.0, 1.0, 1.0], 'b': 0.0, 'd': 0.0}
    score = lambda q: float(np.minimum(errors(probs, nuc, q), clip).mean())  # noqa: E731
    best = score(p)
    net_only = score({'g': [1e6] * 3, 'b': 0.0, 'd': 0.0})
    for _sweep in range(2):
        for key, grid in [(('g', 0), GRID_G), (('g', 1), GRID_G), (('g', 2), GRID_G), ('b', GRID_B), ('d', GRID_D)]:
            for v in grid:
                q = json.loads(json.dumps(p))
                if isinstance(key, tuple):
                    q['g'][key[1]] = v
                else:
                    q[key] = v
                s = score(q)
                if s < best:
                    best, p = s, q
        print(nuc, json.dumps(p), round(best, 4), flush=True)
    return p, {'tuned': round(best, 4), 'net_only': round(net_only, 4)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('work')
    ap.add_argument('step', choices=['inputs', 'tune'])
    ap.add_argument('--report')
    a = ap.parse_args()
    d = a.work.rstrip('/') + '/data/'
    if a.step == 'inputs':
        write_inputs(d)
        return
    tp, sp = problems(d, 'tune'), problems(d, 'si')
    rep = {}
    for nuc in tl.NUCS:
        p, s = tune(tp, nuc)
        under = [x for x in sp if x[5] < 500]
        rep[nuc] = {'params': p, 'tune': s, 'calib': calibrate(tp, nuc, p),
                    'si_under_500': {'blend': tl.summarise(errors(under, nuc, p)),
                                     'net_only': tl.summarise(errors(under, nuc, {'g': [1e6] * 3, 'b': 0, 'd': 0})),
                                     'lookup_only': tl.summarise(errors(under, nuc, {'g': [1e-6] * 3, 'b': 0, 'd': 0}))}}
        print(nuc, json.dumps(rep[nuc]), flush=True)
    if a.report:
        json.dump(rep, open(a.report, 'w'), indent=1)


if __name__ == '__main__':
    main()
