# ChemDraw clipboard test drawing

`clip-props.cdxml` is our own test drawing for copy and paste with ChemDraw and PowerPoint, written by
`scripts/chemdraw-bench/make-fixture.mjs`: ring fills (`ColoredMolecularArea`), per-fragment
`LineWidth`/`HashSpacing`/`BoldWidth`/`MarginWidth`, wedges and hashed wedges, bold formula labels
(`face="97"`), a right-aligned PCy3 label, gray bonds crossing behind black ones (`Z`,
`CrossingBonds`), a rounded shadowed frame, a plain frame, bold, italic and formula captions.

What ChemDraw and PowerPoint make of it (ChemDraw's saves, clipboard formats, pictures and OLE
objects) is not kept in this repository, because ChemDraw's licence restricts reviewing what the
program produces. The tests that compare against those files run only where a private copy sits in
`tests/fixtures/chemdraw-private/` (or the folder the `CHEMDRAW_FIXTURES` variable names), and are
skipped everywhere else.
