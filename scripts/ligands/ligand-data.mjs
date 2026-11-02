// The ligand library's contents: each ligand's abbreviations, name and structure, by family.
// scripts/make-ligand-library.mjs checks each structure against PubChem (scripts/ligands/
// pubchem.json keeps what it found, so the build runs offline) and lays it out.
//
// Structures are written as SMILES of the free ligand, with its donor atoms numbered: 1 to 49
// for donors that give the metal a lone pair (L: PPh3, pyridine, a carbene), 51 and up for donors
// that lose a hydrogen to the metal (X: the OH of acac, the ortho CH of 2-phenylpyridine). The
// lowest-numbered donor is where a typed abbreviation joins the structure.
//
// Entry: [id, abbreviations ('|' between them; the first is shown), name, SMILES, options]
//   options.tpl     the template to use instead of one made from the SMILES (π ligands,
//                   ferrocenes and other shapes built in 3-D by make-metal-templates.mjs)
//   options.pc      the PubChem name or CID to check the structure against (default: the name)
//   options.check   why a structure that does not match PubChem's record is right anyway
//   options.full    draw every group out (no PPh2-style labels on the donors)
//   options.short   groups to write as labels where the drawing is too crowded (['Ph'], ['C6F5'])
//   options.free    lay the free ligand out on its own and put the metal in the middle of its
//                   donors (crown ethers, cyclam: the ring round the metal)
//   options.turn    degrees to turn the drawing from the standard way round (metal on the left)
//   options.flip    mirror it top to bottom
//   options.lx      the L and X count when the donors don't say it ({ l: 3, x: 0 } for η⁶-arenes)
//   options.hapto   how many atoms bond to the metal, for π ligands
//   options.palette also on the Ligands palette (the ones in common use)
//   options.note    a line about the ligand for the library window

// Substituents, written with ring numbers of their own so they can go anywhere.
const Ph = 'c%91ccccc%91';
const Cy = 'C%91CCCCC%91';
const Cyp = 'C%91CCCC%91';
const tBu = 'C(C)(C)C';
const iPr = 'C(C)C';
const Ad = 'C%91%92CC%93CC(CC(C%93)C%91)C%92';
const oTol = 'c%91ccccc%91C';
const mTol = 'c%91cccc(C)c%91';
const pTol = 'c%91ccc(C)cc%91';
const Xyl = 'c%91cc(C)cc(C)c%91';
const DTBM = 'c%91cc(C(C)(C)C)c(OC)c(C(C)(C)C)c%91';
const Fur = 'c%91ccco%91';
const Mes = 'c%91c(C)cc(C)cc%91C';
const Dipp = 'c%91c(C(C)C)cccc%91C(C)C';
const PMP = 'c%91ccc(OC)cc%91';
/** A PR2 donor at the start of a chain (more follows it) or at the end of one. */
const PR2 = (m, R) => `[P:${m}](${R})(${R})`;
const PR2end = (m, R) => `[P:${m}](${R})${R}`;
/** A PR3 donor. */
const PR3 = (R) => `[P:1](${R})(${R})${R}`;

