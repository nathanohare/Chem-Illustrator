// Purifying, drying, storing and checking common solvents and reagents, and the bench techniques
// that go with them: short notes in this program's own words, each with the papers or books it
// rests on. They are drafts for Nate and the department to check; each entry records who checked
// it (and when), and the window shows the ones not yet checked.
//
// Never copied from a book: Purification of Laboratory Chemicals and the like are for the reader's
// own copy, and the notes here point to primary papers instead.

import { SAFETY_RECORDS } from './safety-tables';
import type { Cell, KbSource, KbTable } from './tables';

/** The papers and books the notes rest on, by a short key. */
export const REFS: Record<string, KbSource & { cite: string }> = {
  williams2010: { label: 'Williams & Lawton 2010', url: 'https://doi.org/10.1021/jo101589h', cite: 'Williams, D. B. G.; Lawton, M. J. Org. Chem. 2010, 75, 8351–8354 (drying solvents, measured by Karl Fischer)' },
  pangborn1996: { label: 'Pangborn 1996', url: 'https://doi.org/10.1021/om9503712', cite: 'Pangborn, A. B.; Giardello, M. A.; Grubbs, R. H.; Rosen, R. K.; Timmers, F. J. Organometallics 1996, 15, 1518–1520 (solvent purification columns)' },
  gottlieb1997: { label: 'Gottlieb 1997', url: 'https://doi.org/10.1021/jo971176v', cite: 'Gottlieb, H. E.; Kotlyar, V.; Nudelman, A. J. Org. Chem. 1997, 62, 7512–7515 (NMR shifts of impurities)' },
  fulmer2010: { label: 'Fulmer 2010', url: 'https://doi.org/10.1021/om100106e', cite: 'Fulmer, G. R. et al. Organometallics 2010, 29, 2176–2179 (NMR shifts of impurities)' },
  kofron1976: { label: 'Kofron & Baclawski 1976', url: 'https://doi.org/10.1021/jo00872a047', cite: 'Kofron, W. G.; Baclawski, L. M. J. Org. Chem. 1976, 41, 1879–1880 (diphenylacetic acid titration)' },
  watson1967: { label: 'Watson & Eastham 1967', url: 'https://doi.org/10.1016/S0022-328X(00)92418-5', cite: 'Watson, S. C.; Eastham, J. F. J. Organomet. Chem. 1967, 9, 165–168 (colored indicators for RLi and RMgX)' },
  burchat1997: { label: 'Burchat 1997', url: 'https://doi.org/10.1016/S0022-328X(97)00143-5', cite: 'Burchat, A. F.; Chong, J. M.; Nielsen, N. J. Organomet. Chem. 1997, 542, 281–283 (N-benzylbenzamide titration)' },
  love1999: { label: 'Love & Jones 1999', url: 'https://doi.org/10.1021/jo982433e', cite: 'Love, B. E.; Jones, E. G. J. Org. Chem. 1999, 64, 3755–3756 (salicylaldehyde phenylhydrazone titration)' },
  knochel2006: { label: 'Krasovskiy & Knochel 2006', url: 'https://doi.org/10.1055/s-2006-926345', cite: 'Krasovskiy, A.; Knochel, P. Synthesis 2006, 890–891 (I2/LiCl titration of RMgX and RZnX)' },
  schwindeman2002: { label: 'Schwindeman 2002', url: 'https://doi.org/10.1016/S1074-9098(02)00295-2', cite: 'Schwindeman, J. A.; Woltermann, C. J.; Letchford, R. J. Chem. Health Saf. 2002, 9 (3), 6–11 (handling organolithiums)' },
  clark2001: { label: 'Clark 2001', url: 'https://doi.org/10.1016/S1074-9098(01)00247-7', cite: 'Clark, D. E. Chem. Health Saf. 2001, 8 (5), 12–22 (peroxide formers: testing and removal)' },
  still1978: { label: 'Still 1978', url: 'https://doi.org/10.1021/jo00408a041', cite: 'Still, W. C.; Kahn, M.; Mitra, A. J. Org. Chem. 1978, 43, 2923–2925 (flash chromatography)' },
  schreiber1994: { label: 'Meyer & Schreiber 1994', url: 'https://doi.org/10.1021/jo00103a067', cite: 'Meyer, S. D.; Schreiber, S. L. J. Org. Chem. 1994, 59, 7549–7552 (water speeds the Dess–Martin oxidation)' },
  corey1975: { label: 'Corey & Suggs 1975', url: 'https://doi.org/10.1016/S0040-4039(00)75204-X', cite: 'Corey, E. J.; Suggs, J. W. Tetrahedron Lett. 1975, 16, 2647–2650 (PCC)' },
  schwartz1964: { label: 'Schwartz & Blumbergs 1964', url: 'https://doi.org/10.1021/jo01030a078', cite: 'Schwartz, N. N.; Blumbergs, J. H. J. Org. Chem. 1964, 29, 1976–1979 (m-CPBA: buffer wash to purify)' },
  kauffman1983: { label: 'Kauffman 1983', url: 'https://doi.org/10.1002/9780470132531.ch20', cite: 'Kauffman, G. B.; Fang, L. Y.; Viswanathan, N.; Townsend, G. Inorg. Synth. 1983, 22, 101–103 (purifying CuI)' },
  colacot2016: { label: 'Carole & Colacot 2016', url: 'https://doi.org/10.1002/chem.201601450', cite: 'Carole, W. A.; Colacot, T. J. Chem. Eur. J. 2016, 22, 7686–7695 (what commercial Pd(OAc)2 contains)' },
  prudent2011: { label: 'Prudent Practices 2011', url: 'https://doi.org/10.17226/12654', cite: 'National Research Council. Prudent Practices in the Laboratory, updated ed.; National Academies Press, 2011 (free to read)' },
  fieser1967: { label: 'Fieser & Fieser 1967', cite: 'Fieser, L. F.; Fieser, M. Reagents for Organic Synthesis, Vol. 1; Wiley, 1967, p 584 (the n, n, 3n LiAlH4 work-up)' },
  shriver1986: { label: 'Shriver & Drezdzon 1986', cite: 'Shriver, D. F.; Drezdzon, M. A. The Manipulation of Air-Sensitive Compounds, 2nd ed.; Wiley, 1986' },
  // further reading only: nothing here is taken from it
  armarego2017: { label: 'Armarego & Chai (your copy)', cite: 'Armarego, W. L. F.; Chai, C. L. L. Purification of Laboratory Chemicals, 8th ed.; Butterworth-Heinemann, 2017 (further reading, not quoted)' },
};

