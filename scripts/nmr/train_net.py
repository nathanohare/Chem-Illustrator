"""Phase 2: graph networks for 13C and 1H shifts, trained on the shipped data (NMRShiftDB2 and
CC BY/CC0 NMRBank lists as assigned by train_lookup.py) and scored on the SI test set.

Usage:
  python3 -I scripts/nmr/train_net.py WORK --seed 1 --epochs 60 --out net-1.pt [--report r.json]

WORK/data must hold feats.jsonl (scripts/nmr/graph_feats.ts, the app's own features),
nmr-measured.dat.inputs.pkl (train_lookup.py --store) and records-v1.jsonl (SI test set, scored only).
Validation: 5% of training structures by id hash (never the SI test set).
"""
import argparse
import hashlib
import json
import os
import pickle
import random
import sys
import time

import numpy as np
import torch
import torch.nn as nn
from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train_lookup as tl  # noqa: E402
import __main__  # noqa: E402
__main__.Mol = tl.Mol  # the cached inputs were pickled from train_lookup run as a script

RDLogger.DisableLog('rdApp.*')
BLOCKS = [14, 2, 3, 5, 6, 7, 3, 2]          # src/chem/nmr/features.ts ATOM_BLOCKS
OFFS = np.cumsum([0] + BLOCKS[:-1])
ATOM_DIM = sum(BLOCKS)
BOND_TYPES = 8
SOLVENTS = ['CDCl3', 'DMSO-d6', 'CD3OD', 'C6D6', 'acetone-d6', 'CD2Cl2', 'CD3CN', 'D2O']  # NET_SOLVENTS
NSOLV = len(SOLVENTS) + 1
NORM = {'13C': (100.0, 50.0), '1H': (4.0, 2.5)}   # (mean, scale) of the outputs


def solv_index(s):
    return SOLVENTS.index(s) if s in SOLVENTS else len(SOLVENTS)


def bucket(key, mod=100):
    return int(hashlib.sha1(key.encode()).hexdigest(), 16) % mod


class Net(nn.Module):
    """Message passing, all plain linear layers so the app can run it in TypeScript:
    h0 = relu(W_in [atom one-hot, solvent one-hot])
    each layer: m_i = sum_j relu(W_msg h_j + e[type_ij]);  h_i += relu(W_self h_i + W_agg m_i)
    out = W_o2 relu(W_o1 h + b)  -> (13C, 1H), scaled by NORM."""

    def __init__(self, hidden=128, layers=5):
        super().__init__()
        self.inp = nn.Linear(ATOM_DIM + NSOLV, hidden)
        self.msg = nn.ModuleList(nn.Linear(hidden, hidden) for _ in range(layers))
        self.bond = nn.ModuleList(nn.Embedding(BOND_TYPES, hidden) for _ in range(layers))
        self.self_ = nn.ModuleList(nn.Linear(hidden, hidden) for _ in range(layers))
        self.agg = nn.ModuleList(nn.Linear(hidden, hidden, bias=False) for _ in range(layers))
        self.o1 = nn.Linear(hidden, hidden)
        self.o2 = nn.Linear(hidden, 2)

    def forward(self, x, src, dst, et):
        h = torch.relu(self.inp(x))
        for k in range(len(self.msg)):
            m = torch.relu(self.msg[k](h)[src] + self.bond[k](et))
            agg = torch.zeros_like(h).index_add_(0, dst, m)
            h = h + torch.relu(self.self_[k](h) + self.agg[k](agg))
        return self.o2(torch.relu(self.o1(h)))


def onehot(a, solv):
    x = np.zeros((len(a), ATOM_DIM + NSOLV), dtype=np.float32)
    idx = np.asarray(a) + OFFS
    for j in range(idx.shape[1]):
        x[np.arange(len(a)), idx[:, j]] = 1
    x[:, ATOM_DIM + solv] = 1
    return x


def load_feats(path):
    out = {}
    for l in open(path):
        r = json.loads(l)
        if r.get('ok'):
            out[r['id']] = (r['a'], r['b'])
    return out


def make_examples(rows, feats, srcmap=None):
    """One example per (structure, solvent): atom targets for 13C and 1H (NaN where unknown)."""
    ex = []
    for m, obs in rows:
        f = feats.get(m.id)
        if f is None or len(f[0]) != len(m.el):
            continue
        by = {}
        for nuc, a, shift, solv in obs:
            si = solv_index(solv)
            t = by.setdefault(si, np.full((len(m.el), 2), np.nan, dtype=np.float32))
            t[a, 0 if nuc == '13C' else 1] = shift
        key = (srcmap or {}).get(m.id) or m.id
        for si, t in by.items():
            # equivalent atoms share the measured value
            ex.append({'id': m.id, 'key': key, 'a': f[0], 'b': f[1], 'solv': si, 'y': t, 'mw': m.mw})
    return ex


