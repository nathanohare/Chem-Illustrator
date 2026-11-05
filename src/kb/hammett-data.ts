// The data behind the Knowledge Base's Hammett table (src/kb/hammett.ts), read from Hansch, Leo and
// Taft, Chem. Rev. 1991, 91, 165 (doi 10.1021/cr00002a004) and checked against the paper's own
// equations: F = 1.297σm − 0.385σp + 0.033 (eq 8) and R = σp − F (eq 2) hold for every row to
// within rounding, apart from the three misprints listed in CORRECTED.
// The values are the measurements of the papers cited for each row; the names, SMILES ([*] where
// the group joins the ring) and the order are Chem Illustrator's.

/**
 * Table I, one group a line: Table I no. | group | name | σm | σp | F | R | the paper's reference
 * numbers (REFS) | SMILES. A value in brackets is one the paper marks as "suspected of being
 * inaccurate"; an empty SMILES is a group with no plain SMILES (carboranes, metal complexes) or one
 * the table names too loosely to draw. The groups chemists use most come first.
 */
export const TABLE_I = `43|H|hydrogen|0.00|0.00|0.03|0.00||[*][H]
133|CH3|methyl|-0.07|-0.17|0.01|-0.18|183|[*]C
219|C2H5|ethyl|-0.07|-0.15|0.00|-0.15|183|[*]CC
289|n-C3H7|propyl|-0.06|-0.13|0.01|-0.14|85,87|[*]CCC
288|i-C3H7|isopropyl|-0.04|-0.15|0.04|-0.19|85,183|[*]C(C)C
352|n-C4H9|butyl|-0.08|-0.16|-0.01|-0.15|174,87|[*]CCCC
349|t-C4H9|tert-butyl|-0.10|-0.20|-0.02|-0.18|183|[*]C(C)(C)C
270|c-C3H5|cyclopropyl|-0.07|-0.21|0.02|-0.23|177|[*]C1CC1
433|c-C6H11|cyclohexyl|-0.05|-0.15|0.03|-0.18|85|[*]C1CCCCC1
497|1-Ad|1-adamantyl|-0.12|-0.13|-0.07|-0.06|149|[*]C12CC3CC(CC(C3)C1)C2
456|CH2C6H5|benzyl|-0.08|-0.09|-0.04|-0.05|170|[*]Cc1ccccc1
193|CH=CH2|vinyl|0.06|-0.04|0.13|-0.17|85|[*]C=C
468|CH=CHC6H5|styryl (E)|0.03|-0.07|0.10|-0.17|186|[*]/C=C/c1ccccc1
175|C≡CH|ethynyl|0.21|0.23|0.22|0.01|171|[*]C#C
466|C≡CC6H5|phenylethynyl|0.14|0.16|0.15|0.01|170|[*]C#Cc1ccccc1
417|C6H5|phenyl|0.06|-0.01|0.12|-0.13|183|[*]c1ccccc1
458|C6H4-4-OMe|4-methoxyphenyl|0.05|-0.08|0.13|-0.21|85|[*]c1ccc(OC)cc1
413|C6H4-4-NO2|4-nitrophenyl|0.25|0.26|0.26|0.00|85|[*]c1ccc([N+](=O)[O-])cc1
378|2-pyridyl|2-pyridyl|0.33|0.17|0.40|-0.23|93|[*]c1ccccn1
379|3-pyridyl|3-pyridyl|0.23|0.25|0.24|0.01|71|[*]c1cccnc1
380|4-pyridyl|4-pyridyl|0.27|0.44|0.21|0.23|71|[*]c1ccncc1
335|2-furyl|2-furyl|0.06|0.02|0.10|-0.08|114|[*]c1ccco1
336|2-thienyl|2-thienyl|0.09|0.05|0.13|-0.08|159|[*]c1cccs1
337|3-thienyl|3-thienyl|0.03|-0.02|0.08|-0.10|159|[*]c1ccsc1
340|1-pyrrolyl|pyrrol-1-yl|0.47|0.37|0.50|-0.13|93|[*]n1cccc1
493|Fc|ferrocenyl|-0.15|-0.18|-0.09|-0.09|141|[*][C-]1C=CC=C1.[CH-]1C=CC=C1.[Fe+2]
70|CF3|trifluoromethyl|0.43|0.54|0.38|0.16|183|[*]C(F)(F)F
103|CHF2|difluoromethyl|0.29|0.32|0.29|0.03|110|[*]C(F)F
66|CCl3|trichloromethyl|0.40|0.46|0.38|0.09|170|[*]C(Cl)(Cl)Cl
165|C2F5|pentafluoroethyl|0.47|0.52|0.44|0.08|172|[*]C(F)(F)C(F)(F)F
122|CH2F|fluoromethyl|0.12|0.11|0.15|-0.04|110|[*]CF
120|CH2Cl|chloromethyl|0.11|0.12|0.13|-0.01|170|[*]CCl
119|CH2Br|bromomethyl|0.12|0.14|0.14|0.00|170|[*]CBr
185|CH2CF3|2,2,2-trifluoroethyl|0.12|0.09|0.15|-0.06|109|[*]CC(F)(F)F
143|CH2OH|hydroxymethyl|0.00|0.00|0.03|-0.03|133|[*]CO
223|CH2OMe|methoxymethyl|0.08|0.01|0.13|-0.12|85|[*]COC
155|CH2NH2|aminomethyl|-0.03|-0.11|0.04|-0.15|74|[*]CN
298|CH2NMe2|dimethylaminomethyl|0.00|0.01|0.03|-0.02|74|[*]CN(C)C
189|CH2CN|cyanomethyl|0.16|0.18|0.17|0.01|170|[*]CC#N
369|CH2SiMe3|trimethylsilylmethyl|-0.16|-0.21|-0.09|-0.12|183|[*]C[Si](C)(C)C
84|CN|cyano|0.56|0.66|0.51|0.15|183|[*]C#N
117|CHO|formyl|0.35|0.42|0.33|0.09|87,174|[*]C=O
200|COCH3|acetyl|0.38|0.50|0.33|0.17|183|[*]C(C)=O
276|COC2H5|propanoyl|0.38|0.48|0.34|0.14|74|[*]C(=O)CC
448|COC6H5|benzoyl|0.34|0.43|0.31|0.12|180|[*]C(=O)c1ccccc1
160|COCF3|trifluoroacetyl|0.63|0.80|0.54|0.26|110|[*]C(=O)C(F)(F)F
118|COOH|carboxy|0.37|0.45|0.34|0.11|183|[*]C(=O)O
99|COO⁻|carboxylate|-0.10|0.00|-0.10|0.10|183|[*]C(=O)[O-]
203|COOCH3|methoxycarbonyl|0.37|0.45|0.34|0.11|175|[*]C(=O)OC
277|COOC2H5|ethoxycarbonyl|0.37|0.45|0.34|0.11|183|[*]C(=O)OCC
450|COOC6H5|phenoxycarbonyl|0.37|0.44|0.34|0.10|128|[*]C(=O)Oc1ccccc1
127|CONH2|carbamoyl|0.28|0.36|0.26|0.10|87,187|[*]C(N)=O
212|CONHCH3|methylcarbamoyl|0.35|0.36|0.35|-0.01|154|[*]C(=O)NC
454|CONHC6H5|phenylcarbamoyl|0.23|0.41|0.17|0.24|74,175|[*]C(=O)Nc1ccccc1
64|COCl|chlorocarbonyl|0.51|0.61|0.46|0.15|164|[*]C(Cl)=O
129|CH=NOH|hydroxyiminomethyl|0.22|0.10|0.28|-0.18|129|[*]/C=N/O
15|F|fluoro|0.34|0.06|0.45|-0.39|183|[*]F
5|Cl|chloro|0.37|0.23|0.42|-0.19|183|[*]Cl
2|Br|bromo|0.39|0.23|0.45|-0.22|183|[*]Br
28|I|iodo|0.35|0.18|0.42|-0.24|183|[*]I
45|OH|hydroxy|0.12|-0.37|0.33|-0.70|183|[*]O
38|O⁻|oxido|-0.47|(-0.81)|-0.26|(-0.55)|181|[*][O-]
142|OCH3|methoxy|0.12|-0.27|0.29|-0.56|183|[*]OC
221|OC2H5|ethoxy|0.10|-0.24|0.26|-0.50|183|[*]OCC
294|O-n-C3H7|propoxy|0.10|-0.25|0.26|-0.51|183|[*]OCCC
293|O-i-C3H7|isopropoxy|0.10|(-0.45)|0.34|(-0.79)|183|[*]OC(C)C
353|O-n-C4H9|butoxy|0.10|-0.32|0.29|-0.61|183|[*]OCCCC
275|OCH2CH=CH2|allyloxy|0.09|-0.25|0.25|-0.50|105|[*]OCC=C
420|OC6H5|phenoxy|0.25|-0.03|0.37|-0.40|183,87|[*]Oc1ccccc1
75|OCF3|trifluoromethoxy|0.38|0.35|0.39|-0.04|145|[*]OC(F)(F)F
104|OCHF2|difluoromethoxy|0.31|0.18|0.37|-0.19|146|[*]OC(F)F
202|OCOCH3|acetoxy|0.39|0.31|0.42|-0.11|183|[*]OC(C)=O
449|OCOC6H5|benzoyloxy|0.21|0.13|0.26|-0.13|156|[*]OC(=O)c1ccccc1
150|OSO2CH3|mesyloxy|0.39|0.36|0.40|-0.04|156|[*]OS(C)(=O)=O
80|OSO2CF3|triflyloxy|0.56|0.53|0.56|-0.03|118|[*]OS(=O)(=O)C(F)(F)F
303|OSi(CH3)3|trimethylsilyloxy|0.13|-0.27|0.31|-0.58|74|[*]O[Si](C)(C)C
132|OCH2O|methylenedioxy (3,4-)|-0.16|-0.16|-0.11|-0.05|188|[*]OCO[*]
51|NH2|amino|-0.16|-0.66|0.08|-0.74|183|[*]N
154|NHCH3|methylamino|-0.21|-0.70|0.03|-0.73|164|[*]NC
231|N(CH3)2|dimethylamino|-0.16|-0.83|0.15|-0.98|185,183|[*]N(C)C
360|N(C2H5)2|diethylamino|-0.23|-0.72|0.01|-0.73|113,82|[*]N(CC)CC
427|NHC6H5|anilino|-0.02|-0.56|0.22|-0.78|173,85|[*]Nc1ccccc1
504|N(C6H5)2|diphenylamino|0.00|-0.22|0.12|-0.34|168,169|[*]N(c1ccccc1)c1ccccc1
211|NHCOCH3|acetamido|0.21|0.00|0.31|-0.31|183|[*]NC(C)=O
210|NHCOOCH3|methoxycarbonylamino|-0.02|-0.17|0.07|-0.24|68|[*]NC(=O)OC
453|NHCOC6H5|benzamido|0.02|-0.19|0.13|-0.32|156|[*]NC(=O)c1ccccc1
177|NHCOCF3|trifluoroacetamido|0.30|0.12|0.38|-0.26|156|[*]NC(=O)C(F)(F)F
156|NHSO2CH3|methanesulfonamido|0.20|0.03|0.28|-0.25|156|[*]NS(C)(=O)=O
59|NHNH2|hydrazinyl|-0.02|-0.55|0.22|-0.77|87|[*]NN
52|NHOH|hydroxyamino|-0.04|-0.34|0.11|-0.45|87|[*]NO
58|NH3⁺|ammonio|0.86|0.60|0.92|-0.32|181|[*][NH3+]
300|N(CH3)3⁺|trimethylammonio|0.88|0.82|0.86|-0.04|183|[*][N+](C)(C)C
32|NO2|nitro|0.71|0.78|0.65|0.13|183|[*][N+](=O)[O-]
31|NO|nitroso|0.62|0.91|0.49|0.42|107|[*]N=O
37|N3|azido|0.37|0.08|0.48|-0.40|130|[*]N=[N+]=[N-]
89|N=C=O|isocyanato|0.27|0.19|0.31|-0.12|165|[*]N=C=O
92|N=C=S|isothiocyanato|0.48|0.38|0.51|-0.13|156|[*]N=C=S
85|NC|isocyano|0.48|0.49|0.47|0.02|74|[*][N+]#[C-]
419|N=NC6H5|phenylazo|0.32|0.39|0.30|0.09|175|[*]/N=N/c1ccccc1
34|N₂⁺|diazonio|1.76|1.91|1.58|0.33|182|[*][N+]#N
49|SH|sulfanyl|0.25|0.15|0.30|-0.15|183|[*]S
151|SCH3|methylthio|0.15|0.00|0.23|-0.23|183|[*]SC
225|SC2H5|ethylthio|0.18|0.03|0.26|-0.23|174,183|[*]SCC
426|SC6H5|phenylthio|0.23|0.07|0.30|-0.23|85|[*]Sc1ccccc1
81|SCF3|trifluoromethylthio|0.40|0.50|0.36|0.14|178|[*]SC(F)(F)F
93|SCN|thiocyanato|0.51|0.52|0.49|0.03|85,183|[*]SC#N
144|SOCH3|methylsulfinyl|0.52|0.49|0.52|-0.03|183|[*][S](C)=O
421|SOC6H5|phenylsulfinyl|0.50|0.44|0.51|-0.07|85|[*]S(=O)c1ccccc1
148|SO2CH3|methylsulfonyl|0.60|0.72|0.53|0.19|183|[*]S(C)(=O)=O
224|SO2C2H5|ethylsulfonyl|0.66|0.77|0.59|0.18|74|[*]S(=O)(=O)CC
424|SO2C6H5|phenylsulfonyl|0.62|0.68|0.58|0.10|85|[*]S(=O)(=O)c1ccccc1
78|SO2CF3|triflyl|0.83|0.96|0.74|0.22|70|[*]S(=O)(=O)C(F)(F)F
53|SO2NH2|sulfamoyl|0.53|0.60|0.49|0.11|170|[*]S(N)(=O)=O
233|SO2N(CH3)2|dimethylsulfamoyl|0.51|0.65|0.44|0.21|74|[*]S(=O)(=O)N(C)C
7|SO2Cl|chlorosulfonyl|1.20|1.11|1.16|(-0.05)|134|[*]S(Cl)(=O)=O
40|SO3⁻|sulfonato|0.30|0.35|0.29|0.06|81|[*]S(=O)(=O)[O-]
241|S(CH3)2⁺|dimethylsulfonio|1.00|0.90|0.98|-0.08|183|[*][S+](C)C
307|Si(CH3)3|trimethylsilyl|-0.04|-0.07|0.01|-0.08|183|[*][Si](C)(C)C
308|Sn(CH3)3|trimethylstannyl|0.00|0.00|0.03|-0.03|74,183|[*][Sn](C)(C)C
50|B(OH)2|dihydroxyboryl|-0.01|0.12|-0.03|0.15|170|[*]B(O)O
506|P(C6H5)2|diphenylphosphino|0.11|0.19|0.10|0.09|144|[*]P(c1ccccc1)c1ccccc1
505|PO(C6H5)2|diphenylphosphoryl|0.38|0.53|0.32|0.21|144|[*]P(=O)(c1ccccc1)c1ccccc1
363|PO(OC2H5)2|diethoxyphosphoryl|0.55|0.60|0.52|0.08|143|[*]P(=O)(OCC)OCC
306|P(CH3)3⁺|trimethylphosphonio|0.74|0.73|0.71|0.02|123,122|[*][P+](C)(C)C
1|BF2|difluoroboryl|0.32|0.48|0.26|0.22|109|[*]B(F)F
3|GeBr3|tribromogermyl|0.66|0.73|0.61|0.12|139|[*][Ge](Br)(Br)Br
4|SiBr3|tribromosilyl|0.48|0.57|0.44|0.13|139|[*][Si](Br)(Br)Br
6|HgCl|chloromercurio|0.33|0.35|0.33|0.02|74|[*][Hg]Cl
8|SCl|chlorosulfanyl|0.44|0.48|0.42|0.06|74|[*]SCl
9|ICl2|dichloro-λ³-iodanyl|1.10|1.11|1.03|0.08|110|[*]I(Cl)Cl
10|P(O)Cl2|dichlorophosphoryl|0.78|0.90|0.70|0.20|74|[*]P(=O)(Cl)Cl
11|PCl2|dichlorophosphanyl|0.54|0.61|0.50|0.11|164|[*]P(Cl)Cl
12|P(S)Cl2|dichlorophosphorothioyl|0.70|0.80|0.63|0.17|74|[*]P(=S)(Cl)Cl
13|GeCl3|trichlorogermyl|0.71|0.79|0.65|0.14|139|[*][Ge](Cl)(Cl)Cl
14|SiCl3|trichlorosilyl|0.48|0.56|0.44|0.12|139|[*][Si](Cl)(Cl)Cl
16|HgF|fluoromercurio|0.34|0.33|0.35|-0.02|74|[*][Hg]F
17|SOF|fluorosulfinyl|0.74|0.83|0.67|0.16|74|[*]S(=O)F
18|SO2F|fluorosulfonyl|0.80|0.91|0.72|0.19|142|[*]S(=O)(=O)F
19|IF2|difluoro-λ³-iodanyl|0.85|0.83|0.82|0.01|110|[*]I(F)F
20|POF2|difluorophosphoryl|0.81|0.89|0.74|0.15|164|[*]P(=O)(F)F
21|PF2|difluorophosphanyl|0.49|0.59|0.44|0.15|109|[*]P(F)F
22|GeF3|trifluorogermyl|0.85|0.97|0.76|0.21|139|[*][Ge](F)(F)F
23|SF3|trifluoro-λ⁴-sulfanyl|0.70|0.80|0.63|0.17|110|[*]S(F)(F)F
24|SiF3|trifluorosilyl|0.54|0.69|0.47|0.22|164|[*][Si](F)(F)F
25|IF4|tetrafluoro-λ⁵-iodanyl|1.07|1.15|0.98|0.17|110|[*]I(F)(F)(F)F
26|PF4|tetrafluoro-λ⁵-phosphanyl|0.63|0.80|0.54|0.26|110|[*]P(F)(F)(F)F
27|SF5|pentafluoro-λ⁶-sulfanyl|0.61|0.68|0.56|0.12|179|[*]S(F)(F)(F)(F)F
29|IO|iodosyl|0.58|0.62|0.55|0.07|63|[*]I=O
30|IO2|iodyl|0.68|0.78|0.61|0.17|170|[*]I(=O)=O
33|ONO2|nitrooxy|0.55|0.70|0.48|0.22|74|[*]O[N+](=O)[O-]
35|N₂⁺ BF₄⁻|diazonio (tetrafluoroborate salt)|1.65|1.79|1.48|0.31|88|[*][N+]#N.F[B-](F)(F)F
36|NNO₂⁻|nitroazanidyl (nitramide anion)|0.00|-0.43|0.20|-0.63|112|[*][N-][N+](=O)[O-]
39|SO₂⁻|sulfinato|-0.02|-0.05|0.03|-0.08|135|[*]S(=O)[O-]
41|S⁻|sulfido|-0.36|-1.21|0.03|-1.24|74,97|[*][S-]
42|AsO₃H⁻|hydrogen arsonato|0.00|-0.02|0.04|-0.06|74,87|[*][As](=O)([O-])O
44|NHNO2|nitroamino|0.91|0.57|0.99|-0.42|112|[*]N[N+](=O)[O-]
46|S(O)OH|sulfino|-0.04|-0.07|0.01|-0.08|74|[*]S(=O)O
47|PO₃H⁻|hydrogen phosphonato|0.20|0.26|0.19|0.07|183|[*]P(=O)([O-])O
48|OPO₃H⁻|hydrogen phosphonatooxy|0.29|0.00|0.41|-0.41|74|[*]OP(=O)([O-])O
54|PO(OH)2|phosphono|0.36|0.42|0.34|0.08|74|[*]P(=O)(O)O
55|PH2|phosphanyl|0.06|0.05|0.09|-0.04|74|[*]P
56|B(OH)₃⁻|trihydroxyborato|-0.48|-0.44|-0.42|-0.02|90|[*][B-](O)(O)O
57|GeH3|germyl|0.00|0.01|0.03|-0.02|74,280|[*][GeH3]
60|SiH3|silyl|0.05|0.10|0.06|0.04|110|[*][SiH3]
61|CBr3|tribromomethyl|0.28|0.29|0.28|0.01|165|[*]C(Br)(Br)Br
62|CClF2|chlorodifluoromethyl|0.42|0.46|0.40|0.06|74|[*]C(F)(F)Cl
63|5-chloro-1-tetrazolyl|5-chlorotetrazol-1-yl|0.60|0.61|0.58|0.03|165|[*]n1nnnc1Cl
65|N=CCl2|(dichloromethylidene)amino|0.21|0.13|0.26|-0.13|165|[*]N=C(Cl)Cl
67|OCCl3|trichloromethoxy|0.43|0.35|0.46|-0.11|74|[*]OC(Cl)(Cl)Cl
68|COF|fluorocarbonyl|0.55|0.70|0.48|0.22|110|[*]C(=O)F
69|OCF2O|difluoromethylenedioxy (3,4-)|0.36|0.36|0.36|0.00|153|[*]OC(F)(F)O[*]
71|HgCF3|(trifluoromethyl)mercurio|0.29|0.32|0.29|0.03|74|[*][Hg]C(F)(F)F
72|HgSCF3|[(trifluoromethyl)sulfanyl]mercurio|0.39|0.42|0.38|0.04|74|[*][Hg]SC(F)(F)F
73|I=NSO2CF3|(trifluoromethylsulfonylimino)-λ³-iodanyl|1.30|1.35|1.20|0.15|63|[*]I=NS(=O)(=O)C(F)(F)F
74|N=NCF3|(trifluoromethyl)azo|0.56|0.68|0.50|0.18|74|[*]N=NC(F)(F)F
76|SOCF3|trifluoromethylsulfinyl|0.63|0.69|0.58|0.11|163|[*]S(=O)C(F)(F)F
77|SeOCF3|trifluoromethylseleninyl|0.81|0.83|0.76|0.07|74|[*][Se](=O)C(F)(F)F
79|SeO2CF3|trifluoromethylselenonyl|1.08|1.21|0.97|0.24|74|[*][Se](=O)(=O)C(F)(F)F
82|SeCF3|trifluoromethylselanyl|0.44|0.45|0.43|0.02|167|[*][Se]C(F)(F)F
83|HgCN|cyanomercurio|0.28|0.34|0.27|0.08|74|[*][Hg]C#N
86|CN(BBr3)|cyano–tribromoborane complex|0.61|0.48|0.64|-0.16|164|[*]C#[N+][B-](Br)(Br)Br
87|CN(BCl3)|cyano–trichloroborane complex|0.95|0.86|(0.93)|(-0.05)|164|[*]C#[N+][B-](Cl)(Cl)Cl
88|CN(BF3)|cyano–trifluoroborane complex|0.72|0.66|(0.71)|(-0.05)|164|[*]C#[N+][B-](F)(F)F
90|OCN|cyanato|0.67|0.54|0.69|-0.15|74|[*]OC#N
91|SO2CN|cyanosulfonyl|1.10|1.26|0.97|0.29|74|[*]S(=O)(=O)C#N
94|SeCN|selenocyanato|0.61|0.66|0.57|0.09|173,87|[*][Se]C#N
95|N=NCN|cyanoazo|0.71|1.03|0.56|0.47|72|[*]N=NC#N
96|N(O)=NCN|cyano-NNO-azoxy|0.78|0.89|0.70|0.19|281|[*][N+]([O-])=NC#N
97|C(NO2)3|trinitromethyl|0.72|0.82|0.65|0.17|74,190|[*]C([N+](=O)[O-])([N+](=O)[O-])[N+](=O)[O-]
98|5-azido-1-tetrazolyl|5-azidotetrazol-1-yl|0.54|0.54|0.53|0.01|165|[*]n1nnnc1N=[N+]=[N-]
100|CHBr2|dibromomethyl|0.31|0.32|0.31|0.01|74|[*]C(Br)Br
101|CHCl2|dichloromethyl|0.31|0.32|0.31|0.01|74|[*]C(Cl)Cl
102|OCHCl2|dichloromethoxy|0.38|0.26|0.43|-0.17|74|[*]OC(Cl)Cl
105|SOCHF2|difluoromethylsulfinyl|0.54|0.58|0.51|0.07|140|[*]S(=O)C(F)F
106|SO2CHF2|difluoromethylsulfonyl|0.75|0.86|0.67|0.19|146|[*]S(=O)(=O)C(F)F
107|SCHF2|difluoromethylthio|0.33|0.37|0.32|0.05|170|[*]SC(F)F
108|S(O)(=NH)CF3|S-(trifluoromethyl)sulfonimidoyl|0.72|0.84|0.64|0.20|62|[*]S(=O)(=N)C(F)(F)F
109|NHSO2CF3|trifluoromethanesulfonamido|0.44|0.39|0.45|-0.06|74|[*]NS(=O)(=O)C(F)(F)F
110|CHI2|diiodomethyl|0.26|0.26|0.27|-0.01|74|[*]C(I)I
111|NHCN|cyanoamino|0.21|0.06|0.28|-0.22|158|[*]NC#N
112|1-(1H)-tetrazolyl|tetrazol-1-yl|0.52|0.50|0.52|-0.02|165|[*]n1cnnn1
113|5-(1H)-tetrazolyl|1H-tetrazol-5-yl|0.64|0.56|0.65|-0.09|166|[*]c1nnn[nH]1
114|5-hydroxy-1-tetrazolyl|5-hydroxytetrazol-1-yl|0.39|0.33|0.41|-0.08|165|[*]n1nnnc1O
115|5-mercapto-1-tetrazolyl|5-sulfanyltetrazol-1-yl|0.45|0.45|0.44|-0.01|165|[*]n1nnnc1S
116|1,2,3,4-thiatriazol-5-ylamino|1,2,3,4-thiatriazol-5-ylamino|0.30|0.19|0.35|-0.16|158|[*]NC1=NN=NS1
121|OCH2Cl|chloromethoxy|0.25|0.08|0.33|-0.25|74|[*]OCCl
123|OCH2F|fluoromethoxy|0.20|0.02|0.29|-0.27|74|[*]OCF
124|SCH2F|fluoromethylthio|0.23|0.20|0.25|-0.05|74|[*]SCF
125|CH2I|iodomethyl|0.10|0.11|0.12|-0.01|170|[*]CI
126|NHCHO|formamido|0.19|0.00|0.28|-0.28|156|[*]NC=O
128|CSNH2|thiocarbamoyl|0.25|0.30|0.24|0.06|283|[*]C(N)=S
130|N=CHNH|fused imidazole ring (3,4-)|-0.15|-0.15|-0.10|-0.05|116|[*]N=CN[*]
131|N(O)=NCONH2|carbamoyl-NNO-azoxy|0.59|0.63|0.56|0.07|281|[*][N+]([O-])=NC(N)=O
134|CH2SO2R|(alkylsulfonyl)methyl|0.15|0.17|0.16|0.01|170|
135|SiMeCl2|dichloro(methyl)silyl|0.31|0.39|0.29|0.10|74|[*][Si](C)(Cl)Cl
136|SiMeF2|difluoro(methyl)silyl|0.29|0.23|0.32|-0.09|74|[*][Si](C)(F)F
137|HgMe|methylmercurio|0.43|0.10|(0.55)|(-0.45)|164|[*][Hg]C
138|NHCH2SO3H|(sulfomethyl)amino|-0.10|-0.57|0.12|-0.69|89|[*]NCS(=O)(=O)O
139|NHCONH2|ureido|-0.03|-0.24|0.09|-0.33|156|[*]NC(N)=O
140|N(Me)NO2|methyl(nitro)amino|0.49|0.61|0.43|0.18|112|[*]N(C)[N+](=O)[O-]
141|NHCSNH2|thioureido|0.22|0.16|0.26|-0.10|158|[*]NC(N)=S
145|SOMe|methoxysulfanyl|0.21|0.17|0.24|-0.07|74|[*]SOC
146|OS(=O)CH3|methanesulfinyloxy|0.44|0.45|0.43|0.02|74|[*]OS(C)=O
147|S(O)OMe|methoxysulfinyl|0.50|0.54|0.47|0.07|74|[*]S(=O)OC
149|SSO2Me|(methylsulfonyl)sulfanyl|0.43|0.54|0.38|0.16|74|[*]SS(C)(=O)=O
152|SSMe|methyldisulfanyl|0.22|0.13|0.27|-0.14|74|[*]SSC
153|SeMe|methylselanyl|0.10|0.00|0.16|-0.16|183|[*][Se]C
157|CH2NH3⁺|ammoniomethyl|0.59|0.53|0.59|-0.06|88|[*]C[NH3+]
158|N(COF)2|bis(fluorocarbonyl)amino|0.58|0.57|0.57|0.00|109|[*]N(C(=O)F)C(=O)F
159|HgOCOCF3|(trifluoroacetoxy)mercurio|0.50|0.52|0.48|0.04|74|[*][Hg]OC(=O)C(F)(F)F
161|SCOCF3|(trifluoroacetyl)sulfanyl|0.48|0.46|0.48|-0.02|74|[*]SC(=O)C(F)(F)F
162|OCOCF3|trifluoroacetoxy|0.56|0.46|0.58|-0.12|74|[*]OC(=O)C(F)(F)F
163|N(CF3)C(=O)F|(fluorocarbonyl)(trifluoromethyl)amino|0.50|0.50|0.49|0.01|109|[*]N(C(F)(F)F)C(=O)F
164|CF2OCF2|tetrafluoro-dihydrofuran ring (3,4-)|0.81|0.81|0.77|0.04|153|[*]C(F)(F)OC(F)(F)[*]
166|OCF2CF3|pentafluoroethoxy|0.48|0.28|0.55|-0.27|74|[*]OC(F)(F)C(F)(F)F
167|SO2CF2CF3|pentafluoroethylsulfonyl|0.92|1.08|0.81|0.27|76|[*]S(=O)(=O)C(F)(F)C(F)(F)F
168|SCF2CF3|pentafluoroethylthio|0.44|0.48|0.42|0.06|76|[*]SC(F)(F)C(F)(F)F
169|N(CF3)2|bis(trifluoromethyl)amino|0.40|0.53|(0.35)|0.18|145|[*]N(C(F)(F)F)C(F)(F)F
170|S(CF3)=NSO2CF3|S-(trifluoromethyl)-N-triflylsulfinimidoyl|1.18|1.28|1.07|0.21|62|[*]S(C(F)(F)F)=NS(=O)(=O)C(F)(F)F
171|SO(CF3)=NSO2CF3|S-(trifluoromethyl)-N-triflylsulfonimidoyl|1.23|1.40|1.09|0.31|62|[*]S(=O)(C(F)(F)F)=NS(=O)(=O)C(F)(F)F
172|N(SO2CF3)2|bis(trifluoromethylsulfonyl)amino|0.61|0.83|0.50|0.33|103|[*]N(S(=O)(=O)C(F)(F)F)S(=O)(=O)C(F)(F)F
173|P(CF3)2|bis(trifluoromethyl)phosphanyl|0.60|0.69|0.55|0.14|109|[*]P(C(F)(F)F)C(F)(F)F
174|P(CN)2|dicyanophosphanyl|0.82|0.90|0.75|0.15|74|[*]P(C#N)C#N
176|OCF2CHFCl|2-chloro-1,1,2-trifluoroethoxy|0.35|0.28|0.38|-0.10|146|[*]OC(F)(F)C(F)Cl
178|CH=NSO2CF3|(trifluoromethylsulfonylimino)methyl|0.76|1.00|0.63|0.37|63|[*]C=NS(=O)(=O)C(F)(F)F
179|OCF2CHF2|1,1,2,2-tetrafluoroethoxy|0.34|0.25|0.38|-0.13|178|[*]OC(F)(F)C(F)F
180|SCF2CHF2|1,1,2,2-tetrafluoroethylthio|0.38|0.47|0.35|0.12|178|[*]SC(F)(F)C(F)F
181|tetrazolyl disulfide (drawn)|5-(1H-tetrazol-5-yldisulfanyl)tetrazol-1-yl|0.63|0.64|0.60|0.04|165|[*]n1nnnc1SSc1nnn[nH]1
182|SC≡CH|ethynylthio|0.26|0.19|0.30|-0.11|74|[*]SC#C
183|SCH=CHCl|(2-chlorovinyl)thio|0.31|0.24|0.34|-0.10|105|[*]SC=CCl
184|SeCH=CHCl|(2-chlorovinyl)selanyl|0.28|0.26|0.30|-0.04|105|[*][Se]C=CCl
186|CH2SOCF3|(trifluoromethylsulfinyl)methyl|0.25|0.24|0.27|-0.03|162|[*]CS(=O)C(F)(F)F
187|CH2SO2CF3|(trifluoromethylsulfonyl)methyl|0.29|0.31|0.29|0.02|162|[*]CS(=O)(=O)C(F)(F)F
188|CH2SCF3|(trifluoromethylthio)methyl|0.12|0.15|0.13|0.02|162|[*]CSC(F)(F)F
190|CH=CHNO2 (E)|2-nitrovinyl (E)|0.32|0.26|0.35|(-0.09)|184|[*]/C=C/[N+](=O)[O-]
191|CH2CO2⁻|carboxylatomethyl|0.07|-0.16|0.19|-0.35|88|[*]CC(=O)[O-]
192|CH2SCN|thiocyanatomethyl|0.12|0.14|0.14|0.00|74|[*]CSC#N
194|NHCOCH2Cl|chloroacetamido|0.17|-0.03|0.27|-0.30|156|[*]NC(=O)CCl
195|N(Me)SO2CF3|N-methyltrifluoromethanesulfonamido|0.46|0.44|0.46|-0.02|74|[*]N(C)S(=O)(=O)C(F)(F)F
196|HgOCOCH3|acetoxymercurio|0.39|0.40|0.39|0.01|74|[*][Hg]OC(C)=O
197|C(Me)(NO2)2|1,1-dinitroethyl|0.54|0.61|0.50|0.11|74|[*]C(C)([N+](=O)[O-])[N+](=O)[O-]
198|oxiranyl|oxiranyl|0.05|0.03|0.09|-0.06|74|[*]C1CO1
199|OCH=CH2|vinyloxy|0.21|-0.09|0.34|-0.43|96|[*]OC=C
201|SCOMe|acetylthio|0.39|0.44|0.37|0.07|183|[*]SC(C)=O
204|thiiranyl|thiiranyl|0.04|0.01|0.08|-0.07|74|[*]C1CS1
205|SCH=CH2|vinylthio|0.26|0.20|0.29|-0.09|99,105|[*]SC=C
206|SeCH=CH2|vinylselanyl|0.26|0.21|0.29|-0.08|105|[*][Se]C=C
207|1-aziridinyl|aziridin-1-yl|-0.07|-0.22|0.03|-0.25|74|[*]N1CC1
208|2-aziridinyl|aziridin-2-yl|-0.06|-0.10|-0.01|-0.09|74|[*]C1CN1
209|N-methyl-3-oxaziridinyl|2-methyloxaziridin-3-yl|0.09|0.12|0.10|0.02|74|[*]C1ON1C
213|CH=NOMe|(methoxyimino)methyl|0.37|0.30|0.40|-0.10|93|[*]C=NOC
214|CH2CONH2|carbamoylmethyl|0.06|0.07|0.08|-0.01|74|[*]CC(N)=O
215|NHCSMe|thioacetamido|0.24|0.12|0.30|-0.18|154|[*]NC(C)=S
216|CSNHMe|methylthiocarbamoyl|0.30|0.34|0.29|0.05|154|[*]C(=S)NC
217|CH=NNHCSNH2|(thiosemicarbazono)methyl|0.45|0.40|0.46|-0.06|93|[*]C=NNC(N)=S
218|OCH2CH2O|ethylenedioxy (3,4-)|-0.12|-0.12|-0.08|-0.04|74|[*]OCCO[*]
220|CH=NNHCONHNH2|(carbonohydrazidoylhydrazono)methyl|0.22|0.16|0.26|-0.10|93|[*]C=NNC(=O)NN
222|CH(OH)Me|1-hydroxyethyl|0.08|-0.07|0.16|-0.23|74|[*]C(C)O
226|P(Cl)NMe2|chloro(dimethylamino)phosphanyl|0.38|0.56|0.31|0.25|164|[*]P(Cl)N(C)C
227|CH2SC(NH2)2⁺|(amidinothio)methyl, isothiouronium|0.13|0.15|0.14|0.01|128|[*]CSC(N)=[NH2+]
228|SiClMe2|chlorodimethylsilyl|0.16|0.21|0.16|0.05|74|[*][Si](C)(C)Cl
229|SiFMe2|fluorodimethylsilyl|0.12|0.17|0.12|0.04|74|[*][Si](C)(C)F
230|NHEt|ethylamino|-0.24|-0.61|-0.04|-0.57|87,187|[*]NCC
232|N(Me)SO2Me|N-methylmethanesulfonamido|0.21|0.24|0.21|0.03|81,74|[*]N(C)S(C)(=O)=O
234|N(SO2Me)2|bis(methylsulfonyl)amino|0.47|0.49|0.45|0.04|74|[*]N(S(C)(=O)=O)S(C)(=O)=O
235|SNMe2|(dimethylamino)sulfanyl|0.12|0.09|0.15|-0.06|74|[*]SN(C)C
236|N=NNMe2|3,3-dimethyltriazen-1-yl|-0.05|-0.03|-0.02|-0.01|72|[*]N=NN(C)C
237|N(Me)N⁺(Me)=N|fused 1,3-dimethyltriazolium ring (3,4-)|1.17|1.17|1.10|0.07|116|[*]N(C)[N+](C)=N[*]
238|P(O)Me2|dimethylphosphoryl|0.43|0.50|0.40|0.10|74|[*]P(C)(C)=O
239|PO(OMe)2|dimethoxyphosphoryl|0.42|0.53|0.37|0.16|152|[*]P(=O)(OC)OC
240|PMe2|dimethylphosphanyl|0.03|0.06|0.05|0.01|69|[*]P(C)C
242|S(CH3)2⁺ TsO⁻|dimethylsulfonio (tosylate salt)|1.06|0.96|1.04|-0.08|88|[*][S+](C)C.Cc1ccc(cc1)S(=O)(=O)[O-]
243|CH2CH2NH3⁺|2-ammonioethyl|0.23|0.17|0.27|-0.10|74|[*]CC[NH3+]
244|SiH(Me)2|dimethylsilyl|0.01|0.04|0.03|0.01|74|[*][SiH](C)C
245|1-(1,7-(BH)10-C2H) (m-carboranyl)|1,7-dicarba-closo-dodecaboran-1-yl (m-carboranyl)|0.25|0.33|0.23|0.10|147|
246|2-(1,7-(BH)10-C2H) (m-carboranyl)|1,7-dicarba-closo-dodecaboran-2-yl (m-carboranyl)|0.14|0.15|0.16|-0.01|117|
247|4-(1,7-(BH)10-C2H) (m-carboranyl)|1,7-dicarba-closo-dodecaboran-4-yl (m-carboranyl)|-0.02|0.02|0.00|0.02|80|
248|1-(1,2-(BH)10-C2H) (o-carboranyl)|1,2-dicarba-closo-dodecaboran-1-yl (o-carboranyl)|0.49|0.43|0.50|-0.07|147|
249|3-(1,2-(BH)10-C2H) (o-carboranyl)|1,2-dicarba-closo-dodecaboran-3-yl (o-carboranyl)|0.20|0.19|0.22|-0.03|147|
250|C≡CCF3|3,3,3-trifluoropropynyl|0.41|0.51|0.37|0.14|163|[*]C#CC(F)(F)F
251|CF=CFCF3 (E)|perfluoroprop-1-enyl (E)|0.39|0.46|0.36|0.10|109|[*]/C(F)=C(F)/C(F)(F)F
252|N=C(CF3)2|[bis(trifluoromethyl)methylidene]amino|0.29|0.23|0.32|-0.09|109|[*]N=C(C(F)(F)F)C(F)(F)F
253|CF2CF2CF3|heptafluoropropyl|0.44|0.48|0.42|0.06|85|[*]C(F)(F)C(F)(F)C(F)(F)F
254|CF(CF3)2|heptafluoroisopropyl|0.37|0.53|(0.31)|0.22|172|[*]C(F)(C(F)(F)F)C(F)(F)F
255|SO2CF2CF2CF3|heptafluoropropylsulfonyl|0.92|1.09|0.81|0.28|76|[*]S(=O)(=O)C(F)(F)C(F)(F)C(F)(F)F
256|SO2CF(CF3)2|heptafluoroisopropylsulfonyl|0.92|1.10|0.80|0.30|76|[*]S(=O)(=O)C(F)(C(F)(F)F)C(F)(F)F
257|SCF2CF2CF3|heptafluoropropylthio|0.45|0.48|0.43|0.05|76|[*]SC(F)(F)C(F)(F)C(F)(F)F
258|SCF(CF3)2|heptafluoroisopropylthio|0.48|0.51|0.46|0.03|76|[*]SC(F)(C(F)(F)F)C(F)(F)F
259|TeCF2CF2CF3|heptafluoropropyltellanyl|0.46|0.48|0.45|0.03|76|[*][Te]C(F)(F)C(F)(F)C(F)(F)F
260|C(OH)(CF3)2|2,2,2-trifluoro-1-hydroxy-1-(trifluoromethyl)ethyl|0.29|0.30|0.29|0.01|172|[*]C(O)(C(F)(F)F)C(F)(F)F
261|CH(SCF3)2|bis(trifluoromethylthio)methyl|0.44|0.44|0.43|0.01|74|[*]C(SC(F)(F)F)SC(F)(F)F
262|CH(CN)2|dicyanomethyl|0.53|0.52|0.52|0.00|74|[*]C(C#N)C#N
263|CH=CHCF3 (Z)|3,3,3-trifluoroprop-1-enyl (Z)|0.16|0.17|0.18|0.01|165|[*]/C=C\\C(F)(F)F
264|CH=CHCF3 (E)|3,3,3-trifluoroprop-1-enyl (E)|0.24|0.27|0.24|0.03|165|[*]/C=C/C(F)(F)F
265|CH=CHSO2CF3|2-(trifluoromethylsulfonyl)vinyl|0.31|0.55|0.22|0.33|74|[*]C=CS(=O)(=O)C(F)(F)F
266|CH=CHCN|2-cyanovinyl|0.24|0.17|0.28|-0.11|155|[*]C=CC#N
267|C≡CMe|prop-1-ynyl|0.21|0.03|0.29|-0.26|85|[*]C#CC
268|N(Me)COCF3|N-methyltrifluoroacetamido|0.41|0.39|0.41|-0.02|74|[*]N(C)C(=O)C(F)(F)F
269|CH=CHCHO|3-oxoprop-1-enyl|0.24|0.13|0.29|-0.16|155|[*]C=CC=O
271|C(Me)=CH2|isopropenyl|0.09|0.05|0.13|-0.08|85|[*]C(C)=C
272|CH=CHMe (E)|prop-1-enyl (E)|0.02|-0.09|0.09|-0.18|85|[*]/C=C/C
273|CH2CH=CH2|allyl|-0.11|-0.14|-0.06|-0.08|74|[*]CC=C
274|C(Et)(NO2)2|1,1-dinitropropyl|0.56|0.64|0.51|0.13|74|[*]C(CC)([N+](=O)[O-])[N+](=O)[O-]
278|CH2OCOMe|acetoxymethyl|0.04|0.05|0.07|-0.02|74|[*]COC(C)=O
279|CH2CH2COOH|2-carboxyethyl|-0.03|-0.07|0.02|-0.09|188|[*]CCC(=O)O
280|SCH2CH=CH2|allylthio|0.19|0.12|0.23|-0.11|105|[*]SCC=C
281|SeCH2CH=CH2|allylselanyl|0.21|0.12|0.26|-0.14|105|[*][Se]CC=C
282|CH2CH2CH2|trimethylene (3,4-, fused ring)|-0.26|-0.26|-0.20|-0.06|87|[*]CCC[*]
283|N(Me)COMe|N-methylacetamido|0.31|0.26|0.34|-0.08|74|[*]N(C)C(C)=O
284|CH2NHCOMe|acetamidomethyl|0.05|-0.05|0.12|-0.17|85|[*]CNC(C)=O
285|NHCOOEt|ethoxycarbonylamino|0.11|-0.15|0.23|-0.38|157,156|[*]NC(=O)OCC
286|C(NO2)Me2|2-nitropropan-2-yl|0.18|0.20|0.19|0.01|74,190|[*]C(C)(C)[N+](=O)[O-]
287|OCH2CH2CH2O|propylenedioxy (3,4-)|0.00|0.00|0.03|-0.03|74|[*]OCCCO[*]
290|N⁺(Me)=CHN(Me)|fused 1,3-dimethylimidazolium ring (3,4-)|1.11|1.11|1.05|0.06|116|[*][N+](C)=CN(C)[*]
291|NHCONHEt|3-ethylureido|0.04|-0.26|0.19|-0.45|154|[*]NC(=O)NCC
292|NHCSNHEt|3-ethylthioureido|0.30|0.07|0.40|-0.33|154|[*]NC(=S)NCC
295|CH2CH(OH)Me|2-hydroxypropyl|-0.12|-0.17|-0.06|-0.11|74,102|[*]CC(C)O
296|C(OOH)Me2|2-hydroperoxypropan-2-yl|0.06|-0.14|0.17|-0.31|92|[*]C(C)(C)OO
297|SCHMe2|isopropylthio|0.23|0.07|0.30|-0.23|74|[*]SC(C)C
299|GeMe3|trimethylgermyl|0.00|0.00|0.03|-0.03|74|[*][Ge](C)(C)C
301|CH2NH(CH3)2⁺|(dimethylammonio)methyl|0.40|0.43|0.39|0.04|74|[*]C[NH+](C)C
302|Si(Me)2OMe|methoxydimethylsilyl|0.04|-0.02|0.09|-0.11|74|[*][Si](C)(C)OC
304|SiMe(OMe)2|dimethoxy(methyl)silyl|0.04|0.10|0.05|0.05|74|[*][Si](C)(OC)OC
305|Si(OMe)3|trimethoxysilyl|0.09|0.13|0.10|0.03|74|[*][Si](OC)(OC)OC
309|1-(1,2-(BH)10-C2Me) (o-carboranyl)|2-methyl-1,2-dicarba-closo-dodecaboran-1-yl|0.50|0.65|0.43|0.22|111|
310|CH2-1-(1,7-(BH)10-C2H) (m-carboranylmethyl)|(1,7-dicarba-closo-dodecaboran-1-yl)methyl|0.00|0.01|0.03|-0.02|67|
311|CH2-1-(1,2-(BH)10-C2H) (o-carboranylmethyl)|(1,2-dicarba-closo-dodecaboran-1-yl)methyl|0.12|0.12|0.14|-0.02|67|
312|1-(1,2-(BH)10-C2H3HgCH3) (o-carboranyl)|o-carboranyl with methylmercurio|0.86|0.85|0.82|0.03|111|
313|2-(hydroxymethyl)carboran-1-yl|2-(hydroxymethyl)-1,2-dicarba-closo-dodecaboran-1-yl|0.38|0.49|0.34|0.15|111|
314|I(OCOCF3)2|bis(trifluoroacetoxy)-λ³-iodanyl|1.28|1.34|1.18|0.16|110|[*]I(OC(=O)C(F)(F)F)OC(=O)C(F)(F)F
315|cyclo-C4F7|heptafluorocyclobutyl|0.48|0.53|0.45|0.08|109|[*]C1(F)C(F)(F)C(F)(F)C1(F)F
316|COCF2CF2CF3|heptafluorobutanoyl|0.63|0.79|0.55|0.24|110|[*]C(=O)C(F)(F)C(F)(F)C(F)(F)F
317|C(CF3)3|nonafluoro-tert-butyl|0.55|0.55|0.53|0.02|76|[*]C(C(F)(F)F)(C(F)(F)F)C(F)(F)F
318|(CF2)3CF3|nonafluorobutyl|0.47|0.52|0.44|0.08|172|[*]C(F)(F)C(F)(F)C(F)(F)C(F)(F)F
319|SO2C(CF3)3|nonafluoro-tert-butylsulfonyl|0.96|1.13|0.84|0.29|76|[*]S(=O)(=O)C(C(F)(F)F)(C(F)(F)F)C(F)(F)F
320|SC(CF3)3|nonafluoro-tert-butylthio|0.51|0.58|0.47|0.11|76|[*]SC(C(F)(F)F)(C(F)(F)F)C(F)(F)F
321|C(SCF3)3|tris(trifluoromethylthio)methyl|0.51|0.53|0.49|0.04|74|[*]C(SC(F)(F)F)(SC(F)(F)F)SC(F)(F)F
322|SeC(CF3)3|nonafluoro-tert-butylselanyl|0.49|0.54|0.46|0.08|76|[*][Se]C(C(F)(F)F)(C(F)(F)F)C(F)(F)F
323|C(CN)3|tricyanomethyl|0.97|0.96|0.92|0.04|165|[*]C(C#N)(C#N)C#N
324|cyclo-1-(OH)C4F6|2,2,3,3,4,4-hexafluoro-1-hydroxycyclobutyl|0.36|0.37|0.36|0.01|109|[*]C1(O)C(F)(F)C(F)(F)C1(F)F
325|CH=C(CN)2|2,2-dicyanovinyl|0.66|0.84|0.57|0.27|93|[*]C=C(C#N)C#N
326|2-(5-bromofuryl)|5-bromofuran-2-yl|0.15|0.00|0.23|-0.23|94,95|[*]c1ccc(Br)o1
327|maleimido|maleimido|0.33|0.27|0.36|-0.09|108|[*]N1C(=O)C=CC1=O
328|3-chloro-1-pyrroline-2,5-dione|3-chloro-2,5-dioxopyrrolinyl|0.47|0.46|0.47|-0.01|108|
329|3-pyridazinyl|pyridazin-3-yl|0.28|0.48|0.21|0.27|61|[*]c1cccnn1
330|CH=CHCH=CH|benzo (3,4-, fused ring)|0.04|0.04|0.07|-0.03|183|[*]C=CC=C[*]
331|C(Me)(CN)2|1,1-dicyanoethyl|0.60|0.57|0.59|-0.02|74|[*]C(C)(C#N)C#N
332|4-pyrimidinyl|pyrimidin-4-yl|0.30|0.63|0.18|0.45|277|[*]c1ccncn1
333|2-pyrimidinyl|pyrimidin-2-yl|0.23|0.53|0.13|0.40|277|[*]c1ncccn1
334|5-pyrimidinyl|pyrimidin-5-yl|0.28|0.39|0.25|0.14|277|[*]c1cncnc1
338|2-selenienyl|selenophen-2-yl|0.06|0.04|0.10|-0.06|84|[*]c1ccc[se]1
339|2-tellurienyl|tellurophen-2-yl|0.06|0.03|0.10|-0.07|84|[*]c1ccc[te]1
341|1-pyrroline-2,5-dione|2,5-dioxopyrrolinyl|0.34|0.31|0.36|-0.05|108|
342|CH=CHCOMe|3-oxobut-1-enyl|0.21|-0.01|0.31|-0.32|155|[*]C=CC(C)=O
343|I(OCOMe)2|diacetoxy-λ³-iodanyl|0.85|0.88|0.80|0.08|110|[*]I(OC(C)=O)OC(C)=O
344|N(COMe)2|diacetylamino|0.35|0.33|0.36|-0.03|74|[*]N(C(C)=O)C(C)=O
345|cyclobutyl|cyclobutyl|-0.05|-0.14|0.02|-0.16|85|[*]C1CCC1
346|COCHMe2|isobutyryl|0.38|0.47|0.35|0.12|74,119|[*]C(=O)C(C)C
347|(CH2)4|tetramethylene (3,4-, fused ring)|-0.48|-0.48|-0.40|-0.08|87|[*]CCCC[*]
348|NHCOCH(Me)2|isobutyramido|0.11|-0.10|0.21|-0.31|156|[*]NC(=O)C(C)C
350|CH(Me)Et|sec-butyl|-0.08|-0.12|-0.02|-0.10|74,87|[*]C(C)CC
351|CH2CH(Me)2|isobutyl|-0.07|-0.12|-0.01|-0.11|176,87|[*]CC(C)C
354|CH2C(OH)Me2|2-hydroxy-2-methylpropyl|-0.16|-0.17|-0.11|-0.06|74,102|[*]CC(C)(C)O
355|C(OMe)3|trimethoxymethyl|-0.03|-0.04|0.01|-0.05|74|[*]C(OC)(OC)OC
356|AsEt2|diethylarsanyl|0.22|0.00|0.32|-0.32|77|[*][As](CC)CC
357|As(O)Et2|diethylarsoryl|0.57|0.44|0.60|-0.16|77|[*][As](=O)(CC)CC
358|As(S)Et2|diethylarsorothioyl|0.52|0.44|0.54|-0.10|77|[*][As](=S)(CC)CC
359|NH(CH2)3CH3|butylamino|-0.34|-0.51|-0.21|-0.30|87,85|[*]NCCCC
361|PO(Et)2|diethylphosphoryl|0.37|0.47|0.33|0.14|79|[*]P(=O)(CC)CC
362|N=NPO(OEt)2|(diethoxyphosphoryl)azo|(0.16)|0.74|(-0.05)|(0.79)|72|[*]N=NP(=O)(OCC)OCC
364|P(Et)2|diethylphosphanyl|0.10|0.13|0.11|0.02|124|[*]P(CC)CC
365|P(S)Et2|diethylphosphorothioyl|0.39|0.46|0.36|0.10|79|[*]P(=S)(CC)CC
366|CH2N(CH3)3⁺|(trimethylammonio)methyl|0.40|0.44|0.38|0.06|74|[*]C[N+](C)(C)C
367|CH2CH2NH(CH3)2⁺|2-(dimethylammonio)ethyl|0.24|0.14|0.29|-0.15|74|[*]CC[NH+](C)C
368|CH2OSi(CH3)3|(trimethylsilyloxy)methyl|-0.04|-0.05|0.00|-0.05|74|[*]CO[Si](C)(C)C
370|PO(N(Me)2)2|bis(dimethylamino)phosphoryl|0.30|0.40|0.27|0.13|78|[*]P(=O)(N(C)C)N(C)C
371|P(N(Me)2)2|bis(dimethylamino)phosphanyl|0.18|0.25|0.17|0.08|164|[*]P(N(C)C)N(C)C
372|2-(methylcarbonyl)carboran-1-yl|2-acetyl-o-carboran-1-yl|0.40|0.63|0.31|0.32|111|
373|2-[(carbonyloxy)methyl]carboran-1-yl|2-[(carbonyloxy)methyl]-o-carboran-1-yl|0.70|0.74|0.66|0.08|111|
374|CH2-1-(1,2-(BH)10-C2Me)|(2-methyl-o-carboran-1-yl)methyl|0.10|0.11|0.12|-0.01|67|
375|C(CN)=C(CN)2|tricyanovinyl|0.77|0.98|0.65|0.33|74,165|[*]C(C#N)=C(C#N)C#N
376|2-(5-cyanofuryl)|5-cyanofuran-2-yl|0.25|0.10|0.32|-0.22|94,95|[*]c1ccc(C#N)o1
377|2-(5-formylfuryl)|5-formylfuran-2-yl|0.22|-0.05|0.34|-0.39|94,95|[*]c1ccc(C=O)o1
381|2-(4,6-dimethyl-s-triazinyl)|4,6-dimethyl-1,3,5-triazin-2-yl|0.25|0.39|0.21|0.18|121|[*]c1nc(C)nc(C)n1
382|1-cyclopentenyl|cyclopent-1-enyl|-0.06|-0.05|-0.03|-0.02|127|[*]C1=CCCC1
383|CH=CHCOOEt|3-ethoxy-3-oxoprop-1-enyl|0.19|0.03|0.27|-0.24|155|[*]C=CC(=O)OCC
384|cyclopentyl|cyclopentyl|-0.05|-0.14|0.02|-0.16|85|[*]C1CCCC1
385|COC(Me)3|pivaloyl|0.27|0.32|0.26|0.06|74,119|[*]C(=O)C(C)(C)C
386|NHCO2(CH2)3CH3|butoxycarbonylamino|0.06|-0.05|0.13|-0.18|126|[*]NC(=O)OCCCC
387|C(Et)(Me)2|tert-pentyl|-0.06|-0.18|0.03|-0.21|85|[*]C(C)(C)CC
388|CH2C(Me)3|neopentyl|-0.05|-0.17|0.03|-0.20|85|[*]CC(C)(C)C
389|(CH2)4CH3|pentyl|-0.08|-0.15|-0.01|-0.14|174|[*]CCCCC
390|O(CH2)4CH3|pentyloxy|0.10|(-0.34)|0.29|(-0.63)|183|[*]OCCCCC
391|CH2PO(OEt)2|(diethoxyphosphoryl)methyl|0.12|0.06|0.17|-0.11|85|[*]CP(=O)(OCC)OCC
392|CH2CH2N(CH3)3⁺|2-(trimethylammonio)ethyl|0.16|0.13|0.19|-0.06|74,189|[*]CC[N+](C)(C)C
393|CH2CH2Si(Me)3|2-(trimethylsilyl)ethyl|-0.16|-0.17|-0.11|-0.06|74,132|[*]CC[Si](C)(C)C
394|Si(Me)2OSi(Me)3|pentamethyldisiloxanyl|0.00|-0.01|0.04|-0.05|160|[*][Si](C)(C)O[Si](C)(C)C
395|C6Cl5|pentachlorophenyl|0.25|0.24|0.27|-0.03|151|[*]c1c(Cl)c(Cl)c(Cl)c(Cl)c1Cl
396|C6F5|pentafluorophenyl|0.26|0.27|0.27|0.00|151|[*]c1c(F)c(F)c(F)c(F)c1F
397|P(O)(C3F7)2|bis(heptafluoropropyl)phosphoryl|0.95|1.10|0.84|0.26|64|[*]P(=O)(C(F)(F)C(F)(F)C(F)(F)F)C(F)(F)C(F)(F)C(F)(F)F
398|OP(O)(C3F7)2|[bis(heptafluoropropyl)phosphoryl]oxy|0.66|0.56|0.67|-0.11|64|[*]OP(=O)(C(F)(F)C(F)(F)C(F)(F)F)C(F)(F)C(F)(F)C(F)(F)F
399|NHP(O)(C3F7)2|[bis(heptafluoropropyl)phosphoryl]amino|0.28|0.18|0.33|-0.15|64|[*]NP(=O)(C(F)(F)C(F)(F)C(F)(F)F)C(F)(F)C(F)(F)C(F)(F)F
400|CH2Co(CN)5³⁻|(pentacyanocobaltato)methyl|-0.53|-0.68|-0.39|-0.29|150|[*]C[Co-3](C#N)(C#N)(C#N)(C#N)C#N
401|CH2Mn(CO)5|(pentacarbonylmanganese)methyl|-0.14|-0.44|0.02|-0.46|150|
402|C6H2-2,4,6-(NO2)3|2,4,6-trinitrophenyl (picryl)|0.26|0.30|0.26|0.04|170|[*]c1c([N+](=O)[O-])cc([N+](=O)[O-])cc1[N+](=O)[O-]
403|C6H4-3-Br|3-bromophenyl|0.09|0.08|0.12|-0.04|161|[*]c1cccc(Br)c1
404|C6H4-4-Br|4-bromophenyl|0.15|0.12|0.18|-0.06|85|[*]c1ccc(Br)cc1
405|C6H4-3-Cl|3-chlorophenyl|0.15|0.10|0.19|-0.09|85|[*]c1cccc(Cl)c1
406|C6H4-4-Cl|4-chlorophenyl|0.15|0.12|0.18|-0.06|85|[*]c1ccc(Cl)cc1
407|C6H4-3-F|3-fluorophenyl|0.15|0.10|0.19|-0.09|85|[*]c1cccc(F)c1
408|C6H4-4-F|4-fluorophenyl|0.12|0.06|0.17|-0.11|85|[*]c1ccc(F)cc1
409|OC6H4-4-F|4-fluorophenoxy|-0.08|-0.10|-0.03|-0.07|106|[*]Oc1ccc(F)cc1
410|C6H4-3-I|3-iodophenyl|0.13|0.06|0.18|-0.12|85|[*]c1cccc(I)c1
411|C6H4-4-I|4-iodophenyl|0.14|0.10|0.18|-0.08|85|[*]c1ccc(I)cc1
412|C6H4-3-NO2|3-nitrophenyl|0.21|0.20|0.23|-0.03|85|[*]c1cccc([N+](=O)[O-])c1
414|SC6H4-4-NO2|(4-nitrophenyl)thio|0.32|0.24|0.36|-0.12|85|[*]Sc1ccc([N+](=O)[O-])cc1
415|SOC6H4-4-NO2|(4-nitrophenyl)sulfinyl|0.58|0.60|0.55|0.05|85|[*]S(=O)c1ccc([N+](=O)[O-])cc1
416|2-benzotriazolyl|2H-benzotriazol-2-yl|0.49|0.51|0.47|0.04|74|[*]n1nc2ccccc2n1
418|N(O)=NSO2C6H5|(phenylsulfonyl)-NNO-azoxy|0.69|0.79|0.62|0.17|281|[*][N+]([O-])=NS(=O)(=O)c1ccccc1
422|2-(5-acetylfuryl)|5-acetylfuran-2-yl|0.24|0.08|0.31|-0.23|94,95|[*]c1ccc(C(C)=O)o1
423|2-(6-methylpyronyl)|6-methyl-4-oxo-4H-pyran-2-yl|0.38|0.43|0.36|0.07|115|[*]C1=CC(=O)C=C(C)O1
425|OSO2C6H5|benzenesulfonyloxy|0.36|0.33|0.37|-0.04|156|[*]OS(=O)(=O)c1ccccc1
428|NHSO2C6H5|benzenesulfonamido|0.16|0.01|0.24|-0.23|156|[*]NS(=O)(=O)c1ccccc1
429|SO2NHC6H5|phenylsulfamoyl|0.56|0.65|0.51|0.14|74|[*]S(=O)(=O)Nc1ccccc1
430|2-(5-ethylfuryl)|5-ethylfuran-2-yl|0.09|-0.13|0.20|-0.33|94,95|[*]c1ccc(CC)o1
431|1-(2,5-dimethylpyrryl)|2,5-dimethylpyrrol-1-yl|0.49|0.38|0.52|-0.14|93|[*]n1c(C)ccc1C
432|1-cyclohexenyl|cyclohex-1-enyl|-0.10|-0.08|-0.07|-0.01|127|[*]C1=CCCCC1
434|N(C3H7)2|dipropylamino|-0.26|-0.93|0.06|-0.99|113|[*]N(CCC)CCC
435|(CH2)4NMe2|4-(dimethylamino)butyl|-0.08|-0.16|-0.01|-0.15|74|[*]CCCCN(C)C
436|PO(isopropyl)2|diisopropylphosphoryl|0.37|0.41|0.36|0.05|79|[*]P(=O)(C(C)C)C(C)C
437|P(isopropyl)2|diisopropylphosphanyl|0.02|0.06|0.04|0.02|69|[*]P(C(C)C)C(C)C
438|P(O)(OPr)2|dipropoxyphosphoryl|0.38|0.50|0.33|0.17|152|[*]P(=O)(OCCC)OCCC
439|Ge(Et)3|triethylgermyl|0.00|0.00|0.03|-0.03|74,183|[*][Ge](CC)(CC)CC
440|(CH2)3N(CH3)3⁺|3-(trimethylammonio)propyl|0.06|-0.01|0.12|-0.13|74|[*]CCC[N+](C)(C)C
441|Si(OEt)3|triethoxysilyl|0.02|0.08|0.03|0.05|74|[*][Si](OCC)(OCC)OCC
442|P(C2H5)3⁺|triethylphosphonio|0.99|0.98|0.94|0.04|78|[*][P+](CC)(CC)CC
443|Sn(Et)3|triethylstannyl|0.00|0.00|0.03|-0.03|74,183|[*][Sn](CC)(CC)CC
444|P(=NSO2CF3)(C3F7)2|bis(heptafluoropropyl)(triflylimino)-λ⁵-phosphanyl|1.24|1.37|1.11|0.26|63|[*]P(=NS(=O)(=O)C(F)(F)F)(C(F)(F)C(F)(F)C(F)(F)F)C(F)(F)C(F)(F)C(F)(F)F
445|Si(NMe2)3|tris(dimethylamino)silyl|-0.04|-0.04|0.00|-0.04|74|[*][Si](N(C)C)(N(C)C)N(C)C
446|2-benzoxazolyl|benzoxazol-2-yl|0.30|0.33|0.30|0.04|138|[*]c1nc2ccccc2o1
447|2-benzthiazolyl|benzothiazol-2-yl|0.27|0.29|0.27|0.02|138|[*]c1nc2ccccc2s1
451|N=CHC6H5|benzylideneamino|-0.08|-0.55|0.14|-0.69|156|[*]N=Cc1ccccc1
452|CH=NC6H5|(phenylimino)methyl|0.35|0.42|0.33|0.09|136,137|[*]C=Nc1ccccc1
455|C6H4-4-Me|4-methylphenyl (p-tolyl)|0.06|-0.03|0.12|-0.15|85|[*]c1ccc(C)cc1
457|N=NC6H3-5-Me-2-OH|(2-hydroxy-5-methylphenyl)azo|0.27|0.31|0.26|0.05|156|[*]N=Nc1cc(C)ccc1O
459|CH(OH)C6H5|hydroxy(phenyl)methyl|0.00|-0.03|0.05|-0.08|74,175|[*]C(O)c1ccccc1
460|CH2OC6H5|phenoxymethyl|0.06|0.07|0.08|-0.01|128,282|[*]COc1ccccc1
461|CH2SO2C6H5|(phenylsulfonyl)methyl|0.15|0.16|0.17|-0.01|128,282|[*]CS(=O)(=O)c1ccccc1
462|C(Et)3|3-ethylpentan-3-yl|-0.07|-0.20|0.02|-0.22|85|[*]C(CC)(CC)CC
463|(CH2)6CH3|heptyl|-0.07|-0.16|0.00|-0.16|85|[*]CCCCCCC
464|SiMe(OSi(Me)3)2|heptamethyltrisiloxan-3-yl|-0.02|-0.01|0.01|-0.02|160|[*][Si](C)(O[Si](C)(C)C)O[Si](C)(C)C
465|CF2CF2C6H4-4-F|1,1,2,2-tetrafluoro-2-(4-fluorophenyl)ethyl|0.34|0.39|0.32|0.07|109|[*]C(F)(F)C(F)(F)c1ccc(F)cc1
467|CH=NCOC6H5|(benzoylimino)methyl|0.39|0.51|0.34|0.17|74|[*]C=NC(=O)c1ccccc1
469|CH2Fe(CO)2(π-C5H5)|CpFe(CO)₂-methyl|-0.26|-0.49|-0.11|-0.38|150|
470|CH=NNHCOC6H5|(benzoylhydrazono)methyl|0.39|0.51|0.34|0.17|93|[*]C=NNC(=O)c1ccccc1
471|N=CHC6H4-4-OMe|(4-methoxybenzylidene)amino|-0.07|-0.54|0.15|-0.69|156|[*]N=Cc1ccc(OC)cc1
472|NHCOC6H4-4-OMe|4-methoxybenzamido|0.09|-0.06|0.17|-0.23|156|[*]NC(=O)c1ccc(OC)cc1
473|SCH=NSO2C6H4-4-Me|as printed (same values as no. 478)|0.65|0.70|0.61|0.09|74|
474|C6H4-4-Et|4-ethylphenyl|0.07|-0.02|0.13|-0.15|85|[*]c1ccc(CC)cc1
475|CH2CH2C6H5|2-phenylethyl|-0.07|-0.12|-0.01|-0.11|74|[*]CCc1ccccc1
476|N=C(Me)NHC6H5|N'-phenylacetimidamido|0.29|0.08|0.38|-0.30|133|[*]N=C(C)Nc1ccccc1
477|Si(C6H5)(Me)2|dimethyl(phenyl)silyl|0.04|0.07|0.06|0.01|74|[*][Si](C)(C)c1ccccc1
478|S(Me)=NSO2C6H4-4-Me|S-methyl-N-tosylsulfilimino|0.65|0.70|0.61|0.09|205|[*]S(C)=NS(=O)(=O)c1ccc(C)cc1
479|2,4,6-trimethylpyridinium|2,4,6-trimethylpyridinio|0.62|0.58|0.61|-0.03|73|[*][n+]1c(C)cc(C)cc1C
480|PO(CMe3)2|di-tert-butylphosphoryl|0.31|0.41|0.28|0.13|79|[*]P(=O)(C(C)(C)C)C(C)(C)C
481|PO(C4H9)2|dibutylphosphoryl|0.35|0.49|0.30|0.19|152|[*]P(=O)(CCCC)CCCC
482|PO(OC4H9)2|dibutoxyphosphoryl|0.41|0.57|0.35|0.22|85|[*]P(=O)(OCCCC)OCCCC
483|P(CMe3)2|di-tert-butylphosphanyl|0.01|0.15|-0.01|0.16|69|[*]P(C(C)(C)C)C(C)(C)C
484|C6H5Cr(CO)3|(benzene)tricarbonylchromium|0.29|0.14|0.36|-0.22|104|
485|2-benzo-4-thiopyronyl|benzo-4-thiopyron-2-yl|0.34|0.35|0.34|0.01|115|
486|2-(benzothiopyronyl)|benzothiopyron-2-yl|0.48|0.45|0.48|-0.03|115|
487|2-(benzo-1,4-pyronyl)|4-oxo-4H-chromen-2-yl|0.41|0.40|0.41|-0.01|115|[*]C1=CC(=O)c2ccccc2O1
488|CH=CHCOC6H4-4-NO2|3-(4-nitrophenyl)-3-oxoprop-1-enyl|0.15|0.05|0.21|-0.16|155|[*]C=CC(=O)c1ccc([N+](=O)[O-])cc1
489|CH2Mo(CO)3(C5H5)|CpMo(CO)₃-methyl|-0.21|-0.45|-0.07|-0.38|150|
490|CH=CHCOC6H5|3-oxo-3-phenylprop-1-enyl|0.18|0.05|0.25|-0.20|155|[*]C=CC(=O)c1ccccc1
491|C6H4-4-CHMe2|4-isopropylphenyl|0.08|0.01|0.13|-0.12|85|[*]c1ccc(C(C)C)cc1
492|Si(OSiMe3)3|tris(trimethylsilyloxy)silyl|-0.09|-0.01|-0.08|0.07|160|[*][Si](O[Si](C)(C)C)(O[Si](C)(C)C)O[Si](C)(C)C
494|ferricenium⁺|ferricenium-yl|0.29|0.29|0.30|-0.01|100|
495|ferrocenonium⁺|ferrocenonium|0.05|0.29|-0.01|0.30|101|
496|C6H4-4-CMe3|4-tert-butylphenyl|0.07|0.01|0.12|-0.11|85|[*]c1ccc(C(C)(C)C)cc1
498|1-dibenzarsenyl|dibenzarsenyl|0.19|0.13|0.23|-0.10|65|
499|1-dibenzoarsoxyl|dibenzoarsoxyl|0.17|0.09|0.22|-0.13|65|
500|1-dibenzoarsazinyl|dibenzoarsazinyl|0.14|0.09|0.18|-0.09|66|
501|As(C6H5)2|diphenylarsanyl|0.03|0.09|0.04|0.05|125|[*][As](c1ccccc1)c1ccccc1
502|AsO(C6H5)2|diphenylarsoryl|0.54|0.64|0.49|0.15|81|[*][As](=O)(c1ccccc1)c1ccccc1
503|P(C6H5)2(BCl3)|diphenylphosphanyl–trichloroborane complex|0.67|0.72|0.62|0.10|164|[*][P+](c1ccccc1)(c1ccccc1)[B-](Cl)(Cl)Cl
507|PS(C6H5)2|diphenylphosphorothioyl|0.29|0.47|0.23|0.24|144|[*]P(=S)(c1ccccc1)c1ccccc1
508|P(N(C3H7)2)C6H4-3-F|(dipropylamino)(3-fluorophenyl)phosphanyl|0.20|0.24|0.20|0.04|122,123|[*]P(N(CCC)CCC)c1cccc(F)c1
509|benzo[h]chromonyl|4-oxo-4H-benzo[h]chromen-2-yl|0.37|0.38|0.37|0.01|61|[*]C1=CC(=O)c2ccc3ccccc3c2O1
510|benzo[f]chromonyl|1-oxo-1H-benzo[f]chromen-3-yl|0.38|0.38|0.38|0.00|61|[*]C1=CC(=O)c2c(ccc3ccccc23)O1
511|1-Ph-benzimidazol-2-yl|1-phenylbenzimidazol-2-yl|0.17|0.21|0.17|0.04|138|[*]c1nc2ccccc2n1-c1ccccc1
512|CH(C6H5)2|benzhydryl (diphenylmethyl)|-0.03|-0.05|0.01|-0.06|74,102|[*]C(c1ccccc1)c1ccccc1
513|N-Me-phenarsazinyl|10-methylphenarsazin-5-yl|0.12|0.07|0.16|-0.09|66|[*][As]1c2ccccc2N(C)c2ccccc21
514|PO(C6H5)C6H4-4-Me|phenyl(p-tolyl)phosphoryl|0.13|0.30|0.09|0.21|91|[*]P(=O)(c1ccccc1)c1ccc(C)cc1
515|CH2PO(C6H5)2|(diphenylphosphoryl)methyl|0.14|0.01|0.21|-0.20|85|[*]CP(=O)(c1ccccc1)c1ccccc1
516|PS(C6H5)C6H4-4-Me|phenyl(p-tolyl)phosphorothioyl|0.09|0.30|0.03|0.27|91|[*]P(=S)(c1ccccc1)c1ccc(C)cc1
517|P(CH3)(C6H5)2⁺|methyldiphenylphosphonio|1.13|1.18|1.04|0.14|91|[*][P+](C)(c1ccccc1)c1ccccc1
518|Si(Me)(C6H5)2|methyldiphenylsilyl|0.10|0.13|0.11|0.02|74|[*][Si](C)(c1ccccc1)c1ccccc1
519|COOCH(C6H5)2|benzhydryloxycarbonyl|0.36|0.56|0.28|0.28|175|[*]C(=O)OC(c1ccccc1)c1ccccc1
520|PO(C6H4-4-Me)2|di(p-tolyl)phosphoryl|0.17|0.30|0.14|0.16|91|[*]P(=O)(c1ccc(C)cc1)c1ccc(C)cc1
521|PS(C6H4-4-Me)2|di(p-tolyl)phosphorothioyl|0.20|0.23|0.20|0.03|91|[*]P(=S)(c1ccc(C)cc1)c1ccc(C)cc1
522|P(CH3)(C6H5)(C6H4-4-Me)⁺|methyl(phenyl)(p-tolyl)phosphonio|1.09|1.11|1.02|0.09|91|[*][P+](C)(c1ccccc1)c1ccc(C)cc1
523|P(CH3)(C6H4-4-Me)2⁺|methyldi(p-tolyl)phosphonio|1.13|1.18|1.04|0.14|91|[*][P+](C)(c1ccc(C)cc1)c1ccc(C)cc1
524|Ge(C6H5)3|triphenylgermyl|0.05|0.08|0.07|0.01|98|[*][Ge](c1ccccc1)(c1ccccc1)c1ccccc1
525|2-Me-4,6-Ph2-pyridinium|2-methyl-4,6-diphenylpyridinio|0.65|0.70|0.61|0.09|61|[*][n+]1c(C)cc(-c2ccccc2)cc1-c1ccccc1
526|N=P(C6H5)3|(triphenylphosphoranylidene)amino|-0.33|-0.77|-0.10|-0.67|83|[*]N=P(c1ccccc1)(c1ccccc1)c1ccccc1
527|Si(C6H5)3|triphenylsilyl|-0.03|0.10|-0.04|0.14|132|[*][Si](c1ccccc1)(c1ccccc1)c1ccccc1
528|Sn(C6H5)3|triphenylstannyl|(0.53)|(0.27)|(0.62)|(-0.35)|164|[*][Sn](c1ccccc1)(c1ccccc1)c1ccccc1
529|C(C6H5)3|trityl (triphenylmethyl)|-0.01|0.02|0.01|0.01|131|[*]C(c1ccccc1)(c1ccccc1)c1ccccc1
530|2,4,6-Ph3-pyridinium|2,4,6-triphenylpyridinio|0.34|0.33|0.35|-0.02|73|[*][n+]1c(-c2ccccc2)cc(-c2ccccc2)cc1-c1ccccc1`;

