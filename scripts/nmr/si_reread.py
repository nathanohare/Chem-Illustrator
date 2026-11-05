"""Build second-reading batches for every SI record that failed a check.

Usage: python3 -I scripts/nmr/si_reread.py blocks.jsonl TEXT_DIR records.jsonl READINGS_DIR OUT_DIR [BATCH=50]

Two kinds of input, each line {"id", "text", "first_reading", "problem"}:
- label only (no name in the block): "text" also carries up to 4,000 characters of the
  SI text before the block, so the reader can find where that label is named.
- a check failed (formula, H count, C count, structure unverified, no integrals): the
  block, the first reading and what the check found.
Records failing only because the paper reports a mixture are not re-read.
"""
import glob
import json
import os
import sys

SKIP_ONLY = {'list_mixture', 'list_minor_isomer', 'list_mixture_minor_isomer', 'list_minor_isomer_mixture'}


def main():
    blocks_p, tdir, rec_p, rdir, outd = sys.argv[1:6]
    size = int(sys.argv[6]) if len(sys.argv) > 6 else 50
    blocks = {json.loads(l)['block_id']: json.loads(l) for l in open(blocks_p)}
    first = {}
    for f in sorted(glob.glob(os.path.join(rdir, '*.jsonl'))):
        for l in open(f):
            try:
                r = json.loads(l)
                first[r['id']] = r
            except (json.JSONDecodeError, KeyError):
                pass
    items = []
    for l in open(rec_p):
        r = json.loads(l)
        if r['tier'] != 'fail' or set(r['reasons']) <= SKIP_ONLY:
            continue
        b = blocks[r['block_id']]
        text = b['text']
        if r['reasons'] == ['no_structure'] and not r.get('name'):
            src = os.path.join(tdir, b['pmcid'], b['file'] + '.txt')
            if os.path.exists(src):
                full = open(src, encoding='utf-8', errors='replace').read()
                i = full.find(text[:300])
                if i > 0:
                    text = '[EARLIER SI TEXT, for finding the name only]\n' + full[max(0, i - 4000):i] + \
                        '\n[THE BLOCK TO TRANSCRIBE]\n' + text
            problem = 'No compound name was found in the block. Look in the earlier SI text for where this label is named (a heading, a compound list, a general procedure naming the product) and give the name and SMILES. If the structure is only shown in a scheme image, set skip to "structure only in scheme".'
        else:
            msg = []
            for s in r.get('spectra', []):
                if s.get('check') not in (None, 'match', 'not_checked', 'close', 'missing_some', 'extra_lines_cf_cp', 'match_minus_exchangeable'):
                    msg.append(f"{s['nuc']} list check: {s['check']} (printed vs structure)")
            if 'formula_mismatch' in r['reasons']:
                msg.append(f"structure formula {r.get('formula')} does not match the printed formula/HRMS ion")
            if 'structure_unverified' in r['reasons']:
                msg.append('no printed formula to confirm the structure, and the name did not parse automatically')
            if 'no_structure' in r['reasons']:
                msg.append('no SMILES could be made from the name')
            problem = 'A check failed: ' + '; '.join(msg) + '. Re-read the block carefully. Fix any transcription error (a missed or split peak, a wrong integral, a name broken across lines, a wrong SMILES). If the source itself is inconsistent, keep what is printed and add the block flag "source_inconsistent".'
        if len(text) > 7500:
            text = '…' + text[-7500:]
        fr = dict(first.get(r['block_id'], {}))
        items.append({'id': r['block_id'], 'problem': problem, 'first_reading': fr, 'text': text})
    os.makedirs(outd, exist_ok=True)
    n = 0
    for i in range(0, len(items), size):
        with open(os.path.join(outd, f'r{n:03d}.jsonl'), 'w') as f:
            for it in items[i:i + size]:
                f.write(json.dumps(it, ensure_ascii=False) + '\n')
        n += 1
    print(json.dumps({'items': len(items), 'batches': n}))


if __name__ == '__main__':
    main()
