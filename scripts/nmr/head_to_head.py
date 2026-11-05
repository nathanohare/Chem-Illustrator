"""Head-to-head of NMR predictors on the same SI test compounds, scored the same way.

  python head_to_head.py sample RECORDS OUTDIR [--n 200]   picks compounds, writes sample.jsonl (+ .smi, .sdf)
  python head_to_head.py score OUTDIR NAME=preds.jsonl ...   scores each predictor's file

Sample: gold tier (--tiers gold,silver for more), under 500 Da, no metals, 13C and 1H both in CDCl3,
at most --per-paper compounds per paper (default 1), structures whose InChIKey skeleton is in an
--exclude list left out (e.g. the test compounds found in NMRexp, which our networks saw), random order
(seeded) so any prefix is itself a fair random subset. --prefix names the ids (HH001...).
Predictions file (JSONL): {id, "13C": [ppm per carbon atom], "1H": [[ppm, H count], ...]}, or the raw
output of nmrdb_predict.mjs (nmrdb.org signals).
Scoring is the same for every program: per-atom lists (13C one value per carbon, 1H one per proton)
matched one-to-one to the printed lists (Hungarian); MAE over matched pairs. --bootstrap N adds a 95%
interval for each program's MAE minus the first one's, resampling whole papers. Only compounds every
program predicted are scored, so the numbers compare like with like.
"""
import argparse, json, os, random, sys
import numpy as np
from scipy.optimize import linear_sum_assignment
from rdkit import Chem
from rdkit.Chem import AllChem, Descriptors

sys.path.insert(0, os.path.dirname(__file__))
from benchmark import exp_13c, exp_1h  # noqa: E402


def sample(a):
    excl = set(json.load(open(a.exclude))['inchikey14']) if a.exclude else set()
    rows = []
    for l in open(a.records):
        r = json.loads(l)
        if r.get('tier') not in a.tiers.split(',') or not r.get('smiles') or 'organometallic' in r.get('classes', []):
            continue
        if (r.get('inchikey') or '')[:14] in excl:
            continue
        m = Chem.MolFromSmiles(r['smiles'])
        if not m or Descriptors.MolWt(m) > 500:
            continue
        sp = {s['nuc']: s for s in r['spectra'] if s.get('solvent') == 'CDCl3'}
        if not (sp.get('13C', {}).get('peaks') and sp.get('1H', {}).get('signals')):
            continue
        rows.append((r, sp))
    random.Random(20261103).shuffle(rows)
    seen, picked, keys = {}, [], set()
    for r, sp in rows:
        k = (r.get('inchikey') or r['smiles'])[:14]
        if seen.get(r['pmcid'], 0) >= a.per_paper or k in keys:
            continue
        seen[r['pmcid']] = seen.get(r['pmcid'], 0) + 1
        keys.add(k)
        picked.append({'id': r['block_id'], 'smiles': Chem.MolToSmiles(Chem.MolFromSmiles(r['smiles'])), 'name': r.get('name'),
                       'classes': r['classes'], 'solvent': 'CDCl3', '13C': exp_13c(sp['13C']), '1H': exp_1h(sp['1H'])})
        if len(picked) == a.n:
            break
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, 'sample.jsonl'), 'w') as f:
        for p in picked:
            f.write(json.dumps(p) + '\n')
    with open(os.path.join(a.out, 'sample.smi'), 'w') as f:
        for i, p in enumerate(picked, 1):
            f.write(f"{p['smiles']} {a.prefix}{i:0{a.width}d}\n")
    w = Chem.SDWriter(os.path.join(a.out, 'sample.sdf'))
    for i, p in enumerate(picked, 1):
        m = Chem.MolFromSmiles(p['smiles'])
        AllChem.Compute2DCoords(m)
        m.SetProp('_Name', f'{a.prefix}{i:0{a.width}d}')
        m.SetProp('ID', f'{a.prefix}{i:0{a.width}d}')
        w.write(m)
    w.close()
    print(json.dumps({'picked': len(picked), 'eligible': len(rows), 'papers': len(seen)}))


