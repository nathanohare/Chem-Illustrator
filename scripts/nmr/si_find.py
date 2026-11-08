"""Find CC BY papers with SI for the NMR test set, spread across 16 compound classes.

Usage: python3 -I scripts/nmr/si_find.py OUT_papers.jsonl [PER_CLASS=60]

Searches Europe PMC for open-access PMC articles that carry supplementary files, report
13C NMR and HRMS (a synthetic-chemistry paper), and whose licence is exactly CC BY
(not BY-NC or BY-ND). Each paper is tagged with the class whose query found it first;
the class is only a sampling aid, the final class tags come from the structures
(classes.py).
"""
import json
import sys
import time
import urllib.parse
import urllib.request

API = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'
BASE = ' AND LICENSE:"cc by" AND HAS_SUPPL:y AND IN_PMC:y AND PUB_YEAR:[2018 TO 2026] AND "13C NMR" AND (HRMS OR "high-resolution mass")'
CLASSES = {
    'aromatic': '(benzylic OR arylation OR "cross-coupling" OR "Suzuki" OR "C-H functionalization" OR "aryl ether")',
    'heteroaromatic': '(pyridine OR indole OR quinoline OR pyrazole OR triazole OR imidazole OR thiophene OR benzofuran OR oxazole OR pyrimidine)',
    'carbonyl': '(ketone OR ester OR amide OR enone OR aldehyde OR lactam OR lactone)',
    'alkene_alkyne': '(alkene OR olefin OR alkyne OR allene OR enyne OR "Z-selective" OR "E-selective" OR olefination)',
    'fluorinated': '(trifluoromethyl OR fluorination OR difluoromethyl OR fluorinated OR pentafluorosulfanyl OR trifluoromethylation)',
    'phosphorus': '(phosphonate OR phosphine OR "phosphine oxide" OR organophosphorus OR phosphorylation OR phosphonium)',
    'b_si_sn': '(boronate OR borylation OR "boronic ester" OR silyl OR silane OR silylation OR stannane OR organoboron)',
    'heavy_halogen': '(iodination OR bromination OR "aryl iodide" OR "aryl bromide" OR "alkyl bromide" OR iodoarene OR "hypervalent iodine")',
    'strained': '(cyclopropane OR cyclobutane OR epoxide OR aziridine OR "bicyclo[1.1.1]pentane" OR cyclopropanation OR oxetane OR azetidine)',
    'stereo_sp3': '(polyketide OR carbohydrate OR glycoside OR steroid OR terpene OR diastereoselective OR glycosylation OR "spirocyclic")',
    'macro_atrop': '(macrocycle OR macrocyclic OR macrolactone OR atropisomer OR atroposelective OR "axially chiral" OR biaryl)',
    'ring_current': '(cyclophane OR helicene OR paracyclophane OR nanographene OR "polycyclic aromatic hydrocarbon" OR porphyrin)',
    'natural_product': '("total synthesis" OR alkaloid OR "natural product" OR meroterpenoid OR "formal synthesis")',
    'organometallic': '(ferrocene OR "palladium complex" OR "platinum complex" OR "rhodium complex" OR "iridium complex" OR "ruthenium complex" OR "gold complex" OR cyclometalated)',
    'charged': '(pyridinium OR ammonium OR zwitterion OR zwitterionic OR "ionic liquid" OR imidazolium OR sulfonium)',
    'exchangeable': '(phenol OR "carboxylic acid" OR sulfonamide OR hydroxamic OR "amino acid" OR urea) AND "DMSO-d6"',
}


def search(q, n):
    out, cursor = [], '*'
    while len(out) < n:
        url = API + '?' + urllib.parse.urlencode({'query': q, 'format': 'json', 'pageSize': 100, 'resultType': 'core',
                                                  'cursorMark': cursor, 'sort': 'P_PDATE_D desc'})
        for attempt in range(4):
            try:
                d = json.load(urllib.request.urlopen(url, timeout=60))
                break
            except Exception:
                time.sleep(2 ** attempt)
        else:
            break
        res = d.get('resultList', {}).get('result', [])
        if not res:
            break
        out += res
        nxt = d.get('nextCursorMark')
        if not nxt or nxt == cursor:
            break
        cursor = nxt
    return out, d.get('hitCount')


def main():
    path = sys.argv[1]
    per = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    seen, rows, counts = set(), [], {}
    for cls, terms in CLASSES.items():
        res, hits = search('TITLE_ABS:' + terms + BASE, per * 3)
        kept = 0
        for r in res:
            pmcid = r.get('pmcid')
            if not pmcid or pmcid in seen or (r.get('license') or '').lower() != 'cc by':
                continue
            seen.add(pmcid)
            rows.append({'pmcid': pmcid, 'doi': r.get('doi'), 'title': r.get('title'), 'year': r.get('pubYear'),
                         'journal': (r.get('journalInfo') or {}).get('journal', {}).get('title'),
                         'license': 'CC BY 4.0' if r.get('license') == 'cc by' else r.get('license'), 'query_class': cls})
            kept += 1
            if kept >= per:
                break
        counts[cls] = {'hits': hits, 'kept': kept}
        print(cls, counts[cls], file=sys.stderr)
    with open(path, 'w') as f:
        for r in rows:
            f.write(json.dumps(r) + '\n')
    print(json.dumps({'papers': len(rows), 'by_class': counts}, indent=1))


if __name__ == '__main__':
    main()
