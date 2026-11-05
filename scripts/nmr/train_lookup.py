"""Phase 1: build the shift lookup (HOSE-style environment codes) from NMRShiftDB2 plus
NMRBank peak lists assigned by matching, tune how radii are combined, and score it.

Usage:
  python3 -I scripts/nmr/train_lookup.py WORKDIR [--rounds 2] [--out table.json.gz]

WORKDIR/data must hold nmrshiftdb2.jsonl.gz, nmrbank.jsonl, records-v1.jsonl and
codes_all.jsonl (environment codes from scripts/nmr/env_codes.ts, the app's own code).

Splits, all by source paper or record so nothing scored was seen in training:
- NMRShiftDB2: 10% of records held out (reference score, assigned atoms).
- NMRBank: 5% of papers held out as the tuning set (scored like the SI test set); the rest
  is assigned to atoms by optimal matching against the current table, then added.
- SI test set (records-v1 gold/silver): never used for training or tuning; its papers and
  the second run's papers were already removed from NMRBank by scripts/nmr/nmrbank.py.
"""
import argparse
import gzip
import hashlib
import json
import random
import sys
from collections import defaultdict

import numpy as np
from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors
from scipy.optimize import linear_sum_assignment

RDLogger.DisableLog('rdApp.*')
NUCS = ('13C', '1H')
RANGE = {'13C': (-15.0, 250.0), '1H': (-6.0, 20.0)}
BIG = {'13C': 10.0, '1H': 1.0}
EXCH = {'O', 'N', 'S'}  # H on these may be missing from a printed 1H list


def paper_bucket(key, mod=100):
    return int(hashlib.sha1(key.encode()).hexdigest(), 16) % mod


# ---------------------------------------------------------------- loading

def load_codes(path):
    out = {}
    for l in open(path):
        r = json.loads(l)
        if r.get('ok'):
            out[r['id']] = (r['el'], r['h'], [tuple(int(c, 16) for c in cs) for cs in r['codes']])
    return out


class Mol:
    __slots__ = ('id', 'el', 'h', 'codes', 'rank', 'mw')

    def __init__(self, id_, smiles, codes):
        self.id = id_
        mol = Chem.MolFromSmiles(smiles)
        if mol is None or id_ not in codes:
            raise ValueError
        self.el, self.h, self.codes = codes[id_]
        if [a.GetSymbol() for a in mol.GetAtoms()] != self.el:
            raise ValueError('atom order differs')
        self.rank = list(Chem.CanonicalRankAtoms(mol, breakTies=False))
        self.mw = Descriptors.MolWt(mol)

    def classes(self, pred):
        """Symmetry classes (list of atom index lists) whose first atom passes pred."""
        g = defaultdict(list)
        for i, r in enumerate(self.rank):
            g[r].append(i)
        return [v for v in g.values() if pred(v[0])]


def load_nmrshiftdb(path, codes):
    rows = []
    for l in gzip.open(path, 'rt'):
        r = json.loads(l)
        try:
            m = Mol('db' + r['id'], r['smiles'], codes)
        except ValueError:
            continue
        cls_atom = {}
        for i, rk in enumerate(m.rank):
            cls_atom.setdefault(rk, i)
        obs = []  # (nuc, atom, shift, solvent)
        for s in r['spectra']:
            if s['nuc'] not in NUCS or 'conflict' in s['flags']:
                continue
            vals = [p[0] for p in s['peaks']]
            lo, hi = RANGE[s['nuc']]
            if any(not lo <= v <= hi for v in vals) or (s['nuc'] == '1H' and vals and sum(vals) / len(vals) > 12):
                continue
            for shift, _m, _at, cls in s['peaks']:
                a = cls_atom.get(cls)
                if a is None:
                    continue
                if (s['nuc'] == '13C' and m.el[a] == 'C') or (s['nuc'] == '1H' and m.h[a] > 0):
                    obs.append((s['nuc'], a, shift, s.get('solvent')))
        if obs:
            rows.append((m, obs))
    return rows


