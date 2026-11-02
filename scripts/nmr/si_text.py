"""Turn SI files into plain text that keeps sub/superscripts on their line.

Usage: python3 -I scripts/nmr/si_text.py manifest.jsonl SI_DIR TEXT_DIR

PDF: PyMuPDF words regrouped into lines by vertical overlap, so "CDCl3" and "13C" stay
whole instead of the subscript dropping to its own line (the pilot's main parser
failure). DOCX: python-docx paragraphs and tables. DOC: converted with LibreOffice.
Writes TEXT_DIR/<PMCID>/<file>.txt with a form feed between pages.
"""
import concurrent.futures as cf
import json
import os
import subprocess
import sys
import tempfile

import pymupdf


def pdf_text(path):
    doc = pymupdf.open(path)
    pages = []
    for page in doc:
        words = page.get_text('words', sort=False)  # x0, y0, x1, y1, word, block, line, wno
        lines = []
        for w in sorted(words, key=lambda w: ((w[1] + w[3]) / 2, w[0])):
            yc, h = (w[1] + w[3]) / 2, max(w[3] - w[1], 1)
            for ln in lines:
                # same line if vertical overlap is large relative to the smaller glyph height
                ov = min(ln['y1'], w[3]) - max(ln['y0'], w[1])
                if ov > 0.45 * min(h, ln['y1'] - ln['y0']) and abs(ln['yc'] - yc) < 0.75 * max(h, ln['h']):
                    ln['w'].append(w)
                    ln['y0'], ln['y1'] = min(ln['y0'], w[1]), max(ln['y1'], w[3])
                    break
            else:
                lines.append({'yc': yc, 'h': h, 'y0': w[1], 'y1': w[3], 'w': [w]})
        out = []
        for ln in sorted(lines, key=lambda l: l['yc']):
            ws = sorted(ln['w'], key=lambda w: w[0])
            s, prev = '', None
            for w in ws:
                if prev is not None:
                    gap = w[0] - prev[2]
                    small = (w[3] - w[1]) < 0.8 * (prev[3] - prev[1]) or (prev[3] - prev[1]) < 0.8 * (w[3] - w[1])
                    s += '' if (gap < 0.8 or (small and gap < 1.5)) else ' '
                s += w[4]
                prev = w
            out.append(s)
        pages.append('\n'.join(out))
    return '\f'.join(pages)


def docx_text(path):
    import docx
    d = docx.Document(path)
    out = [p.text for p in d.paragraphs]
    for t in d.tables:
        for r in t.rows:
            out.append(' | '.join(c.text for c in r.cells))
    return '\n'.join(out)


def doc_text(path):
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(['soffice', '--headless', '--convert-to', 'txt:Text', '--outdir', td, path],
                       capture_output=True, timeout=300)
        f = [x for x in os.listdir(td) if x.endswith('.txt')]
        return open(os.path.join(td, f[0]), encoding='utf-8', errors='replace').read() if f else ''


def one(args):
    src, dst = args
    if os.path.exists(dst):
        return dst, 'cached'
    try:
        low = src.lower()
        txt = pdf_text(src) if low.endswith('.pdf') else docx_text(src) if low.endswith('.docx') else \
            doc_text(src) if low.endswith('.doc') else open(src, encoding='utf-8', errors='replace').read()
    except Exception as e:
        return dst, 'error: ' + str(e)[:100]
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, 'w').write(txt)
    return dst, 'ok'


def main():
    man, sidir, tdir = sys.argv[1:4]
    jobs = []
    for l in open(man):
        r = json.loads(l)
        for f in r['files']:
            if f.get('kind') in ('si', 'article_text') and f.get('bytes'):
                jobs.append((os.path.join(sidir, r['pmcid'], f['name']), os.path.join(tdir, r['pmcid'], f['name'] + '.txt')))
    from collections import Counter
    c = Counter()
    with cf.ProcessPoolExecutor(4) as ex:
        for dst, st in ex.map(one, jobs, chunksize=4):
            c[st.split(':')[0]] += 1
            if st.startswith('error'):
                print(dst, st, file=sys.stderr)
    print(dict(c))


if __name__ == '__main__':
    main()
