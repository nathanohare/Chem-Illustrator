"""Structure-based class tags for the NMR test set (the plan's 16 diversity classes).

A compound can carry several tags; per-class scores count it in each. The paper's search
class is only used for "natural_product", which no substructure rule captures well.
"""
from rdkit import Chem
from rdkit.Chem import rdMolDescriptors

METALS = set('Li Na K Mg Ca Al Ti V Cr Mn Fe Co Ni Cu Zn Ru Rh Pd Ag Os Ir Pt Au Hg Mo W Re Zr Hf Sc Y La Ce Sm Eu Gd Yb Ga In'.split())
P = {k: Chem.MolFromSmarts(v) for k, v in {
    'benzene': 'c1ccccc1',
    'hetero_arom': '[n,o,s;a]',
    'carbonyl': '[CX3]=[OX1]',
    'alkene': '[CX3;!a]=[CX3;!a]',
    'alkyne': '[CX2]#[CX2]',
    'allene': '[CX3]=[CX2]=[CX3]',
    'oh_nh': '[OX2H1,NX3H1,NX3H2,nH1,SX2H1]',
    'nitro': '[N+](=O)[O-]',
    'n_oxide': '[#7+][O-]',
    'biaryl': '[a;R]-!@[a;R]',
}.items()}
ORDER = ['aromatic', 'heteroaromatic', 'carbonyl', 'alkene_alkyne', 'fluorinated', 'phosphorus', 'b_si_sn',
         'heavy_halogen', 'strained', 'stereo_sp3', 'macro_atrop', 'ring_current', 'natural_product',
         'organometallic', 'charged', 'exchangeable']


def _fused_aromatic_max(mol):
    ri = mol.GetRingInfo()
    rings = [set(r) for r in ri.AtomRings() if all(mol.GetAtomWithIdx(a).GetIsAromatic() for a in r)]
    best, seen = 0, set()
    for i in range(len(rings)):
        if i in seen:
            continue
        comp, stack = {i}, [i]
        while stack:
            j = stack.pop()
            for k in range(len(rings)):
                if k not in comp and len(rings[j] & rings[k]) >= 2:
                    comp.add(k)
                    stack.append(k)
        seen |= comp
        best = max(best, len(comp))
    return best


def _ortho_count(mol, a, b):
    """Substituents ortho to the biaryl bond a-b on a's ring."""
    n = 0
    for nb in mol.GetAtomWithIdx(a).GetNeighbors():
        if nb.GetIdx() == b or not nb.GetIsAromatic():
            continue
        n += sum(1 for x in nb.GetNeighbors() if x.GetIdx() != a and not mol.GetBondBetweenAtoms(nb.GetIdx(), x.GetIdx()).GetIsAromatic())
    return n


def tags(mol, query_class=None):
    t = set()
    syms = {a.GetSymbol() for a in mol.GetAtoms()}
    if mol.HasSubstructMatch(P['benzene']):
        t.add('aromatic')
    if mol.HasSubstructMatch(P['hetero_arom']):
        t.add('heteroaromatic')
    if mol.HasSubstructMatch(P['carbonyl']):
        t.add('carbonyl')
    if any(mol.HasSubstructMatch(P[k]) for k in ('alkene', 'alkyne', 'allene')):
        t.add('alkene_alkyne')
    if 'F' in syms:
        t.add('fluorinated')
    if 'P' in syms:
        t.add('phosphorus')
    if syms & {'B', 'Si', 'Sn', 'Ge'}:
        t.add('b_si_sn')
    if syms & {'Br', 'I'}:
        t.add('heavy_halogen')
    ri = mol.GetRingInfo()
    sizes = [len(r) for r in ri.AtomRings()]
    if any(s in (3, 4) for s in sizes):
        t.add('strained')
    centres = Chem.FindMolChiralCenters(mol, includeUnassigned=True, useLegacyImplementation=False)
    heavy = mol.GetNumHeavyAtoms()
    if len(centres) >= 2 and rdMolDescriptors.CalcFractionCSP3(mol) >= 0.4:
        t.add('stereo_sp3')
    atrop = False
    for m in mol.GetSubstructMatches(P['biaryl']):
        a, b = m
        if _ortho_count(mol, a, b) + _ortho_count(mol, b, a) >= 3:
            atrop = True
    if any(s >= 12 for s in sizes) or atrop:
        t.add('macro_atrop')
    big_arom_ring = any(s >= 8 and any(mol.GetAtomWithIdx(a).GetIsAromatic() for a in r)
                        for r, s in zip(ri.AtomRings(), sizes))
    if _fused_aromatic_max(mol) >= 4 or big_arom_ring:
        t.add('ring_current')
    if query_class == 'natural_product' and (len(centres) >= 2 or heavy >= 20):
        t.add('natural_product')
    if syms & METALS:
        t.add('organometallic')
    charged_atoms = [a for a in mol.GetAtoms() if a.GetFormalCharge() != 0]
    paired = set()
    for k in ('nitro', 'n_oxide'):
        for m in mol.GetSubstructMatches(P[k]):
            paired |= set(m)
    if any(a.GetIdx() not in paired for a in charged_atoms) or len(Chem.GetMolFrags(mol)) > 1:
        t.add('charged')
    if mol.HasSubstructMatch(P['oh_nh']):
        t.add('exchangeable')
    return [c for c in ORDER if c in t]
