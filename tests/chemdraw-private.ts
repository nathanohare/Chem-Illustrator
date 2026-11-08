// Files ChemDraw made (its saves, clipboard formats, pictures and OLE objects) are kept out of the
// public repository: ChemDraw's licence restricts reviewing what the program produces. Tests that
// compare against them run where a private copy is in tests/fixtures/chemdraw-private/ (or the
// folder CHEMDRAW_FIXTURES names) and are skipped everywhere else.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const CHEMDRAW_DIR = process.env.CHEMDRAW_FIXTURES ?? join(__dirname, 'fixtures', 'chemdraw-private');
/** True when the private ChemDraw files are not here, so the tests that need them are skipped. */
export const noChemDraw = !existsSync(join(CHEMDRAW_DIR, 'clip-props.cd.cdxml'));