def batch(exs):
    xs, src, dst, et, ys, off = [], [], [], [], [], 0
    for e in exs:
        xs.append(onehot(e['a'], e['solv']))
        for u, v, t in e['b']:
            src += [u + off, v + off]
            dst += [v + off, u + off]
            et += [t, t]
        if 'y' in e:
            ys.append(e['y'])
        off += len(e['a'])
    x = torch.from_numpy(np.concatenate(xs))
    s, d, t = (torch.tensor(z, dtype=torch.long) for z in (src, dst, et))
    y = torch.from_numpy(np.concatenate(ys)) if ys else None
    return x, s, d, t, y


def norm_y(y):
    return torch.stack([(y[:, 0] - NORM['13C'][0]) / NORM['13C'][1], (y[:, 1] - NORM['1H'][0]) / NORM['1H'][1]], 1)


def denorm(o):
    return torch.stack([o[:, 0] * NORM['13C'][1] + NORM['13C'][0], o[:, 1] * NORM['1H'][1] + NORM['1H'][0]], 1)


def loss_fn(o, y):
    yn = norm_y(y)
    mask = ~torch.isnan(yn)
    # 1H errors weigh as much as 13C errors relative to their typical size
    w = torch.tensor([1.0, 1.5], device=o.device)
    d = (o - torch.nan_to_num(yn)).abs() * w
    return (d * mask).sum() / mask.sum().clamp(min=1)


DEV = torch.device('cpu')


def to_dev(*ts):
    return [t.to(DEV) if t is not None else None for t in ts]


def evaluate(net, exs, bs=256):
    net.eval()
    err = {'13C': [], '1H': []}
    with torch.no_grad():
        for i in range(0, len(exs), bs):
            x, s, d, t, y = to_dev(*batch(exs[i:i + bs]))
            p = denorm(net(x, s, d, t))
            for k, nuc in enumerate(('13C', '1H')):
                m = ~torch.isnan(y[:, k])
                err[nuc] += (p[m, k] - y[m, k]).abs().tolist()
    net.train()
    return {n: tl.summarise(e) for n, e in err.items()}


def predict_mol(net, a, b, solv):
    x, s, d, t, _ = to_dev(*batch([{'a': a, 'b': b, 'solv': solv}]))
    with torch.no_grad():
        return denorm(net(x, s, d, t)).cpu().numpy()


