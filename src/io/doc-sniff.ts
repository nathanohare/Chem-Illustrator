// Telling the other word processors' files apart, and the note after saving one, without
// loading their readers and writers (which load the first time a document is opened or saved).

import { cfbStreams, isCfb } from './cfb';

const MIME = 'application/vnd.oasis.opendocument.text';
const extOf = (name: string) => /\.([^.\\/]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';

/** Extensions of documents that open but save as .docx. */
export const DOC_OPEN_ONLY = ['doc'];

/** Is this an RTF file? */
export const isRtf = (b: Uint8Array): boolean => b.length > 5 && String.fromCharCode(...b.slice(0, 5)) === '{\\rtf';

/** Is this an OpenDocument text? (Its first file, `mimetype`, says so, uncompressed.) */
export function isOdt(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  const head = String.fromCharCode(...bytes.subarray(30, 120));
  return head.startsWith(`mimetype${MIME}`) && !head.startsWith(`mimetype${MIME}-`);
}

/** Is this an old Word document (a compound file with a WordDocument stream)? */
export function isDoc(bytes: Uint8Array): boolean {
  if (!isCfb(bytes)) return false;
  try {
    return cfbStreams(bytes).has('WordDocument');
  } catch {
    return false;
  }
}

/** Is this one of the other word processors' files (not Word's .docx)? */
export function isOtherDocument(bytes: Uint8Array, name: string): boolean {
  const ext = extOf(name);
  return ext === 'rtf' || ext === 'odt' || ext === 'doc' || isRtf(bytes) || isOdt(bytes) || isDoc(bytes);
}

/** A note after saving in a format that keeps less than .docx. */
export function documentSaveNote(name: string): string {
  const ext = extOf(name);
  if (ext === 'rtf') return ' (as RTF: live fields, citations, comments and tracked changes are kept as their text; save as .docx to keep everything)';
  if (ext === 'odt') return ' (as OpenDocument: live fields, citations, comments and tracked changes are kept as their text; save as .docx to keep everything)';
  return '';
}
