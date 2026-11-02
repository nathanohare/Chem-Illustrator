"""Independent audit of test-set records against their SI text.

Usage:
  python3 -I scripts/nmr/si_audit.py prepare records.jsonl blocks.jsonl bench_report.json OUT_DIR [N_RANDOM=150]
  python3 -I scripts/nmr/si_audit.py apply records.jsonl VERDICT_DIR OUT_records.jsonl OUT_report.json

prepare writes audit batches of 15: a random sample of gold/silver records (to estimate
the error rate of the whole set) and every outlier spectrum, i.e. a matched error above
8 ppm (13C) or 0.6 ppm (1H) against the baseline, which is where a wrong structure or a
list from the wrong compound shows up. apply drops every record an auditor rejects and
reports the error rate on the random sample.
"""
import glob
import json
import os
import random
import sys
from collections import Counter

OUT = {'13C': 8.0, '1H': 0.6}


def prepare(rec_p, blocks_p, bench_p, outd, n_random=150):
    recs = [json.loads(l) for l in open(rec_p)]
    good = {r['block_id']: r for r in recs if r['tier'] in ('gold', 'silver')}
    blocks = {}
    for l in open(blocks_p):
        b = json.loads(l)
        if b['block_id'] in good:
            blocks[b['block_id']] = b['text']
    per = json.load(open(bench_p)).get('per_spectrum', [])
    outliers = sorted({p['block_id'] for p in per if p['mae'] > OUT[p['nuc']] and p['block_id'] in good})
    random.seed(20261102)
    pool = sorted(set(good) - set(outliers))
    sample = random.sample(pool, min(n_random, len(pool)))
    items = []
    for kind, ids in (('random', sample), ('outlier', outliers)):
        for i in ids:
            r = good[i]
            items.append({'id': i, 'kind': kind, 'record': {k: r.get(k) for k in ('label', 'name', 'smiles', 'formula', 'structure_source', 'spectra')},
                          'text': blocks[i][-6000:]})
    os.makedirs(outd, exist_ok=True)
    n = 0
    for k in range(0, len(items), 15):
        with open(os.path.join(outd, f'a{n:03d}.jsonl'), 'w') as f:
            for it in items[k:k + 15]:
                f.write(json.dumps(it, ensure_ascii=False) + '\n')
        n += 1
    print(json.dumps({'random': len(sample), 'outliers': len(outliers), 'batches': n}))


def apply(rec_p, vdir, out_p, rep_p):
    verdicts = {}
    for f in sorted(glob.glob(os.path.join(vdir, '*.jsonl'))):
        for l in open(f):
            try:
                v = json.loads(l)
                verdicts[v['id']] = v
            except (json.JSONDecodeError, KeyError):
                pass
    recs = [json.loads(l) for l in open(rec_p)]
    c = Counter()
    with open(out_p, 'w') as f:
        for r in recs:
            v = verdicts.get(r['block_id'])
            if v:
                r['audit'] = {'kind': v.get('kind'), 'verdict': v.get('verdict'), 'details': v.get('details')}
                c[(v.get('kind'), v.get('verdict'))] += 1
                if v.get('verdict') not in ('ok', 'source_error_minor') and r['tier'] in ('gold', 'silver'):
                    r['tier'] = 'fail'
                    r['reasons'] = r.get('reasons', []) + ['audit_' + str(v.get('verdict'))]
            f.write(json.dumps(r) + '\n')
    rnd = {k[1]: n for k, n in c.items() if k[0] == 'random'}
    tot = sum(rnd.values())
    rep = {'verdicts': {f'{k[0]}:{k[1]}': n for k, n in sorted(c.items(), key=str)},
           'random_sample_size': tot,
           'random_sample_error_rate_pct': round(100 * (tot - rnd.get('ok', 0) - rnd.get('source_error_minor', 0)) / tot, 1) if tot else None}
    json.dump(rep, open(rep_p, 'w'), indent=1)
    print(json.dumps(rep, indent=1))


if __name__ == '__main__':
    if sys.argv[1] == 'prepare':
        prepare(*sys.argv[2:6], *(int(x) for x in sys.argv[6:7]))
    else:
        apply(*sys.argv[2:6])
