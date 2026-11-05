# NMR shift data (nmr-hose.dat, nmr-measured.dat, nmr-net.dat)

`nmr-hose.dat` holds median 13C and 1H chemical shifts for atom environments (HOSE-style
codes, see `src/chem/nmr/env.ts`). It is built by `scripts/nmr/train_lookup.py` from:

- **NMRShiftDB2** (https://nmrshiftdb.nmr.uni-koeln.de), experimental spectra only, by
  Christoph Steinbeck, Stefan Kuhn and contributors. The derived table is distributed under
  the nmrshiftdb2 Database License (ODbL-based, with its clause 4.5), separately from the
  program's own GPL licence.
- **NMRBank** (Hugging Face `sweetssweets/NMRBank`, MIT licence): peak lists extracted from
  open-access articles in PubMed Central. Only numbers from articles published under
  CC BY or CC0 are used, assigned to atoms by matching. The articles are listed by PMC
  accession number in `nmrbank-sources.txt`; each is credited to its authors under CC BY.

`nmr-measured.dat` holds the measured shifts of whole structures (up to 500 Da) from the same
two sources, so a structure that is already known shows its own measured shifts. It carries the
same licences and credits.

`nmr-net.dat` holds five small graph networks (weights only) trained by `scripts/nmr/train_net.py`
on the same NMRShiftDB2 and CC BY/CC0 NMRBank data, plus unassigned peak lists from NMRexp; they
are a produced work of those sources and carry the same credits. They also give the gap between
the two protons of a CH2 and read the drawing's stereochemistry (feature set 2).

- **NMRexp** (Zenodo, doi 10.5281/zenodo.17296666, CC BY 4.0): experimental 1H and 13C peak lists
  with structures, extracted from the supporting information of published articles. Contains data
  from NMRexp (CC BY 4.0), DOI 10.5281/zenodo.17296666. Used to train the networks only; no records
  are included in the app.

`nmr-ch2split.json` holds decision trees (numbers only) that predict the gap between the two
protons of a diastereotopic CH2, trained by `scripts/nmr/proton3d_fit.py` on NMRShiftDB2 shifts. It is a
produced work of NMRShiftDB2 and carries the same nmrshiftdb2 Database License and credit.

`nmr-fp.dat` holds median 19F and 31P shifts for atom environments, built by `scripts/nmr/train_fp.py`
from NMRShiftDB2 and NMRexp (CC BY 4.0, doi 10.5281/zenodo.17296666; contains data from NMRexp). It
carries the nmrshiftdb2 Database License and both credits.

No text from any article is included. Papers in the project's NMR test set were left out.
