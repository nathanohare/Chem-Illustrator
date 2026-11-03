"""Turn ChemDraw "Predict 13C/1H-NMR Shifts" protocol text into a head-to-head predictions file.

  python parse_chemdraw.py PROTOCOLS.txt OUT.jsonl

PROTOCOLS.txt holds blocks headed '#HHnnn 13C' or '#HHnnn 1H' followed by the protocol caption text
copied from ChemDraw. The last block with a matching protocol header wins (reruns overwrite earlier tries);
a block without one (for example an error message) is ignored.
"""
import json, re, sys

HEAD = re.compile(r'^\s*#HH(\d+)\s+(13C|1H)\s*$', re.M)
ROW = re.compile(r'^\s*(C|CH|CH2|CH3|H|NH|NH2|OH|SH)\s+(-?\d+(?:\.\d+)?(?:;-?\d+(?:\.\d+)?)*)\s', re.M)
NH = {'C': 0, 'CH': 1, 'CH2': 2, 'CH3': 3, 'H': 1, 'NH': 1, 'NH2': 2, 'OH': 1, 'SH': 1}


def main(src, dst):
    t = open(src, encoding='utf-8').read().replace('\r', '')
    heads = list(HEAD.finditer(t))
    got = {}
    for i, m in enumerate(heads):
        body = t[m.end(): heads[i + 1].start() if i + 1 < len(heads) else len(t)]
        nuc = m.group(2)
        if ('Protocol of the C-13' if nuc == '13C' else 'Protocol of the H-1') not in body:
            continue
        body = body.split('Coupling Constant Prediction')[0]
        rows = ROW.findall(body)
        if nuc == '13C':
            vals = [float(v.split(';')[0]) for lab, v in rows if lab.startswith('C')]
        else:
            vals = []
            for lab, v in rows:
                parts = [float(x) for x in v.split(';')]  # diastereotopic protons come as 'a;b'
                n = NH[lab]
                if len(parts) > 1:
                    vals += [[x, n / len(parts)] for x in parts]
                elif n:
                    vals.append([parts[0], n])
        if vals:
            got.setdefault('HH' + m.group(1), {})[nuc] = vals
    with open(dst, 'w') as f:
        for k in sorted(got):
            f.write(json.dumps({'id': k, **got[k]}) + '\n')
    print(json.dumps({'compounds': len(got), '13C': sum('13C' in v for v in got.values()), '1H': sum('1H' in v for v in got.values())}))


if __name__ == '__main__':
    main(*sys.argv[1:3])
