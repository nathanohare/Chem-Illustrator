# NMR prediction: data and benchmark tooling (phase 0)

These scripts build the NMR test set from journal SI and score shift predictors on it.
They are run by hand, never in CI, and none of their raw inputs or private outputs live
in this repository. See the NMR prediction build plan for the reasons behind each step.

Python 3 with `rdkit`, `pymupdf`, `python-docx`, `scipy` and `numpy`; Node for OPSIN.
Run every script with `python3 -I` from the repository root.

| Step | Script | Output |
|---|---|---|
| 1. NMRShiftDB2 | `nmrshiftdb2.py nmrshiftdb2withsignals.sd OUT.jsonl.gz REPORT.json` | experimental spectra only (predicted ACD/DFT spectra dropped), symmetry class per peak, conflicting repeat spectra flagged |
| 2. Find papers | `si_find.py papers.jsonl 60` | CC BY papers with SI, about 60 per compound class, from Europe PMC |
| 3. Fetch SI | `si_fetch.py papers.jsonl SI_DIR manifest.jsonl` | SI PDF/DOCX (also from ZIPs) and article text from the PMC open-access store, with SHA-256 |
| 4. Text | `si_text.py manifest.jsonl SI_DIR TEXT_DIR` | layout-aware text that keeps sub/superscripts (CDCl3, 13C) on their line |
| 5. Blocks | `si_blocks.py manifest.jsonl TEXT_DIR blocks.jsonl` | one block per compound: heading, procedure tail, NMR lists, HRMS |
| 6. Reading | AI pass with `reader-prompt.md` | one JSON reading per block (name, SMILES, formula, every NMR list) |
| 7. Records | `si_records.py blocks.jsonl READINGS_DIR records.jsonl REPORT.json` | structure (OPSIN first), formula/H/C checks, gold/silver/fail tier, class tags |
| 8. Benchmark | `benchmark.py nmrshiftdb2.jsonl.gz records.jsonl report.json report.md` | per-class MAE by optimal peak matching |

`classes.py` holds the 16 class rules; `opsin_names.mjs` runs the app's own OPSIN.

## Licences and where data lives

- NMRShiftDB2 derivatives carry the nmrshiftdb2 Database License (ODbL plus clause 4.5).
- Only CC BY papers are used here; the licence is checked twice (Europe PMC and the PMC
  store's own licence code). Raw SI files are never committed.
- Test-set records stay out of the public repository until after phase 2, when the CC BY
  set is published as an open benchmark. Private copies: the project's shared files
  (`nmr-prediction/testset-v1/`) and, for raw SI, `C:\Users\npo00\Documents\SIs for NMR Prediction`.
