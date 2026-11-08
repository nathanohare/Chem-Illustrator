// Drops the NMR prediction data (public/nmr, about 48 MB) from a finished build for the versions that
// don't offer prediction: the browser version on GitHub Pages and the iPad app (src-tauri/tauri.ios.conf.json).
// The desktop builds keep it.
import { rmSync } from 'node:fs';

rmSync(new URL('../dist/nmr', import.meta.url), { recursive: true, force: true });
console.log('Removed dist/nmr (NMR prediction is desktop only).');