def load_nmrbank(path, codes):
    rows = []
    for l in open(path):
        r = json.loads(l)
        try:
            m = Mol(r['id'], r['smiles'], codes)
        except ValueError:
            continue
        rows.append((m, r))
    return rows


def load_si(path, codes):
    rows = []
    for l in open(path):
        r = json.loads(l)
        if r.get('tier') not in ('gold', 'silver') or not r.get('smiles'):
            continue
        try:
            m = Mol('si' + r['block_id'], r['smiles'], codes)
        except ValueError:
            continue
        rows.append((m, r))
    return rows


# ---------------------------------------------------------------- the lookup

class Table:
    def __init__(self, maxr):
        self.maxr = maxr
        self.raw = {n: defaultdict(list) for n in NUCS}   # (r, code) -> [(value, weight)]
        self.rawsolv = {n: defaultdict(list) for n in NUCS}  # (r, code, solvent) -> values
        self.stat = None
        self.parent = {}  # (r, code) -> code at r-1 of the same atom (one parent: codes grow from it)

    def add(self, nuc, codes, value, weight=1.0, solvent=None):
        for r in range(self.maxr + 1):
            if r:
                self.parent[(r, codes[r])] = codes[r - 1]
            self.raw[nuc][(r, codes[r])].append((value, weight))
            if solvent:
                self.rawsolv[nuc][(r, codes[r], solvent)].append((value, weight))

    @staticmethod
    def _stat(vals):
        v = np.array([x for x, _ in vals])
        w = np.array([x for _, x in vals])
        o = np.argsort(v)
        v, w = v[o], w[o]
        cw = np.cumsum(w)
        med = float(v[np.searchsorted(cw, cw[-1] / 2)])
        mad = float(np.sum(w * np.abs(v - med)) / cw[-1])
        return med, mad, float(cw[-1]), len(v)

    def freeze(self):
        self.stat = {n: {k: self._stat(v) for k, v in t.items()} for n, t in self.raw.items()}
        self.statsolv = {n: {k: self._stat(v) for k, v in t.items() if len(v) >= 2} for n, t in self.rawsolv.items()}
        self.raw = self.rawsolv = None

    def predict(self, nuc, codes, solvent=None, p=None):
        """Blend the deepest matching radii. Returns (value, spread, radius, n) or None."""
        p = p or {}
        mins = p.get('min_n', 1)
        depth = p.get('depth', 1)          # how many radii below the deepest hit to blend
        decay = p.get('decay', 0.35)        # weight factor per radius step down
        c = p.get('c', 1.0)                 # count saturation
        st = self.stat[nuc]
        hits = []
        for r in range(min(self.maxr, p.get('maxr', self.maxr)), -1, -1):
            s = None
            if solvent and p.get('solvent', True):
                s = self.statsolv[nuc].get((r, codes[r], solvent))
            if s is None:
                s = st.get((r, codes[r]))
            if s is None or s[2] < (mins if r > 0 else 0):
                continue
            hits.append((r, s))
            if len(hits) > depth:
                break
        if not hits:
            return None
        top = hits[0][0]
        num = den = 0.0
        for r, (med, mad, wn, _n) in hits:
            w = (decay ** (top - r)) * (wn / (wn + c))
            num += w * med
            den += w
        r0, s0 = hits[0]
        return num / den, s0[1], r0, s0[3]


SHIP_LICENCES = {'CC BY', 'CC0'}
PRUNE_TOL = {'13C': 0.4, '1H': 0.03}