/** How many of TABLE_I's lines are the common groups (shown first). */
export const COMMON_COUNT = 124;

/** Values Table I misprints, given in TABLE_I as worked out from the paper's own equation. */
export const CORRECTED: Record<number, string> = {
  213: 'R corrected: Table I prints 0.10, but R = σp − F (eq 2) = 0.30 − 0.40 = −0.10',
  388: 'R corrected: Table I prints −0.14, but R = σp − F (eq 2) = −0.17 − 0.03 = −0.20',
  523: 'R corrected: Table I prints 1.14, but R = σp − F (eq 2) = 1.18 − 1.04 = 0.14 (no. 517, with the same σ values, prints 0.14)',
};

/**
 * Table V (σp⁺ and σp⁻, each measured in its own paper): Table V no. | Table I no. (empty for a
 * group Table I doesn't have, listed in TABLE_V_ONLY) | σp⁺ | its reference | σp⁻ | its reference.
 */
export const TABLE_V = `1||0.86|267||
2|2|0.15|194|0.25|206
3|4|0.41|245||
4|5|0.11|194|0.19|251
5|10|0.38|208||
6|11|0.62|208||
7|12|0.33|208||
8|13|0.57|249||
9|14|0.57|249||
10|15|-0.07|194|-0.03|198
11|18|||1.54|109
12|27|||0.86|179
13|28|0.14|194|0.27|251
14|31|||1.63|197
15|32|0.79|194|1.27|87
16|34|||3.43|182
17|37|||0.11|130
18|38|-2.30|218|-0.82|88
19|39|||0.08|235
20||||-0.16|202
21|40|||0.58|239
22|41|-2.62|269||
23|43|0.00||0.00|
24|42|||0.46|244
25|45|-0.92|194|-0.37|251
26|49|-0.03|269||
27||||0.97|244
28|50|0.38|267||
29|51|-1.30|194|-0.15|195
30|53|||0.94|196
31|55|0.06|253||
32|58|||-0.56|74
33|60|0.14|237||
34|63|||0.70|165
35|64|0.79|236|1.24|250
36|70|0.61|194|0.65|178
37|74|0.74|72||
38|75|||0.27|145
39|76|||1.05|221
40|78|||1.63|221
41|80|||0.49|221
42|81|||0.64|145
43|82|||0.53|221
44|84|0.66|194|1.00|196
45|89|-0.19|236||
46|92|||0.34|238
47|93|||0.59|251
48|95|1.03|72||
49|99|-0.02|194|0.31|200
51|104|||0.11|221
52|105|||0.93|221
53|106|||1.44|221
54|112|||0.57|165
55|117|0.73|236|1.03|200
56|118|0.42|194|0.77|206
57|119|0.02|243||
58|120|-0.01|194||
59||||1.17|221
60|127|||0.61|206
61|132|-0.68|254||
62|133|-0.31|194|-0.17|204
63|135|0.08|245||
64|136|0.23|245||
65|142|-0.78|194|-0.26|198
66|143|-0.04|243|0.08|200
67|144|||0.73|222
68|147|||0.89|235
69|148|||1.13|278
70|150|0.16|241||
71|151|-0.60|194|0.06|214
72|154|-1.81|269||
73||||0.32|247
74|160|0.85|236|1.09|266
75|165|||0.69|165
76|166|||0.28|178
77|169|||0.53|145
78|175|0.18|171|0.53|223
79|179|||0.21|178
80|180|||0.61|178
81||-4.67|271||
82|185|||0.14|109
83|189|0.16|243|0.11|263
84|190|||0.88|193
85|191|-0.53|271|-0.16|88
86|193|-0.16|248||
87|200|||0.84|200
88|201|||0.46|195
89|202|-0.19|265||
90|203|0.49|194|0.75|74
91||-0.01|243|0.05|263
92|211|-0.60|194|-0.46|251
93|219|-0.30|194|-0.19|251
94|221|-0.81|256|-0.28|251
95|223|-0.05|243||
96||||-0.15|251
97|228|0.02|245||
98|229|0.17|245||
99|231|-1.70|194|-0.12|195
100|233|0.86|275|0.99|215
101|236|-0.46|72||
102|238|||0.74|258
103|240|||0.22|224
104||||0.62|224
105|241|||0.83|207
106|244|-0.04|249||
107|245|||0.32|242
108|248|||0.52|210
109||||0.85|240
110|251|||0.65|221
111|254|||0.68|172
112|255|||1.75|70
113|256|||1.76|70
114|257|||0.65|70
115|258|||0.69|70
116|260|||0.48|172
117|264|||0.34|165
118|263|||0.29|165
119|265|||0.83|221
120||||0.62|188
121|270|-0.41|209|-0.09|204
122|273|-0.22|279|-0.18|201
123||0.03|243||
124|277|0.48|194|0.75|251
125||||0.07|88
126|282|-0.41|226||
127||||0.70|266
128|288|-0.28|194|-0.16|251
129|289|-0.29|225|-0.06|251
130|293|-0.85|254||
131|294|-0.83|256||
132|300|0.41|194|0.77|206
133|302|-0.02|245||
134|304|0.01|245||
135|305|0.13|245||
136|306|||0.95|258
137|307|0.02|194||
138|308|-0.12|216||
139|317|||0.71|120
140|318|||0.73|172
141|319|||1.81|70
142|320|||0.79|70
143|325|0.82|241|1.20|165
144|335|-0.39|228|0.21|228
145|336|-0.43|228|0.19|159
146|337|-0.38|228|0.13|159
147|338|||0.22|84
148|339|||0.25|84
149|330|-0.14|194|0.12|197
150|342|0.39|261||
151|345|-0.29|127|-0.07|204
152||-0.16|194||
153|347|-0.41|226||
154|349|-0.26|194|-0.13|206
155|351|||0.01|251
156|352|-0.29|225|-0.12|251
157|356|||0.08|219
158|360|-2.07|231|-0.43|251
159||-0.61|262||
160|366|||0.57|88
161|369|-0.62|229|-0.22|132
162||-0.92|229||
163|375|||1.70|165
164|378|||0.55|266
165|379|||0.58|266
166|380|||0.81|266
167|384|-0.30|127|-0.18|204
168||-0.26|279||
169|388|-0.31|270||
170|389|||-0.19|201
171|392|||0.09|88
172|393|||-0.16|132
173||-0.23|246|0.02|246
174|396|0.23|255|0.43|257
175|404|-0.18|226|0.03|212
176|405|-0.15|226||
177|406|-0.19|226||
178|413|0.04|260|0.31|212
179|414|-0.17|225|0.56|212
180||||1.04|217
181||||1.06|213
182|416|||0.57|220
183|417|-0.18|194|0.02|212
184|419|-0.19|225|0.45|212
185|420|-0.50|194|-0.10|212
186|421|||0.76|266
187|424|||1.21|213
188||||1.11|233
189|426|-0.55|225|0.18|212
190||-0.47|268|0.13|212
191|427|-1.40|194|-0.29|212
192|428|-0.98|269||
193||||1.33|213
194|433|-0.29|127|-0.14|204
195|440|||0.09|88
196|441|0.17|237||
197||0.04|249||
198|446|||0.68|234
199|447|||0.65|234
200|448|0.51|236|0.83|74
201|449|-0.07|272||
202|451|||0.22|199
203|452|||0.54|199
204|453|-0.60|194||
205|456|-0.28|225|-0.09|212
206|466|-0.03|192|0.30|212
207|468|-1.00|192|0.13|259
208|475|-0.28|225|-0.12|212
209|477|0.08|273||
210|478|||1.00|205
211|487|||0.70|61
212|493|-1.00|141|-0.03|141
213|497|-0.38|270|-0.14|252
214|501|||0.29|219
215|505|0.52|208|0.68|211
216|506|0.70|208|0.26|230
217|507|||0.73|230
218|512|-0.19|264||
219|518|-0.04|276||
220|524|-0.15|249||
221|526|-1.65|232|-0.77|227
222|527|0.12|237|0.29|132
223|529|-0.21|264||`;