export const FAMILIES = [
  {
    id: 'monophosphines',
    name: 'Monophosphines',
    note: 'Trialkyl- and triarylphosphines, by size and donor strength.',
    items: [
      ['pme3', 'PMe3', 'Trimethylphosphine', PR3('C')],
      ['pet3', 'PEt3', 'Triethylphosphine', PR3('CC')],
      ['pnbu3', 'PnBu3|PBu3|P(n-Bu)3', 'Tributylphosphine', PR3('CCCC')],
      ['pnoct3', 'TOP|POct3', 'Trioctylphosphine', PR3('CCCCCCCC')],
      ['pipr3', 'PiPr3|P(i-Pr)3', 'Triisopropylphosphine', PR3(iPr)],
      ['pcyp3', 'PCyp3', 'Tricyclopentylphosphine', PR3(Cyp)],
      ['pcy3', 'PCy3', 'Tricyclohexylphosphine', PR3(Cy), { tpl: 'pcy3', palette: true }],
      ['ptbu3', 'PtBu3|P(t-Bu)3|tBu3P', 'Tri-tert-butylphosphine', PR3(tBu), { tpl: 'ptbu3', palette: true }],
      ['pad3', 'PAd3', 'Tri(1-adamantyl)phosphine', PR3(Ad), { pc: 'Tri(1-adamantyl)phosphine', note: 'Carrow, 2016.' }],
      ['dtbnpp', 'DTBNpP|PtBu2Np', 'Di-tert-butylneopentylphosphine', `[P:1](CC(C)(C)C)(${tBu})${tBu}`],
      ['ptbu2me', 'PtBu2Me|P(t-Bu)2Me', 'Di-tert-butylmethylphosphine', `[P:1](C)(${tBu})${tBu}`],
      ['ptbu2ph', 'PtBu2Ph|P(t-Bu)2Ph', 'Di-tert-butylphenylphosphine', `[P:1](${Ph})(${tBu})${tBu}`],
      ['amphos', 'Amphos|APhos|AmPhos', 'Di-tert-butyl(4-dimethylaminophenyl)phosphine', `${PR2(1, tBu)}c1ccc(N(C)C)cc1`, { pc: '4-(Di-tert-butylphosphino)-N,N-dimethylaniline' }],
      ['catacxiuma', 'cataCXium A|PAd2nBu|PAd2Bu|BuPAd2', 'Butyldi(1-adamantyl)phosphine (cataCXium A)', `[P:1](CCCC)(${Ad})${Ad}`, { pc: 'Butyldi-1-adamantylphosphine' }],
      ['pph3', 'PPh3|Ph3P', 'Triphenylphosphine', PR3(Ph), { tpl: 'pph3', palette: true }],
      ['potol3', 'P(o-Tol)3|P(o-tol)3', 'Tri(o-tolyl)phosphine', PR3(oTol), { pc: 'Tri(o-tolyl)phosphine' }],
      ['pmtol3', 'P(m-Tol)3|P(m-tol)3', 'Tri(m-tolyl)phosphine', PR3(mTol), { pc: 'Tri-m-tolylphosphine' }],
      ['pptol3', 'P(p-Tol)3|P(p-tol)3', 'Tri(p-tolyl)phosphine', PR3(pTol), { pc: 'Tri-p-tolylphosphine' }],
      ['pmes3', 'PMes3', 'Trimesitylphosphine', PR3(Mes)],
      ['ppmp3', 'P(PMP)3|P(4-MeOC6H4)3|P(p-anisyl)3', 'Tris(4-methoxyphenyl)phosphine', PR3(PMP)],
      ['pfph3', 'P(4-FC6H4)3', 'Tris(4-fluorophenyl)phosphine', PR3('c%91ccc(F)cc%91')],
      ['pcf3ph3', 'P(4-CF3C6H4)3', 'Tris[4-(trifluoromethyl)phenyl]phosphine', PR3('c%91ccc(C(F)(F)F)cc%91')],
      ['pc6f53', 'P(C6F5)3', 'Tris(pentafluorophenyl)phosphine', PR3('c%91c(F)c(F)c(F)c(F)c%91F'), { short: ['C6F5'] }],
      ['tfp', 'TFP|P(2-furyl)3|P(Fur)3', 'Tri(2-furyl)phosphine', PR3(Fur), { pc: 'Tri(2-furyl)phosphine' }],
      ['pme2ph', 'PMe2Ph|PPhMe2', 'Dimethylphenylphosphine', `[P:1](C)(C)${Ph}`],
      ['pmeph2', 'PMePh2|PPh2Me', 'Methyldiphenylphosphine', `[P:1](C)(${Ph})${Ph}`],
      ['pcy2ph', 'PCy2Ph|PPhCy2', 'Dicyclohexylphenylphosphine', `[P:1](${Ph})(${Cy})${Cy}`],
      ['pcyph2', 'PCyPh2|PPh2Cy', 'Cyclohexyldiphenylphosphine', `[P:1](${Cy})(${Ph})${Ph}`],
      ['tppts', 'TPPTS', '3,3′,3′′-Phosphanetriyltris(benzenesulfonic acid)', PR3('c%91cccc(S(=O)(=O)O)c%91'), { pc: 'Tris(3-sulfophenyl)phosphine', check: 'water-soluble Ph3P; usually sold as the trisodium salt', note: 'Water-soluble; sold as the trisodium salt.' }],
      ['asph3', 'AsPh3|Ph3As', 'Triphenylarsine', `[As:1](${Ph})(${Ph})${Ph}`],
      ['sbph3', 'SbPh3|Ph3Sb', 'Triphenylstibine', `[Sb:1](${Ph})(${Ph})${Ph}`],
    ],
  },
  {
    id: 'biaryl-phosphines',
    name: 'Dialkylbiaryl phosphines',
    note: 'Buchwald-type ligands for cross-coupling, drawn with the PR₂ group kept as a label.',
    items: [
      ['johnphos', 'JohnPhos', '(2-Biphenyl)di-tert-butylphosphine (JohnPhos)', `${PR2(1, tBu)}c1ccccc1-c1ccccc1`, { pc: 'JohnPhos' }],
      ['cyjohnphos', 'CyJohnPhos', '(2-Biphenyl)dicyclohexylphosphine (CyJohnPhos)', `${PR2(1, Cy)}c1ccccc1-c1ccccc1`, { pc: '2-(Dicyclohexylphosphino)biphenyl' }],
      ['phjohnphos', 'PhJohnPhos', '2-(Diphenylphosphino)biphenyl', `${PR2(1, Ph)}c1ccccc1-c1ccccc1`],
      ['mephos', 'MePhos', '2-Dicyclohexylphosphino-2′-methylbiphenyl (MePhos)', `${PR2(1, Cy)}c1ccccc1-c1ccccc1C`, { pc: '2-Dicyclohexylphosphino-2\'-methylbiphenyl' }],
      ['tbumephos', 'tBuMePhos', '2-Di-tert-butylphosphino-2′-methylbiphenyl (tBuMePhos)', `${PR2(1, tBu)}c1ccccc1-c1ccccc1C`, { pc: '2-Di-tert-butylphosphino-2\'-methylbiphenyl' }],
      ['davephos', 'DavePhos', '2-Dicyclohexylphosphino-2′-(N,N-dimethylamino)biphenyl (DavePhos)', `${PR2(1, Cy)}c1ccccc1-c1ccccc1N(C)C`, { pc: 'DavePhos' }],
      ['tbudavephos', 'tBuDavePhos', '2-Di-tert-butylphosphino-2′-(N,N-dimethylamino)biphenyl (tBuDavePhos)', `${PR2(1, tBu)}c1ccccc1-c1ccccc1N(C)C`, { pc: '2-Di-tert-butylphosphino-2\'-(N,N-dimethylamino)biphenyl' }],
      ['phdavephos', 'PhDavePhos', '2-Diphenylphosphino-2′-(N,N-dimethylamino)biphenyl (PhDavePhos)', `${PR2(1, Ph)}c1ccccc1-c1ccccc1N(C)C`, { pc: '2-Diphenylphosphino-2\'-(N,N-dimethylamino)biphenyl' }],
      ['xphos', 'XPhos', '2-Dicyclohexylphosphino-2′,4′,6′-triisopropylbiphenyl (XPhos)', `${PR2(1, Cy)}c1ccccc1-c1c(C(C)C)cc(C(C)C)cc1C(C)C`, { tpl: 'xphos', pc: 'XPhos', palette: true }],
      ['tbuxphos', 't-BuXPhos|tBuXPhos', '2-Di-tert-butylphosphino-2′,4′,6′-triisopropylbiphenyl (tBuXPhos)', `${PR2(1, tBu)}c1ccccc1-c1c(C(C)C)cc(C(C)C)cc1C(C)C`, { pc: 'tBuXPhos', palette: true }],
      ['me4tbuxphos', 'Me4tBuXPhos', '2-Di-tert-butylphosphino-3,4,5,6-tetramethyl-2′,4′,6′-triisopropylbiphenyl (Me4tBuXPhos)', `${PR2(1, tBu)}c1c(C)c(C)c(C)c(C)c1-c1c(C(C)C)cc(C(C)C)cc1C(C)C`, { pc: 'Me4tBuXPhos' }],
      ['sphos', 'SPhos', '2-Dicyclohexylphosphino-2′,6′-dimethoxybiphenyl (SPhos)', `${PR2(1, Cy)}c1ccccc1-c1c(OC)cccc1OC`, { tpl: 'sphos', pc: 'SPhos', palette: true }],
      ['ruphos', 'RuPhos', '2-Dicyclohexylphosphino-2′,6′-diisopropoxybiphenyl (RuPhos)', `${PR2(1, Cy)}c1ccccc1-c1c(OC(C)C)cccc1OC(C)C`, { pc: 'RuPhos', palette: true }],
      ['cphos', 'CPhos', '2-Dicyclohexylphosphino-2′,6′-bis(N,N-dimethylamino)biphenyl (CPhos)', `${PR2(1, Cy)}c1ccccc1-c1c(N(C)C)cccc1N(C)C`, { pc: 'CPhos' }],
      ['brettphos', 'BrettPhos', '2-(Dicyclohexylphosphino)-3,6-dimethoxy-2′,4′,6′-triisopropylbiphenyl (BrettPhos)', `${PR2(1, Cy)}c1c(OC)ccc(OC)c1-c1c(C(C)C)cc(C(C)C)cc1C(C)C`, { pc: 'BrettPhos', palette: true }],
      ['tbubrettphos', 'tBuBrettPhos|t-BuBrettPhos', '2-(Di-tert-butylphosphino)-3,6-dimethoxy-2′,4′,6′-triisopropylbiphenyl (tBuBrettPhos)', `${PR2(1, tBu)}c1c(OC)ccc(OC)c1-c1c(C(C)C)cc(C(C)C)cc1C(C)C`, { pc: 'tBuBrettPhos' }],
      ['adbrettphos', 'AdBrettPhos', '2-(Di-1-adamantylphosphino)-3,6-dimethoxy-2′,4′,6′-triisopropylbiphenyl (AdBrettPhos)', `${PR2(1, Ad)}c1c(OC)ccc(OC)c1-c1c(C(C)C)cc(C(C)C)cc1C(C)C`, { pc: 'AdBrettPhos' }],
    ],
  },
  {
    id: 'other-monophosphines',
    name: 'Other bulky monophosphines',
    note: 'Ligands for difficult couplings that are not biaryls.',
    items: [
      ['bippyphos', 'BippyPhos', '5-(Di-tert-butylphosphino)-1′,3′,5′-triphenyl-1′H-[1,4′]bipyrazole (BippyPhos)', `${PR2(1, tBu)}c1ccnn1-c1c(-c2ccccc2)nn(-c2ccccc2)c1-c1ccccc1`, { pc: 'BippyPhos' }],
      ['mordalphos', 'Mor-DalPhos|MorDalPhos', 'Di(1-adamantyl)-2-morpholinophenylphosphine (Mor-DalPhos)', `${PR2(1, Ad)}c1ccccc1[N:2]1CCOCC1`, { pc: 'Mor-DalPhos', note: 'Binds through P and N (κ²-P,N).' }],
      ['qphos', 'Q-Phos|QPhos', '1,2,3,4,5-Pentaphenyl-1′-(di-tert-butylphosphino)ferrocene (Q-Phos)', '[P:1](C(C)(C)C)(C(C)(C)C)C1=CC=C[CH-]1.[Fe+2].c1ccc(cc1)[C-]1C(c2ccccc2)=C(c2ccccc2)C(c2ccccc2)=C1c1ccccc1', { tpl: 'qphos', pc: 'Q-Phos', check: 'ferrocene written as Fe²⁺ and two Cp⁻ rings, as PubChem does' }],
      ['ph2ppy', 'Ph2Ppy|PPh2py|dppy', '2-(Diphenylphosphino)pyridine', `${PR2(1, Ph)}c1ccccn1`, { note: 'Usually bonds through P alone, or bridges two metals through P and N.' }],
    ],
  },
  {
    id: 'phosphites',
    name: 'Phosphites and other P donors',
    note: 'π-Acidic phosphorus ligands.',
    items: [
      ['pome3', 'P(OMe)3', 'Trimethyl phosphite', PR3('OC')],
      ['poet3', 'P(OEt)3', 'Triethyl phosphite', PR3('OCC')],
      ['poipr3', 'P(OiPr)3|P(O-i-Pr)3', 'Triisopropyl phosphite', PR3('OC(C)C')],
      ['poph3', 'P(OPh)3', 'Triphenyl phosphite', PR3(`O${Ph}`)],
      ['pootol3', 'P(O-o-Tol)3', 'Tri(o-tolyl) phosphite', PR3(`O${oTol}`), { pc: 'Tri-o-tolyl phosphite' }],
      ['pnme23', 'P(NMe2)3|HMPT', 'Tris(dimethylamino)phosphine', PR3('N(C)C')],
      ['pf3', 'PF3', 'Phosphorus trifluoride', PR3('F')],
    ],
  },
  {
    id: 'bisphosphines',
    name: 'Bis- and polyphosphines',
    note: 'Chelating phosphines, by bite angle; PR₂ groups kept as labels.',
    items: [
      ['dmpe', 'dmpe|DMPE', '1,2-Bis(dimethylphosphino)ethane', `${PR2(1, 'C')}CC${PR2end(2, 'C')}`],
      ['depe', 'depe|DEPE', '1,2-Bis(diethylphosphino)ethane', `${PR2(1, 'CC')}CC${PR2end(2, 'CC')}`],
      ['dippe', 'dippe|DIPPE', '1,2-Bis(diisopropylphosphino)ethane', `${PR2(1, iPr)}CC${PR2end(2, iPr)}`],
      ['dcpe', 'dcpe|DCPE', '1,2-Bis(dicyclohexylphosphino)ethane', `${PR2(1, Cy)}CC${PR2end(2, Cy)}`],
      ['dtbpe', 'dtbpe|DTBPE', '1,2-Bis(di-tert-butylphosphino)ethane', `${PR2(1, tBu)}CC${PR2end(2, tBu)}`],
      ['dppm', 'dppm|DPPM', 'Bis(diphenylphosphino)methane', `${PR2(1, Ph)}C${PR2end(2, Ph)}`, { note: 'Bridges two metals more often than it chelates one.' }],
      ['dppe', 'dppe|DPPE', '1,2-Bis(diphenylphosphino)ethane', `${PR2(1, Ph)}CC${PR2end(2, Ph)}`, { tpl: 'dppe', palette: true }],
      ['dppp', 'dppp|DPPP', '1,3-Bis(diphenylphosphino)propane', `${PR2(1, Ph)}CCC${PR2end(2, Ph)}`, { tpl: 'dppp', palette: true }],
      ['dppb', 'dppb|DPPB', '1,4-Bis(diphenylphosphino)butane', `${PR2(1, Ph)}CCCC${PR2end(2, Ph)}`],
      ['dpppe', 'dpppe|DPPPE', '1,5-Bis(diphenylphosphino)pentane', `${PR2(1, Ph)}CCCCC${PR2end(2, Ph)}`],
      ['dppen', 'dppen|cis-dppen|dppv', 'cis-1,2-Bis(diphenylphosphino)ethylene', `${PR2(1, Ph)}/C=C\\${PR2end(2, Ph)}`],
      ['dppbz', 'dppbz|DPPBz', '1,2-Bis(diphenylphosphino)benzene', `${PR2(1, Ph)}c1ccccc1${PR2end(2, Ph)}`],
      ['dcypbz', 'dcypbz', '1,2-Bis(dicyclohexylphosphino)benzene', `${PR2(1, Cy)}c1ccccc1${PR2end(2, Cy)}`],
      ['dppf', 'dppf|DPPF', '1,1′-Bis(diphenylphosphino)ferrocene', '[P:1](c1ccccc1)(c1ccccc1)C1=CC=C[CH-]1.[Fe+2].[P:2](c1ccccc1)(c1ccccc1)C1=CC=C[CH-]1', { tpl: 'dppf', palette: true, check: 'ferrocene written as Fe²⁺ and two Cp⁻ rings, as PubChem does' }],
      ['dippf', 'dippf|DiPPF', '1,1′-Bis(diisopropylphosphino)ferrocene', '[P:1](C(C)C)(C(C)C)C1=CC=C[CH-]1.[Fe+2].[P:2](C(C)C)(C(C)C)C1=CC=C[CH-]1', { tpl: 'dippf', check: 'ferrocene written as Fe²⁺ and two Cp⁻ rings, as PubChem does' }],
      ['dcypf', 'dcypf|dcpf', '1,1′-Bis(dicyclohexylphosphino)ferrocene', '[P:1](C1CCCCC1)(C1CCCCC1)C1=CC=C[CH-]1.[Fe+2].[P:2](C1CCCCC1)(C1CCCCC1)C1=CC=C[CH-]1', { tpl: 'dcypf', check: 'ferrocene written as Fe²⁺ and two Cp⁻ rings, as PubChem does' }],
      ['dtbpf', 'dtbpf|DTBPF', '1,1′-Bis(di-tert-butylphosphino)ferrocene', '[P:1](C(C)(C)C)(C(C)(C)C)C1=CC=C[CH-]1.[Fe+2].[P:2](C(C)(C)C)(C(C)(C)C)C1=CC=C[CH-]1', { tpl: 'dtbpf', check: 'ferrocene written as Fe²⁺ and two Cp⁻ rings, as PubChem does' }],
      ['dpephos', 'DPEphos|DPEPhos', 'Bis[2-(diphenylphosphino)phenyl] ether (DPEphos)', `${PR2(1, Ph)}c1ccccc1Oc1ccccc1${PR2end(2, Ph)}`, { pc: 'DPEphos' }],
      ['xantphos', 'Xantphos|XantPhos', '4,5-Bis(diphenylphosphino)-9,9-dimethylxanthene (Xantphos)', `${PR2(1, Ph)}c1cccc2c1Oc1c(${PR2end(2, Ph)})cccc1C2(C)C`, { tpl: 'xantphos', pc: 'Xantphos', palette: true }],
      ['tbuxantphos', 't-Bu-Xantphos|tBuXantphos', '4,5-Bis(di-tert-butylphosphino)-9,9-dimethylxanthene', `${PR2(1, tBu)}c1cccc2c1Oc1c(${PR2end(2, tBu)})cccc1C2(C)C`, { tpl: 'tbuxantphos' }],
      ['nixantphos', 'NiXantphos|NIXANTPHOS', '4,6-Bis(diphenylphosphino)phenoxazine (NiXantphos)', `${PR2(1, Ph)}c1cccc2c1Oc1c(${PR2end(2, Ph)})cccc1N2`, { pc: 'NiXantphos', tpl: 'nixantphos' }],
      ['biphep', 'BIPHEP', '2,2′-Bis(diphenylphosphino)-1,1′-biphenyl', `${PR2(1, Ph)}c1ccccc1-c1ccccc1${PR2end(2, Ph)}`],
      ['bisbi', 'BISBI', '2,2′-Bis(diphenylphosphinomethyl)-1,1′-biphenyl', `${PR2(1, Ph)}Cc1ccccc1-c1ccccc1C${PR2end(2, Ph)}`, { tpl: 'bisbi' }],
      ['dtbpx', 'dtbpx|DTBPMB', '1,2-Bis(di-tert-butylphosphinomethyl)benzene', `${PR2(1, tBu)}Cc1ccccc1C${PR2end(2, tBu)}`],
      ['triphos', 'triphos|Triphos', '1,1,1-Tris(diphenylphosphinomethyl)ethane', `${PR2(1, Ph)}CC(C)(C${PR2end(2, Ph)})C${PR2end(3, Ph)}`, { pc: '1,1,1-Tris(diphenylphosphinomethyl)ethane' }],
      ['ltriphos', 'PhP(CH2CH2PPh2)2|etp', 'Bis(2-diphenylphosphinoethyl)phenylphosphine', `${PR2(1, Ph)}CC[P:2](${Ph})CC${PR2end(3, Ph)}`],
    ],
  },
  {
    id: 'chiral-bisphosphines',
    name: 'Chiral bisphosphines',
    note: 'For asymmetric hydrogenation and other enantioselective reactions; one enantiomer is drawn (mirror it for the other).',
    items: [
      ['binap', 'BINAP', '2,2′-Bis(diphenylphosphino)-1,1′-binaphthyl (BINAP)', `${PR2(1, Ph)}c1ccc2ccccc2c1-c1c(${PR2end(2, Ph)})ccc2ccccc12`, { tpl: 'binap', pc: 'BINAP', palette: true }],
      ['tolbinap', 'Tol-BINAP|TolBINAP|p-Tol-BINAP', '2,2′-Bis(di-p-tolylphosphino)-1,1′-binaphthyl (Tol-BINAP)', `${PR2(1, pTol)}c1ccc2ccccc2c1-c1c(${PR2end(2, pTol)})ccc2ccccc12`, { pc: 'Tol-BINAP' }],
      ['xylbinap', 'Xyl-BINAP|XylBINAP|DM-BINAP', '2,2′-Bis[di(3,5-xylyl)phosphino]-1,1′-binaphthyl (Xyl-BINAP)', `${PR2(1, Xyl)}c1ccc2ccccc2c1-c1c(${PR2end(2, Xyl)})ccc2ccccc12`, { pc: '2,2\'-Bis[di(3,5-xylyl)phosphino]-1,1\'-binaphthyl' }],
      ['h8binap', 'H8-BINAP|H8BINAP', '2,2′-Bis(diphenylphosphino)-5,5′,6,6′,7,7′,8,8′-octahydro-1,1′-binaphthyl (H8-BINAP)', `${PR2(1, Ph)}c1ccc2CCCCc2c1-c1c(${PR2end(2, Ph)})ccc2CCCCc12`, { pc: 'H8-BINAP' }],
      ['segphos', 'SEGPHOS|Segphos', '5,5′-Bis(diphenylphosphino)-4,4′-bi-1,3-benzodioxole (SEGPHOS)', `${PR2(1, Ph)}c1ccc2OCOc2c1-c1c(${PR2end(2, Ph)})ccc2OCOc12`, { pc: 'SEGPHOS' }],
      ['dmsegphos', 'DM-SEGPHOS|DM-Segphos', '5,5′-Bis[di(3,5-xylyl)phosphino]-4,4′-bi-1,3-benzodioxole (DM-SEGPHOS)', `${PR2(1, Xyl)}c1ccc2OCOc2c1-c1c(${PR2end(2, Xyl)})ccc2OCOc12`, { pc: 'DM-SEGPHOS' }],
      ['dtbmsegphos', 'DTBM-SEGPHOS|DTBM-Segphos', '5,5′-Bis[di(3,5-di-tert-butyl-4-methoxyphenyl)phosphino]-4,4′-bi-1,3-benzodioxole (DTBM-SEGPHOS)', `${PR2(1, DTBM)}c1ccc2OCOc2c1-c1c(${PR2end(2, DTBM)})ccc2OCOc12`, { pc: 'DTBM-SEGPHOS' }],
      ['meobiphep', 'MeO-BIPHEP|MeOBIPHEP', '2,2′-Bis(diphenylphosphino)-6,6′-dimethoxy-1,1′-biphenyl (MeO-BIPHEP)', `${PR2(1, Ph)}c1cccc(OC)c1-c1c(OC)cccc1${PR2end(2, Ph)}`, { pc: 'MeO-BIPHEP' }],
      ['synphos', 'SYNPHOS|Synphos', '6,6′-Bis(diphenylphosphino)-2,2′,3,3′-tetrahydro-5,5′-bi-1,4-benzodioxine (SYNPHOS)', `${PR2(1, Ph)}c1ccc2OCCOc2c1-c1c(${PR2end(2, Ph)})ccc2OCCOc12`, { pc: 'SYNPHOS' }],
      ['difluorphos', 'DIFLUORPHOS|Difluorphos', '5,5′-Bis(diphenylphosphino)-2,2,2′,2′-tetrafluoro-4,4′-bi-1,3-benzodioxole (DIFLUORPHOS)', `${PR2(1, Ph)}c1ccc2OC(F)(F)Oc2c1-c1c(${PR2end(2, Ph)})ccc2OC(F)(F)Oc12`, { pc: 'DIFLUORPHOS' }],
      ['pphos', 'P-Phos|PPhos', '2,2′,6,6′-Tetramethoxy-4,4′-bis(diphenylphosphino)-3,3′-bipyridine (P-Phos)', `${PR2(1, Ph)}c1cc(OC)nc(OC)c1-c1c(${PR2end(2, Ph)})cc(OC)nc1OC`, { pc: 'P-Phos' }],
      ['sdp', 'SDP', '7,7′-Bis(diphenylphosphino)-1,1′-spirobiindane (SDP)', `${PR2(1, Ph)}c1cccc2CCC3(CCc4cccc(${PR2end(2, Ph)})c43)c12`, { pc: '7,7\'-Bis(diphenylphosphino)-1,1\'-spirobiindane' }],
      ['diop', 'DIOP', '(4S,5S)-2,2-Dimethyl-4,5-bis(diphenylphosphinomethyl)-1,3-dioxolane (DIOP)', `${PR2(1, Ph)}C[C@H]1OC(C)(C)O[C@@H]1C${PR2end(2, Ph)}`, { pc: 3084647 }],
      ['chiraphos', 'CHIRAPHOS|Chiraphos', '(2R,3R)-2,3-Bis(diphenylphosphino)butane (CHIRAPHOS)', '[P:1](c1ccccc1)(c1ccccc1)[C@H](C)[C@@H](C)[P:2](c1ccccc1)c1ccccc1', { pc: 2724948 }],
      ['prophos', 'PROPHOS|Prophos', '(R)-1,2-Bis(diphenylphosphino)propane (PROPHOS)', `${PR2(1, Ph)}[C@H](C)C${PR2end(2, Ph)}`, { pc: 2724539 }],
      ['skewphos', 'BDPP|SKEWPHOS|Skewphos', '(2S,4S)-2,4-Bis(diphenylphosphino)pentane (BDPP, SKEWPHOS)', '[P:1](c1ccccc1)(c1ccccc1)[C@@H](C)C[C@H](C)[P:2](c1ccccc1)c1ccccc1', { pc: 2734567 }],
      ['norphos', 'NORPHOS|Norphos', '(R,R)-5,6-Bis(diphenylphosphino)bicyclo[2.2.1]hept-2-ene (NORPHOS)', '[P:1](c1ccccc1)(c1ccccc1)[C@@H]1[C@H]2C=C[C@H](C2)[C@H]1[P:2](c1ccccc1)c1ccccc1', { pc: 10139589 }],
      ['dipamp', 'DIPAMP', '(R,R)-1,2-Bis[(2-methoxyphenyl)phenylphosphino]ethane (DIPAMP)', '[P@@:1](c1ccccc1OC)(c1ccccc1)CC[P@@:2](c1ccccc1OC)c1ccccc1', { pc: 10884975, full: true }],
      ['meduphos', 'Me-DuPhos|MeDuPhos', '1,2-Bis[(2R,5R)-2,5-dimethylphospholano]benzene (Me-DuPhos)', '[P:1]1([C@H](C)CC[C@H]1C)c1ccccc1[P:2]1[C@H](C)CC[C@H]1C', { pc: 2734551 }],
      ['etduphos', 'Et-DuPhos|EtDuPhos', '1,2-Bis[(2R,5R)-2,5-diethylphospholano]benzene (Et-DuPhos)', '[P:1]1([C@H](CC)CC[C@H]1CC)c1ccccc1[P:2]1[C@H](CC)CC[C@H]1CC', { pc: 'Et-DuPhos' }],
      ['iprduphos', 'iPr-DuPhos|iPrDuPhos', '1,2-Bis[(2R,5R)-2,5-diisopropylphospholano]benzene (iPr-DuPhos)', '[P:1]1([C@@H](C(C)C)CC[C@@H]1C(C)C)c1ccccc1[P:2]1[C@@H](C(C)C)CC[C@@H]1C(C)C', { pc: 'iPr-DuPhos' }],
      ['mebpe', 'Me-BPE|MeBPE', '1,2-Bis[(2R,5R)-2,5-dimethylphospholano]ethane (Me-BPE)', '[P:1]1([C@H](C)CC[C@H]1C)CC[P:2]1[C@H](C)CC[C@H]1C', { pc: 'Me-BPE' }],
      ['phbpe', 'Ph-BPE|PhBPE', '1,2-Bis[(2R,5R)-2,5-diphenylphospholano]ethane (Ph-BPE)', '[P:1]1([C@@H](c2ccccc2)CC[C@@H]1c1ccccc1)CC[P:2]1[C@@H](c2ccccc2)CC[C@@H]1c1ccccc1', { pc: 'Ph-BPE', short: ['Ph'] }],
      ['tangphos', 'TangPhos', '(1S,1′S,2R,2′R)-1,1′-Di-tert-butyl-2,2′-biphospholane (TangPhos)', '[P@:1]1(C(C)(C)C)CCC[C@@H]1[C@H]1CCC[P@:2]1C(C)(C)C', { pc: 10149434 }],
      ['duanphos', 'DuanPhos', '(1R,1′R,2S,2′S)-2,2′-Di-tert-butyl-2,3,2′,3′-tetrahydro-1H,1′H-1,1′-biisophosphindole (DuanPhos)', '[P@:1]1(C(C)(C)C)Cc2ccccc2[C@@H]1[C@H]1c2ccccc2C[P@:2]1C(C)(C)C', { pc: 10309415 }],
      ['quinoxp', 'QuinoxP*|Quinox-P*', '(R,R)-2,3-Bis(tert-butylmethylphosphino)quinoxaline (QuinoxP*)', '[P@:1](C)(C(C)(C)C)c1nc2ccccc2nc1[P@:2](C)C(C)(C)C', { pc: 11695692 }],
      ['benzp', 'BenzP*|Benz-P*', '(R,R)-1,2-Bis(tert-butylmethylphosphino)benzene (BenzP*)', '[P@:1](C)(C(C)(C)C)c1ccccc1[P@:2](C)C(C)(C)C', { pc: 15953600 }],
      ['trostph', 'Trost ligand|DACH-phenyl Trost|DPPBA-DACH', '(R,R)-DACH-phenyl Trost ligand', `${PR2(1, Ph)}c1ccccc1C(=O)N[C@@H]1CCCC[C@H]1NC(=O)c1ccccc1${PR2end(2, Ph)}`, { pc: '(R,R)-DACH-phenyl Trost ligand' }],
      ['trostnaph', 'DACH-naphthyl Trost', '(R,R)-DACH-naphthyl Trost ligand', `${PR2(1, Ph)}c1ccc2ccccc2c1C(=O)N[C@@H]1CCCC[C@H]1NC(=O)c1c(${PR2end(2, Ph)})ccc2ccccc12`, { pc: '(R,R)-DACH-naphthyl Trost ligand' }],
      ['josiphos', 'Josiphos|SL-J001|PPF-PCy2', 'Josiphos SL-J001: (R)-1-[(SP)-2-(diphenylphosphino)ferrocenyl]ethyldicyclohexylphosphine', '[P:1](c1ccccc1)(c1ccccc1)C1=CC=C[C-]1[C@@H](C)[P:2](C1CCCCC1)C1CCCCC1.[Fe+2].[CH-]1C=CC=C1', { tpl: 'josiphos', pc: 'Josiphos SL-J001-1', check: 'ferrocene written as Fe²⁺ and two Cp⁻ rings; PubChem\'s record for the name writes the rings saturated' }],
      ['josiphos-tbu', 'SL-J002|PPF-PtBu2', 'Josiphos SL-J002: (R)-1-[(SP)-2-(diphenylphosphino)ferrocenyl]ethyldi-tert-butylphosphine', '[P:1](c1ccccc1)(c1ccccc1)C1=CC=C[C-]1[C@@H](C)[P:2](C(C)(C)C)C(C)(C)C.[Fe+2].[CH-]1C=CC=C1', { tpl: 'josiphos-tbu', pc: 'Josiphos SL-J002-1', check: 'ferrocene written as Fe²⁺ and two Cp⁻ rings, as PubChem does' }],
      ['josiphos-cy', 'SL-J009|CyPF-tBu', 'Josiphos SL-J009: (R)-1-[(SP)-2-(dicyclohexylphosphino)ferrocenyl]ethyldi-tert-butylphosphine', '[P:1](C1CCCCC1)(C1CCCCC1)C1=CC=C[C-]1[C@@H](C)[P:2](C(C)(C)C)C(C)(C)C.[Fe+2].[CH-]1C=CC=C1', { tpl: 'josiphos-cy', pc: 'Josiphos SL-J009-1', check: 'ferrocene written as Fe²⁺ and two Cp⁻ rings, as PubChem does' }],
    ],
  },
  {
    id: 'pn-ligands',
    name: 'P,N ligands',
    note: 'Phosphinooxazolines and other ligands with one P and one N donor.',
    items: [
      ['iprphox', 'iPr-PHOX|iPrPHOX', '(S)-4-Isopropyl-2-[2-(diphenylphosphino)phenyl]-2-oxazoline (iPr-PHOX)', `${PR2(1, Ph)}c1ccccc1C1=[N:2][C@@H](C(C)C)CO1`, { pc: '(S)-4-Isopropyl-2-[2-(diphenylphosphino)phenyl]-2-oxazoline' }],
      ['tbuphox', 'tBu-PHOX|t-Bu-PHOX|tBuPHOX', '(S)-4-tert-Butyl-2-[2-(diphenylphosphino)phenyl]-2-oxazoline (tBu-PHOX)', `${PR2(1, Ph)}c1ccccc1C1=[N:2][C@@H](C(C)(C)C)CO1`, { pc: '(S)-4-tert-Butyl-2-[2-(diphenylphosphino)phenyl]-2-oxazoline' }],
      ['phphox', 'Ph-PHOX|PhPHOX', '(S)-4-Phenyl-2-[2-(diphenylphosphino)phenyl]-2-oxazoline (Ph-PHOX)', `${PR2(1, Ph)}c1ccccc1C1=[N:2][C@@H](c2ccccc2)CO1`, { pc: '(S)-4-Phenyl-2-[2-(diphenylphosphino)phenyl]-2-oxazoline' }],
      ['quinap', 'QUINAP|Quinap', '1-(2-Diphenylphosphino-1-naphthyl)isoquinoline (QUINAP)', `${PR2(1, Ph)}c1ccc2ccccc2c1-c1[n:2]ccc2ccccc12`, { pc: 'QUINAP' }],
    ],
  },
  {
    id: 'phosphoramidites',
    name: 'Phosphoramidites',
    note: 'Monodentate BINOL- and spirobiindane-based ligands (Feringa, Zhou).',
    items: [
      ['monophos', 'MonoPhos', '(3,5-Dioxa-4-phosphacyclohepta[2,1-a:3,4-a′]dinaphthalen-4-yl)dimethylamine (MonoPhos)', '[P:1]1(N(C)C)Oc2ccc3ccccc3c2-c2c(O1)ccc1ccccc21', { pc: 'MonoPhos' }],
      ['pipphos', 'PipPhos', '1-(3,5-Dioxa-4-phosphacyclohepta[2,1-a:3,4-a′]dinaphthalen-4-yl)piperidine (PipPhos)', '[P:1]1(N3CCCCC3)Oc2ccc3ccccc3c2-c2c(O1)ccc1ccccc21', { pc: 'PipPhos' }],
      ['feringa', 'Feringa ligand|(S,R,R)-L', 'O,O′-(1,1′-Dinaphthyl-2,2′-diyl)-N,N′-bis[(R)-1-phenylethyl]phosphoramidite (Feringa ligand)', '[P:1]1(N([C@H](C)c3ccccc3)[C@H](C)c3ccccc3)Oc2ccc3ccccc3c2-c2c(O1)ccc1ccccc21', { pc: '(S,R,R)-(+)-(3,5-Dioxa-4-phosphacyclohepta[2,1-a:3,4-a\']dinaphthalen-4-yl)bis(1-phenylethyl)amine' }],
      ['siphos', 'SIPHOS|Siphos', 'Spirobiindane phosphoramidite with NMe2 (SIPHOS)', '[P:1]1(N(C)C)Oc2cccc3CCC4(CCc5cccc(O1)c54)c23', { pc: 'SIPHOS' }],
    ],
  },
  {
    id: 'nhc',
    name: 'N-Heterocyclic and other carbenes',
    note: 'Bonded through the carbene carbon; S- in front means the saturated (imidazolin-2-ylidene) ring.',
    items: [
      ['ime', 'IMe', '1,3-Dimethylimidazol-2-ylidene (IMe)', '[C:1]1N(C)C=CN1C', { pc: '1,3-Dimethylimidazol-2-ylidene' }],
      ['iipr', 'IiPr|I-iPr', '1,3-Diisopropylimidazol-2-ylidene (IiPr)', '[C:1]1N(C(C)C)C=CN1C(C)C', { pc: '1,3-Diisopropylimidazol-2-ylidene' }],
      ['itbu', 'ItBu|I-tBu', '1,3-Di-tert-butylimidazol-2-ylidene (ItBu)', '[C:1]1N(C(C)(C)C)C=CN1C(C)(C)C', { pc: '1,3-Di-tert-butylimidazol-2-ylidene' }],
      ['iad', 'IAd', '1,3-Bis(1-adamantyl)imidazol-2-ylidene (IAd)', `[C:1]1N(${Ad})C=CN1${Ad}`, { pc: '1,3-Bis(1-adamantyl)imidazol-2-ylidene' }],
      ['icy', 'ICy', '1,3-Dicyclohexylimidazol-2-ylidene (ICy)', `[C:1]1N(${Cy})C=CN1${Cy}`, { pc: '1,3-Dicyclohexylimidazol-2-ylidene' }],
      ['ixy', 'IXy', '1,3-Bis(2,6-dimethylphenyl)imidazol-2-ylidene (IXy)', '[C:1]1N(c2c(C)cccc2C)C=CN1c1c(C)cccc1C', { pc: '1,3-Bis(2,6-dimethylphenyl)imidazol-2-ylidene' }],
      ['imes', 'IMes', '1,3-Bis(2,4,6-trimethylphenyl)imidazol-2-ylidene (IMes)', `[C:1]1N(${Mes})C=CN1${Mes}`, { tpl: 'imes', pc: '1,3-Bis(2,4,6-trimethylphenyl)imidazol-2-ylidene', palette: true }],
      ['simes', 'SIMes', '1,3-Bis(2,4,6-trimethylphenyl)imidazolidin-2-ylidene (SIMes)', `[C:1]1N(${Mes})CCN1${Mes}`, { pc: '1,3-Bis(2,4,6-trimethylphenyl)imidazolidin-2-ylidene', palette: true }],
      ['ipr', 'IPr', '1,3-Bis(2,6-diisopropylphenyl)imidazol-2-ylidene (IPr)', `[C:1]1N(${Dipp})C=CN1${Dipp}`, { tpl: 'ipr', pc: '1,3-Bis(2,6-diisopropylphenyl)imidazol-2-ylidene', palette: true }],
      ['sipr', 'SIPr', '1,3-Bis(2,6-diisopropylphenyl)imidazolidin-2-ylidene (SIPr)', `[C:1]1N(${Dipp})CCN1${Dipp}`, { pc: '1,3-Bis(2,6-diisopropylphenyl)imidazolidin-2-ylidene', palette: true }],
      ['iprcl', 'IPrCl|IPr(Cl)', '4,5-Dichloro-1,3-bis(2,6-diisopropylphenyl)imidazol-2-ylidene (IPrCl)', `[C:1]1N(${Dipp})C(Cl)=C(Cl)N1${Dipp}`, { pc: '4,5-Dichloro-1,3-bis(2,6-diisopropylphenyl)imidazol-2-ylidene' }],
      ['ipent', 'IPent', '1,3-Bis(2,6-di(pentan-3-yl)phenyl)imidazol-2-ylidene (IPent)', '[C:1]1N(c2c(C(CC)CC)cccc2C(CC)CC)C=CN1c1c(C(CC)CC)cccc1C(CC)CC', { pc: '1,3-Bis[2,6-di(3-pentyl)phenyl]imidazol-2-ylidene' }],
      ['iprstar', 'IPr*', '1,3-Bis[2,6-bis(diphenylmethyl)-4-methylphenyl]imidazol-2-ylidene (IPr*)', '[C:1]1N(c2c(C(c3ccccc3)c3ccccc3)cc(C)cc2C(c2ccccc2)c2ccccc2)C=CN1c1c(C(c2ccccc2)c2ccccc2)cc(C)cc1C(c1ccccc1)c1ccccc1', { pc: '1,3-Bis[2,6-bis(diphenylmethyl)-4-methylphenyl]imidazol-2-ylidene' }],
      ['caac', 'CAAC|Me-CAAC|CAACMe', 'Cyclic (alkyl)(amino)carbene: 1-(2,6-diisopropylphenyl)-3,3,5,5-tetramethylpyrrolidin-2-ylidene', `[C:1]1N(${Dipp})C(C)(C)CC1(C)C`, { pc: 'none', check: 'free CAAC carbene; Bertrand, 2005' }],
      ['tpt', 'TPT|Enders carbene', '1,3,4-Triphenyl-4,5-dihydro-1H-1,2,4-triazol-5-ylidene (Enders carbene)', '[C:1]1N(c2ccccc2)N=C(c2ccccc2)N1c1ccccc1', { pc: '1,3,4-Triphenyl-4,5-dihydro-1H-1,2,4-triazol-5-ylidene' }],
    ],
  },
  {
    id: 'n-monodentate',
    name: 'Pyridines, amines, nitriles and isocyanides',
    note: 'Monodentate N- and C-donors.',
    items: [
      ['py', 'py|pyr', 'Pyridine', '[n:1]1ccccc1', { tpl: 'py', palette: true }],
      ['dmap', 'DMAP', '4-(Dimethylamino)pyridine', '[n:1]1ccc(N(C)C)cc1'],
      ['picoline', '2-pic|2-Mepy', '2-Methylpyridine (2-picoline)', '[n:1]1ccccc1C', { pc: '2-Picoline' }],
      ['lutidine', 'lut|2,6-lut', '2,6-Dimethylpyridine (2,6-lutidine)', '[n:1]1c(C)cccc1C', { pc: '2,6-Lutidine' }],
      ['tbupy', '4-tBupy|tBupy', '4-tert-Butylpyridine', '[n:1]1ccc(C(C)(C)C)cc1'],
      ['quinoline', 'quin', 'Quinoline', '[n:1]1cccc2ccccc12'],
      ['pyrazine', 'pyz', 'Pyrazine', '[n:1]1ccncc1', { note: 'Bridges two metals.' }],
      ['imidazole', 'ImH|HIm|imH', 'Imidazole', '[n:1]1cc[nH]c1'],
      ['nmi', 'NMI|N-MeIm|1-MeIm', '1-Methylimidazole', '[n:1]1ccn(C)c1'],
      ['pyrazole', 'Hpz|pzH', 'Pyrazole', '[n:1]1ccc[nH]1'],
      ['net3', 'NEt3|Et3N', 'Triethylamine', '[N:1](CC)(CC)CC'],
      ['quinuclidine', 'quinuclidine', 'Quinuclidine', '[N:1]12CCC(CC1)CC2'],
      ['dabco', 'DABCO', '1,4-Diazabicyclo[2.2.2]octane', '[N:1]12CCN(CC1)CC2'],
      ['mecn', 'MeCN|NCMe|CH3CN', 'Acetonitrile', '[N:1]#CC', { tpl: 'mecn', palette: true }],
      ['phcn', 'PhCN|NCPh', 'Benzonitrile', '[N:1]#Cc1ccccc1'],
      ['tbunc', 'CNtBu|tBuNC|t-BuNC', 'tert-Butyl isocyanide', '[C-:1]#[N+]C(C)(C)C'],
      ['cync', 'CNCy|CyNC', 'Cyclohexyl isocyanide', '[C-:1]#[N+]C1CCCCC1'],
      ['xylnc', 'CNXyl|XylNC|CNAr', '2,6-Dimethylphenyl isocyanide', '[C-:1]#[N+]c1c(C)cccc1C'],
    ],
  },
  {
    id: 'bipyridines',
    name: 'Bipyridines, phenanthrolines and terpyridines',
    note: 'Chelating diimines, the workhorses of Ni, Cu and photoredox catalysis.',
    items: [
      ['bpy', 'bpy|bipy', '2,2′-Bipyridine', '[n:1]1ccccc1-c1cccc[n:2]1', { tpl: 'bipy', palette: true }],
      ['dtbbpy', 'dtbbpy|dtbpy|dtbbpy', '4,4′-Di-tert-butyl-2,2′-bipyridine', '[n:1]1ccc(C(C)(C)C)cc1-c1cc(C(C)(C)C)cc[n:2]1', { palette: true }],
      ['dmbpy44', "4,4'-dmbpy|4,4′-Me2bpy|dmbpy", '4,4′-Dimethyl-2,2′-bipyridine', '[n:1]1ccc(C)cc1-c1cc(C)cc[n:2]1'],
      ['dmbpy55', "5,5'-dmbpy|5,5′-Me2bpy", '5,5′-Dimethyl-2,2′-bipyridine', '[n:1]1cc(C)ccc1-c1ccc(C)c[n:2]1'],
      ['dmbpy66', "6,6'-dmbpy|6,6′-Me2bpy", '6,6′-Dimethyl-2,2′-bipyridine', '[n:1]1c(C)cccc1-c1cccc(C)[n:2]1'],
      ['dmeobpy', 'dMeObpy|dmobpy|4,4′-(MeO)2bpy', '4,4′-Dimethoxy-2,2′-bipyridine', '[n:1]1ccc(OC)cc1-c1cc(OC)cc[n:2]1'],
      ['dcf3bpy', 'dCF3bpy|4,4′-(CF3)2bpy', '4,4′-Bis(trifluoromethyl)-2,2′-bipyridine', '[n:1]1ccc(C(F)(F)F)cc1-c1cc(C(F)(F)F)cc[n:2]1'],
      ['dcbpy', 'dcbpy|H2dcbpy', '2,2′-Bipyridine-4,4′-dicarboxylic acid', '[n:1]1ccc(C(=O)O)cc1-c1cc(C(=O)O)cc[n:2]1'],
      ['biq', 'biq', '2,2′-Biquinoline', '[n:1]1c(ccc2ccccc12)-c1ccc2ccccc2[n:2]1'],
      ['bpm', 'bpm|bipym', '2,2′-Bipyrimidine', '[n:1]1cccnc1-c1nccc[n:2]1'],
      ['phen', 'phen', '1,10-Phenanthroline', '[n:1]1cccc2ccc3ccc[n:2]c3c12', { tpl: 'phen', palette: true }],
      ['neocuproine', 'neocuproine|dmphen|2,9-Me2phen|dmp', '2,9-Dimethyl-1,10-phenanthroline (neocuproine)', '[n:1]1c(C)ccc2ccc3ccc(C)[n:2]c3c12', { pc: 'Neocuproine' }],
      ['bphen', 'BPhen|bphen|bathophen', '4,7-Diphenyl-1,10-phenanthroline (bathophenanthroline)', '[n:1]1ccc(-c4ccccc4)c2ccc3c(-c4ccccc4)cc[n:2]c3c12', { pc: 'Bathophenanthroline' }],
      ['bcp', 'BCP|bathocuproine', '2,9-Dimethyl-4,7-diphenyl-1,10-phenanthroline (bathocuproine)', '[n:1]1c(C)cc(-c4ccccc4)c2ccc3c(-c4ccccc4)cc(C)[n:2]c3c12', { pc: 'Bathocuproine' }],
      ['me4phen', 'Me4phen|tmphen|3,4,7,8-Me4phen', '3,4,7,8-Tetramethyl-1,10-phenanthroline', '[n:1]1cc(C)c(C)c2ccc3c(C)c(C)c[n:2]c3c12'],
      ['dppz', 'dppz', 'Dipyrido[3,2-a:2′,3′-c]phenazine', '[n:1]1cccc2c1-c1[n:2]cccc1-c1nc3ccccc3nc12', { pc: 'Dipyrido[3,2-a:2\',3\'-c]phenazine' }],
      ['terpy', 'terpy|tpy|terpyridine', '2,2′:6′,2′′-Terpyridine', '[n:1]1ccccc1-c1cccc(-c2cccc[n:3]2)[n:2]1', { pc: '2,2\':6\',2\'\'-Terpyridine' }],
      ['tbu3tpy', 'tBu3tpy|ttbtpy', '4,4′,4′′-Tri-tert-butyl-2,2′:6′,2′′-terpyridine', '[n:1]1ccc(C(C)(C)C)cc1-c1cc(C(C)(C)C)cc(-c2cc(C(C)(C)C)cc[n:3]2)[n:2]1', { pc: '4,4\',4\'\'-Tri-tert-butyl-2,2\':6\',2\'\'-terpyridine' }],
    ],
  },
  {
    id: 'amines',
    name: 'Diamines, polyamines and aza-macrocycles',
    note: 'Chelating sp³ N-donors, chiral diamines for transfer hydrogenation, and tripodal and macrocyclic amines.',
    items: [
      ['en', 'en', 'Ethylenediamine', '[NH2:1]CC[NH2:2]', { tpl: 'en', palette: true }],
      ['tmeda', 'TMEDA|tmeda', 'N,N,N′,N′-Tetramethylethylenediamine', '[N:1](C)(C)CC[N:2](C)C', { tpl: 'tmeda', palette: true }],
      ['dmeda', 'DMEDA|dmeda', 'N,N′-Dimethylethylenediamine', '[NH:1](C)CC[NH:2]C'],
      ['dmcda', 'DMCDA|DMCHDA', '(1R,2R)-N,N′-Dimethylcyclohexane-1,2-diamine', '[NH:1](C)[C@@H]1CCCC[C@H]1[NH:2]C', { pc: 'trans-N,N\'-Dimethylcyclohexane-1,2-diamine', note: 'Buchwald\'s ligand for Cu-catalyzed couplings.' }],
      ['dach', 'DACH|dach|chxn', '(1R,2R)-1,2-Diaminocyclohexane', '[NH2:1][C@@H]1CCCC[C@H]1[NH2:2]', { pc: 'trans-1,2-Diaminocyclohexane' }],
      ['dpen', 'DPEN|dpen', '(1R,2R)-1,2-Diphenylethylenediamine', '[NH2:1][C@H](c1ccccc1)[C@@H](c1ccccc1)[NH2:2]', { pc: '(1R,2R)-1,2-Diphenylethylenediamine' }],
      ['tsdpen', 'TsDPEN|Ts-DPEN', '(1R,2R)-N-(p-Toluenesulfonyl)-1,2-diphenylethylenediamine', '[NH2:1][C@H](c1ccccc1)[C@@H](c1ccccc1)[NH:51]S(=O)(=O)c1ccc(C)cc1', { pc: '(1R,2R)-(-)-N-(4-Toluenesulfonyl)-1,2-diphenylethylenediamine', note: 'Noyori\'s transfer-hydrogenation ligand: NH₂ gives a lone pair, NTs is an amide (X).' }],
      ['binam', 'BINAM', '1,1′-Binaphthyl-2,2′-diamine', '[NH2:1]c1ccc2ccccc2c1-c1c([NH2:2])ccc2ccccc12', { pc: '1,1\'-Binaphthyl-2,2\'-diamine' }],
      ['sparteine', 'sparteine|(−)-sparteine', '(−)-Sparteine', 'C1CC[N:1]2C[C@@H]3C[C@H]([C@H]2C1)C[N:2]1CCCC[C@@H]31', { pc: 'Sparteine' , free: true }],
      ['dien', 'dien', 'Diethylenetriamine', '[NH2:1]CC[NH:2]CC[NH2:3]'],
      ['pmdeta', 'PMDETA|pmdta', 'N,N,N′,N′′,N′′-Pentamethyldiethylenetriamine', '[N:1](C)(C)CC[N:2](C)CC[N:3](C)C'],
      ['tren', 'tren|TREN', 'Tris(2-aminoethyl)amine', '[NH2:1]CC[N:4](CC[NH2:2])CC[NH2:3]', { tpl: 'tren' }],
      ['me6tren', 'Me6TREN|Me6tren', 'Tris[2-(dimethylamino)ethyl]amine', '[N:1](C)(C)CC[N:4](CC[N:2](C)C)CC[N:3](C)C', { tpl: 'me6tren' }],
      ['tpa', 'TPA|tpa|TPMA', 'Tris(2-pyridylmethyl)amine', '[n:1]1ccccc1C[N:4](Cc1cccc[n:2]1)Cc1cccc[n:3]1'],
      ['bpmen', 'BPMEN|bpmen', 'N,N′-Dimethyl-N,N′-bis(2-pyridylmethyl)ethane-1,2-diamine', '[n:1]1ccccc1C[N:2](C)CC[N:3](C)Cc1cccc[n:4]1', { pc: 'none', check: 'Que\'s tetradentate N4 ligand' }],
      ['pdp', 'PDP|pdp', '(S,S)-N,N′-Bis(2-pyridylmethyl)-2,2′-bipyrrolidine (PDP)', '[n:1]1ccccc1C[N:2]1CCC[C@H]1[C@@H]1CCC[N:3]1Cc1cccc[n:4]1', { pc: 'none', check: 'White\'s Fe(PDP) C–H oxidation ligand' }],
      ['tacn', 'TACN|tacn', '1,4,7-Triazacyclononane', '[NH:1]1CC[NH:2]CC[NH:3]CC1', { free: true }],
      ['me3tacn', 'Me3TACN|Me3tacn', '1,4,7-Trimethyl-1,4,7-triazacyclononane', '[N:1]1(C)CC[N:2](C)CC[N:3](C)CC1', { free: true }],
      ['cyclen', 'cyclen', '1,4,7,10-Tetraazacyclododecane (cyclen)', '[NH:1]1CC[NH:2]CC[NH:3]CC[NH:4]CC1', { pc: 'Cyclen', free: true }],
      ['cyclam', 'cyclam', '1,4,8,11-Tetraazacyclotetradecane (cyclam)', '[NH:1]1CC[NH:2]CCC[NH:3]CC[NH:4]CCC1', { pc: 'Cyclam' , free: true }],
    ],
  },
  {
    id: 'oxazolines',
    name: 'Bis(oxazolines) and pyridine-oxazolines',
    note: 'C₂-symmetric BOX and PyBOX ligands for Cu, Zn, Fe and Ni; one enantiomer is drawn.',
    items: [
      ['phbox', 'Ph-BOX|PhBOX', '2,2′-Isopropylidenebis[(4S)-4-phenyl-2-oxazoline] (Ph-BOX)', 'CC(C)(C1=[N:1][C@@H](c2ccccc2)CO1)C1=[N:2][C@@H](c2ccccc2)CO1', { pc: '2,2\'-Isopropylidenebis[(4S)-4-phenyl-2-oxazoline]', palette: true }],
      ['tbubox', 'tBu-BOX|t-Bu-BOX|tBuBOX', '2,2′-Isopropylidenebis[(4S)-4-tert-butyl-2-oxazoline] (tBu-BOX)', 'CC(C)(C1=[N:1][C@@H](C(C)(C)C)CO1)C1=[N:2][C@@H](C(C)(C)C)CO1', { pc: '2,2\'-Isopropylidenebis[(4S)-4-tert-butyl-2-oxazoline]' }],
      ['iprbox', 'iPr-BOX|i-Pr-BOX|iPrBOX', '2,2′-Isopropylidenebis[(4S)-4-isopropyl-2-oxazoline] (iPr-BOX)', 'CC(C)(C1=[N:1][C@@H](C(C)C)CO1)C1=[N:2][C@@H](C(C)C)CO1', { pc: '2,2\'-Isopropylidenebis[(4S)-4-isopropyl-2-oxazoline]' }],
      ['bnbox', 'Bn-BOX|BnBOX', '2,2′-Isopropylidenebis[(4S)-4-benzyl-2-oxazoline] (Bn-BOX)', 'CC(C)(C1=[N:1][C@@H](Cc2ccccc2)CO1)C1=[N:2][C@@H](Cc2ccccc2)CO1', { pc: '2,2\'-Isopropylidenebis[(4S)-4-benzyl-2-oxazoline]' }],
      ['indabox', 'Inda-BOX|IndaBOX|inda(box)', '2,2′-Methylenebis[(3aR,8aS)-3a,8a-dihydro-8H-indeno[1,2-d]oxazole] (Inda-BOX)', 'C(C1=[N:1][C@@H]2c3ccccc3C[C@@H]2O1)C1=[N:2][C@@H]2c3ccccc3C[C@@H]2O1', { pc: '2,2\'-Methylenebis[(3aR,8aS)-3a,8a-dihydro-8H-indeno[1,2-d]oxazole]' }],
      ['iprpybox', 'iPr-PyBOX|iPr-Pybox|iPrPyBOX', '2,6-Bis[(4S)-4-isopropyl-2-oxazolinyl]pyridine (iPr-PyBOX)', 'CC(C)[C@H]1COC(=[N:1]1)c1cccc(C2=[N:3][C@@H](C(C)C)CO2)[n:2]1', { pc: '2,6-Bis[(4S)-4-isopropyl-2-oxazolinyl]pyridine' }],
      ['phpybox', 'Ph-PyBOX|Ph-Pybox|PhPyBOX', '2,6-Bis[(4S)-4-phenyl-2-oxazolinyl]pyridine (Ph-PyBOX)', 'c1ccc(cc1)[C@H]1COC(=[N:1]1)c1cccc(C2=[N:3][C@@H](c3ccccc3)CO2)[n:2]1', { pc: '2,6-Bis[(4S)-4-phenyl-2-oxazolinyl]pyridine' }],
      ['tbupyox', 'tBu-PyOx|t-Bu-PyOx|tBuPyOx', '(S)-4-tert-Butyl-2-(2-pyridyl)oxazoline (tBu-PyOx)', 'CC(C)(C)[C@H]1COC(=[N:1]1)c1cccc[n:2]1', { pc: '(S)-4-tert-Butyl-2-(2-pyridyl)oxazoline' }],
    ],
  },
  {
    id: 'imines',
    name: 'Imines, salens and cyclometallating ligands',
    note: 'Diimines, β-diketiminates, salens, porphyrins and C^N ligands for Ir and Pt emitters.',
    items: [
      ['dippdab', 'Dipp-DAB|DAB|DippDAB', 'N,N′-Bis(2,6-diisopropylphenyl)-1,4-diaza-1,3-butadiene', `C(=[N:1]${Dipp})C=[N:2]${Dipp}`, { pc: 'Glyoxal-bis(2,6-diisopropylphenyl)imine' }],
      ['dippbian', 'Dipp-BIAN|BIAN|dpp-bian', 'Bis(2,6-diisopropylphenylimino)acenaphthene (Dipp-BIAN)', `C1(=[N:1]${Dipp})c2cccc3cccc(c23)C1=[N:2]${Dipp}`, { pc: 'none', check: 'acenaphthenequinone bis(2,6-diisopropylphenyl)imine' }],
      ['pdi', 'PDI|Dipp-PDI|iPrPDI', '2,6-Bis[1-(2,6-diisopropylphenylimino)ethyl]pyridine (Dipp-PDI)', `CC(=[N:1]${Dipp})c1cccc(C(C)=[N:3]${Dipp})[n:2]1`, { pc: '2,6-Bis[1-(2,6-diisopropylphenylimino)ethyl]pyridine', note: 'Redox non-innocent pincer for Fe and Co (Brookhart, Gibson, Chirik).' }],
      ['nacnac', 'nacnac|BDI|Dipp-nacnac', 'β-Diketiminate: N,N′-bis(2,6-diisopropylphenyl)pentane-2,4-diiminate (Dipp-nacnac)', `CC(=[N:1]${Dipp})C=C(C)[NH:51]${Dipp}`, { pc: 'none', check: 'drawn as the enamine-imine tautomer' }],
      ['salen', 'salen|H2salen', 'N,N′-Bis(salicylidene)ethylenediamine (salen)', '[OH:51]c1ccccc1C=[N:1]CC[N:2]=Cc1ccccc1[OH:52]', { pc: 'N,N\'-Bis(salicylidene)ethylenediamine' }],
      ['jacobsen', 'Jacobsen salen|(R,R)-salen', '(R,R)-N,N′-Bis(3,5-di-tert-butylsalicylidene)-1,2-cyclohexanediamine (Jacobsen\'s ligand)', '[OH:51]c1c(C(C)(C)C)cc(C(C)(C)C)cc1C=[N:1][C@@H]1CCCC[C@H]1[N:2]=Cc1cc(C(C)(C)C)cc(C(C)(C)C)c1[OH:52]', { pc: '(R,R)-(-)-N,N\'-Bis(3,5-di-tert-butylsalicylidene)-1,2-cyclohexanediamine', palette: true }],
      ['salophen', 'salophen|salphen', 'N,N′-Bis(salicylidene)-1,2-phenylenediamine (salophen)', '[OH:51]c1ccccc1C=[N:1]c1ccccc1[N:2]=Cc1ccccc1[OH:52]', { pc: 'N,N\'-Bis(salicylidene)-1,2-phenylenediamine' }],
      ['ppy', 'ppy', '2-Phenylpyridine (C^N)', '[n:1]1ccccc1-c1[cH:51]cccc1', { pc: '2-Phenylpyridine', palette: true, note: 'Cyclometallated at the phenyl ring\'s ortho carbon, as in Ir(ppy)₃.' }],
      ['dfcf3ppy', 'dF(CF3)ppy|dFCF3ppy', '2-(2,4-Difluorophenyl)-5-(trifluoromethyl)pyridine (C^N)', '[n:1]1cc(C(F)(F)F)ccc1-c1c(F)cc(F)c[cH:51]1', { pc: '2-(2,4-Difluorophenyl)-5-(trifluoromethyl)pyridine', note: 'As in [Ir(dF(CF3)ppy)₂(dtbbpy)]PF₆.' }],
      ['dfppy', 'dFppy|Fppy', '2-(2,4-Difluorophenyl)pyridine (C^N)', '[n:1]1ccccc1-c1c(F)cc(F)c[cH:51]1', { pc: '2-(2,4-Difluorophenyl)pyridine' }],
      ['piq', 'piq', '1-Phenylisoquinoline (C^N)', '[n:1]1ccc2ccccc2c1-c1[cH:51]cccc1', { pc: '1-Phenylisoquinoline' }],
      ['bzq', 'bzq|bhq', 'Benzo[h]quinoline (C^N)', '[n:1]1cccc2ccc3ccc[cH:51]c3c12', { pc: 'Benzo[h]quinoline' }],
      ['pic', 'pic', 'Picolinate (pyridine-2-carboxylate)', '[n:1]1ccccc1C(=O)[OH:51]', { pc: 'Picolinic acid' }],
      ['hq', '8-HQ|hq|oxine', 'Quinolin-8-olate (oxinate)', '[OH:51]c1cccc2ccc[n:1]c12', { pc: '8-Hydroxyquinoline', note: 'As in Alq₃.' }],
      ['tp', 'Tp', 'Hydrotris(pyrazol-1-yl)borate (Tp)', '[BH-](n1ccc[n:1]1)(n1ccc[n:2]1)n1ccc[n:3]1', { pc: 'none', check: 'Trofimenko\'s scorpionate, as its anion', lx: { l: 2, x: 1 } }],
      ['tpstar', 'Tp*', 'Hydrotris(3,5-dimethylpyrazol-1-yl)borate (Tp*)', '[BH-](n1c(C)cc(C)[n:1]1)(n1c(C)cc(C)[n:2]1)n1c(C)cc(C)[n:3]1', { pc: 'none', check: 'Trofimenko\'s scorpionate, as its anion', lx: { l: 2, x: 1 } }],
      ['tpp', 'TPP|H2TPP', '5,10,15,20-Tetraphenylporphyrin', 'c1ccc(cc1)-c1c2ccc([n:1]2)c(-c2ccccc2)c2ccc([nH:51]2)c(-c2ccccc2)c2ccc([n:2]2)c(-c2ccccc2)c2ccc1[nH:52]2', { pc: 'Tetraphenylporphyrin' }],
      ['oep', 'OEP|H2OEP', '2,3,7,8,12,13,17,18-Octaethylporphyrin', 'CCC1=C(C2=CC3=[N:1]C(=CC4=[N:2]C(=CC5=C(C(=C([NH:51]5)C=C1[NH:52]2)CC)CC)C(=C4CC)CC)C(=C3CC)CC)CC', { pc: 'Octaethylporphyrin' }],
      ['pc', 'Pc|H2Pc', 'Phthalocyanine', 'c1ccc2c(c1)c1nc3[nH:51]c(nc4[n:1]c(nc5[nH:52]c(nc2[n:2]1)c1ccccc51)c1ccccc41)c1ccccc31', { pc: 'Phthalocyanine' }],
    ],
  },
  {
    id: 'pincers',
    name: 'Pincers',
    note: 'Tridentate ligands that hold the metal in a plane: PNP, PCP, POCOP, NCN, PNN and MACHO.',
    items: [
      ['tbupnp', 'tBu-PNP|PNP|t-Bu-PNP', '2,6-Bis(di-tert-butylphosphinomethyl)pyridine (tBu-PNP)', `${PR2(1, tBu)}Cc1cccc(C${PR2end(3, tBu)})[n:2]1`, { pc: '2,6-Bis(di-tert-butylphosphinomethyl)pyridine', palette: true }],
      ['iprpnp', 'iPr-PNP|i-Pr-PNP', '2,6-Bis(diisopropylphosphinomethyl)pyridine (iPr-PNP)', `${PR2(1, iPr)}Cc1cccc(C${PR2end(3, iPr)})[n:2]1`, { pc: '2,6-Bis(diisopropylphosphinomethyl)pyridine' }],
      ['tbupcp', 'tBu-PCP|PCP|t-Bu-PCP', '2,6-Bis(di-tert-butylphosphinomethyl)phenyl (tBu-PCP)', `${PR2(1, tBu)}Cc1cccc(C${PR2end(3, tBu)})[cH:51]1`, { pc: '1,3-Bis(di-tert-butylphosphinomethyl)benzene' }],
      ['tbupocop', 'tBu-POCOP|POCOP|t-Bu-POCOP', '2,6-Bis(di-tert-butylphosphinito)phenyl (tBu-POCOP)', `${PR2(1, tBu)}Oc1cccc(O${PR2end(3, tBu)})[cH:51]1`, { pc: '1,3-Bis(di-tert-butylphosphinito)benzene' }],
      ['iprpocop', 'iPr-POCOP|i-Pr-POCOP', '2,6-Bis(diisopropylphosphinito)phenyl (iPr-POCOP)', `${PR2(1, iPr)}Oc1cccc(O${PR2end(3, iPr)})[cH:51]1`, { pc: '1,3-Bis(diisopropylphosphinito)benzene' }],
      ['ncn', 'NCN', '2,6-Bis(dimethylaminomethyl)phenyl (NCN)', '[N:1](C)(C)Cc1cccc(C[N:3](C)C)[cH:51]1', { pc: '1,3-Bis(dimethylaminomethyl)benzene' }],
      ['pnn', 'PNN|tBu-PNN', '2-(Di-tert-butylphosphinomethyl)-6-(diethylaminomethyl)pyridine (Milstein PNN)', `${PR2(1, tBu)}Cc1cccc(C[N:3](CC)CC)[n:2]1`, { pc: '2-(Di-tert-butylphosphinomethyl)-6-(diethylaminomethyl)pyridine' }],
      ['phmacho', 'MACHO|Ph-MACHO|PNHP', 'Bis[2-(diphenylphosphino)ethyl]amine (Ph-MACHO)', `${PR2(1, Ph)}CC[NH:2]CC${PR2end(3, Ph)}`, { pc: 'Bis[2-(diphenylphosphino)ethyl]amine' }],
      ['iprmacho', 'iPr-MACHO|iPr-PNHP', 'Bis[2-(diisopropylphosphino)ethyl]amine (iPr-MACHO)', `${PR2(1, iPr)}CC[NH:2]CC${PR2end(3, iPr)}`, { pc: 'Bis[2-(diisopropylphosphino)ethyl]amine' }],
    ],
  },
  {
    id: 'o-donors',
    name: 'O-donors: diketonates, carboxylates, diolates',
    note: 'Anionic O-ligands (X-type) and the chiral diols used as ligands.',
    items: [
      ['acac', 'acac', 'Acetylacetonate (pentane-2,4-dionate)', 'CC([OH:51])=CC(C)=[O:1]', { tpl: 'acac', pc: 'Acetylacetone', check: 'drawn as the enol, the form that binds', palette: true }],
      ['hfac', 'hfac|hfacac', 'Hexafluoroacetylacetonate', 'FC(F)(F)C([OH:51])=CC(=[O:1])C(F)(F)F', { pc: 'Hexafluoroacetylacetone', check: 'drawn as the enol, the form that binds' }],
      ['tfac', 'tfac|tfacac', 'Trifluoroacetylacetonate', 'CC([OH:51])=CC(=[O:1])C(F)(F)F', { pc: 'Trifluoroacetylacetone', check: 'drawn as the enol, the form that binds' }],
      ['tmhd', 'tmhd|thd|dpm', '2,2,6,6-Tetramethylheptane-3,5-dionate (dipivaloylmethanate)', 'CC(C)(C)C([OH:51])=CC(=[O:1])C(C)(C)C', { pc: '2,2,6,6-Tetramethyl-3,5-heptanedione', check: 'drawn as the enol, the form that binds' }],
      ['dbm', 'dbm', 'Dibenzoylmethanate', 'c1ccccc1C([OH:51])=CC(=[O:1])c1ccccc1', { pc: 'Dibenzoylmethane', check: 'drawn as the enol, the form that binds' }],
      ['oac', 'OAc|AcO', 'Acetate', 'CC(=O)[OH:51]', { pc: 'Acetic acid' }],
      ['opiv', 'OPiv|PivO', 'Pivalate', 'CC(C)(C)C(=O)[OH:51]', { pc: 'Pivalic acid' }],
      ['tfa', 'TFA|OTFA|O2CCF3', 'Trifluoroacetate', 'FC(F)(F)C(=O)[OH:51]', { pc: 'Trifluoroacetic acid' }],
      ['obz', 'OBz|BzO', 'Benzoate', 'c1ccccc1C(=O)[OH:51]', { pc: 'Benzoic acid' }],
      ['otf', 'OTf|TfO', 'Triflate (trifluoromethanesulfonate)', 'FC(F)(F)S(=O)(=O)[OH:51]', { pc: 'Trifluoromethanesulfonic acid' }],
      ['ots', 'OTs|TsO', 'Tosylate (4-toluenesulfonate)', 'Cc1ccc(cc1)S(=O)(=O)[OH:51]', { pc: 'p-Toluenesulfonic acid' }],
      ['esp', 'esp', 'α,α,α′,α′-Tetramethyl-1,3-benzenedipropanoate (esp)', '[OH:51]C(=O)C(C)(C)Cc1cccc(CC(C)(C)C(=O)[OH:52])c1', { pc: 'none', check: 'Du Bois\'s dicarboxylate for Rh₂(esp)₂', note: 'Bridges two Rh atoms in Rh₂(esp)₂.' }],
      ['ox', 'ox', 'Oxalate', '[OH:51]C(=O)C(=O)[OH:52]', { pc: 'Oxalic acid' }],
      ['cat', 'cat', 'Catecholate (benzene-1,2-diolate)', '[OH:51]c1ccccc1[OH:52]', { pc: 'Catechol' }],
      ['pin', 'pin', 'Pinacolate (2,3-dimethylbutane-2,3-diolate)', '[OH:51]C(C)(C)C(C)(C)[OH:52]', { pc: 'Pinacol' }],
      ['binol', 'BINOL|binol', '1,1′-Bi-2-naphthol (BINOL)', '[OH:51]c1ccc2ccccc2c1-c1c([OH:52])ccc2ccccc12', { pc: '1,1\'-Bi-2-naphthol' }],
      ['h8binol', 'H8-BINOL', '5,5′,6,6′,7,7′,8,8′-Octahydro-1,1′-bi-2-naphthol (H8-BINOL)', '[OH:51]c1ccc2CCCCc2c1-c1c([OH:52])ccc2CCCCc12', { pc: '5,5\',6,6\',7,7\',8,8\'-Octahydro-1,1\'-bi-2-naphthol' }],
      ['vanol', 'VANOL', '3,3′-Diphenyl-2,2′-bi-1-naphthol (VANOL)', '[OH:51]c1c(-c3c(-c4ccccc4)cc4ccccc4c3[OH:52])c(-c2ccccc2)cc2ccccc12', { pc: 'VANOL', short: ['Ph'] }],
      ['taddol', 'TADDOL', '(4R,5R)-2,2-Dimethyl-α,α,α′,α′-tetraphenyl-1,3-dioxolane-4,5-dimethanol (TADDOL)', '[OH:51]C(c1ccccc1)(c1ccccc1)[C@@H]1OC(C)(C)O[C@H]1C([OH:52])(c1ccccc1)c1ccccc1', { pc: 'TADDOL' }],
    ],
  },
  {
    id: 'o-neutral',
    name: 'Solvents, oxides and crown ethers',
    note: 'Neutral O-donors (L-type): coordinating solvents, phosphine oxides and the crowns and cryptands that hold alkali metals.',
    items: [
      ['thf', 'THF|thf', 'Tetrahydrofuran', '[O:1]1CCCC1'],
      ['et2o', 'Et2O|OEt2', 'Diethyl ether', '[O:1](CC)CC'],
      ['dme', 'DME|dme', '1,2-Dimethoxyethane', '[O:1](C)CC[O:2]C', { pc: '1,2-Dimethoxyethane' }],
      ['diglyme', 'diglyme', 'Bis(2-methoxyethyl) ether (diglyme)', '[O:1](C)CC[O:2]CC[O:3]C', { pc: 'Diglyme' }],
      ['dioxane', 'dioxane|1,4-dioxane', '1,4-Dioxane', '[O:1]1CCOCC1', { note: 'Often bridges two metals.' }],
      ['dmso', 'DMSO|dmso', 'Dimethyl sulfoxide (O-bound)', '[O:1]=S(C)C', { pc: 'Dimethyl sulfoxide', note: 'Hard metals take DMSO through O; Ru, Pd and Pt often through S.' }],
      ['dmf', 'DMF|dmf', 'N,N-Dimethylformamide', '[O:1]=CN(C)C'],
      ['dma', 'DMA|DMAc', 'N,N-Dimethylacetamide', '[O:1]=C(C)N(C)C'],
      ['nmp', 'NMP', 'N-Methyl-2-pyrrolidone', '[O:1]=C1CCCN1C'],
      ['hmpa', 'HMPA', 'Hexamethylphosphoramide', '[O:1]=P(N(C)C)(N(C)C)N(C)C'],
      ['dmpu', 'DMPU', '1,3-Dimethyl-3,4,5,6-tetrahydro-2(1H)-pyrimidinone', '[O:1]=C1N(C)CCCN1C', { pc: 'DMPU' }],
      ['tppo', 'TPPO|OPPh3|Ph3PO', 'Triphenylphosphine oxide', '[O:1]=P(c1ccccc1)(c1ccccc1)c1ccccc1'],
      ['topo', 'TOPO|OPOct3', 'Trioctylphosphine oxide', '[O:1]=P(CCCCCCCC)(CCCCCCCC)CCCCCCCC'],
      ['12c4', '12-crown-4|12-C-4', '12-Crown-4', '[O:1]1CC[O:2]CC[O:3]CC[O:4]CC1', { free: true }],
      ['15c5', '15-crown-5|15-C-5', '15-Crown-5', '[O:1]1CC[O:2]CC[O:3]CC[O:4]CC[O:5]CC1', { free: true }],
      ['18c6', '18-crown-6|18-C-6', '18-Crown-6', '[O:1]1CC[O:2]CC[O:3]CC[O:4]CC[O:5]CC[O:6]CC1', { free: true }],
      ['db18c6', 'DB18C6|dibenzo-18-crown-6', 'Dibenzo-18-crown-6', '[O:1]1CC[O:2]c2ccccc2[O:3]CC[O:4]CC[O:5]c2ccccc2[O:6]CC1', { free: true }],
      ['crypt222', '2.2.2-cryptand|[2.2.2]cryptand|crypt-222', '[2.2.2]Cryptand (4,7,13,16,21,24-hexaoxa-1,10-diazabicyclo[8.8.8]hexacosane)', '[N:1]12CC[O:3]CC[O:4]CC[N:2](CC[O:5]CC[O:6]CC1)CC[O:7]CC[O:8]CC2', { pc: 'Cryptand 222', free: true }],
    ],
  },
  {
    id: 's-and-misc',
    name: 'S-donors and amides',
    note: 'Thioethers, dithiocarbamates and the silylamide.',
    items: [
      ['sme2', 'SMe2|Me2S|DMS', 'Dimethyl sulfide', '[S:1](C)C'],
      ['tht', 'THT|tht', 'Tetrahydrothiophene', '[S:1]1CCCC1'],
      ['dmso-s', 'DMSO-κS|S-DMSO', 'Dimethyl sulfoxide (S-bound)', '[S:1](=O)(C)C', { pc: 'Dimethyl sulfoxide' }],
      ['dtc', 'dtc|Et2dtc|S2CNEt2', 'N,N-Diethyldithiocarbamate', 'CCN(CC)C(=[S:1])[SH:51]', { pc: 'Diethyldithiocarbamic acid' }],
      ['hmds', 'HMDS|hmds|N(SiMe3)2|N(TMS)2', 'Bis(trimethylsilyl)amide (hexamethyldisilazide)', '[NH:51]([Si](C)(C)C)[Si](C)(C)C', { pc: 'Hexamethyldisilazane' }],
    ],
  },
  {
    id: 'pi-ligands',
    name: 'π-Ligands and carbonyl',
    note: 'Cyclopentadienyls, arenes, dienes and allyls, drawn in perspective on the metal.',
    items: [
      ['co', 'CO', 'Carbonyl (carbon monoxide)', '[C-:1]#[O+]', { tpl: 'co', pc: 'Carbon monoxide', palette: true }],
      ['cp', 'Cp', 'η⁵-Cyclopentadienyl', '[CH-:51]1C=CC=C1', { tpl: 'cp', pc: 'Cyclopentadienide', lx: { l: 2, x: 1 }, hapto: 5, palette: true }],
      ['cpme', 'Cp′|CpMe|MeCp', 'η⁵-Methylcyclopentadienyl', 'C[C-:51]1C=CC=C1', { tpl: 'cpme', pc: 'none', check: 'methylcyclopentadienide', lx: { l: 2, x: 1 }, hapto: 5 }],
      ['cpstar', 'Cp*', 'η⁵-Pentamethylcyclopentadienyl', 'C[C-:51]1C(C)=C(C)C(C)=C1C', { tpl: 'cpstar', pc: 'none', check: 'pentamethylcyclopentadienide', lx: { l: 2, x: 1 }, hapto: 5, palette: true }],
      ['indenyl', 'Ind', 'η⁵-Indenyl', '[CH-:51]1C=Cc2ccccc12', { tpl: 'indenyl', pc: 'none', check: 'indenide', lx: { l: 2, x: 1 }, hapto: 5 }],
      ['benzene', 'C6H6', 'η⁶-Benzene', '[cH:1]1ccccc1', { tpl: 'benzene', pc: 'Benzene', lx: { l: 3, x: 0 }, hapto: 6, palette: true }],
      ['mesitylene', 'C6H3Me3|mes', 'η⁶-Mesitylene', '[cH:1]1c(C)cc(C)cc1C', { tpl: 'mesitylene', pc: 'Mesitylene', lx: { l: 3, x: 0 }, hapto: 6 }],
      ['c6me6', 'C6Me6|HMB', 'η⁶-Hexamethylbenzene', '[c:1]1(C)c(C)c(C)c(C)c(C)c1C', { tpl: 'c6me6', pc: 'Hexamethylbenzene', lx: { l: 3, x: 0 }, hapto: 6 }],
      ['cymene', 'p-cymene|cymene', 'η⁶-p-Cymene', '[cH:1]1cc(C(C)C)ccc1C', { tpl: 'cymene', pc: 'p-Cymene', lx: { l: 3, x: 0 }, hapto: 6, palette: true }],
      ['cod', 'COD|cod', 'η⁴-1,5-Cyclooctadiene', '[CH:1]1=CCCC=CCC1', { tpl: 'cod', pc: '1,5-Cyclooctadiene', lx: { l: 2, x: 0 }, palette: true }],
      ['nbd', 'NBD|nbd', 'η⁴-Norbornadiene', '[CH:1]1=CC2C=CC1C2', { tpl: 'nbd', pc: 'Norbornadiene', lx: { l: 2, x: 0 } }],
      ['butadiene', 'C4H6|bd', 'η⁴-1,3-Butadiene', '[CH2:1]=CC=C', { tpl: 'butadiene', pc: '1,3-Butadiene', lx: { l: 2, x: 0 }, hapto: 4 }],
      ['ethylene', 'C2H4', 'η²-Ethylene', '[CH2:1]=C', { tpl: 'ethylene', pc: 'Ethylene', lx: { l: 1, x: 0 }, hapto: 2 }],
      ['allyl', 'allyl|C3H5', 'η³-Allyl', '[CH2:51]=CC', { tpl: 'allyl', pc: 'Propene', check: 'propene less a hydrogen', lx: { l: 1, x: 1 }, hapto: 3 }],
      ['methallyl', 'methallyl|2-Me-allyl', 'η³-2-Methylallyl', '[CH2:51]=C(C)C', { tpl: 'methallyl', pc: 'Isobutylene', check: 'isobutylene less a hydrogen', lx: { l: 1, x: 1 }, hapto: 3 }],
      ['crotyl', 'crotyl', 'η³-Crotyl (but-2-enyl)', '[CH2:51]C=CC', { tpl: 'crotyl', pc: '2-Butene', check: 'but-2-ene less a hydrogen', lx: { l: 1, x: 1 }, hapto: 3 }],
      ['cinnamyl', 'cinnamyl|cin', 'η³-Cinnamyl (3-phenylallyl)', '[CH2:51]C=Cc1ccccc1', { tpl: 'cinnamyl', pc: 'beta-Methylstyrene', check: 'β-methylstyrene less a hydrogen', lx: { l: 1, x: 1 }, hapto: 3, note: 'As in (SIPr)Pd(cinnamyl)Cl.' }],
    ],
  },
];

