"""Head-to-head of NMR predictors on the same SI test compounds, scored the same way.

  python head_to_head.py sample RECORDS OUTDIR [--n 200]   picks compounds, writes sample.jsonl (+ .smi, .sdf)
  python head_to_head.py score OUTDIR NAME=preds.jsonl ...   scores each predictor's file

Sample: gold tier, under 500 Da, no metals, 13C and 1H both in CDCl3, at most one compound per paper,
random order (seeded) so any prefix is itself a fair random subset.
Predictions file (JSONL): {id, "13C": [ppm per carbon atom], "1H": [[ppm, H count], ...]}.
Scoring is the same for every program: per-atom lists (13C one value per carbon, 1H one per proton)
matched one-to-one to the printed lists (Hungarian); MAE over matched pairs. Only compounds every
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
    rows = []
    for l in open(a.records):
        r = json.loads(l)
        if r.get('tier') != 'gold' or not r.get('smiles') or 'organometallic' in r.get('classes', []):
            continue
        m = Chem.MolFromSmiles(r['smiles'])
        if not m or Descriptors.MolWt(m) > 500:
            continue
        sp = {s['nuc']: s for s in r['spectra'] if s.get('solvent') == 'CDCl3'}
        if not (sp.get('13C', {}).get('peaks') and sp.get('1H', {}).get('signals')):
            continue
        rows.append((r, sp))
    random.Random(20261103).shuffle(rows)
    seen, picked = set(), []
    for r, sp in rows:
        if r['pmcid'] in seen:
            continue
        seen.add(r['pmcid'])
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
            f.write(f"{p['smiles']} HH{i:03d}\n")
    w = Chem.SDWriter(os.path.join(a.out, 'sample.sdf'))
    for i, p in enumerate(picked, 1):
        m = Chem.MolFromSmiles(p['smiles'])
        AllChem.Compute2DCoords(m)
        m.SetProp('_Name', f'HH{i:03d}')
        m.SetProp('ID', f'HH{i:03d}')
        w.write(m)
    w.close()
    print(json.dumps({'picked': len(picked), 'eligible': len(rows)}))


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
        exp[f'HH{i:03d}'] = r  # the programs see only the HH number
    preds = {}
    for spec in a.preds:
        name, path = spec.split('=', 1)
        preds[name] = {}
        for l in open(path):
            p = json.loads(l)
            if p['id'] in exp:
                preds[name][exp[p['id']]['id']] = p
    out = {}
    for nuc in ('13C', '1H'):
        common = set.intersection(*[{k for k, p in d.items() if p.get(nuc)} for d in preds.values()])
        for name, d in preds.items():
            errs = []
            for k in common:
                p = d[k][nuc]
                pl = p if nuc == '13C' else [v for v, n in p for _ in range(int(n))]
                errs += mae_pairs(pl, exp[k][nuc])
            out.setdefault(name, {})[nuc] = {'compounds': len(common), 'MAE': round(float(np.mean(errs)), 3),
                                               'RMSE': round(float(np.sqrt(np.mean(np.square(errs)))), 3)}
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='step', required=True)
    s = sub.add_parser('sample'); s.add_argument('records'); s.add_argument('out'); s.add_argument('--n', type=int, default=200)
    s = sub.add_parser('score'); s.add_argument('out'); s.add_argument('preds', nargs='+')
    a = ap.parse_args()
    sample(a) if a.step == 'sample' else score(a)
