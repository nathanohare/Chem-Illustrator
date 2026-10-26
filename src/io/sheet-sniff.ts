// Telling sheet files apart, and the note after an Excel save, without loading their readers
// and writers (which load the first time a sheet file is opened or saved).

import type { Workbook } from '../sheet/workbook';
import { cfbStreams, isCfb } from './cfb';

/** Is this an OpenDocument spreadsheet? (Its first file, `mimetype`, says so, uncompressed.) */
export function isOds(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  const head = new TextDecoder('latin1').decode(bytes.subarray(30, 120));
  return head.startsWith('mimetypeapplication/vnd.oasis.opendocument.spreadsheet');
}

/** Is this an old Excel workbook (a compound file with a workbook stream)? */
export function isXls(bytes: Uint8Array): boolean {
  if (!isCfb(bytes)) return false;
  try {
    const s = cfbStreams(bytes);
    return s.has('Workbook') || s.has('Book');
  } catch {
    return false;
  }
}

/** The most characters an Excel cell holds ("Excel specifications and limits"). */
export const MAX_CELL_TEXT = 32767;

/** Said after an .xlsx save that cut cells' text to Excel's limit ('' when none was cut). */
export function excelLimitNote(book: Workbook): string {
  let n = 0;
  for (const s of book.sheets) for (const v of s.values.values()) if (typeof v === 'string' && v.length > MAX_CELL_TEXT) n++;
  return n ? ` (${n === 1 ? 'one cell holds' : `${n} cells hold`} more than Excel's ${MAX_CELL_TEXT.toLocaleString('en')} characters: cut to that in the file)` : '';
}