/** Who has checked an entry, and when; empty while it is a draft. */
export type Checked = '' | `${string}, ${number}-${number}-${number}`;

export interface HandlingEntry {
  name: string;
  /** For compounds not in the safety table. */
  cas?: string;
  kind: 'Solvent' | 'Organometallic' | 'Hydride' | 'Oxidant' | 'Reagent' | 'Amine' | 'Metal' | 'Catalyst' | 'Ligand';
  /** What it reacts with or turns into on keeping. */
  sensitive: string;
  purify: string;
  store: string;
  /** How to tell it is still good. */
  check: string;
  refs: (keyof typeof REFS)[];
  checked: Checked;
}

export const HANDLING: HandlingEntry[] = [
  // ---- solvents
  { name: 'Tetrahydrofuran', kind: 'Solvent', sensitive: 'Forms peroxides in air and light; takes up water', purify: 'Pass through an activated alumina column (solvent system), or stand over activated 3 Å sieves (about 20% m/v) for 2 to 3 days. A sodium/benzophenone still also works (deep blue or purple means dry and oxygen-free) but measured worse than sieves and is a fire risk.', store: 'Under N2 or Ar, dark, over sieves. Buy inhibited (BHT) unless the BHT matters.', check: 'Peroxide test strip before distilling or concentrating; Karl Fischer for water. BHT shows in 1H NMR (CDCl3) at 6.98, 5.01, 2.27 and 1.43 ppm.', refs: ['williams2010', 'pangborn1996', 'clark2001', 'gottlieb1997'], checked: '' },
  { name: 'Diethyl ether', kind: 'Solvent', sensitive: 'Forms peroxides; very volatile and flammable (flash point −45 °C)', purify: 'Activated alumina column, or sodium/benzophenone still under N2.', store: 'Under N2, dark, inhibited, cool; date the bottle when opened.', check: 'Peroxide test before use if opened more than a few months ago; never distil to dryness.', refs: ['pangborn1996', 'clark2001'], checked: '' },
  { name: '1,4-Dioxane', kind: 'Solvent', sensitive: 'Forms peroxides; freezes at 12 °C', purify: 'Sodium/benzophenone still, or activated alumina then 4 Å sieves.', store: 'Under N2, dark.', check: 'Peroxide test; it solidifies in a cold lab, so warm it gently rather than chipping it out.', refs: ['clark2001', 'armarego2017'], checked: '' },
  { name: '1,2-Dimethoxyethane', kind: 'Solvent', sensitive: 'Forms peroxides; takes up water', purify: 'Sodium/benzophenone still or alumina column.', store: 'Under N2, dark.', check: 'Peroxide test; Karl Fischer.', refs: ['clark2001', 'armarego2017'], checked: '' },
  { name: 'Dichloromethane', kind: 'Solvent', sensitive: 'Stabilized with amylene or ethanol (check which; ethanol can interfere)', purify: 'Distill from CaH2 under N2, or activated alumina column. Never use sodium or potassium with halogenated solvents (explosive).', store: 'Dark bottle, over 3 Å or 4 Å sieves.', check: 'Karl Fischer. The stabilizer shows in 1H NMR (ethanol 3.72 q, 1.25 t in CDCl3).', refs: ['williams2010', 'pangborn1996', 'gottlieb1997'], checked: '' },
  { name: 'Chloroform', kind: 'Solvent', sensitive: 'Light and air make HCl and phosgene; stabilized with ethanol or amylene', purify: 'For acid-sensitive work, pass through basic alumina just before use. Dry over 4 Å sieves; distil from P2O5 or CaH2 if needed. No alkali metals.', store: 'Dark bottle, cool; CDCl3 over anhydrous K2CO3 or silver foil.', check: 'Acid: a drop on wet pH paper, or an acid-sensitive sample turning in the NMR tube.', refs: ['gottlieb1997', 'armarego2017'], checked: '' },
  { name: 'Toluene', kind: 'Solvent', sensitive: 'Takes up some water', purify: 'Alumina/copper catalyst column, sodium/benzophenone still, or 3 Å sieves.', store: 'Over sieves under N2.', check: 'Karl Fischer.', refs: ['williams2010', 'pangborn1996'], checked: '' },
  { name: 'Hexane', kind: 'Solvent', sensitive: 'Commercial hexane is mixed isomers; may contain alkenes', purify: 'Alumina column or 3 Å/4 Å sieves. Alkenes are removed by shaking with conc. H2SO4, then water, then drying and distilling.', store: 'Over sieves.', check: 'Karl Fischer; 1H NMR for alkene signals (4.5 to 6 ppm).', refs: ['pangborn1996', 'williams2010', 'armarego2017'], checked: '' },
  { name: 'Acetonitrile', kind: 'Solvent', sensitive: 'Takes up water', purify: 'Stand over activated 3 Å sieves, or distil from CaH2 (P2O5 also works but can give a polymer).', store: 'Over 3 Å sieves under N2.', check: 'Karl Fischer.', refs: ['williams2010', 'armarego2017'], checked: '' },
  { name: 'Methanol', kind: 'Solvent', sensitive: 'Takes up water fast', purify: 'Activated 3 Å sieves (not 4 Å: methanol fits the larger pores), 20% m/v for several days; or reflux over Mg/I2 (magnesium methoxide) and distil.', store: 'Over 3 Å sieves under N2.', check: 'Karl Fischer.', refs: ['williams2010'], checked: '' },
  { name: 'Ethanol', kind: 'Solvent', sensitive: 'Takes up water; absolute ethanol may contain benzene or cyclohexane from azeotropic drying', purify: '3 Å sieves, or Mg/I2 (magnesium ethoxide) and distil.', store: 'Over 3 Å sieves.', check: 'Karl Fischer; check the label for the denaturant or entrainer.', refs: ['williams2010', 'armarego2017'], checked: '' },
  { name: 'Acetone', kind: 'Solvent', sensitive: 'Base or acid makes it condense with itself (diacetone alcohol, mesityl oxide)', purify: 'Dry over anhydrous CaSO4 and distil. Avoid basic drying agents (KOH, basic alumina) and long standing on sieves.', store: 'Tightly closed.', check: 'Karl Fischer; 1H NMR for mesityl oxide (6.1 ppm, vinyl H).', refs: ['williams2010', 'armarego2017'], checked: '' },
  { name: 'Ethyl acetate', kind: 'Solvent', sensitive: 'Hydrolyses slowly to acetic acid and ethanol', purify: 'Wash with 5% Na2CO3 then brine, dry over K2CO3 or MgSO4, distil (from P2O5 for very dry).', store: 'Over 4 Å sieves.', check: '1H NMR for acetic acid (2.10 s, CDCl3) and ethanol.', refs: ['gottlieb1997', 'armarego2017'], checked: '' },
  { name: 'N,N-Dimethylformamide', kind: 'Solvent', sensitive: 'Breaks down to dimethylamine and CO, faster when hot or with acid or base', purify: 'Stand over 4 Å sieves, then distil under reduced pressure (keep the pot below about 80 °C). Do not distil at atmospheric pressure.', store: 'Over 4 Å sieves, dark, under N2.', check: 'A fishy (amine) smell means dimethylamine is present; Karl Fischer.', refs: ['williams2010', 'armarego2017'], checked: '' },
  { name: 'Dimethyl sulfoxide', kind: 'Solvent', sensitive: 'Very hygroscopic; decomposes near its boiling point (189 °C)', purify: 'Stand over 4 Å sieves; distil from CaH2 under reduced pressure at a low pot temperature.', store: 'Over sieves, tightly closed. It freezes at 18.5 °C.', check: 'Dry DMSO freezes readily in a cool room; wet DMSO stays liquid. Karl Fischer.', refs: ['williams2010', 'armarego2017'], checked: '' },
  { name: 'Pyridine', kind: 'Solvent', sensitive: 'Hygroscopic', purify: 'Distill from CaH2 or KOH under N2.', store: 'Over KOH pellets or 4 Å sieves, under N2.', check: 'Karl Fischer; colorless (yellow or brown means old).', refs: ['williams2010', 'armarego2017'], checked: '' },
  // ---- amines
  { name: 'Triethylamine', kind: 'Amine', sensitive: 'Takes up water and CO2; yellows as it oxidizes', purify: 'Distill from CaH2 under N2.', store: 'Over KOH pellets under N2.', check: 'Colorless; 1H NMR for diethylamine.', refs: ['armarego2017'], checked: '' },
  { name: 'N,N-Diisopropylethylamine', kind: 'Amine', sensitive: 'Takes up water and CO2', purify: 'Distill from CaH2 (or KOH) under N2.', store: 'Under N2 over KOH.', check: 'Colorless liquid.', refs: ['armarego2017'], checked: '' },
  { name: 'Diisopropylamine', kind: 'Amine', sensitive: 'Takes up water and CO2', purify: 'Distill from CaH2 under N2 before making LDA.', store: 'Under N2 over KOH or 4 Å sieves.', check: 'Karl Fischer if LDA yields drop.', refs: ['armarego2017'], checked: '' },
  // ---- organometallics and hydrides
  { name: 'n-Butyllithium', kind: 'Organometallic', sensitive: 'Air and moisture; the solution loses strength on keeping (LiH settles out)', purify: 'Not purified: titrate and use the measured concentration.', store: 'Under Ar or N2 with a good septum or Sure/Seal cap, in a fridge for hexane solutions. Replace damaged septa.', check: 'Titrate against diphenylacetic acid (yellow end point) or N-benzylbenzamide (blue). A white solid at the bottom is LiH and lithium alkoxide.', refs: ['kofron1976', 'burchat1997', 'love1999', 'schwindeman2002'], checked: '' },
  { name: 'tert-Butyllithium', kind: 'Organometallic', sensitive: 'Pyrophoric: catches fire in air', purify: 'Not purified: titrate.', store: 'Under Ar, cold, in its original Sure/Seal bottle. Transfer by cannula or a gas-tight syringe no more than half full, with a second person nearby.', check: 'Titrate as for n-BuLi (salicylaldehyde phenylhydrazone or N-benzylbenzamide).', refs: ['schwindeman2002', 'love1999', 'burchat1997'], checked: '' },
  { name: 'Methylmagnesium bromide', kind: 'Organometallic', sensitive: 'Air and moisture', purify: 'Not purified: titrate.', store: 'Under N2; ether solutions lose solvent through a pierced septum.', check: 'Titrate with I2 in 0.5 M LiCl/THF (brown to colorless) or with salicylaldehyde phenylhydrazone.', refs: ['knochel2006', 'love1999', 'watson1967'], checked: '' },
  { name: 'Lithium diisopropylamide', kind: 'Organometallic', sensitive: 'Air and moisture; solutions slowly decompose', purify: 'Best made fresh: n-BuLi into diisopropylamine in THF at −78 °C, then 0 °C for 10 to 15 min.', store: 'Make fresh; bought solutions under N2 in the fridge.', check: 'Titrate (diphenylacetic acid or N-benzylbenzamide).', refs: ['kofron1976', 'burchat1997'], checked: '' },
  { name: 'Sodium hydride', cas: '7646-69-7', kind: 'Hydride', sensitive: 'Moisture: gives H2, which can ignite', purify: 'Usually used as the 60% dispersion in oil. To remove the oil, wash with dry hexane or pentane under N2 and syringe off the washings, which carry fine NaH: quench them slowly with isopropanol.', store: 'Tightly closed under N2.', check: 'Gray powder that fizzes in alcohol; a crust of white NaOH means old.', refs: ['armarego2017'], checked: '' },
  { name: 'Lithium aluminum hydride', kind: 'Hydride', sensitive: 'Moisture and air: fires on contact with water', purify: 'Not purified in a normal lab; old gray lumps are weaker.', store: 'Dry, under N2. For a fire use dry sand or a Class D extinguisher, never water or CO2.', check: 'Activity by reducing a test ester, or by the H2 given off with an alcohol.', refs: ['prudent2011', 'fieser1967'], checked: '' },
  { name: 'Diisobutylaluminum hydride', kind: 'Hydride', sensitive: 'Air and moisture; neat DIBAL is pyrophoric', purify: 'Not purified: use solutions.', store: 'Under N2, in its Sure/Seal bottle.', check: 'Activity by reducing a test ester at −78 °C. Work up with Rochelle salt to break the aluminium emulsion.', refs: ['armarego2017'], checked: '' },
  { name: 'Tetrabutylammonium fluoride', kind: 'Reagent', sensitive: 'The THF solution holds about 5% water; dry TBAF decomposes (Hofmann elimination)', purify: 'Not purified. For water-sensitive desilylations, use TBAT, TASF or HF·pyridine instead.', store: 'Cold, tightly closed.', check: 'It is basic: base-sensitive substrates may need buffering with acetic acid.', refs: ['armarego2017'], checked: '' },
  // ---- oxidants
  { name: 'meta-Chloroperoxybenzoic acid', kind: 'Oxidant', sensitive: 'Sold at about 70 to 77% with m-chlorobenzoic acid and water for safety; pure m-CPBA is shock-sensitive', purify: 'Wash a CH2Cl2 or ether solution with pH 7.5 phosphate buffer to remove m-chlorobenzoic acid, dry and evaporate below 30 °C. Use soon; don\'t store the purified solid in bulk.', store: 'Fridge, in plastic, away from metals and reducing agents.', check: 'Iodometric titration for active oxygen; correct the equivalents for its purity.', refs: ['schwartz1964', 'prudent2011'], checked: '' },
  { name: 'Dess-Martin periodinane', kind: 'Oxidant', sensitive: 'Moisture: partial hydrolysis; heat or impact can set off the precursor IBX', purify: 'Not purified; buy or make fresh. A little water (about 1 equiv) speeds the oxidation.', store: 'Freezer, under N2, in a closed vial.', check: 'Oxidize a test alcohol; 1H NMR of the reagent (acetate singlets).', refs: ['schreiber1994', 'prudent2011'], checked: '' },
  { name: 'Pyridinium chlorochromate', kind: 'Oxidant', sensitive: 'Slightly hygroscopic; Cr(VI) is a carcinogen', purify: 'Not purified; buy or make by the Corey–Suggs procedure.', store: 'Dry, closed, labeled as Cr(VI).', check: 'Orange-yellow free-flowing solid; brown and sticky means wet or reduced.', refs: ['corey1975', 'armarego2017'], checked: '' },
  { name: 'N-Bromosuccinimide', kind: 'Reagent', sensitive: 'Light and moisture: releases Br2 (turns yellow or orange)', purify: 'Recrystallize from hot water (about 10 g per 100 mL at 90 to 95 °C), filter cold, dry in vacuo in the dark.', store: 'Fridge, dark.', check: 'White crystals; yellow means free Br2, which gives side reactions in radical brominations.', refs: ['armarego2017'], checked: '' },
  { name: 'p-Toluenesulfonyl chloride', kind: 'Reagent', sensitive: 'Moisture: hydrolyses to TsOH and HCl', purify: 'Dissolve in a little CHCl3, add about 5 volumes of light petroleum to precipitate TsOH, filter, concentrate and crystallize.', store: 'Dry, closed.', check: 'mp 67 to 69 °C; TsOH shows as a broad OH and shifted aromatic peaks in 1H NMR.', refs: ['armarego2017'], checked: '' },
  { name: 'Thionyl chloride', kind: 'Reagent', sensitive: 'Moisture: SO2 and HCl', purify: 'Distill under dry N2 through a short column; yellow or orange means sulfur chlorides.', store: 'Dry, under N2, in a fume cupboard cabinet.', check: 'Colorless to pale yellow.', refs: ['armarego2017'], checked: '' },
  { name: 'Benzaldehyde', cas: '100-52-7', kind: 'Reagent', sensitive: 'Air: autoxidises to benzoic acid', purify: 'Wash with 10% Na2CO3 (removes benzoic acid), dry over MgSO4, distil under reduced pressure under N2.', store: 'Under N2, dark, cold.', check: 'White crystals of benzoic acid in the neck or the liquid; 1H NMR CO2H.', refs: ['armarego2017'], checked: '' },
  { name: 'Azobisisobutyronitrile', cas: '78-67-1', kind: 'Reagent', sensitive: 'Heat: decomposes (half-life about 10 h at 65 °C), giving N2', purify: 'Recrystallize from methanol warmed to no more than about 40 °C; dry in vacuo at room temperature.', store: 'Fridge, dark.', check: 'White crystals; old material initiates poorly.', refs: ['armarego2017'], checked: '' },
  // ---- metals, catalysts, ligands
  { name: 'Sodium', kind: 'Metal', sensitive: 'Water (H2, fire); air', purify: 'Cut away the crust under mineral oil or dry hexane.', store: 'Under mineral oil, closed.', check: 'Bright cut surface. Destroy scraps under N2 in isopropanol, then ethanol, then methanol, then water, each only after the last stops fizzing.', refs: ['prudent2011'], checked: '' },
  { name: 'Potassium', kind: 'Metal', sensitive: 'Water and air, more violently than sodium; old pieces grow a yellow superoxide crust', purify: 'Cut under oil. Do not cut or handle potassium with a yellow or orange crust: superoxide in contact with oil or metal can explode. Have it collected as hazardous waste.', store: 'Under mineral oil, in small pieces, and use it up.', check: 'Bright silvery cut surface; any yellow crust means stop.', refs: ['prudent2011'], checked: '' },
  { name: 'Tetrakis(triphenylphosphine)palladium(0)', kind: 'Catalyst', sensitive: 'Air: oxidizes slowly (yellow to green or brown)', purify: 'Usually replaced rather than purified.', store: 'Freezer, under Ar, in the dark.', check: 'Bright yellow; 31P NMR: Ph3P=O at about 29 ppm and free PPh3 at about −5 ppm mean oxidation.', refs: ['armarego2017'], checked: '' },
  { name: 'Palladium(II) acetate', kind: 'Catalyst', sensitive: 'Commercial batches vary: some contain Pd3(OAc)5(NO2) and polymeric [Pd(OAc)2]n', purify: 'Buy from a supplier that states the content, or recrystallize from hot acetic acid.', store: 'Dry, closed.', check: 'Orange-brown crystals; a poor batch shows as erratic yields. See Carole & Colacot for how to check.', refs: ['colacot2016'], checked: '' },
  { name: 'Triphenylphosphine', kind: 'Ligand', sensitive: 'Air: slowly oxidizes to Ph3P=O', purify: 'Recrystallize from hot ethanol.', store: 'Closed; under N2 for catalysis.', check: '31P NMR: PPh3 about −5 ppm, Ph3P=O about 29 ppm.', refs: ['armarego2017'], checked: '' },
  { name: 'Copper(I) iodide', cas: '7681-65-4', kind: 'Catalyst', sensitive: 'Air and light: tan or green from Cu(II) and I2', purify: 'Dissolve in hot saturated aqueous KI, dilute with water to precipitate, filter, wash with water, ethanol and ether, dry in vacuo.', store: 'Dark, dry, under N2.', check: 'White to off-white powder.', refs: ['kauffman1983'], checked: '' },
];

