// Windows Metafiles (WMF), as ChemDraw keeps pictures pasted into it. Windows writes the picture's
// enhanced metafile inside the WMF too, cut into comment records, so the picture can be read from
// there at full quality ([MS-WMF] META_ESCAPE_ENHANCED_METAFILE). A WMF without those comments
// isn't read here (null).

const META_ESCAPE = 0x0626;
const MFCOMMENT = 0x000f;
/** "WMFC" */
const COMMENT_ID = 0x43464d57;
/** A placeable header's key, in front of some files. */
const PLACEABLE = 0x9ac6cdd7;

/** The enhanced metafile held in a WMF's comments, or null when it holds none. */
export function emfInWmf(wmf: Uint8Array): Uint8Array | null {
  const v = new DataView(wmf.buffer, wmf.byteOffset, wmf.byteLength);
  if (wmf.length < 18) return null;
  let at = v.getUint32(0, true) === PLACEABLE ? 22 : 0;
  if (at + 18 > wmf.length) return null;
  at += v.getUint16(at + 2, true) * 2;
  let out: Uint8Array | null = null, filled = 0;
  while (at + 6 <= wmf.length) {
    const size = v.getUint32(at, true) * 2;
    if (size < 6 || at + size > wmf.length) break;
    if (v.getUint16(at + 4, true) === META_ESCAPE && size >= 44 && v.getUint16(at + 6, true) === MFCOMMENT && v.getUint32(at + 10, true) === COMMENT_ID) {
      const piece = v.getUint32(at + 32, true), total = v.getUint32(at + 40, true);
      if (at + 44 + piece > wmf.length || total === 0) return null;
      out ??= new Uint8Array(total);
      if (filled + piece > out.length) return null;
      out.set(wmf.subarray(at + 44, at + 44 + piece), filled);
      filled += piece;
    }
    at += size;
  }
  return out && filled === out.length ? out : null;
}
