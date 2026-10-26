// File > Import Structures: from a picture (a photo or scan of a hand drawing, a screenshot, a
// figure), from the clipboard, or from a PDF. Chooses the reader (the one on this computer, the
// person's AI model, or asks to download the first), then opens the review screen.

import { ask } from './ask';
import { openReview, pixelsPng, type FoundPicture } from './import-review';
import { canReadHere, cancelPack, downloadPack, localReader, packReady, readWithAi, PACK_MB, type ReadResult } from '../recognise/reader';
import { checkRead, type Checked, type Engine } from '../recognise/check';
import { cleanPhoto, shrinkTo, type Pixels } from '../recognise/picture';
import { findDrawings, isProse, type Box } from '../recognise/find';
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
  // Cancel (or Esc) drops the download; what was fetched of a file is fetched again next time
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  const buttons = document.createElement('p');
  buttons.className = 'ask-buttons';
  buttons.append(cancel);
  d.append(h, bar, buttons);
  let cancelled = false;
  const stop = () => { if (cancelled) return; cancelled = true; cancel.disabled = true; h.textContent = 'Stopping the download…'; void cancelPack().catch(() => {}); };
  cancel.addEventListener('click', stop);
  d.addEventListener('cancel', (e) => { e.preventDefault(); stop(); });
  document.body.append(d);
  d.showModal();
  try {
    await downloadPack((share) => { bar.value = share; });
    return 'here';
  } catch (e) {
    if (cancelled) return null;
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
export async function importPictures(host: ImportHost, found: FoundPicture[], o: { title: string; note: string; tickDoubtful: boolean; photo: boolean; hideJunk?: boolean }): Promise<void> {
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
    hideJunk: o.hideJunk,
    place: host.place,
  });
}

/** Pages read at most in one go (a thesis is read a part at a time). */
const MOST_PAGES = 40;

/** The drawings on the pages of a PDF, as pictures (pages from `first` to `last`, from 1). */
export async function pdfDrawings(bytes: Uint8Array, pick: (pages: number) => Promise<[number, number] | null>, progress: (msg: string) => void): Promise<FoundPicture[] | null> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  }
  const task = pdfjs.getDocument({ data: bytes.slice() });
  try {
    const pdf = await task.promise;
    const range = pdf.numPages > MOST_PAGES ? await pick(pdf.numPages) : [1, pdf.numPages] as [number, number];
    if (!range) return null;
    const found: FoundPicture[] = [];
    for (let n = range[0]; n <= range[1]; n++) {
      progress(`Looking for structures on page ${n} of ${range[1]}…`);
      const page = await pdf.getPage(n);
      // about 150 dots to the inch: structures come out a few hundred pixels across, as the reader likes
      const view = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(view.width);
      canvas.height = Math.ceil(view.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: view }).promise;
      const text = await page.getTextContent();
      const prose: Box[] = [], labels: Box[] = [];
      for (const it of text.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        const t = pdfjs.Util.transform(view.transform, it.transform);
        const size = Math.hypot(t[2], t[3]);
        (isProse(it.str) ? prose : labels).push({ x: t[4], y: t[5] - size, w: it.width * view.scale, h: size * 1.25 });
      }
      const w = canvas.width, h = canvas.height;
      const px = ctx.getImageData(0, 0, w, h).data;
      const ink = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) ink[i] = px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] < 600 ? 1 : 0;
      const boxes = findDrawings(ink, w, h, prose, Math.round(w / 120), labels);
      boxes.forEach((b, k) => {
        const pad = 6;
        const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad), bw = Math.min(w - x, b.w + 2 * pad), bh = Math.min(h - y, b.h + 2 * pad);
        const d = ctx.getImageData(x, y, bw, bh);
        found.push({ where: boxes.length > 1 ? `Page ${n}, ${k + 1}` : `Page ${n}`, pixels: { width: d.width, height: d.height, data: d.data } });
      });
      page.cleanup();
    }
    return found;
  } finally {
    void task.destroy();
  }
}
