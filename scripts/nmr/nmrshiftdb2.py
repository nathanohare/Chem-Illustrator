"""Load NMRShiftDB2 (nmrshiftdb2withsignals.sd) into clean experimental records.

Usage: python3 -I scripts/nmr/nmrshiftdb2.py nmrshiftdb2withsignals.sd OUT.jsonl.gz [REPORT.json]

Keeps only experimental spectra: a spectrum index named in <Program> (e.g. ACD/Labs
prediction) or <NMRProgram> (DFT) is dropped. 1H atom numbers in this file point at the
heavy atom carrying the proton (0-based), 13C at the carbon itself. Each peak is stored as
[shift, multiplicity, atom index, symmetry class]; the class is RDKit's canonical rank
without tie-breaking, so symmetry-equivalent atoms share it.

Conflicts: when one compound (InChIKey) has two experimental spectra of the same
nucleus in the same solvent whose per-atom shifts differ by more than 3 ppm (13C) or
0.3 ppm (1H), every such spectrum is flagged "conflict" and kept out of training.

Licence: the output is a derivative of the nmrshiftdb2 Database License (ODbL plus
clause 4.5) and must carry that licence and attribution wherever it goes.
"""
import gzip
import json
import re
import sys
from collections import defaultdict

from rdkit import Chem, RDLogger

RDLogger.DisableLog('rdApp.*')

SOLVENTS = [
    ('CDCl3', r'cdcl3|chloroform'), ('DMSO-d6', r'dmso|dimethylsulphoxide|dimethylsulfoxide'),
    ('CD3OD', r'cd3od|methanol'), ('C6D6', r'c6d6|benzene'), ('acetone-d6', r'acetone'),
    ('CD3CN', r'cd3cn|acetonitrile'), ('D2O', r'd2o|deuteriumoxide|water'), ('CD2Cl2', r'cd2cl2|dichloromethane|methylenechloride'),
    ('THF-d8', r'thf|tetrahydrofuran'), ('toluene-d8', r'toluene'), ('pyridine-d5', r'pyridin'),
    ('TFA-d', r'trifluoroacetic|tfa'), ('CCl4', r'ccl4|tetrachloromethane|carbontetrachloride'),
]
LIMIT = {'13C': 3.0, '1H': 0.3}


def norm_solvent(s):
    if not s:
        return None
    t = re.sub(r'[\s\-_]', '', s.lower())
    if 'unreported' in t or 'unknown' in t:
        return None
    for name, rx in SOLVENTS:
        if re.search(rx, t):
            return name
    return s.strip()


def indexed(field):
    """'0:298 1:300 ' -> {0: '298', 1: '300'}"""
    out = {}
    for m in re.finditer(r'(\d+):(.*?)(?=\s\d+:|$)', field.strip()):
        out[int(m.group(1))] = m.group(2).strip()
    return out


def parse(path):
    txt = open(path, encoding='utf-8', errors='replace').read()
    for rec in txt.split('$$$$\n'):
        if 'M  END' not in rec:
            continue
        mb = rec[:rec.index('M  END') + 6]
        props = dict(re.findall(r'> *<([^>]+)>\s*\n(.*?)(?:\n\s*\n|\Z)', rec[rec.index('M  END'):], re.S))
        yield mb, props


