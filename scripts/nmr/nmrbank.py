"""NMRBank (Hugging Face sweetssweets/NMRBank, MIT): parse its peak-list text into numbers.

Usage: python3 -I scripts/nmr/nmrbank.py NMRBank_....json EXCLUDE_PMCIDS.txt OUT.jsonl

Keeps numbers only (shifts, integrals, solvent, field), never the article paragraphs. Rows
from papers in EXCLUDE_PMCIDS (the SI test set's papers) are dropped so the test set stays
held out by paper. Each row keeps its article licence so the build can ship only CC BY/CC0
rows. The peak lists are unassigned; scripts/nmr/train_lookup.py assigns them by matching.
"""
import json
import re
import sys

SOLVENTS = [
    (r'DMSO|dimethyl ?sulfoxide|\(CD3\)2SO', 'DMSO-d6'), (r'CD3OD|MeOD|methanol|CD3OH', 'CD3OD'),
    (r'C6D6|benzene', 'C6D6'), (r'acetone|\(CD3\)2CO', 'acetone-d6'), (r'D2O|deuterium oxide', 'D2O'),
    (r'CD2Cl2|dichloromethane', 'CD2Cl2'), (r'CD3CN|acetonitrile', 'CD3CN'), (r'THF', 'THF-d8'),
    (r'toluene', 'toluene-d8'), (r'pyridine', 'pyridine-d5'), (r'CDCl3|chloroform|CHCl3', 'CDCl3'),
]
NUM = r'[-−–]?\d+(?:\.\d+)?'
DASH = '[-–—−~]'


def solvent(cond):
    for pat, name in SOLVENTS:
        if re.search(pat, cond or '', re.I):
            return name
    return None


def mhz(cond):
    m = re.search(r'(\d{2,4})\s*MHz', cond or '')
    return int(m.group(1)) if m else None


def num(s):
    return float(s.replace('−', '-').replace('–', '-'))


def top_split(text):
    """Split on commas/semicolons that are not inside parentheses."""
    out, depth, cur = [], 0, ''
    for ch in text:
        if ch in '([':
            depth += 1
        elif ch in ')]':
            depth = max(0, depth - 1)
        if ch in ',;' and depth == 0:
            out.append(cur)
            cur = ''
        else:
            cur += ch
    out.append(cur)
    return [x.strip() for x in out if x.strip()]


def parse_13c(text):
    peaks = []
    for item in top_split(text or ''):
        m = re.match(rf'^\s*({NUM})(?:\s*{DASH}\s*({NUM}))?', item.replace('δ', '').strip())
        if not m:
            continue
        v = num(m.group(1))
        mult = 1
        c = re.search(r'\((\d+)\s*C\)|(\d+)\s*C\b', item)
        if c:
            mult = int(c.group(1) or c.group(2))
        peaks.append([v, min(mult, 12)])
    return peaks


def parse_1h(text):
    sigs = []
    for item in top_split(text or ''):
        item = item.replace('δ', '').strip()
        m = re.match(rf'^({NUM})(?:\s*{DASH}\s*({NUM}))?', item)
        if not m:
            continue
        a = num(m.group(1))
        b = num(m.group(2)) if m.group(2) else None
        n = re.search(r'(\d+(?:\.\d+)?)\s*H\b', item)
        sigs.append([a, b, float(n.group(1)) if n else None])
    return sigs


def main():
    src, excl, out = sys.argv[1:4]
    skip = set(x.strip() for x in open(excl) if x.strip())
    w = open(out, 'w')
    n = kept = 0
    for i, line in enumerate(open(src)):
        r = json.loads(line)
        n += 1
        pmc = r.get('PMC accession number (PMCID)')
        if pmc in skip:
            continue
        smi = r.get('Standardized SMILES') or r.get('SMILES')
        if not smi:
            continue
        rec = {'id': f'nb{i}', 'pmcid': pmc, 'license': r.get('License'), 'year': r.get('Article publication time'),
               'conf': r.get('Confidence in data given by large models'), 'smiles': smi}
        c13 = parse_13c(r.get('13C NMR chemical shifts'))
        if c13:
            rec['c13'] = {'solvent': solvent(r.get('13C NMR conditions')), 'mhz': mhz(r.get('13C NMR conditions')), 'peaks': c13}
        h1 = parse_1h(r.get('1H NMR chemical shifts'))
        if h1:
            rec['h1'] = {'solvent': solvent(r.get('1H NMR conditions')), 'mhz': mhz(r.get('1H NMR conditions')), 'signals': h1}
        if 'c13' in rec or 'h1' in rec:
            w.write(json.dumps(rec) + '\n')
            kept += 1
    print(json.dumps({'rows': n, 'kept': kept, 'excluded_papers': len(skip)}))


if __name__ == '__main__':
    main()