/** Groups with σp⁺ or σp⁻ in Table V but no row in Table I: Table V no. | group | name | SMILES. */
export const TABLE_V_ONLY = `1|BCl2|dichloroboryl|[*]B(Cl)Cl
20|PO3²⁻|phosphonato|[*]P(=O)([O-])[O-]
27|As(O)(OH)2|arsono|[*][As](=O)(O)O
59|SO2CH2F|fluoromethylsulfonyl|[*]S(=O)(=O)CF
73|NHC(NH2)=NH2⁺|guanidinio|[*]NC(N)=[NH2+]
81|CH⁻CN|cyanomethanide (carbanion)|[*][CH-]C#N
91|CH2COOH|carboxymethyl|[*]CC(=O)O
96|CH2CH2OH|2-hydroxyethyl|[*]CCO
104|P(S)(CH3)2|dimethylphosphorothioyl|[*]P(C)(C)=S
109|2-(4,6-dichloro-s-triazinyl)|4,6-dichloro-1,3,5-triazin-2-yl|[*]c1nc(Cl)nc(Cl)n1
120|CH=CHCOOH|2-carboxyvinyl|[*]C=CC(=O)O
123|CH2COCH3|2-oxopropyl|[*]CC(C)=O
125|CH2COOCH3|(methoxycarbonyl)methyl|[*]CC(=O)OC
127|CON(CH3)2|dimethylcarbamoyl|[*]C(=O)N(C)C
152|CH2COOEt|(ethoxycarbonyl)methyl|[*]CC(=O)OCC
159|CH2Ge(CH3)3|(trimethylgermyl)methyl|[*]C[Ge](C)(C)C
162|CH2Sn(CH3)3|(trimethylstannyl)methyl|[*]C[Sn](C)(C)C
168|CH2CH=C(CH3)2|prenyl (3-methylbut-2-enyl)|[*]CC=C(C)C
173|Si(CH3)2Si(CH3)3|pentamethyldisilanyl|[*][Si](C)(C)[Si](C)(C)C
180|SO2C6H4-3-NO2|(3-nitrophenyl)sulfonyl|[*]S(=O)(=O)c1cccc([N+](=O)[O-])c1
181|SO2C6H4-4-NO2|(4-nitrophenyl)sulfonyl|[*]S(=O)(=O)c1ccc([N+](=O)[O-])cc1
188|SO2OC6H5|phenoxysulfonyl|[*]S(=O)(=O)Oc1ccccc1
190|SeC6H5|phenylselanyl|[*][Se]c1ccccc1
193|SO2C6H4-4-NH2|(4-aminophenyl)sulfonyl|[*]S(=O)(=O)c1ccc(N)cc1
197|Si(C2H5)3|triethylsilyl|[*][Si](CC)(CC)CC`;