def prune(t, tol):
    """Drop environments that say nothing new: a key whose median is within tol of the nearest
    kept shallower key of the same atom, and a solvent key within tol of the general key.
    Keeps the shipped file small; scored after pruning so the cost is measured."""
    dropped = {}
    for nuc in NUCS:
        st = t.stat[nuc]
        kept_anc = {}  # (r, code) -> median of the nearest kept ancestor (itself if kept)
        gone = 0
        for r in range(t.maxr + 1):
            for k in [k for k in st if k[0] == r]:
                med = st[k][0]
                if r == 0:
                    kept_anc[k] = med
                    continue
                anc = kept_anc.get((r - 1, t.parent.get(k)))
                if anc is not None and abs(med - anc) <= tol[nuc]:
                    kept_anc[k] = anc
                    del st[k]
                    gone += 1
                else:
                    kept_anc[k] = med
        ss = t.statsolv[nuc]
        for k in list(ss):
            g = st.get(k[:2])
            ref = g[0] if g else kept_anc.get(k[:2])
            if ref is not None and abs(ss[k][0] - ref) <= tol[nuc]:
                del ss[k]
                gone += 1
        dropped[nuc] = gone
    return dropped
SCALE = {'13C': 50.0, '1H': 1000.0}
MAGIC = b'NMRH'


def export_table(t, path, params, meta):
    """Write the lookup as public/nmr/nmr-hose.dat (read by src/chem/nmr/lookup.ts).

    Layout: 'NMRH', u32 version, u32 header length, JSON header, zero padding to 8 bytes,
    then for each section in header order: f64 codes (sorted), i16 median, u16 spread, u16 count,
    each array padded to 8 bytes. Values are ppm times SCALE[nuc]."""
    import struct
    sections, blobs = [], []
    solvents = sorted({k[2] for n in NUCS for k in t.statsolv[n]})
    for nuc in NUCS:
        maxr = params[nuc]['maxr']
        for r in range(maxr + 1):
            for solv in [None] + solvents:
                if solv is None:
                    items = [(k[1], v) for k, v in t.stat[nuc].items() if k[0] == r]
                else:
                    items = [(k[1], v) for k, v in t.statsolv[nuc].items() if k[0] == r and k[2] == solv]
                if not items:
                    continue
                items.sort()
                codes = np.array([c for c, _ in items], dtype=np.float64)
                med = np.clip(np.round(np.array([v[0] for _, v in items]) * SCALE[nuc]), -32768, 32767).astype('<i2')
                mad = np.clip(np.round(np.array([v[1] for _, v in items]) * SCALE[nuc]), 0, 65535).astype('<u2')
                cnt = np.clip(np.array([v[3] for _, v in items]), 0, 65535).astype('<u2')
                sections.append({'nuc': nuc, 'r': r, 'solvent': solv, 'count': len(items)})
                blobs.append((codes.astype('<f8'), med, mad, cnt))
    head = json.dumps({'version': 1, 'scale': SCALE, 'params': params, 'sections': sections, **meta}).encode()
    pre = MAGIC + struct.pack('<II', 1, len(head)) + head
    pre += b'\0' * (-len(pre) % 8)
    with open(path, 'wb') as f:
        f.write(pre)
        for arrs in blobs:
            for a in arrs:
                b = a.tobytes()
                f.write(b + b'\0' * (-len(b) % 8))
    return sections


def hash52(s):
    """The app's hash52 (src/chem/nmr/env.ts): two 32-bit FNV-1a lanes, 13 hex digits."""
    a, b = 0x811c9dc5, 0x050c5d1f
    for ch in s:
        c = ord(ch)
        a = ((a ^ c) * 0x01000193) & 0xffffffff
        b = ((b ^ c) * (0x01000193 ^ 0x5bd1e995)) & 0xffffffff
        b = (b ^ (b >> 13)) & 0xffffffff
    return '%08x%05x' % (a, b & 0xfffff)


def mol_key(m):
    """Whole-structure key: hash52 of the sorted deepest atom codes (same as src/chem/nmr/measured.ts)."""
    return int(hash52(','.join(sorted('%013x' % c[-1] for c in m.codes))), 16)


STORE_MAGIC = b'NMRM'


