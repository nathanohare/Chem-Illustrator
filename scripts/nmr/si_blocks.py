"""Cut SI text into one block per compound, ready for reading.

Usage: python3 -I scripts/nmr/si_blocks.py manifest.jsonl TEXT_DIR OUT_blocks.jsonl

A block starts after the previous compound's data and ends after this compound's last
NMR list (and its HRMS line when there is one), so it holds the compound name or label,
the procedure tail, and every NMR list for that compound. A new block starts at a 1H
NMR header that follows another compound's lists. Figure captions such as
"1H NMR spectrum of 3a" are ignored. The article text is used only when the SI files
give fewer than three blocks (MDPI and others print the experimental section in the
article).
"""
import hashlib
import json
import os
import re
import sys

NUCS = r'(?:1\s?H|13\s?C|19\s?F|31\s?P|11\s?B|29\s?Si|¹H|¹³C|¹⁹F|³¹P)'
HDR = re.compile(r'(?<![\w])(?P<nuc>' + NUCS + r')\s*(?:\{[^}]{1,20}\}|\[[^\]]{1,20}\])?\s*[-–]?\s*NMR\b(?P<tail>[^\n]{0,160})', re.I)
DATA = re.compile(r'[δd]\s*[:=]?\s*\(?\s*(?:ppm)?\)?\s*[:=]?\s*-?\d{1,3}\.\d|\)\s*[:,]?\s*-?\d{1,3}\.\d{1,3}\s*\(|\)\s*[:,]?\s*\d{1,3}\.\d')
CAPTION = re.compile(r'(spectr(um|a)\s+(of|for)|Figure|Fig\.|copies of|chart)', re.I)
END_AFTER = re.compile(r'(HR-?MS|HRMS|LRMS|MS\s*\((ESI|EI|APCI|MALDI)|Anal\.\s*Calcd|Elemental analysis|IR\s*\(|FT-?IR)[^\n]*(\n[^\n]{0,120}found[^\n]*)?', re.I)
MAXCTX = 1600
MAXBLOCK = 6000


def norm_nuc(n):
    n = re.sub(r'\s', '', n)
    return {'¹H': '1H', '¹³C': '13C', '¹⁹F': '19F', '³¹P': '31P'}.get(n, n.upper().replace('SI', 'Si'))


def headers(text):
    out = []
    for m in HDR.finditer(text):
        before = text[max(0, m.start() - 60):m.start()]
        if CAPTION.search(before) or CAPTION.search(m.group('tail')[:40]):
            continue
        if not DATA.search(text[m.end() - len(m.group('tail')):m.end() + 120]):
            continue
        out.append((m.start(), norm_nuc(m.group('nuc'))))
    return out


HEADING = re.compile(r'\n(?=[^\n]{0,200}\(\s*\d{1,3}[a-z]{0,3}\'?\s*\)\s*[.:]?\s*\n|[A-Z0-9(][^\n]{3,200}\n(?:[^\n]*\n){0,1}[^\n]*(?:was|were)\s+(?:prepared|obtained|synthesi[sz]ed|isolated))')


def para_end(text, start, limit):
    """End of the paragraph that starts at `start`: a blank line, or a line ending in '.'
    followed by a line that starts a new heading, whichever comes first."""
    seg = text[start:limit]
    m = re.search(r'\n\s*\n|(?<=[.;])[ \t]*\n(?=[A-Z0-9(\[][^\n]{0,200}\n)', seg)
    return start + (m.start() if m else len(seg))


def list_end(text, start, nxt):
    """End of an NMR list: next header or the end of its paragraph."""
    return min(para_end(text, start, nxt), start + 2500)


def blocks(text):
    hs = headers(text)
    groups = []
    for i, (pos, nuc) in enumerate(hs):
        new = not groups or (nuc == '1H' and '1H' in groups[-1]['nucs']) or \
            (nuc == '13C' and '13C' in groups[-1]['nucs'] and '1H' not in groups[-1]['nucs']) or \
            pos - groups[-1]['end'] > 400
        if new:
            groups.append({'start': pos, 'nucs': [], 'last': pos, 'end': pos})
        g = groups[-1]
        g['nucs'].append(nuc)
        g['last'] = pos
        nxt = hs[i + 1][0] if i + 1 < len(hs) else len(text)
        g['end'] = max(g['end'], list_end(text, pos, nxt))
    out = []
    prev_end = 0
    for i, g in enumerate(groups):
        nxt = groups[i + 1]['start'] if i + 1 < len(groups) else len(text)
        # HRMS / IR / analysis lines that follow the lists in the same paragraph or the next short line
        end = g['end']
        tail = END_AFTER.match(text, end + len(text[end:end + 40]) - len(text[end:end + 40].lstrip(' ;,.\n')))
        if tail and tail.start() - end < 40:
            end = para_end(text, tail.start(), min(nxt, tail.start() + 600))
        end = min(end, nxt)
        ctx = max(prev_end, g['start'] - MAXCTX)
        body = text[ctx:end].strip()
        if len(body) > MAXBLOCK:
            body = body[-MAXBLOCK:]
        out.append({'nucs': sorted(set(g['nucs'])), 'text': body})
        prev_end = end
    return out


def main():
    man, tdir, outp = sys.argv[1:4]
    n_papers = n_blocks = 0
    with open(outp, 'w') as f:
        for l in open(man):
            r = json.loads(l)
            si, art = [], []
            for fi in r['files']:
                if fi.get('kind') not in ('si', 'article_text') or not fi.get('bytes'):
                    continue
                p = os.path.join(tdir, r['pmcid'], fi['name'] + '.txt')
                if not os.path.exists(p):
                    continue
                txt = open(p, encoding='utf-8', errors='replace').read()
                bl = [(fi['name'], b) for b in blocks(txt)]
                (si if fi['kind'] == 'si' else art).extend(bl)
            use = si if len(si) >= 3 else si + art
            if use:
                n_papers += 1
            seen = set()
            for k, (fname, b) in enumerate(use):
                h = hashlib.sha1(re.sub(r'\s+', ' ', b['text'][-800:]).encode()).hexdigest()[:12]
                if h in seen:
                    continue
                seen.add(h)
                n_blocks += 1
                f.write(json.dumps({'block_id': f"{r['pmcid']}-{k:03d}", 'pmcid': r['pmcid'], 'doi': r.get('doi'),
                                    'license': r.get('license'), 'query_class': r.get('query_class'), 'file': fname,
                                    'nucs': b['nucs'], 'text': b['text']}) + '\n')
    print(json.dumps({'papers_with_blocks': n_papers, 'blocks': n_blocks}))


if __name__ == '__main__':
    main()
