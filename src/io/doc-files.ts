// The word processors' files Document mode opens and saves: Word's .docx (its own), and RTF,
// OpenDocument text (.odt) and old Word documents (.doc, opened only), each chosen by the file's
// contents or, failing that, its name.

import type { DocText } from '../document/document';
// Word's reader and writer load the first time a document is opened or saved
import type { DocxDeps } from './docx-write';
import type { DocxReadDeps } from './docx-read';
import { readRtf, writeRtf } from './rtf';
import { readOdt, writeOdt } from './odt';
import { readDoc } from './doc-binary';
import { isRtf, isOdt, isDoc } from './doc-sniff';
export { DOC_OPEN_ONLY, isOtherDocument, documentSaveNote } from './doc-sniff';

const extOf = (name: string) => /\.([^.\\/]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';

/** Open a document file of any of these kinds. */
export async function readDocumentFile(bytes: Uint8Array, name: string, deps: DocxReadDeps = {}): Promise<{ doc: DocText; warnings: string[] }> {
  if (isRtf(bytes)) return readRtf(bytes);
  if (isOdt(bytes)) return readOdt(bytes);
  if (isDoc(bytes)) return readDoc(bytes);
  const ext = extOf(name);
  if (ext === 'rtf') return readRtf(bytes);
  if (ext === 'odt') return readOdt(bytes);
  if (ext === 'doc') return readDoc(bytes);
  return (await import('./docx-read')).readDocx(bytes, deps);
}

/** Save a document as its name says: .rtf, .odt, else .docx. */
export async function writeDocumentFile(t: DocText, name: string, deps: DocxDeps): Promise<Uint8Array> {
  const ext = extOf(name);
  if (ext === 'rtf') return writeRtf(t, { picture: deps.picture });
  if (ext === 'odt') return writeOdt(t, { picture: deps.picture });
  return (await import('./docx-write')).writeDocx(t, deps);
}

