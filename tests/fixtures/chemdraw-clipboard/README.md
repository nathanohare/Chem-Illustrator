# ChemDraw clipboard test drawings

Our own test drawing for copy and paste with ChemDraw 25 and PowerPoint, and what those programs
made of it. Every file here was made from `clip-props.cdxml`, which is written by
`scripts/chemdraw-bench/make-fixture.mjs`; nothing here comes from anyone's own ChemDraw files.

| File | What it is |
| --- | --- |
| `clip-props.cdxml` | The drawing as written by the script: ring fills (`ColoredMolecularArea`), per-fragment `LineWidth`/`HashSpacing`/`BoldWidth`/`MarginWidth`, wedges and hashed wedges, bold formula labels (`face="97"`), a right-aligned PCy3 label, gray bonds crossing behind black ones (`Z`, `CrossingBonds`), a rounded shadowed frame, a plain frame, bold, italic and formula captions. |
| `clip-props.cd.cdx`, `clip-props.cd.cdxml` | The same drawing opened and saved by ChemDraw 25.0.2. The CDX is what ChemDraw puts on the clipboard as "ChemDraw Interchange Format". |
| `clip-props.ref.png`, `clip-props.ref.emf` | ChemDraw's own picture of it: what a paste must look like. |
| `chemdraw-object.pptx` | A slide holding the drawing as a ChemDraw object (inserted by PowerPoint from the CDX). |
| `from-powerpoint/` | The Windows clipboard after copying that object in PowerPoint (M365): `formats.txt` lists every format and its size; `embedded-object.bin` is "Embedded Object" (a compound file whose `CONTENTS` stream is the CDX), `picture.emf` the metafile, `object-descriptor.bin` the "Object Descriptor". PowerPoint puts no "ChemDraw Interchange Format" on the clipboard. |

To remake the ChemDraw files on a Windows computer with ChemDraw:
`node scripts/chemdraw-bench/make-fixture.mjs tests/fixtures/chemdraw-clipboard/clip-props.cdxml` then
`powershell -File scripts/chemdraw-bench/chemdraw-reference.ps1 tests/fixtures/chemdraw-clipboard/clip-props.cdxml`.
`scripts/chemdraw-bench/clip-dump.ps1 <folder>` saves whatever is on the clipboard, one file per format.

`from-chemdraw/` is the Windows clipboard after Ctrl+A, Ctrl+C on `clip-props.cd.cdxml` in ChemDraw 25.0.2
(`formats.txt` lists every format). ChemDraw puts its drawing on the clipboard only as CDX ("ChemDraw
Interchange Format"), alongside an OLE object ("Embed Source"), a metafile, SMILES, SLN and MDL
sketch formats; there is no CDXML text format.
