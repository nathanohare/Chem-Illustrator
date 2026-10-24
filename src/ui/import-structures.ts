// File > Import Structures: from a picture (a photo or scan of a hand drawing, a screenshot, a
// figure), from the clipboard, or from a PDF. Chooses the reader (the one on this computer, the
// person's AI model, or asks to download the first), then opens the review screen.

import { ask } from './ask';
import { openReview, pixelsPng, type FoundPicture } from './import-review';
import { canReadHere, downloadPack, localReader, packReady, readWithAi, PACK_MB, type ReadResult } from '../recognise/reader';
import { checkRead, type Checked, type Engine } from '../recognise/check';
import { cleanPhoto, shrinkTo, type Pixels } from '../recognise/picture';
import { aiName, aiReady, type AiPrefs } from '../ai/link';
import type { DocStyle } from '../style';

export interface ImportHost {
  style: () => DocStyle;
  chem: Engine & { ready: boolean };
  ai: () => AiPrefs;
  flash: (msg: string, ms?: number) => void;
  place: (chosen: { result: ReadResult; checked: Checked }[]) => void;
}

/** A picture's pixels, at most `most` pixels on its longer side. */
export async function decodePicture(bytes: Uint8Array, mime: string, most = 2000): Promise<Pixels | null> {
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return shrinkTo({ width: d.width, height: d.height, data: d.data }, most);
  } catch {
    return null;
  }
}

/** Which reader to use: the one here (downloading it first, if the person agrees), the AI model, or none. */
async function chooseReader(host: ImportHost, preferAi: boolean): Promise<'here' | 'ai' | null> {
  const ai = host.ai();
  const linked = await aiReady(ai).catch(() => false);
  if (linked && preferAi) return 'ai';
  if (canReadHere && await packReady()) return 'here';
  if (!canReadHere) {
    if (linked) return 'ai';
    await ask('Import Structures', [], { noCancel: true, note: 'In the browser, structures are read by an AI model of your own: link one in Edit > Settings > AI Model. The desktop app can also read them on your computer, with nothing sent anywhere.' });
    return null;
  }
  const r = await ask('Import Structures', linked ? [{ name: 'how', label: 'Read with', value: 'here', options: [
    { value: 'here', label: `The structure reader on this computer (download about ${PACK_MB} MB once)` },
    { value: 'ai', label: `${aiName(ai)} (sends the pictures to it)` },
  ] }] : [], {
    ok: linked ? 'Continue' : 'Download',
    note: `The structure reader runs on this computer, so nothing is sent anywhere. It needs a one-time download of about ${PACK_MB} MB (the MolScribe model, MIT licence).`,
  });
  if (!r) return null;
  if (r.how === 'ai') return 'ai';
  const d = document.createElement('dialog');
  d.className = 'ask';
  const bar = document.createElement('progress');
  bar.max = 1;
  bar.value = 0;
  bar.style.width = '100%';
  const h = document.createElement('h2');
  h.textContent = 'Downloading the structure reader…';
  d.append(h, bar);
  d.addEventListener('cancel', (e) => e.preventDefault());
  document.body.append(d);
  d.showModal();
  try {
    await downloadPack((share) => { bar.value = share; });
    return 'here';
  } catch (e) {
    await ask('Import Structures', [], { noCancel: true, note: 'The structure reader could not be downloaded: ' + (e instanceof Error ? e.message : String(e)) });
    return null;
  } finally {
    d.close();
    d.remove();
  }
}

/**
 * Read the pictures and open the review screen. Photos of hand drawings go to the linked AI model
 * first, when there is one: the reader on this computer was trained on printed drawings and reads
 * few hand drawings right (about 1 in 10 on the DECIMER hand-drawn set; Claude about 3 in 4).
 */
export async function importPictures(host: ImportHost, found: FoundPicture[], o: { title: string; note: string; tickDoubtful: boolean; photo: boolean }): Promise<void> {
  if (!found.length) { host.flash('No pictures to read.'); return; }
  if (!host.chem.ready) { host.flash('The chemistry engine is still loading. Try again in a moment.'); return; }
  const how = await chooseReader(host, o.photo);
  if (!how) return;
  const ai = host.ai();
  const linked = await aiReady(ai).catch(() => false);
  const here = canReadHere && await packReady();
  // the reader on this computer gets a cleaned-up photo; an AI model sees the picture as it is
  const local = (p: Pixels) => localReader.read(o.photo ? cleanPhoto(p) : p);
  const viaAi = (p: Pixels) => readWithAi(ai, pixelsPng(p));
  openReview({
    title: o.title,
    note: o.note,
    found,
    read: how === 'here' ? local : viaAi,
    ...(how === 'here' && linked ? { alt: { name: aiName(ai).split(',')[0].replace(/ \(.*\)$/, ''), read: viaAi, sends: true } } : {}),
    ...(how === 'ai' && here ? { alt: { name: 'This Computer', read: local, sends: false } } : {}),
    check: (r) => checkRead(r, host.style(), host.chem),
    typed: (smiles) => ({ kind: 'smiles', smiles, note: '', ms: 0 }),
    tickDoubtful: o.tickDoubtful,
    place: host.place,
  });
}
