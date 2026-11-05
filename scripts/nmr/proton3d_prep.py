"""NMRShiftDB2 1H spectra -> sp3 CH2 carbons with their two proton shifts (one value when both are equal),
for fitting the diastereotopic split (src/chem/nmr/proton3d.ts).
  python3 -I scripts/nmr/proton3d_prep.py nmrshiftdb2withsignals.sd OUT.jsonl
"""
import json, re, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from nmrshiftdb2 import parse, indexed, norm_solvent
from rdkit import Chem, RDLogger
RDLogger.DisableLog('rdApp.*')
out = open(sys.argv[2], 'w')
n = pairs = split = 0
for mb, props in parse(sys.argv[1]):
    mol = Chem.MolFromMolBlock(mb, removeHs=False)
    if mol is None or mol.GetNumAtoms() > 80: continue
    predicted = set(indexed(props.get('Program', ''))) | set(k for k, v in indexed(props.get('NMRProgram', '')).items() if v)
    solv = indexed(props.get('Solvent', ''))
    heavy = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() > 1]
    new = {old: k for k, old in enumerate(heavy)}
    try:
        m2 = Chem.RemoveHs(mol)
        Chem.SanitizeMol(m2)
    except Exception: continue
    if m2.GetNumAtoms() != len(heavy): continue
    for key, val in props.items():
        mm = re.match(r'Spectrum 1H (\d+)$', key.strip())
        if not mm or int(mm.group(1)) in predicted: continue
        by = {}
        for p in val.strip().split('|'):
            f = p.split(';')
            try: by.setdefault(int(f[2]), []).append(float(f[0]))
            except (ValueError, IndexError): pass
        ch2 = []
        for old, sh in by.items():
            if old not in new: continue
            a = m2.GetAtomWithIdx(new[old])
            if a.GetAtomicNum() != 6 or a.GetTotalNumHs() != 2 or a.GetHybridization() != Chem.HybridizationType.SP3: continue
            if len(sh) == 1 or len(sh) == 2:
                ch2.append({'c': new[old], 'shifts': sorted(sh)})
        if not ch2: continue
        out.write(json.dumps({'id': props.get('nmrshiftdb2 ID', '').strip() + '-' + mm.group(1), 'solvent': norm_solvent(solv.get(int(mm.group(1)))), 'molblock': Chem.MolToMolBlock(m2), 'ch2': ch2}) + '\n')
        n += 1; pairs += len(ch2); split += sum(1 for c in ch2 if len(c['shifts']) == 2 and abs(c['shifts'][1] - c['shifts'][0]) > 0.005)
print('spectra', n, 'CH2', pairs, 'split', split)
