"""Download SI files (and the article text) for each paper from the PMC open-access store.

Usage: python3 -I scripts/nmr/si_fetch.py papers.jsonl SI_DIR OUT_manifest.jsonl

Route: https://pmc-oa-opendata.s3.amazonaws.com/<PMCID>.<ver>/<PMCID>.<ver>.json lists
the article's files (media_urls). Images are skipped; PDF, DOCX and DOC supplements are
kept (also from inside ZIP supplements), plus the article's plain text (some journals put the experimental section in
the article itself). The store's own licence_code must be "CC BY", otherwise the paper
is skipped. Files are saved as SI_DIR/<PMCID>/<name> with a SHA-256 in the manifest.
Raw files never go in the repository.
"""
import concurrent.futures as cf
import hashlib
import json
import os
import sys
import time
import urllib.request
import zipfile

S3 = 'https://pmc-oa-opendata.s3.amazonaws.com/'
KEEP = ('.pdf', '.docx', '.doc', '.zip')
MAXB = 80 * 1024 * 1024


def get(url, binary=True):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(2 ** attempt)
        except Exception:
            time.sleep(2 ** attempt)
    return None


def meta(pmcid):
    best = None
    for v in range(1, 6):
        raw = get(f'{S3}{pmcid}.{v}/{pmcid}.{v}.json')
        if raw is None:
            if v > 1:
                break
            continue
        best = json.loads(raw)
    return best


def s3url(u):
    return S3 + u.split('s3://pmc-oa-opendata/', 1)[1].split('?', 1)[0]


def fetch(paper, root):
    pmcid = paper['pmcid']
    m = meta(pmcid)
    row = dict(paper, files=[], status='ok')
    if not m:
        row['status'] = 'no_store_entry'
        return row
    row['store_license'] = m.get('license_code')
    if (m.get('license_code') or '').upper() != 'CC BY':
        row['status'] = 'licence_not_cc_by'
        return row
    if m.get('is_retracted'):
        row['status'] = 'retracted'
        return row
    d = os.path.join(root, pmcid)
    os.makedirs(d, exist_ok=True)
    urls = [u for u in m.get('media_urls') or [] if u.split('?')[0].lower().endswith(KEEP)]
    if m.get('text_url'):
        urls.append(m['text_url'])
    for u in urls:
        name = u.split('?')[0].rsplit('/', 1)[-1]
        p = os.path.join(d, name)
        if not os.path.exists(p):
            data = get(s3url(u))
            if data is None or len(data) > MAXB:
                row['files'].append({'name': name, 'status': 'failed' if data is None else 'too_big'})
                continue
            open(p, 'wb').write(data)
        data = open(p, 'rb').read()
        row['files'].append({'name': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                             'kind': 'article_text' if name.endswith('.txt') else 'si'})
        if name.lower().endswith('.zip'):
            row['files'][-1]['kind'] = 'archive'
            try:
                z = zipfile.ZipFile(p)
                for zi in z.infolist():
                    base = os.path.basename(zi.filename)
                    if base.lower().endswith(KEEP[:3]) and zi.file_size < MAXB and not base.startswith('.'):
                        q = os.path.join(d, 'zip_' + base)
                        if not os.path.exists(q):
                            open(q, 'wb').write(z.read(zi))
                        b = open(q, 'rb').read()
                        row['files'].append({'name': 'zip_' + base, 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest(),
                                             'kind': 'si', 'from': name})
            except zipfile.BadZipFile:
                row['files'][-1]['status'] = 'bad_zip'
    if not any(f.get('kind') == 'si' for f in row['files']):
        # MDPI and some others put the experimental section in the article itself
        row['status'] = 'article_text_only' if any(f.get('kind') == 'article_text' for f in row['files']) else 'no_files'
    return row


def main():
    papers = [json.loads(l) for l in open(sys.argv[1])]
    root, out = sys.argv[2], sys.argv[3]
    os.makedirs(root, exist_ok=True)
    rows = []
    with cf.ThreadPoolExecutor(16) as ex:
        for i, row in enumerate(ex.map(lambda p: fetch(p, root), papers)):
            rows.append(row)
            if i % 50 == 0:
                print(i, row['pmcid'], row['status'], file=sys.stderr)
    with open(out, 'w') as f:
        for r in rows:
            f.write(json.dumps(r) + '\n')
    from collections import Counter
    print(json.dumps({'papers': len(rows), 'status': Counter(r['status'] for r in rows),
                      'si_files': sum(1 for r in rows for f in r['files'] if f.get('kind') == 'si' and f.get('bytes')),
                      'si_bytes': sum(f.get('bytes', 0) for r in rows for f in r['files'] if f.get('kind') == 'si')}, indent=1))


if __name__ == '__main__':
    main()
