# NMR shift lookup data (nmr-hose.dat)

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

No text from any article is included. Papers in the project's NMR test set were left out.