def export_store(db_rows, nb_assigned, nb_source, path, max_mw=500.0):
    """Write the measured-shift store (public/nmr/nmr-measured.dat, read by src/chem/nmr/measured.ts).

    For each structure up to max_mw (by mol_key): its measured shifts per atom environment, nucleus
    and solvent, with the source (NMRShiftDB2 record or PMC article). Same structure from several
    sources: the median per atom, source of the first. NMRBank atoms were assigned by matching.
    An atom is named by the position of its deepest code among the structure's distinct deepest
    codes, sorted (one byte).

    Layout: 'NMRM', u32 version, u32 header length, JSON header (solvents, count, entries), padding
    to 8, then f64 keys (sorted), u32 source, u32 entry offsets (count + 1), u8 atom positions,
    i16 values (ppm x SCALE), u8 kinds (bit 7: 1H; bits 0-6: 1 + solvent index, 0 unknown), each
    padded to 8. Source: NMRShiftDB2 id (0 unknown), or PMC number with bit 31 set."""
    import struct
    solvents = sorted({o[3] for _m, obs in list(db_rows) + list(nb_assigned) for o in obs if o[3]})[:127]
    sidx = {s: i + 1 for i, s in enumerate(solvents)}
    mols = {}
    for kind, rows in (('db', db_rows), ('nb', nb_assigned)):
        for m, obs in rows:
            if m.mw > max_mw:
                continue
            uniq = sorted({c[-1] for c in m.codes})
            if len(uniq) > 256:
                continue
            pos = {c: i for i, c in enumerate(uniq)}
            if kind == 'db':
                src = int(m.id[2:]) if m.id[2:].isdigit() else 0
            else:
                pm = nb_source.get(m.id) or ''
                if not pm.startswith('PMC') or not pm[3:].isdigit():
                    continue
                src = int(pm[3:]) | 0x80000000
            e = mols.setdefault(mol_key(m), {'src': src, 'vals': defaultdict(list)})
            for nuc, a, shift, solv in obs:
                e['vals'][(pos[m.codes[a][-1]], nuc == '1H', sidx.get(solv, 0))].append(shift)
    keys = sorted(mols)
    srcs, offs, atoms, vals, kinds = [], [0], [], [], []
    for k in keys:
        e = mols[k]
        srcs.append(e['src'])
        for (at, is_h, si), vs in sorted(e['vals'].items()):
            atoms.append(at)
            vals.append(float(np.median(vs)) * SCALE['1H' if is_h else '13C'])
            kinds.append((0x80 if is_h else 0) | si)
        offs.append(len(atoms))
    head = json.dumps({'version': 1, 'scale': SCALE, 'solvents': solvents, 'count': len(keys), 'entries': len(atoms), 'max_mw': max_mw}).encode()
    pre = STORE_MAGIC + struct.pack('<II', 1, len(head)) + head
    pre += b'\0' * (-len(pre) % 8)
    arrs = [np.array(keys, dtype='<f8'), np.array(srcs, dtype='<u4'), np.array(offs, dtype='<u4'), np.array(atoms, dtype='<u1'),
            np.clip(np.round(vals), -32768, 32767).astype('<i2'), np.array(kinds, dtype='<u1')]
    with open(path, 'wb') as f:
        f.write(pre)
        for a in arrs:
            b = a.tobytes()
            f.write(b + b'\0' * (-len(b) % 8))
    return {'structures': len(keys), 'entries': len(atoms)}


def build(maxr, db_rows, nb_assigned, w_nb):
    t = Table(maxr)
    for m, obs in db_rows:
        for nuc, a, shift, solv in obs:
            t.add(nuc, m.codes[a], shift, 1.0, solv)
    for m, obs in nb_assigned:
        for nuc, a, shift, solv in obs:
            t.add(nuc, m.codes[a], shift, w_nb, solv)
    t.freeze()
    return t