def score_si(net, si_rows, feats):
    """The benchmark's rules (train_lookup.score_si): per symmetry class, matched to printed lists."""
    seen = set()
    allerr = {n: {} for n in tl.NUCS}

    def add(nuc, k, e):
        allerr[nuc].setdefault(k, []).extend(e)
    for r in si_rows:
        f = feats.get('si' + r['block_id'])
        mol = Chem.MolFromSmiles(r['smiles'])
        if f is None or mol is None or len(f[0]) != mol.GetNumAtoms():
            continue
        rank = list(Chem.CanonicalRankAtoms(mol, breakTies=False))
        cls = {}
        for i, rk in enumerate(rank):
            cls.setdefault(rk, []).append(i)
        mw = Descriptors.MolWt(mol)
        hs = [a.GetTotalNumHs() for a in mol.GetAtoms()]
        for sp in r['spectra']:
            nuc = sp['nuc']
            if nuc not in tl.NUCS:
                continue
            k = (r['inchikey'], nuc, sp.get('solvent'))
            if k in seen:
                continue
            seen.add(k)
            p = predict_mol(net, f[0], f[1], solv_index(sp.get('solvent')))
            if nuc == '13C':
                pred = [p[c[0], 0] for c in cls.values() if mol.GetAtomWithIdx(c[0]).GetSymbol() == 'C']
                _, e = tl.hungarian(pred, tl.exp_13c_si(sp))
            else:
                pred = []
                for c in cls.values():
                    if hs[c[0]] > 0:
                        pred += [p[c[0], 1]] * (hs[c[0]] * len(c))
                _, e = tl.hungarian(pred, tl.exp_1h_si(sp))
            if not len(e):
                continue
            add(nuc, 'all', e)
            if mw < 500:
                add(nuc, 'under 500', e)
                for c in r.get('classes') or ['other']:
                    add(nuc, 'class ' + c, e)
    return {n: {k: tl.summarise(e) for k, e in d.items()} for n, d in allerr.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('work')
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--epochs', type=int, default=60)
    ap.add_argument('--hidden', type=int, default=128)
    ap.add_argument('--layers', type=int, default=5)
    ap.add_argument('--bs', type=int, default=128)
    ap.add_argument('--lr', type=float, default=2e-3)
    ap.add_argument('--limit', type=int, default=0, help='use only this many training examples (quick runs)')
    ap.add_argument('--out', default='net.pt')
    ap.add_argument('--bundle', default=None, help='read training examples from this file (see --write-bundle) instead of WORK/data')
    ap.add_argument('--write-bundle', default=None, help='write the training and validation examples here and stop')
    ap.add_argument('--device', default='cpu', help="'cuda' for an NVIDIA or ROCm (AMD) GPU")
    ap.add_argument('--report', default=None)
    a = ap.parse_args()
    torch.manual_seed(a.seed)
    random.seed(a.seed)
    torch.set_num_threads(os.cpu_count() or 4)
    global DEV
    DEV = torch.device(a.device)
    d = a.work.rstrip('/') + '/data/'
    if a.bundle:
        import gzip
        train, val = pickle.load(gzip.open(a.bundle, 'rb'))
        feats = None
    else:
        feats = load_feats(d + 'feats.jsonl')
        db_all, ship_nb, srcmap = pickle.load(open(d + 'nmr-measured.dat.inputs.pkl', 'rb'))
        ex = make_examples(db_all, feats) + make_examples(ship_nb, feats, srcmap)
        val = [e for e in ex if bucket(e['key']) < 5]
        train = [e for e in ex if bucket(e['key']) >= 5]
    if a.write_bundle:
        import gzip
        slim = lambda es: [{'key': e['key'], 'a': e['a'], 'b': e['b'], 'solv': e['solv'], 'y': e['y']} for e in es]  # noqa: E731
        with gzip.open(a.write_bundle, 'wb') as f:
            pickle.dump((slim(train), slim(val)), f, protocol=4)
        print(json.dumps({'train': len(train), 'val': len(val), 'bundle': a.write_bundle}))
        return
    if a.limit:
        random.shuffle(train)
        train = train[:a.limit]
    si_path = d + 'records-v1.jsonl'
    si_rows = [json.loads(l) for l in open(si_path)] if feats and os.path.exists(si_path) else []
    si_rows = [r for r in si_rows if r.get('tier') in ('gold', 'silver') and r.get('smiles')]
    print(json.dumps({'train': len(train), 'val': len(val), 'si': len(si_rows)}), flush=True)
    net = Net(a.hidden, a.layers).to(DEV)
    opt = torch.optim.AdamW(net.parameters(), lr=a.lr, weight_decay=1e-5)
    steps = a.epochs * ((len(train) + a.bs - 1) // a.bs)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=steps, pct_start=0.05)
    rep = {'args': vars(a), 'epochs': []}
    best, best_state = 1e9, None
    for ep in range(a.epochs):
        t0 = time.time()
        random.shuffle(train)
        tot = 0.0
        for i in range(0, len(train), a.bs):
            x, s, dd, t, y = to_dev(*batch(train[i:i + a.bs]))
            loss = loss_fn(net(x, s, dd, t), y)
            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(net.parameters(), 5.0)
            opt.step()
            sched.step()
            tot += float(loss.detach()) * len(y)
        v = evaluate(net, val)
        score = v['13C']['MAE'] / 2.0 + v['1H']['MAE'] / 0.2
        if score < best:
            best, best_state = score, {k: t.detach().cpu().clone() for k, t in net.state_dict().items()}
        rep['epochs'].append({'epoch': ep, 'loss': tot / sum(len(e['a']) for e in train), 'val': v, 'sec': round(time.time() - t0)})
        print(json.dumps(rep['epochs'][-1]), flush=True)
    net.load_state_dict(best_state)
    torch.save({'state': best_state, 'hidden': a.hidden, 'layers': a.layers, 'val': best}, a.out)
    if si_rows:
        rep['si'] = score_si(net, si_rows, feats)
        print('si', json.dumps({n: rep['si'][n].get('under 500') for n in tl.NUCS}), flush=True)
    if a.report:
        json.dump(rep, open(a.report, 'w'), indent=1)


if __name__ == '__main__':
    main()