/** The papers the tables cite, by their reference number in Hansch, Leo and Taft, in short form. */
export const REFS: Record<number, string> = {
  61: "Mamaev et al., Adv. Heterocycl. Chem. 1987, 42, 1",
  62: "Kondratenko et al., Zh. Org. Khim. 1986, 22, 1542",
  63: "Yagupol'skii et al., Zh. Org. Khim. 1986, 22, 1947",
  64: "Yagupol'skii et al., Zh. Obshch. Khim. 1984, 54, 297",
  65: "Gavrilov and Khusnutdinova, Zh. Obshch. Khim. 1987, 57, 295",
  66: "Gavrilov and Khusnutdinova, Zh. Obshch. Khim. 1982, 52, 528",
  67: "Zakharkin et al., Zh. Obshch. Khim. 1970, 40, 2411",
  68: "Trub, Boitsov and Tsigin, Zh. Org. Khim. 1983, 19, 78",
  69: "Tsvetkov et al., Zh. Obshch. Khim. 1981, 51, 598",
  70: "Kondratenko et al., Zh. Obshch. Khim. 1983, 53, 2254",
  71: "Shkurko, Baram and Mamaev, Khim. Geterotsikl. Soedin. 1983, 66",
  72: "Kazitsyna et al., Dokl. Akad. Nauk SSSR 1977, 233, 213",
  73: "Claramunt and Elguero, Collect. Czech. Chem. Commun. 1981, 46, 584",
  74: "Perrin, Dempsey and Serjeant, pKa Prediction for Organic Acids and Bases (Chapman and Hall, 1981), Appendix",
  76: "Kondratenko et al., Zh. Org. Khim. 1980, 16, 1049",
  77: "Gel'fond et al., Zh. Obshch. Khim. 1980, 50, 447",
  78: "Tsvetkov et al., Zh. Obshch. Khim. 1978, 48, 1125",
  79: "Tsvetkov et al., Zh. Obshch. Khim. 1978, 48, 1125",
  80: "Kalinin et al., J. Organomet. Chem. 1979, 172, 391",
  81: "Palm, V. A., Tartu State University, private communication",
  82: "Herkstroeter, J. Am. Chem. Soc. 1973, 95, 8686",
  83: "Kukar et al., Zh. Obshch. Khim. 1972, 42, 268",
  84: "Fringuelli et al., J. Chem. Soc., Perkin Trans. 2 1980, 971",
  85: "Charton, Prog. Phys. Org. Chem. 1981, 13, 119",
  87: "Jaffé, Chem. Rev. 1953, 53, 191",
  88: "Hoefnagel et al., J. Org. Chem. 1978, 43, 4720",
  89: "Kurono et al., Chem. Pharm. Bull. 1975, 23, 340",
  90: "Fischer and Havinga, Recl. Trav. Chim. Pays-Bas 1974, 93, 21",
  91: "Schiemenz, Angew. Chem., Int. Ed. Engl. 1968, 7, 544; 545",
  92: "Ogata and Haba, J. Org. Chem. 1973, 38, 2779",
  93: "Hansch, Rockwell, Jow, Leo and Steller, J. Med. Chem. 1977, 20, 304",
  94: "Fisera et al., Collect. Czech. Chem. Commun. 1977, 42, 105",
  95: "Fisera et al., Collect. Czech. Chem. Commun. 1974, 39, 1711",
  96: "Kashik et al., Zh. Org. Khim. 1977, 13, 1104",
  97: "Kargin et al., Zh. Obshch. Khim. 1977, 47, 611",
  98: "Benkeser et al., J. Am. Chem. Soc. 1956, 78, 682",
  99: "Voronkov et al., Dokl. Akad. Nauk SSSR 1975, 222, 311",
  100: "Little et al., J. Am. Chem. Soc. 1962, 84, 2525",
  101: "Bitterwolf and Ling, J. Organomet. Chem. 1977, 141, 355",
  102: "Zuman, Collect. Czech. Chem. Commun. 1962, 27, 2035",
  103: "Yagupol'skii et al., Zh. Org. Khim. 1974, 10, 901",
  104: "Van Meurs et al., J. Organomet. Chem. 1977, 129, 347",
  105: "Kargin et al., Zh. Obshch. Khim. 1976, 46, 2357",
  106: "Meyer and Gutowsky, J. Phys. Chem. 1953, 57, 481",
  107: "Belyaev, Tovbis and Suboch, Zh. Org. Khim. 1976, 12, 1790",
  108: "Romanenko et al., Khim. Geterotsikl. Soedin. 1976, 906",
  109: "Sheppard and Sharts, Organic Fluorine Chemistry (Benjamin, 1969), p 348",
  110: "Yagupol'skii, Il'chenko and Kondratenko, Russ. Chem. Rev. 1974, 43, 32",
  111: "Zakharkin et al., Zh. Obshch. Khim. 1971, 41, 1309",
  112: "Thomas and Tomasik, Bull. Acad. Pol. Sci. 1975, 23, 65",
  113: "Price and Belanger, J. Am. Chem. Soc. 1954, 76, 2682",
  114: "Fringuelli, Marino and Taticchi, J. Chem. Soc. B 1971, 2304",
  115: "Tolmachev et al., Zh. Obshch. Khim. 1973, 43, 633",
  116: "Rudaya et al., Zh. Org. Khim. 1972, 8, 11",
  117: "Zakharkin and Kalinin, Zh. Obshch. Khim. 1973, 43, 853",
  118: "Yagupol'skii and Nazaretyan, Zh. Org. Khim. 1971, 7, 1016",
  119: "Bowden and Shaw, J. Chem. Soc. B 1971, 161",
  120: "Yagupol'skii et al., Zh. Org. Khim. 1973, 9, 669",
  121: "Nyquist and Wolfe, J. Org. Chem. 1974, 39, 2591",
  122: "Prikoszovich and Schindlbauer, Chem. Ber. 1969, 102, 2922",
  123: "Schindlbauer and Prikoszovich, Chem. Ber. 1969, 102, 2914",
  124: "Malakhova et al., Zh. Obshch. Khim. 1971, 41, 2837",
  125: "Tsvetkov et al., Zh. Obshch. Khim. 1969, 39, 2608",
  126: "Brock, J. Org. Chem. 1959, 24, 1802",
  127: "Hahn et al., J. Am. Chem. Soc. 1968, 90, 3404",
  128: "Exner and Boček, Collect. Czech. Chem. Commun. 1973, 38, 50",
  129: "Cecchi, Ric. Sci. 1958, 28, 2526",
  130: "Smith, Hall and Kan, J. Am. Chem. Soc. 1962, 84, 485",
  131: "Benkeser and Gosnell, J. Org. Chem. 1957, 22, 327",
  132: "Chernyshev and Tolstikova, Izv. Akad. Nauk 1961, 419",
  133: "Zuman, Substituent Effects in Organic Polarography (Plenum, 1967), p 76",
  134: "Bray and Barnes, J. Chem. Phys. 1957, 27, 551",
  135: "Linaberg, Acta Chem. Scand. 1970, 24, 2852",
  136: "Weiss et al., Tetrahedron 1966, 22, 825",
  137: "Ryan and Humffray, J. Chem. Soc. B 1966, 842",
  138: "Bystrov et al., Zh. Obshch. Khim. 1968, 38, 963",
  139: "Kondratenko et al., Zh. Obshch. Khim. 1971, 41, 2075",
  140: "Sedova et al., Zh. Obshch. Khim. 1969, 39, 2011",
  141: "Nesmeyanov et al., Tetrahedron Lett. 1966, 2381",
  142: "Kalfus et al., Collect. Czech. Chem. Commun. 1970, 35, 1195",
  143: "Freedman and Jaffé, J. Am. Chem. Soc. 1955, 77, 920",
  144: "Tsvetkov, Lobanov, Makhamatkhanov and Kabachnik, Tetrahedron 1969, 25, 5623",
  145: "Fawcett and Sheppard, J. Am. Chem. Soc. 1965, 87, 4341",
  146: "Van Poucke, Pollet and De Cat, Bull. Soc. Chim. Belg. 1966, 75, 573",
  147: "Zakharkin et al., Dokl. Akad. Nauk 1967, 174, 484",
  149: "Alper, Keung and Partis, J. Org. Chem. 1971, 36, 1352",
  150: "Johnson and Winterton, J. Chem. Soc. A 1970, 507",
  151: "Sheppard, J. Am. Chem. Soc. 1970, 92, 5419",
  152: "Tsvetkov et al., Zh. Obshch. Khim. 1969, 39, 2126",
  153: "Yagupol'skii and Yagupol'skaya, Dokl. Akad. Nauk SSSR 1960, 134, 1207",
  154: "Nishiguchi and Iwakura, J. Org. Chem. 1970, 35, 1591",
  155: "Ellam and Johnson, J. Org. Chem. 1971, 36, 2284",
  156: "Exner and Lakomý, Collect. Czech. Chem. Commun. 1970, 35, 1371",
  157: "Hall, J. Am. Chem. Soc. 1956, 78, 2570",
  158: "Kauer and Sheppard, J. Org. Chem. 1967, 32, 3580",
  159: "Fringuelli, Marino and Taticchi, J. Chem. Soc. B 1970, 1595",
  160: "Plzak et al., Collect. Czech. Chem. Commun. 1971, 36, 3115",
  161: "Berliner and Liu, J. Am. Chem. Soc. 1953, 75, 2417",
  162: "Orda et al., Zh. Obshch. Khim. 1965, 35, 1631",
  163: "Bystrov et al., Dokl. Akad. Nauk SSSR. 1963, 153, 1019",
  164: "Hogben and Graham, J. Am. Chem. Soc. 1969, 91, 283",
  165: "Sheppard, Trans. N.Y. Acad. Sci. 1967, 29, 700",
  166: "Kaczmarek et al., J. Chem. Soc., Perkin Trans. 2 1979, 1670",
  167: "Boloshchuk et al., Zh. Obshch. Khim. 1967, 37, 105",
  168: "Tsvetkov, Lobanov and Kabachnik, Teor. Eksp. Khim. 1966, 2, 458",
  169: "Tsvetkov, Lobanov and Kabachnik, Teor. Eksp. Khim. 1965, 1, 729",
  170: "Exner, Collect. Czech. Chem. Commun. 1966, 31, 65",
  171: "Landgrebe and Rynbrandt, J. Org. Chem. 1966, 31, 2585",
  172: "Sheppard, J. Am. Chem. Soc. 1965, 87, 2410",
  173: "Charton, J. Org. Chem. 1965, 30, 557",
  174: "Charton, J. Org. Chem. 1965, 30, 552",
  175: "Little et al., J. Am. Chem. Soc. 1964, 86, 1376 and 1382",
  176: "Charton, J. Chem. Soc. 1964, 85, 1205",
  177: "Šmejkal, Jonáš and Farkaš, Collect. Czech. Chem. Commun. 1964, 29, 2950",
  178: "Sheppard, J. Am. Chem. Soc. 1963, 85, 1314",
  179: "Sheppard, J. Am. Chem. Soc. 1962, 84, 3072",
  180: "White, Schlitt and Gwynn, J. Org. Chem. 1961, 26, 3613",
  181: "Hine, J. Am. Chem. Soc. 1960, 82, 4877",
  182: "Lewis and Johnson, J. Am. Chem. Soc. 1959, 81, 2070",
  183: "McDaniel and Brown, J. Org. Chem. 1958, 23, 420",
  184: "Stewart and Walker, Can. J. Chem. 1957, 35, 1561",
  185: "Bordwell and Boutan, J. Am. Chem. Soc. 1956, 78, 854",
  186: "Kochi and Hammond, J. Am. Chem. Soc. 1953, 75, 3452",
  187: "Charton, J. Org. Chem. 1963, 28, 3121",
  188: "Hammett, Physical Organic Chemistry (McGraw-Hill, 1940), p 188",
  189: "Smith and Menger, J. Org. Chem. 1969, 34, 77",
  190: "Hine and Bailey, J. Org. Chem. 1961, 26, 2098",
  192: "Kochi and Hammond, J. Am. Chem. Soc. 1953, 75, 3452",
  193: "Stewart and Walker, Can. J. Chem. 1957, 35, 1561",
  194: "Brown and Okamoto, J. Am. Chem. Soc. 1958, 80, 4979",
  195: "Bordwell and Bouton, J. Am. Chem. Soc. 1956, 78, 854",
  196: "Zollinger and Wittwer, Helv. Chim. Acta 1956, 39, 347",
  197: "Fickling et al., J. Am. Chem. Soc. 1959, 81, 4226",
  198: "Biggs and Robinson, J. Chem. Soc. 1961, 388",
  199: "Ryan and Humffray, J. Chem. Soc. B 1966, 842",
  200: "Barlin and Perrin, Quart. Rev. 1966, 20, 75",
  201: "Tribble and Traynham, J. Am. Chem. Soc. 1969, 91, 379",
  202: "Jaffé et al., J. Am. Chem. Soc. 1953, 75, 2209",
  204: "Shabarov et al., Zh. Org. Khim. 1968, 4, 1131",
  205: "Kucsman et al., Acta Chim. Acad. Sci. Hung. 1968, 57, 205",
  206: "Cohen and Jones, J. Am. Chem. Soc. 1963, 85, 3397; 3402",
  207: "Wehry, J. Am. Chem. Soc. 1967, 89, 41",
  208: "Retcofsky and Griffin, Tetrahedron Lett. 1966, 1975",
  209: "Jones and Jones, Tetrahedron Lett. 1966, 14, 1493",
  210: "Hawthorne et al., J. Am. Chem. Soc. 1965, 87, 4746",
  211: "Monagle et al., J. Org. Chem. 1967, 32, 2477",
  212: "Litvinenko, Izv. Acad. Nauk SSSR 1962, 1653",
  213: "Szmant and Suld, J. Am. Chem. Soc. 1956, 78, 3400",
  214: "Bordwell and Cooper, J. Am. Chem. Soc. 1952, 74, 1058",
  215: "Eliel and Nelson, J. Org. Chem. 1955, 20, 1657",
  216: "Buchman et al., Helv. Chim. Acta 1964, 47, 2037",
  217: "Meyers et al., J. Am. Chem. Soc. 1964, 86, 2944",
  218: "Hoefnagel and Wepster, J. Am. Chem. Soc. 1973, 95, 5357",
  219: "Gel'fond et al., Zh. Obshch. Khim. 1972, 42, 2454",
  220: "Cepciansky and Majer, Collect. Czech. Chem. Commun. 1969, 34, 72",
  221: "Titov et al., Zh. Org. Khim. 1971, 7, 2651",
  222: "Bordwell and Boutan, J. Am. Chem. Soc. 1957, 79, 717",
  223: "Eaborn et al., J. Chem. Soc. B 1969, 859",
  224: "Tsvetkov et al., Zh. Obshch. Khim. 1972, 42, 761",
  225: "Shamin and Falyakhov, Zh. Org. Khim. 1973, 9, 751",
  226: "Baker et al., J. Chem. Soc., Perkin Trans. 2 1972, 97",
  227: "Zhmurova et al., Zh. Obshch. Khim. 1973, 43, 79",
  228: "Fringuelli et al., J. Chem. Soc. B 1971, 2302; 2304",
  229: "Hartman and Traylor, J. Am. Chem. Soc. 1975, 97, 6147",
  230: "Schiemenz, Angew. Chem., Int. Ed. Engl. 1966, 5, 731",
  231: "Antonova et al., Zh. Org. Khim. 1975, 11, 1991",
  232: "Zhmurova et al., Zh. Obshch. Khim. 1973, 43, 1028",
  233: "Dell'Erba et al., J. Heterocycl. Chem. 1967, 4, 438",
  234: "Durmis et al., Collect. Czech. Chem. Commun. 1973, 38, 215",
  235: "Lindberg, Ark. Kemi 1970, 32, 317",
  236: "Nelson et al., J. Am. Chem. Soc. 1972, 94, 3089",
  237: "Rakita and Worsham, J. Organomet. Chem. 1977, 137, 145",
  238: "Kristian et al., Collect. Czech. Chem. Commun. 1963, 28, 1651",
  239: "Zollinger et al., Helv. Chim. Acta 1953, 36, 1711",
  240: "Ohto et al., Bull. Chem. Soc. Jpn. 1974, 47, 1301",
  241: "Cornelis et al., J. Org. Chem. 1977, 42, 381",
  242: "Zakharkin et al., Zh. Obshch. Khim. 1971, 41, 1521",
  243: "Cornish and Eaborn, J. Chem. Soc., Perkin Trans. 2 1975, 874",
  244: "Nuallain and Cinneide, J. Inorg. Nucl. Chem. 1973, 35, 2871",
  245: "Mares et al., Collect. Czech. Chem. Commun. 1971, 36, 2957",
  246: "Sakurai et al., J. Organomet. Chem. 1969, 18, 285",
  247: "Koike, Nippon Kagaku Zasshi 1962, 83, 917",
  248: "Peters, Polym. Lett. 1975, 13, 479",
  249: "Kuznetsov et al., Zh. Obshch. Khim. 1975, 45, 2396",
  250: "Zuhr, Ber. Bunsenges. Phys. Chem. 1964, 68, 169",
  251: "Zeng, Acta Chem. Sin. 1966, 32, 107",
  252: "Korolev et al., Zh. Org. Khim. 1978, 14, 1524",
  253: "Parr, J. Chem. Soc., Farad. Trans. 2 1978, 933",
  254: "Brown et al., J. Am. Chem. Soc. 1978, 100, 7946",
  255: "Taylor, J. Chem. Soc., Perkin Trans. 2 1973, 253",
  256: "Seshadri and Ganesan, Tetrahedron 1972, 28, 3827",
  257: "Rodionov et al., Izv. Akad. Nauk SSSR (as cited: Acad. Sci. SSSR) 1979, 20, 1327",
  258: "Schiemenz, Angew. Chem., Int. Ed. Engl. 1966, 5, 129",
  259: "Veschambre and Kergomard, Mem. Present Soc. Chem. 1965, 336",
  260: "Kortekaas et al., J. Chem. Soc., Perkin Trans. 2 1978, 445",
  261: "Saldabol et al., Zh. Org. Khim. 1980, 16, 1285",
  262: "Davis, J. Organomet. Chem. 1981, 206, 21",
  263: "Rackham and Davies, Anal. Lett. 1980, 13, 447",
  264: "Ansell and Taylor, J. Chem. Soc., Perkin Trans. 2 1978, 751",
  265: "Taylor, J. Chem. Soc., Perkin Trans. 2 1978, 755",
  266: "Bradamante and Pagani, J. Org. Chem. 1980, 45, 114",
  267: "Ramsey and Lonemuir, J. Org. Chem. 1980, 45, 1322",
  268: "Ashkinadze et al., Izv. Akad. Nauk SSSR, Ser. Khim. 1981, 397",
  269: "Epstein et al., J. Organomet. Chem. 1982, 228, 53",
  270: "Archer et al., J. Chem. Soc., Perkin Trans. 2 1982, 181",
  271: "Binev et al., J. Chem. Soc., Perkin Trans. 2 1982, 1533",
  272: "Azzaro et al., J. Org. Chem. 1982, 47, 4981",
  273: "Brough and West, J. Organomet. Chem. 1982, 229, 113",
  275: "Hayashi and Shibata, Bull. Chem. Soc. Jpn. 1961, 34, 1116",
  276: "Egorochkin and Razuvaev, Russ. Chem. Rev. 1987, 56, 846",
  277: "Shkurko and Mamaev, Zh. Org. Khim. 1979, 15, 1557",
  278: "Bordwell and Andersen, J. Am. Chem. Soc. 1953, 75, 6019",
  279: "Jones and Foster, J. Org. Chem. 1970, 35, 1777",
  280: "Vo-Kim-Yen et al., Collect. Czech. Chem. Commun. 1973, 38, 3167",
  281: "Calvino et al., Quant. Struct.-Act. Relat. 1988, 7, 26",
  282: "Exner and Jonas, Collect. Czech. Chem. Commun. 1962, 27, 2296",
  283: "Waisser et al., Collect. Czech. Chem. Commun. 1988, 53, 2957",
};