# ---------------------------------------------------------------- predicting and matching

def pred_13c(t, m, solvent, p):
    out = []
    for cls in m.classes(lambda i: m.el[i] == 'C'):
        v = t.predict('13C', m.codes[cls[0]], solvent, p)
        out.append((cls, v[0] if v else None))
    return out


def pred_1h(t, m, solvent, p):
    out = []
    for cls in m.classes(lambda i: m.h[i] > 0):
        v = t.predict('1H', m.codes[cls[0]], solvent, p)
        out.append((cls, v[0] if v else None))
    return out


def hungarian(pred, exp):
    if not pred or not exp:
        return [], []
    cost = np.abs(np.subtract.outer(np.array(pred), np.array(exp)))
    r, c = linear_sum_assignment(cost)
    return list(zip(r, c)), list(cost[r, c])


def exp_13c_si(sp):
    return [p[0] for p in (sp.get('peaks') or []) if p and isinstance(p[0], (int, float))]


def exp_1h_si(sp):
    out = []
    for s in sp.get('signals') or []:
        if not s or not isinstance(s[0], (int, float)):
            continue
        mid = (s[0] + s[1]) / 2 if len(s) > 1 and isinstance(s[1], (int, float)) else s[0]
        n = s[4] if len(s) > 4 and isinstance(s[4], (int, float)) else 1
        out += [mid] * max(1, int(round(n)))
    return out


def score_lists(t, m, c13, h1, solv13, solv1, p):
    """Matched absolute errors for printed 13C peaks and expanded 1H signals (benchmark rules)."""
    e13 = e1 = []
    if c13:
        pr = [v for _c, v in pred_13c(t, m, solv13, p) if v is not None]
        _, e13 = hungarian(pr, c13)
    if h1:
        pr = []
        for cls, v in pred_1h(t, m, solv1, p):
            if v is not None:
                pr += [v] * (m.h[cls[0]] * len(cls))
        _, e1 = hungarian(pr, h1)
    return e13, e1


# ---------------------------------------------------------------- assigning NMRBank lists

def assign_13c(t, m, peaks, solvent, p):
    """Assign printed 13C peaks to symmetry classes. Returns [(atom, shift)] or None."""
    pc = pred_13c(t, m, solvent, p)
    if any(v is None for _c, v in pc) or not peaks:
        return None
    vals = [v for v, _k in peaks]
    lo, hi = RANGE['13C']
    if any(not lo <= v <= hi for v in vals) or len(set(vals)) != len(vals):
        return None
    nu = len(pc)
    if len(vals) == nu:
        cols = vals
    elif len(vals) == nu - 1 or (len(vals) < nu and sum(k for _v, k in peaks) == nu):
        cols = vals + vals  # a peak may stand for two overlapping carbons
    else:
        return None
    cost = np.abs(np.subtract.outer(np.array([v for _c, v in pc]), np.array(cols)))
    if len(cols) > len(vals):
        cost[:, len(vals):] += 0.5
    r, c = linear_sum_assignment(cost)
    err = cost[r, c]
    if err.max() > 12 or err.mean() > 3.5:
        return None
    return [(pc[i][0][0], cols[j]) for i, j in zip(r, c)]