def main():
    src, out = sys.argv[1], sys.argv[2]
    report = sys.argv[3] if len(sys.argv) > 3 else None
    stats = defaultdict(int)
    recs = []
    for mb, props in parse(src):
        stats['records'] += 1
        mol = Chem.MolFromMolBlock(mb)
        if mol is None:
            stats['bad_molblock'] += 1
            continue
        try:
            rank = list(Chem.CanonicalRankAtoms(mol, breakTies=False))
            smi = Chem.MolToSmiles(mol)
            ikey = Chem.MolToInchiKey(mol) or props.get('INChI key', '').strip()
        except Exception:
            stats['bad_molblock'] += 1
            continue
        predicted = set(indexed(props.get('Program', ''))) | set(k for k, v in indexed(props.get('NMRProgram', '')).items() if v)
        solv = indexed(props.get('Solvent', ''))
        field = indexed(props.get('Field Strength [MHz]', ''))
        temp = indexed(props.get('Temperature [K]', ''))
        spectra = []
        for key, val in props.items():
            m = re.match(r'Spectrum (1H|13C|19F|31P|11B|15N|17O|29Si) (\d+)$', key.strip())
            if not m:
                continue
            nuc, idx = m.group(1), int(m.group(2))
            stats['spectra_' + nuc] += 1
            if idx in predicted:
                stats['dropped_predicted_' + nuc] += 1
                continue
            peaks = []
            for p in val.strip().split('|'):
                f = p.split(';')
                if len(f) >= 3 and f[0]:
                    try:
                        at = int(f[2])
                        peaks.append([float(f[0]), re.sub(r'[\d.]', '', f[1]) or None, at, rank[at] if at < len(rank) else None])
                    except ValueError:
                        pass
            if not peaks:
                continue
            try:
                mhz = float(field.get(idx, '').split()[0]) if field.get(idx) else None
            except ValueError:
                mhz = None
            try:
                tk = float(temp.get(idx, '').split()[0]) if temp.get(idx) else None
            except ValueError:
                tk = None
            spectra.append({'idx': idx, 'nuc': nuc, 'solvent': norm_solvent(solv.get(idx)), 'solvent_raw': solv.get(idx),
                            'mhz': mhz, 'temp_K': tk, 'peaks': peaks, 'flags': []})
            stats['kept_' + nuc] += 1
        if spectra:
            recs.append({'id': props.get('nmrshiftdb2 ID', '').strip(), 'inchikey': ikey, 'smiles': smi, 'spectra': spectra})
    # conflicts: same compound, nucleus, solvent; compare per atom
    groups = defaultdict(list)
    for r in recs:
        for s in r['spectra']:
            groups[(r['inchikey'], s['nuc'], s['solvent'])].append((r, s))
    worst = []
    for key, items in groups.items():
        if len(items) < 2 or key[1] not in LIMIT:
            continue
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                a = defaultdict(list)
                b = defaultdict(list)
                # compare by symmetry class (canonical rank), which does not depend on molblock atom order
                for sh, _, _, cls in items[i][1]['peaks']:
                    a[cls].append(sh)
                for sh, _, _, cls in items[j][1]['peaks']:
                    b[cls].append(sh)
                if items[i][0]['smiles'] != items[j][0]['smiles']:
                    continue
                diffs = [abs(sum(a[k]) / len(a[k]) - sum(b[k]) / len(b[k])) for k in a if k in b]
                if diffs and max(diffs) > LIMIT[key[1]]:
                    for _, s in (items[i], items[j]):
                        if 'conflict' not in s['flags']:
                            s['flags'].append('conflict')
                    worst.append((max(diffs), key[0], key[1], key[2]))
    nconf = set()
    for r in recs:
        for s in r['spectra']:
            if 'conflict' in s['flags']:
                nconf.add(r['id'])
            if s['solvent'] is None:
                s['flags'].append('solvent_unknown')
    stats['compounds_kept'] = len(recs)
    stats['records_with_conflicts'] = len(nconf)
    stats['solvent_unknown_spectra'] = sum(1 for r in recs for s in r['spectra'] if s['solvent'] is None)
    with gzip.open(out, 'wt') as f:
        for r in recs:
            f.write(json.dumps(r, separators=(',', ':')) + '\n')
    worst.sort(reverse=True)
    rep = {'stats': dict(sorted(stats.items())), 'worst_conflicts': worst[:20]}
    print(json.dumps(rep, indent=1))
    if report:
        json.dump(rep, open(report, 'w'), indent=1)


if __name__ == '__main__':
    main()