/** A technique: what it is for, the steps, and what goes wrong. */
export interface TechniqueEntry {
  name: string;
  kind: 'Drying' | 'Titration' | 'Air-free' | 'Work-up' | 'Purification' | 'Safety';
  steps: string;
  watch: string;
  refs: (keyof typeof REFS)[];
  checked: Checked;
}

export const TECHNIQUES: TechniqueEntry[] = [
  { name: 'Activating molecular sieves', kind: 'Drying', steps: 'Heat the beads at 200 to 300 °C under vacuum for several hours (or with a heat gun under vacuum until no more water condenses), cool under N2. Use 3 Å for methanol, ethanol and acetonitrile; 4 Å for most others. About 10 to 20% m/v, 2 to 3 days.', watch: 'Sieve dust clouds solutions: decant or filter. Sieves straight from the bottle are not dry.', refs: ['williams2010'], checked: '' },
  { name: 'Solvent columns versus stills', kind: 'Drying', steps: 'A column of activated alumina (plus a copper catalyst for hydrocarbons) dries and deoxygenates solvent pushed through it by inert gas, with no heat and no reactive metal.', watch: 'Stills with sodium or potassium cause fires and need careful quenching. Never dry halogenated solvents with alkali metals.', refs: ['pangborn1996', 'williams2010'], checked: '' },
  { name: 'Titrating alkyllithiums', kind: 'Titration', steps: 'Weigh diphenylacetic acid (or N-benzylbenzamide) into a dry flask under N2, dissolve in dry THF, and add the RLi solution dropwise from a syringe until the color stays (yellow for the acid; blue for the amide, titrated cold). Concentration = mmol of indicator / mL added. Average two or three runs.', watch: 'Wet THF or air reads low. Keep the titrant syringe tip under N2.', refs: ['kofron1976', 'burchat1997', 'love1999'], checked: '' },
  { name: 'Titrating Grignard and organozinc reagents', kind: 'Titration', steps: 'Dissolve a weighed amount of I2 in 0.5 M LiCl in THF at 0 °C under N2, and add the organometallic dropwise until the brown color just goes. One I2 reacts with one C–M.', watch: 'LiCl keeps the magnesium and zinc salts dissolved so the end point is sharp.', refs: ['knochel2006', 'watson1967'], checked: '' },
  { name: 'Freeze–pump–thaw degassing', kind: 'Air-free', steps: 'In a Schlenk flask closed to the line, freeze the liquid in liquid N2, open to vacuum for a few minutes, close, thaw. Repeat three times; backfill with Ar.', watch: 'Never cool a flask open to air in liquid N2: liquid O2 (pale blue) condenses and can explode with organics. Thaw slowly so the flask doesn\'t crack.', refs: ['shriver1986', 'prudent2011'], checked: '' },
  { name: 'Sparging', kind: 'Air-free', steps: 'Bubble N2 or Ar through the solvent from a long needle for 15 to 30 min, with an outlet needle.', watch: 'Quicker than freeze–pump–thaw but less thorough; volatile solvents evaporate.', refs: ['shriver1986'], checked: '' },
  { name: 'Cannula transfer', kind: 'Air-free', steps: 'Put both flasks under inert gas with septa. Push one end of a dried double-ended needle through the source septum into the headspace to purge it, then into the receiving flask, then lower it into the liquid. A small positive pressure on the source (or a vent needle on the receiver) moves the liquid.', watch: 'Use for pyrophorics and volumes too large for a syringe. Purge the cannula before it touches the liquid.', refs: ['schwindeman2002', 'shriver1986'], checked: '' },
  { name: 'Testing for and removing peroxides', kind: 'Safety', steps: 'Test with a peroxide strip (or acidified KI: yellow to brown). Below about 25 ppm is fine for general use; from 25 to 100 ppm, do not distil or concentrate it; above 100 ppm, don\'t use it: have it disposed of. Remove by passing through activated basic alumina, then test again.', watch: 'Never distil a peroxide former to dryness. Crystals around the cap of an old ether bottle: don\'t open it; call your safety officer.', refs: ['clark2001', 'prudent2011'], checked: '' },
  { name: 'Fieser work-up for LiAlH4', kind: 'Work-up', steps: 'For n g of LiAlH4 in ether at 0 °C, add slowly in turn: n mL water, n mL 15% aqueous NaOH, 3n mL water. Stir until the solid is white and granular, add MgSO4, filter.', watch: 'Add the first water very slowly (H2). The granular salts filter far faster than an acid quench.', refs: ['fieser1967'], checked: '' },
  { name: 'Rochelle salt work-up', kind: 'Work-up', steps: 'After a DIBAL or other aluminium reduction, dilute and add saturated aqueous potassium sodium tartrate; stir vigorously until two clear layers form (from 30 min to overnight).', watch: 'Breaks the aluminium gel that otherwise makes an emulsion.', refs: [], checked: '' },
  { name: 'Quenching reactive hydrides and organometallics', kind: 'Safety', steps: 'Dilute with an inert solvent, cool in an ice bath under N2, then add isopropanol dropwise, then ethanol or methanol, then water, each only once the last has stopped reacting.', watch: 'Never quench a large amount at once or add water first. Keep a Class D extinguisher or dry sand within reach.', refs: ['prudent2011', 'schwindeman2002'], checked: '' },
  { name: 'Flash chromatography', kind: 'Purification', steps: 'Choose a solvent giving the product an Rf of about 0.35 on TLC. Pack 40 to 63 µm silica, load the sample in a little solvent (or dry-loaded on silica), and push the eluent through with gentle pressure.', watch: 'Compounds within 0.15 Rf need a longer column or a weaker eluent. Acid-sensitive compounds may need silica treated with Et3N.', refs: ['still1978'], checked: '' },
  { name: 'Recrystallization', kind: 'Purification', steps: 'Find a solvent that dissolves the solid when hot but not cold. Dissolve in the minimum hot solvent, filter hot if needed, cool slowly, then in ice; filter and wash with a little cold solvent.', watch: 'An oil coming out means too concentrated or cooling too fast: add a little solvent, reheat, seed or scratch.', refs: ['armarego2017'], checked: '' },
];

