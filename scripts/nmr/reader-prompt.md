# SI block reader: instructions for the AI reading pass

You transcribe compound characterisation data from journal SI text into JSON. Each input
line is `{"id": ..., "text": ...}`: one block of SI text holding (usually) one compound's
name or label and its NMR lists. Text came from a PDF, so line breaks, hyphenation and the
odd glyph may be damaged.

Transcribe exactly what is printed. Never invent, round, re-order for "correctness" or fix
values. If something looks wrong in the source (a 13C list "at 400 MHz", an H count that
does not add up), copy it as printed and add a flag.

Write one JSON object per input block, one per line, with these keys (omit nothing; use
null where the text does not say):

- `id`: the input id.
- `skip`: null, or a short reason when the block does not hold a single compound's own
  NMR lists (e.g. "data in table", "no peak list", "spectrum caption", "mixture without
  separate lists", "only literature reference"). When skip is set, the other keys may be null.
- `label`: the compound number as printed (e.g. "5n", "S12", "(±)-7"), or null.
- `name`: the full chemical name of THIS compound as printed (the one the NMR lists belong
  to, normally the heading just before the procedure or the "product" named in it). Join
  words broken across lines and remove soft hyphens or stray spaces inside the name, but
  keep real hyphens, primes, stereodescriptors and locants. null when only a label is given.
- `smiles`: your SMILES for the compound, from the name (and the procedure if it makes the
  structure unambiguous). Include stereo only where the name gives it. null if you cannot
  be confident.
- `formula`: the molecular formula of the neutral compound if printed (e.g. "Anal. calcd for
  C10H12O2" or an HRMS "calcd for C17H17N6O5 [M+H]+": write the ion formula exactly as printed
  in `hrms_formula` and the adduct in `hrms_ion`). Keys: `formula`, `hrms_formula`, `hrms_ion`
  (e.g. "[M+H]+", "[M+Na]+", "M+", null).
- `spectra`: a list, one entry per NMR list in the block, in printed order:
  - `nuc`: "1H", "13C", "19F", "31P", "11B", "29Si" ...
  - `mhz`: number as printed (null if absent); `solvent`: one of CDCl3, DMSO-d6, CD3OD,
    C6D6, acetone-d6, CD3CN, D2O, CD2Cl2, THF-d8, toluene-d8, pyridine-d5, TFA-d, or
    "other:<as printed>"; `temp_K`: number if printed (convert °C by adding 273), else null.
  - `decoupled`: for 13C/19F/31P, "1H" if written 13C{1H} etc., else null.
  - for 1H: `signals`: list of `[shift, shift_to, mult, J, nH]` where shift_to is the other
    end of a range ("7.10–7.04" gives 7.10, 7.04) or null, mult is the printed multiplicity
    lower-case ("s", "d", "dd", "br s", "m", "app t", "AB", ...) or null, J is a list of
    coupling constants in Hz as printed (empty list if none), nH is the integration as a
    number (null if not printed). One entry per printed signal, in printed order.
  - for every other nucleus: `peaks`: list of `[shift, mult, J, n]`: mult is the printed
    multiplicity for coupled peaks ("q" for a C–F quartet, "d" for C–P doublet, "CH2" if the
    paper labels carbon type) or null, J the list of Hz values (empty if none), n the
    printed carbon count ("(2C)" gives 2) or null. One entry per printed value. If a list
    prints a coupled peak as separate lines ("124.1 (q, J = 272 Hz)") record it once with
    its J; if it prints every line of the multiplet as a separate number, record each.
  - `flags`: list of short strings for anything odd in THIS list: "field_inconsistent"
    (13C at 400 MHz etc.), "rotamers", "major_isomer", "minor_isomer", "mixture",
    "missing_peaks_noted", "overlapping", "list_truncated" (block cut off mid-list),
    "solvent_unclear".
- `flags`: list for the whole block: "two_compounds" (lists for more than one compound,
  record only the first), "name_unclear", "label_only", "structure_from_procedure".

Output format: compact JSON, one object per line, no Markdown, no commentary. Numbers as
JSON numbers. Use plain ASCII for names where the source uses Unicode primes or dashes
only if the meaning is unchanged (′ may stay as ′).
