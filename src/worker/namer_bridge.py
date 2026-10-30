# Runs in Pyodide inside src/worker/namer-worker.ts. OpenClatura (MIT, lamalab-org) names a
# structure graph made by src/chem/namer-graph.ts from RDKit in JavaScript, because Pyodide has
# no RDKit. OpenClatura's naming core uses its own graph; RDKit appears only in its readers and
# checks, so a stand-in module lets it import, and any name made while the stand-in was used is
# thrown away rather than trusted.

import sys
import types

_used = []


class _Absent(type):
    def __getattr__(cls, name):
        return _Missing

    def __call__(cls, *args, **kwargs):
        _used.append(1)
        return _Missing


class _Missing(metaclass=_Absent):
    pass


for _name in ("rdkit", "rdkit.Chem", "rdkit.Chem.MolStandardize", "rdkit.Chem.rdCIPLabeler", "rdkit.Chem.rdchem"):
    _module = types.ModuleType(_name)
    _module.__getattr__ = lambda name: _Missing
    sys.modules[_name] = _module

from openclatura import small_ring_stereo  # noqa: E402
from openclatura.chalcogen_roles import require_validated_chalcogens  # noqa: E402
from openclatura.engine import DEFAULT_NAMING_ENGINE  # noqa: E402
from openclatura.molecule import Molecule  # noqa: E402

# Local R/S for two centres in a small substituent ring needs RDKit; without it such a ring is
# described as cis/trans, as OpenClatura does when it can't assign them.
small_ring_stereo._assign_local_cip_with_locant_labels = lambda *args, **kwargs: {}
_used.clear()


def _build(graph):
    """The same Molecule OpenClatura's graph_io._build_molecule makes from RDKit."""
    mol = Molecule()
    atoms = graph["atoms"]
    legacy = {i: a["legacy"] for i, a in enumerate(atoms) if a.get("legacy")}
    mol.legacy_cip = dict(legacy)
    mol.accurate_cip = {i: a["cip"] for i, a in enumerate(atoms) if a.get("cip")}
    for i, a in enumerate(atoms):
        stereo = legacy.get(i)
        if stereo is not None:
            if a.get("cip"):
                stereo = a["cip"]
            elif a["el"] == "S" and a.get("deg") == 3:
                stereo = "R" if stereo == "S" else "S"
        mol.add_atom(
            symbol=a["el"],
            idx=i,
            charge=a["q"],
            isotope=a.get("iso") or None,
            stereo=stereo,
            raw_stereo=a.get("tag") if not stereo else None,
            is_aromatic=a["arom"],
            explicit_h_count=a["xh"],
            total_h_count=a["h"],
            radical_electrons=a.get("rad", 0),
        )
    for b in graph["bonds"]:
        mol.add_bond(u=b["u"], v=b["v"], order=b["o"], stereo=b.get("ez"), in_small_ring=b["ring"])
    return mol


def name_graph(graph_json):
    """The name of a structure graph (as JSON), or "" when OpenClatura can't name it."""
    import json

    _used.clear()
    try:
        mol = _build(json.loads(graph_json))
        require_validated_chalcogens(mol)
        name = DEFAULT_NAMING_ENGINE._name(mol)
    except Exception:
        return ""
    if _used:
        return ""
    return name or ""