/**
 * Chiral ligands come in two enantiomers; each is drawn as one of them, named here (shown on
 * its card and in its details). Stereocenters are in the SMILES and drawn with wedges; a chiral
 * axis (BINAP, BINOL) or spiro center (SDP, SIPHOS) is drawn flat, so the label says which one.
 * Each configuration was checked against PubChem's record for that enantiomer (the whole
 * InChIKey, stereo layer and all: PubChem's SMILES and RDKit read a phosphine's lone pair
 * differently, so P-stereogenic SMILES are compared by InChIKey, never by SMILES), a vendor's
 * catalog name, or the enantiomer in Nate's ligand inventory. PubChem keeps no axial stereo, so
 * its record for a biaryl (BINAP, BINOL) stands for both enantiomers.
 */
export const DRAWN = {
  // axially chiral biaryls and spiro compounds (drawn flat)
  binap: '(R)', tolbinap: '(S)', xylbinap: '(R)', h8binap: '(S)',
  segphos: '(R)', dmsegphos: '(R)', dtbmsegphos: '(R)', meobiphep: '(R)', synphos: '(R)',
  difluorphos: '(R)', pphos: '(R)', sdp: '(R)', siphos: '(S)',
  binol: '(R)', h8binol: '(R)', monophos: '(R)', pipphos: '(R)', binam: '(R)', quinap: '(R)',
  feringa: '(S,R,R)',
  // stereocenters (drawn with wedges)
  diop: '(S,S)', chiraphos: '(R,R)', prophos: '(R)', skewphos: '(S,S)', dipamp: '(R,R)',
  meduphos: '(R,R)', etduphos: '(R,R)', iprduphos: '(R,R)', mebpe: '(R,R)', phbpe: '(R,R)',
  tangphos: '(1S,1′S,2R,2′R)', duanphos: '(1R,1′R,2S,2′S)', quinoxp: '(R,R)', benzp: '(R,R)',
  norphos: '(R,R)', trostph: '(R,R)', trostnaph: '(R,R)',
  josiphos: '(R,Sp)', 'josiphos-tbu': '(R,Sp)', 'josiphos-cy': '(R,Sp)',
  iprphox: '(S)', tbuphox: '(S)', phphox: '(S)',
  dmcda: '(1R,2R)', dach: '(1R,2R)', dpen: '(1R,2R)', tsdpen: '(1R,2R)', sparteine: '(−)',
  pdp: '(S,S)', phbox: '(S,S)', tbubox: '(S,S)', iprbox: '(S,S)', bnbox: '(S,S)',
  indabox: '(3aR,8aS)', iprpybox: '(S,S)', phpybox: '(S,S)', tbupyox: '(S)',
  jacobsen: '(R,R)', taddol: '(R,R)',
};