const byName = new Map(SAFETY_RECORDS.map((r) => [r.name.toLowerCase(), r]));

const refLinks = (keys: string): KbSource[] => keys.split(', ').map((k) => {
  const r = Object.values(REFS).find((x) => x.label === k);
  return r ? { label: r.label, url: r.url } : { label: k };
});

const refText = (keys: string[]): string => (keys.length ? keys.map((k) => REFS[k].label).join(', ') : 'Common practice');

// each row names its own sources, linked at the end of the row; the full references are in REFS
const ROW_SOURCES: KbSource[] = [{ label: 'each row\'s Sources column (the links at the end of the row open the papers). Written for this program; drafts until checked' }];

const status = (c: Checked): string => (c ? `Checked: ${c}` : 'Draft, not yet checked');

export const PURIFICATION_TABLE: KbTable = {
  id: 'purification',
  title: 'Purify and Store',
  about: 'How to purify, dry, store and check common solvents and reagents: short notes in our own words with the papers they rest on. Drafts until checked by the department.',
  columns: [
    { key: 'name', label: 'Compound' },
    { key: 'kind', label: 'Kind', filter: true, narrow: true },
    { key: 'sensitive', prose: true, label: 'Sensitive to' },
    { key: 'purify', prose: true, label: 'Purify or dry' },
    { key: 'store', prose: true, label: 'Store' },
    { key: 'check', prose: true, label: 'Check it is good' },
    { key: 'refs', label: 'Sources' },
    { key: 'checked', label: 'Status', filter: true, info: 'Whether someone in the department has checked this note against the lab\'s own practice. Written for Chem Illustrator from the papers in Sources.' },
    { key: 'cas', label: 'CAS' },
  ],
  rows: HANDLING.map((h): Record<string, Cell> => {
    const r = byName.get(h.name.toLowerCase());
    return {
      name: h.name, kind: h.kind, sensitive: h.sensitive, purify: h.purify, store: h.store, check: h.check,
      refs: refText(h.refs), checked: status(h.checked), cas: h.cas ?? r?.cas ?? null, cid: r?.cid ?? null,
    };
  }),
  sources: ROW_SOURCES,
  links: (row) => [
    // PubChem finds a compound by its CAS number as well as its CID
    ...(row.cid || row.cas ? [{ label: 'PubChem', url: `https://pubchem.ncbi.nlm.nih.gov/compound/${row.cid ?? row.cas}` }] : []),
    ...refLinks(String(row.refs ?? '')).filter((l) => l.url),
  ],
};

export const TECHNIQUES_TABLE: KbTable = {
  id: 'techniques',
  title: 'Techniques',
  about: 'Bench techniques in brief: drying solvents, titrating organometallics, air-free transfers, work-ups and purification. Drafts until checked by the department.',
  columns: [
    { key: 'name', label: 'Technique' },
    { key: 'kind', label: 'Kind', filter: true, narrow: true },
    { key: 'steps', prose: true, label: 'How' },
    { key: 'watch', prose: true, label: 'Watch out' },
    { key: 'refs', label: 'Sources' },
    { key: 'checked', label: 'Status', filter: true, info: 'Whether someone in the department has checked this note against the lab\'s own practice. Written for Chem Illustrator from the papers in Sources.' },
  ],
  rows: TECHNIQUES.map((t): Record<string, Cell> => ({ name: t.name, kind: t.kind, steps: t.steps, watch: t.watch, refs: refText(t.refs), checked: status(t.checked) })),
  sources: ROW_SOURCES,
  links: (row) => refLinks(String(row.refs ?? '')).filter((l) => l.url),
};