def assign_1h(t, m, sigs, solvent, p):
    """Assign 1H signals (with integrals) to H-bearing symmetry classes."""
    if not sigs or any(s[2] is None for s in sigs):
        return None
    ph = pred_1h(t, m, solvent, p)
    if any(v is None for _c, v in ph):
        return None
    total_h = sum(m.h[c[0]] * len(c) for c, _v in ph)
    exch = sum(m.h[c[0]] * len(c) for c, _v in ph if m.el[c[0]] in EXCH)
    integ = sum(s[2] for s in sigs)
    if not (total_h - exch - 0.01 <= integ <= total_h + 0.01):
        return None
    exp, owner = [], []
    for k, (a, b, n) in enumerate(sigs):
        mid = (a + b) / 2 if b is not None else a
        if not RANGE['1H'][0] <= mid <= RANGE['1H'][1]:
            return None
        for _ in range(int(round(n))):
            exp.append(mid)
            owner.append(k)
    pr, pcls = [], []
    for ci, (cls, v) in enumerate(ph):
        for _ in range(m.h[cls[0]] * len(cls)):
            pr.append(v)
            pcls.append(ci)
    cost = np.abs(np.subtract.outer(np.array(pr), np.array(exp)))
    r, c = linear_sum_assignment(cost)
    err = cost[r, c]
    if err.max() > 1.6 or err.mean() > 0.45:
        return None
    got = defaultdict(list)
    for i, j in zip(r, c):
        got[pcls[i]].append(exp[j])
    out = []
    for ci, (cls, _v) in enumerate(ph):
        vals = got.get(ci)
        if not vals:
            continue
        need = m.h[cls[0]] * len(cls)
        if len(vals) < need and m.el[cls[0]] not in EXCH:
            continue
        # protons of one carbon split over two signals (diastereotopic CH2) give the mean
        out.append((cls[0], float(np.mean(vals))))
    return out


def assign_all(t, nb_rows, p):
    out = []
    n13 = n1 = 0
    for m, r in nb_rows:
        obs = []
        if 'c13' in r:
            a = assign_13c(t, m, r['c13']['peaks'], r['c13']['solvent'], p)
            if a:
                n13 += 1
                obs += [('13C', i, v, r['c13']['solvent']) for i, v in a]
        if 'h1' in r:
            a = assign_1h(t, m, r['h1']['signals'], r['h1']['solvent'], p)
            if a:
                n1 += 1
                obs += [('1H', i, v, r['h1']['solvent']) for i, v in a]
        if obs:
            out.append((m, obs))
    return out, n13, n1


# ---------------------------------------------------------------- scoring

CLIP = {'13C': 20.0, '1H': 2.0}  # tuning only: a few garbage lists in NMRBank must not steer the choice


def summarise(e, clip=None):
    if not len(e):
        return None
    e = np.asarray(e)
    if clip:
        e = np.minimum(e, clip)
    return {'atoms': int(len(e)), 'MAE': round(float(e.mean()), 3), 'RMSE': round(float(np.sqrt((e ** 2).mean())), 3)}


def mw_band(mw):
    return '<300' if mw < 300 else '300-500' if mw < 500 else '>=500'


def score_db(t, rows, p):
    e = {n: [] for n in NUCS}
    for m, obs in rows:
        for nuc, a, shift, solv in obs:
            v = t.predict(nuc, m.codes[a], solv, p)
            if v:
                e[nuc].append(abs(v[0] - shift))
    return {n: summarise(x) for n, x in e.items()}


def score_nb(t, rows, p):
    e = {n: [] for n in NUCS}
    for m, r in rows:
        c13 = [v for v, _k in r['c13']['peaks']] if 'c13' in r else None
        h1 = None
        if 'h1' in r and all(s[2] is not None for s in r['h1']['signals']):
            h1 = []
            for a, b, n in r['h1']['signals']:
                h1 += [((a + b) / 2 if b is not None else a)] * int(round(n))
        e13, e1 = score_lists(t, m, c13, h1, r.get('c13', {}).get('solvent'), r.get('h1', {}).get('solvent'), p)
        e['13C'] += list(e13)
        e['1H'] += list(e1)
    return {n: summarise(x, CLIP[n]) for n, x in e.items()}


