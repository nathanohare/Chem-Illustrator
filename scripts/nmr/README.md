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

## Phase 0 results (test set v1, 2026-11-02)

- 901 CC BY papers, 15,837 compound blocks; 5,670 read (at most 8 per paper), 5,124 kept after
  dropping duplicates: 1,732 gold, 1,322 silver, 2,070 failed checks.
- Gold plus silver: 3,054 compounds from 667 papers. Most failures had no structure (the
  compound was named only by a label in a scheme image) or a peak list that did not fit.
- Audit of 150 random records: 2% our own reading errors (1 transcription, 2 wrong
  structures), 6.7% serious errors in the source itself; 300 outlier spectra were also checked.
  Every record judged wrong was removed.
- Baseline (radius-4 atom environment lookup on 90% of NMRShiftDB2), MAE on the SI set:
  1H 0.245 ppm, 13C 2.82 ppm, against 0.254 and 2.70 on held-out NMRShiftDB2. Weakest
  classes for 13C: organometallic 5.5, strained 4.0, charged 3.8, B/Si/Sn 3.5 ppm.

## Phase 1: shift lookup shipped with the app

| Step | Script | Output |
|---|---|---|
| 1. NMRBank | `nmrbank.py NMRBank_….json test_pmcids.txt nmrbank.jsonl` | peak lists as numbers, with article licence; test-set papers removed |
| 2. Codes | `env_codes.ts` (esbuild bundle, Node) | environment codes per atom from the app's own `src/chem/nmr/env.ts` |
| 3. Train | `train_lookup.py WORK --rounds 2 --nb nmrbank06.jsonl --w-nb 1.0 --export nmr-hose.dat` | NMRBank lists assigned to atoms by matching (two rounds), tuned on held-out NMRBank papers, pruned, written for the app |
| 4. Parity | `parity.ts` (esbuild bundle, Node) | checks the app's reader (`src/chem/nmr/lookup.ts`) gives the script's numbers |
| 5. Measured store | `train_lookup.py … --export … --store nmr-measured.dat` | whole structures up to 500 Da with their own measured shifts (NMRShiftDB2 + CC BY NMRBank, atoms as assigned above); read by `src/chem/nmr/measured.ts`. Inputs are cached beside it as `.inputs.pkl` |

Results (2026-11-02, SI test set v1, compounds under 500 Da, shipped CC BY/NMRShiftDB2 table):
13C MAE 2.62 ppm, 1H MAE 0.223 ppm (phase 0 baseline 2.82 and 0.245 on all compounds).
The file is 10.3 MB (6.9 MB gzipped), 0.5 ms per compound, and the app's reader matches the
script to 0.01 ppm on 8,572 atoms.

The measured store holds 98,522 structures (7.0 MB, 4.1 MB gzipped). Structures are matched by a
key over their atom environments, so stereoisomers share an entry; the panel marks measured
values with an M chip naming the source.

## Phase 2: shift networks

| Step | Script | Output |
|---|---|---|
| 1. Features | `graph_feats.ts` (esbuild bundle, Node) | atom and bond features from the app's own `src/chem/nmr/features.ts` |
| 2. Train | `train_net.py WORK --seed N --epochs 60` (five seeds) | message-passing network, 5 rounds, width 128, about 276k weights; about 1 hour each on 4 CPU cores |
| 3. Blend | `blend_dump.ts` then `blend_tune.py WORK tune` | weights between the lookup and the networks, and the error bar fit, tuned on NMRBank papers held out from both |
| 4. Export | `export_net.py nmr-net.dat --blend blend.json net-*.pt` | float16 weights for `src/chem/nmr/net.ts` (plain TypeScript, matches PyTorch to 1e-4 ppm) |

Results (2026-11-02, SI test set v1, compounds under 500 Da): five-network ensemble blended with
the lookup, 13C MAE 1.83 ppm, 1H MAE 0.157 ppm (lookup alone 2.62 and 0.224; single networks
1.96-2.00 and 0.163-0.168). The file is 2.8 MB. The error bar is the expected absolute error,
c0 + c1 x ensemble spread, fitted on the held-out papers.

Label audit (2026-11-04): 5-fold cross-validated networks flagged swapped assignments, single
outliers, wrong structures and referencing errors in the NMRShiftDB2 + NMRBank training labels
(full cleaning changes about 11% of 13C labels); OH, NH and SH 1H labels are left out of training,
since the app does not predict them. Five networks of the shipped size retrained on the cleaned
labels, scored on SI test set v1 (under 500 Da, OH/NH/SH 1H from the lookup for every variant):

| Networks (5 x h128-l5 unless noted) | 13C MAE | 13C RMSE | 1H MAE |
|---|---|---|---|
| previously shipped | 1.827 | 4.50 | 0.168 |
| original labels (control) | 1.816 | 4.55 | 0.167 |
| conservative cleaning (about 3.5% of labels changed) | 1.763 | 4.61 | 0.166 |
| full cleaning (shipped now) | 1.743 | 4.61 | 0.167 |
| full cleaning, 3 x h384-l6 (17 MB) | 1.779 | 4.61 | 0.165 |

Cleaning helps 13C by about 0.07-0.08 ppm and leaves C-H 1H unchanged.

## Phase 3: couplings and spectra

| Step | Script | Output |
|---|---|---|
| Couplings | `src/chem/nmr/coupling.ts` | J (Hz) by bond path from the 2D structure: geminal (sp2, and sp3 CH2 when diastereotopic), vicinal (rotating sp3, alkene cis/trans, aromatic ortho in 5- and 6-rings), meta, allylic, propargylic, H-F; first-order multiplet text per proton group |
| Simulation | `src/chem/nmr/spin.ts` | exact spin simulation, a TypeScript port of Open-NMR's `nmrsuite.spin` (BSD-3); parity test `tests/nmr-spin.test.ts` against nmrsuite line lists |
| Score | `j_dump.ts` (esbuild bundle, Node) then `j_bench.py records-v1.jsonl j-out.jsonl` | multiplicity exact-match rate and J errors against published signals, matched through predicted shifts |

Results (2026-11-03, SI test set v1, CDCl3, compounds under 500 Da; thresholds chosen on the first 400
compounds, scored on the other 1,156): multiplicity exact for 61% of first-order signals (s 79%, d 65%,
t 73%, dd 17%), J median error 0.5 Hz, 69% within 1 Hz. Simulation speed: 8 coupled protons 0.1 s,
10 protons 0.5 s, 12 protons about 19 s (so the Accurate setting caps clusters at 10 for now).
