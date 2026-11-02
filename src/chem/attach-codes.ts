// Attachment points (Atom.attach) as molfile atoms: "*" with a number in the isotope field that
// says which kind it is, so the chemistry worker can tell a wavy bond from a star or numbered
// diamond 2. Only for the questions that need it (Hammett's reference position); other molfiles
// write every attachment point as a plain "*".

/** Star (*) and wavy-bond attachment points; a numbered diamond n is written as n itself (1–99). */
export const ATTACH_STAR = 101;
export const ATTACH_WAVY = 102;
/** An attachment point of another kind, or a diamond with no number. */
export const ATTACH_OTHER = 100;

/** The molfile isotope number standing for an attachment point. */
export function attachCode(attach: string, num?: number): number {
  if (attach === 'Star') return ATTACH_STAR;
  if (attach === 'Wavy') return ATTACH_WAVY;
  if (num !== undefined && num >= 1 && num <= 99) return num;
  return ATTACH_OTHER;
}

/** The attachment points a reference names: "wavy", "star" (or "*"), "1" or "numbered 1" (one diamond), "numbered" (any diamond). Null when it names none. */
export function attachCodesFor(ref: string): ((code: number) => boolean) | null {
  const t = ref.trim().toLowerCase().replace(/[〰◆]/g, (c) => (c === '〰' ? 'wavy' : 'numbered')).replace(/\s+/g, ' ');
  if (/^(wavy|wavy bond|squiggle)$/.test(t)) return (c) => c === ATTACH_WAVY;
  if (/^(star|\*|asterisk)$/.test(t)) return (c) => c === ATTACH_STAR;
  if (/^(numbered|diamond)$/.test(t)) return (c) => (c >= 1 && c <= 99) || c === ATTACH_OTHER;
  const n = /^(?:(?:numbered|diamond|#)\s*)?(\d{1,2})$/.exec(t);
  if (n) { const k = Number(n[1]); return (c) => c === k; }
  if (/^(any|attachment|attachment point)$/.test(t)) return (c) => c >= 1;
  return null;
}

/** How a reference is named in messages. */
export function attachName(ref: string): string {
  const t = ref.trim().toLowerCase();
  if (t.startsWith('wavy')) return 'wavy-bond';
  if (t === 'star' || t === '*') return 'star';
  const n = /(\d+)$/.exec(t);
  return n ? `numbered (${n[1]})` : 'numbered';
}