def score_si(t, rows, p):
    seen = set()
    allerr = {n: defaultdict(list) for n in NUCS}
    for m, r in rows:
        band = mw_band(m.mw)
        for sp in r['spectra']:
            nuc = sp['nuc']
            if nuc not in NUCS:
                continue
            k = (r['inchikey'], nuc, sp.get('solvent'))
            if k in seen:
                continue
            seen.add(k)
            if nuc == '13C':
                e, _ = score_lists(t, m, exp_13c_si(sp), None, sp.get('solvent'), None, p)
            else:
                _, e = score_lists(t, m, None, exp_1h_si(sp), None, sp.get('solvent'), p)
            if not len(e):
                continue
            allerr[nuc]['all'] += list(e)
            allerr[nuc]['mw ' + band] += list(e)
            if m.mw < 500:
                allerr[nuc]['under 500'] += list(e)
                for c in r.get('classes') or ['other']:
                    allerr[nuc]['class ' + c] += list(e)
    out = {}
    for n in NUCS:
        out[n] = {}
        for k, e in allerr[n].items():
            s = summarise(e)
            s['big_pct'] = round(100 * float(np.mean(np.asarray(e) > BIG[n])), 2)
            out[n][k] = s
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('work')
    ap.add_argument('--rounds', type=int, default=2)
    ap.add_argument('--maxr', type=int, default=5)
    ap.add_argument('--w-nb', type=float, default=0.5)
    ap.add_argument('--report', default=None)
    ap.add_argument('--tune', action='store_true')
    ap.add_argument('--export', default=None, help='write the shipped table (all NMRShiftDB2 + CC BY/CC0 NMRBank) here')
    ap.add_argument('--store', default=None, help='with --export: also write the measured-shift store here')
    ap.add_argument('--nb', default='nmrbank.jsonl')
    ap.add_argument('--p13', default='{"maxr": 5, "min_n": 1, "depth": 0}')
    ap.add_argument('--p1', default='{"maxr": 4, "min_n": 1, "depth": 1, "decay": 0.2, "c": 2.0}')
    a = ap.parse_args()
    d = a.work.rstrip('/') + '/data/'
    codes = load_codes(d + 'codes_all.jsonl')
    db = load_nmrshiftdb(d + 'nmrshiftdb2.jsonl.gz', codes)
    nb = load_nmrbank(d + a.nb, codes)
    si = load_si(d + 'records-v1.jsonl', codes)
    del codes
    random.seed(7)
    random.shuffle(db)
    nt = len(db) // 10
    db_held, db_tr = db[:nt], db[nt:]
    nb_tune = [x for x in nb if paper_bucket(x[1]['pmcid'] or x[1]['id']) < 5]
    nb_tr = [x for x in nb if paper_bucket(x[1]['pmcid'] or x[1]['id']) >= 5]
    print(json.dumps({'db_train': len(db_tr), 'db_held': len(db_held), 'nb_train': len(nb_tr), 'nb_tune': len(nb_tune), 'si': len(si)}), flush=True)
    p = {}
    rep = {'rounds': []}
    t = build(a.maxr, db_tr, [], a.w_nb)
    rep['rounds'].append({'round': 0, 'db_held': score_db(t, db_held, p), 'nb_tune': score_nb(t, nb_tune, p), 'si': score_si(t, si, p)})
    print(json.dumps(rep['rounds'][-1]), flush=True)
    assigned = []
    for k in range(1, a.rounds + 1):
        assigned, n13, n1 = assign_all(t, nb_tr, p)
        del t
        t = build(a.maxr, db_tr, assigned, a.w_nb)
        rep['rounds'].append({'round': k, 'assigned_13c': n13, 'assigned_1h': n1, 'db_held': score_db(t, db_held, p),
                              'nb_tune': score_nb(t, nb_tune, p), 'si': score_si(t, si, p)})
        print(json.dumps(rep['rounds'][-1]), flush=True)
    if a.tune:
        grid = []
        for maxr in (3, 4, 5):
            for mins in (1, 2, 3):
                for depth in (0, 1, 2):
                    for decay in ((0.2, 0.5) if depth else (1.0,)):
                        for c in (0.5, 2.0):
                            grid.append({'maxr': maxr, 'min_n': mins, 'depth': depth, 'decay': decay, 'c': c})
        res = []
        for q in grid:
            sc = score_nb(t, nb_tune, q)
            res.append((q, sc['13C']['MAE'], sc['1H']['MAE']))
            print(json.dumps(res[-1]), flush=True)
        b13 = min(res, key=lambda x: x[1])[0]
        b1 = min(res, key=lambda x: x[2])[0]
        rep['best'] = {'13C': b13, '1H': b1}
        for nuc, q in (('13C', b13), ('1H', b1)):
            rep['best_' + nuc] = {'params': q, 'db_held': score_db(t, db_held, q)[nuc], 'si': score_si(t, si, q)[nuc]}
            print(json.dumps(rep['best_' + nuc]), flush=True)
    if not a.tune:
        for nuc, q in (('13C', json.loads(a.p13)), ('1H', json.loads(a.p1))):
            rep['best_' + nuc] = {'params': q, 'nb_tune': score_nb(t, nb_tune, q)[nuc], 'db_held': score_db(t, db_held, q)[nuc], 'si': score_si(t, si, q)[nuc]}
            print(json.dumps({k: v for k, v in rep['best_' + nuc].items() if k != 'si'}), json.dumps(rep['best_' + nuc]['si'].get('under 500')), flush=True)
    if a.export:
        lic = {x[0].id: x[1].get('license') for x in nb}
        ship_nb = [x for x in assigned if lic.get(x[0].id) in SHIP_LICENCES]
        if a.store:
            import pickle
            src_map = {x[0].id: x[1].get('pmcid') for x in nb}
            with open(a.store + '.inputs.pkl', 'wb') as f:
                pickle.dump((db_tr + db_held, ship_nb, src_map), f)
            rep['store'] = export_store(db_tr + db_held, ship_nb, {x[0].id: x[1].get('pmcid') for x in nb}, a.store)
            print('store', json.dumps(rep['store']), flush=True)
        del t
        t = build(a.maxr, db_tr + db_held, ship_nb, a.w_nb)
        params = {'13C': json.loads(a.p13), '1H': json.loads(a.p1)}
        rep['export_unpruned_si'] = {nuc: score_si(t, si, params[nuc])[nuc]['under 500'] for nuc in NUCS}
        print('unpruned', json.dumps(rep['export_unpruned_si']), flush=True)
        for nuc in NUCS:  # radii the predictor never reads
            for k in [k for k in t.stat[nuc] if k[0] > params[nuc]['maxr']]:
                del t.stat[nuc][k]
            for k in [k for k in t.statsolv[nuc] if k[0] > params[nuc]['maxr']]:
                del t.statsolv[nuc][k]
        rep['pruned'] = prune(t, PRUNE_TOL)
        secs = export_table(t, a.export, params, {'sources': {'nmrshiftdb2': len(db), 'nmrbank_cc_by': len(ship_nb)}})
        rep['export'] = {'sections': len(secs), 'keys': sum(x['count'] for x in secs), 'nmrbank_rows': len(ship_nb),
                         'si': {nuc: score_si(t, si, params[nuc])[nuc] for nuc in NUCS}}
        print(json.dumps({k: v for k, v in rep['export'].items() if k != 'si'}),
              json.dumps({n: rep['export']['si'][n]['under 500'] for n in NUCS}), flush=True)
        # parity file: predictions for the first 300 SI compounds, for the app's own reader to match
        par = []
        for m, r in si[:300]:
            par.append({'id': m.id, 'smiles': r['smiles'],
                        'c13': [[c[0], v] for c, v in pred_13c(t, m, 'CDCl3', params['13C'])],
                        'h1': [[c[0], v] for c, v in pred_1h(t, m, 'CDCl3', params['1H'])]})
        json.dump(par, open(a.export + '.parity.json', 'w'))
    if a.report:
        json.dump(rep, open(a.report, 'w'), indent=1)


if __name__ == '__main__':
    main()