def mae_pairs(pred, exp):
    if not pred or not exp:
        return []
    cost = np.abs(np.subtract.outer(np.array(pred, float), np.array(exp, float)))
    r, c = linear_sum_assignment(cost)
    return list(cost[r, c])


def score(a):
    exp = {}
    for i, l in enumerate(open(os.path.join(a.out, 'sample.jsonl')), 1):
        r = json.loads(l)
        exp[r['id']] = r
        exp[f'{a.prefix}{i:0{a.width}d}'] = r  # the programs see only the numbered id
    preds = {}
    for spec in a.preds:
        name, path = spec.split('=', 1)
        preds[name] = {}
        for l in open(path):
            p = json.loads(l)
            if 'carbon' in p or 'proton' in p:  # raw nmrdb_predict.mjs output: signals with atom counts
                p = {'id': p['id'], '13C': [s['delta'] for s in p.get('carbon') or [] for _ in range(s['nbAtoms'])],
                     '1H': [[s['delta'], s['nbAtoms']] for s in p.get('proton') or []]}
            if p['id'] in exp:
                preds[name][exp[p['id']]['id']] = p
    out = {}
    names = list(preds)
    rng = np.random.default_rng(20261105)
    for nuc in ('13C', '1H'):
        common = sorted(set.intersection(*[{k for k, p in d.items() if p.get(nuc)} for d in preds.values()]))
        per = {}  # name -> per-compound (sum of errors, count)
        for name, d in preds.items():
            errs, sums = [], []
            for k in common:
                p = d[k][nuc]
                pl = p if nuc == '13C' else [v for v, n in p for _ in range(int(n))]
                e = mae_pairs(pl, exp[k][nuc])
                errs += e
                sums.append((sum(e), len(e)))
            per[name] = np.array(sums, float).reshape(-1, 2)
            out.setdefault(name, {})[nuc] = {'compounds': len(common), 'MAE': round(float(np.mean(errs)), 3),
                                               'RMSE': round(float(np.sqrt(np.mean(np.square(errs)))), 3)}
        if a.bootstrap and len(names) > 1 and common:
            # resample whole papers (compounds from one paper are not independent), 95% interval of
            # each program's MAE minus the first program's
            paper = [k.rsplit('-', 1)[0] for k in common]
            groups = {}
            for i, pp in enumerate(paper):
                groups.setdefault(pp, []).append(i)
            idx = list(groups.values())
            for name in names[1:]:
                diffs = []
                for _ in range(a.bootstrap):
                    pick = np.concatenate([idx[j] for j in rng.integers(0, len(idx), len(idx))])
                    s0, s1 = per[names[0]][pick].sum(0), per[name][pick].sum(0)
                    diffs.append(s1[0] / s1[1] - s0[0] / s0[1])
                lo, hi = np.percentile(diffs, [2.5, 97.5])
                out[name][nuc]['minus_' + names[0]] = [round(float(lo), 3), round(float(hi), 3)]
            out[names[0]][nuc]['papers'] = len(groups)
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='step', required=True)
    s = sub.add_parser('sample'); s.add_argument('records'); s.add_argument('out'); s.add_argument('--n', type=int, default=200)
    s.add_argument('--tiers', default='gold'); s.add_argument('--per-paper', type=int, default=1); s.add_argument('--exclude')
    s.add_argument('--prefix', default='HH'); s.add_argument('--width', type=int, default=3)
    s = sub.add_parser('score'); s.add_argument('out'); s.add_argument('preds', nargs='+')
    s.add_argument('--prefix', default='HH'); s.add_argument('--width', type=int, default=3)
    s.add_argument('--bootstrap', type=int, default=0, help='paper bootstrap rounds for the MAE differences')
    a = ap.parse_args()
    sample(a) if a.step == 'sample' else score(a)
