// Reading the dates of Gantt chart and dated timeline lines (diagrams.ts), and the axis they go on.
//
// A line says what and when: "Column chromatography: 3 – 7 Mar 2026". The when is one point or two
// joined by a dash, "to", "until" or "through". A point is a calendar date (14 Mar 2026, Mar 14,
// 2026-03-14), a month (March, Mar 2026, 2026-03), a quarter (Q3 or Q3 2026), or a counted step
// (Week 4, Day 12, Run 3, or just 3). A point covers its whole day, month, quarter or step, so a
// range runs from the start of its first point to the end of its last, and a single point is a
// milestone. All the lines go on one axis: in days when the first dated line is on the calendar,
// in steps when it is counted.

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A point in time as written: on the calendar (the year may be left out) or a counted step. */
type Point =
  | { cal: true; year?: number; month: number; months: 1 | 3; day?: number }
  | { cal: false; n: number; word: string };

/** A month from its name or an abbreviation of at least three letters ("Sept" too); -1 if none. */
function monthNamed(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return -1;
  if (w === 'sept') return 8;
  return MONTH_NAMES.findIndex((name) => name.startsWith(w));
}

/** One point, or null when the words aren't one. */
function readPoint(raw: string): Point | null {
  const s = raw.replace(/,/g, ' ').trim().replace(/\s+/g, ' ');
  if (!s) return null;
  const iso = /^(\d{4})-(\d\d?)(?:-(\d\d?))?$/.exec(s);
  if (iso) {
    const month = Number(iso[2]) - 1;
    if (month < 0 || month > 11) return null;
    return { cal: true, year: Number(iso[1]), month, months: 1, ...(iso[3] ? { day: Number(iso[3]) } : {}) };
  }
  const quarter = /^q([1-4])(?: (\d{4}))?$/i.exec(s);
  if (quarter) return { cal: true, month: 3 * (Number(quarter[1]) - 1), months: 3, ...(quarter[2] ? { year: Number(quarter[2]) } : {}) };
  // a calendar date is a month's name, with at most one day (1–31) and one year (four digits), in any order
  const words = s.split(' ');
  let month = -1, day: number | undefined, year: number | undefined, other = false;
  for (const w of words) {
    const m = monthNamed(w);
    if (m >= 0 && month < 0) month = m;
    else if (/^\d{4}$/.test(w) && year === undefined) year = Number(w);
    else if (/^\d{1,2}$/.test(w) && day === undefined && Number(w) >= 1 && Number(w) <= 31) day = Number(w);
    else other = true;
  }
  if (month >= 0 && !other) return { cal: true, month, months: 1, ...(year !== undefined ? { year } : {}), ...(day !== undefined ? { day } : {}) };
  // a counted step: a number, perhaps after a word or two ("Week 3", "Batch 12")
  const step = /^(?:(\p{L}[\p{L} ]*?) )?(\d+(?:\.\d+)?)$/u.exec(s);
  if (step) return { cal: false, n: Number(step[2]), word: step[1] ?? '' };
  return null;
}

const RANGE_JOIN = /\s*[–—]\s*|\s*\.\.\s*|\s+(?:-|to|until|till|through|thru)\s+/i;

/** A when: its first point and, for a range, its last; null when it isn't one. */
function readWhen(s: string): { a: Point; b?: Point } | null {
  const bits = s.split(RANGE_JOIN);
  if (bits.length > 2) return null;
  let a = readPoint(bits[0]);
  if (!a) return null;
  if (bits.length === 1) return { a };
  let b = readPoint(bits[1]);
  if (!b) return null;
  // a bare day number against a full date shares its month and year ("3 – 7 Mar", "Mar 3 – 7")
  const dayNo = (p: Point) => (!p.cal && !p.word && Number.isInteger(p.n) && p.n >= 1 && p.n <= 31 ? p.n : 0);
  if (b.cal && b.day !== undefined && dayNo(a)) a = { ...b, day: dayNo(a) };
  else if (a.cal && a.day !== undefined && dayNo(b)) b = { ...a, day: dayNo(b) };
  if (a.cal !== b.cal) return null;
  // "Week 2 – 5": the second step goes by the first one's word
  if (!a.cal && !b.cal && !b.word) b = { ...b, word: a.word };
  return { a, b };
}

/** "What: when" split at the last colon whose rest is a when (null when no colon is). */
export function parseTaskLine(text: string): { name: string; when: string } | null {
  let i = text.lastIndexOf(':');
  while (i > 0) {
    const when = text.slice(i + 1).trim();
    if (when && readWhen(when)) return { name: text.slice(0, i).trim(), when };
    i = text.lastIndexOf(':', i - 1);
  }
  return null;
}

/** Where a line sits on the axis: `from` to `to`, the same for a milestone (`point`). */
export interface TimeSpan { from: number; to: number; point: boolean }

/** The axis: days since 1970-01-01 (`unit` 'day') or counted steps, from `lo` to `hi`. */
export interface TimeAxis { unit: 'day' | 'step'; showYear: boolean; stepWord: string; lo: number; hi: number }

const dayOf = (y: number, m: number, d: number): number => Date.UTC(y, m, d) / 86400000;

/** The days a calendar point covers, [first, end) — the end is the day after its last. */
function calDays(p: Extract<Point, { cal: true }>, year: number): [number, number] {
  if (p.day !== undefined) return [dayOf(year, p.month, p.day), dayOf(year, p.month, p.day + 1)];
  return [dayOf(year, p.month, 1), dayOf(year, p.month + p.months, 1)];
}

/**
 * Every line's when on one axis. A date with no year takes it from the other end of its range,
 * else from the last year written above it (else the first year written anywhere, else 2000).
 * A range that would run backwards ("Nov – Feb") runs into the next year. Lines with no when,
 * or of the other kind from the first, get null.
 */
export function placeOnAxis(whens: (string | null)[]): { spans: (TimeSpan | null)[]; axis: TimeAxis | null } {
  const read = whens.map((w) => (w ? readWhen(w) : null));
  const first = read.find(Boolean);
  if (!first) return { spans: read.map(() => null), axis: null };
  const onCalendar = first.a.cal;
  const years = read.flatMap((r) => (r ? [r.a, r.b] : [])).flatMap((p) => (p?.cal && p.year !== undefined ? [p.year] : []));
  let lastYear = years[0] ?? 2000;
  let stepWord = '';
  const spans = read.map((r): TimeSpan | null => {
    if (!r || r.a.cal !== onCalendar) return null;
    if (!r.a.cal) {
      if (!stepWord && r.a.word) stepWord = r.a.word;
      if (!r.b || r.b.cal) return { from: r.a.n + 0.5, to: r.a.n + 0.5, point: true };
      const from = r.a.n, to = r.b.n + 1;
      return to > from ? { from, to, point: false } : null;
    }
    const a = r.a, b = r.b?.cal ? r.b : undefined;
    let ya = a.year ?? b?.year ?? lastYear;
    if (!b) {
      lastYear = ya;
      const [s, e] = calDays(a, ya);
      // a single day is a milestone at its start; a month or quarter, at its middle
      const at = a.day !== undefined ? s : (s + e) / 2;
      return { from: at, to: at, point: true };
    }
    let yb = b.year ?? ya;
    if (a.year === undefined && b.year !== undefined && calDays(a, ya)[0] >= calDays(b, yb)[1]) ya -= 1;
    if (b.year === undefined && calDays(b, yb)[1] <= calDays(a, ya)[0]) yb += 1;
    lastYear = yb;
    const from = calDays(a, ya)[0], to = calDays(b, yb)[1];
    return to > from ? { from, to, point: false } : null;
  });
  const ends = spans.flatMap((s) => (s ? [s.from, s.to] : []));
  if (!ends.length) return { spans, axis: null };
  let lo = Math.min(...ends), hi = Math.max(...ends);
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  return { spans, axis: { unit: onCalendar ? 'day' : 'step', showYear: years.length > 0, stepWord, lo, hi } };
}

const asDate = (day: number) => new Date(day * 86400000);

/** Marks along the axis with their words: no more than `most`, at the finest even spacing that fits. */
export function axisMarks(axis: TimeAxis, most: number): { at: number; text: string }[] {
  const room = Math.max(2, Math.floor(most));
  if (axis.unit === 'step') {
    const lo = Math.floor(axis.lo), hi = Math.ceil(axis.hi);
    let every = 1;
    for (let mag = 1; (hi - lo) / every > room; mag *= 10) every = [1, 2, 5, 10].map((k) => k * mag).find((k) => (hi - lo) / k <= room) ?? 10 * mag;
    const out: { at: number; text: string }[] = [];
    for (let n = Math.ceil(lo / every) * every; n < hi; n += every) out.push({ at: n, text: axis.stepWord ? `${axis.stepWord} ${n}` : String(n) });
    return out;
  }
  // the finest of days, weeks, months, quarters and years that fits; years then thinned to round numbers
  const ladder: { starts: () => number[]; text: (d: number, i: number) => string }[] = [
    { starts: () => everyDay(axis, 1), text: dayText },
    { starts: () => everyDay(axis, 7), text: dayText },
    { starts: () => monthStarts(axis, 1), text: (d, i) => monthText(axis, d, i) },
    { starts: () => monthStarts(axis, 3), text: (d, i) => quarterText(axis, d, i) },
  ];
  for (const rung of ladder) {
    const starts = rung.starts();
    if (starts.length && starts.length <= room) return starts.map((d, i) => ({ at: d, text: rung.text(d, i) }));
  }
  const y0 = asDate(axis.lo).getUTCFullYear(), y1 = asDate(axis.hi).getUTCFullYear();
  const every = [1, 2, 5, 10, 20, 50, 100].find((k) => (y1 - y0 + 1) / k <= room) ?? 100;
  const out: { at: number; text: string }[] = [];
  for (let y = Math.ceil(y0 / every) * every; y <= y1; y += every) {
    const d = dayOf(y, 0, 1);
    if (d >= axis.lo && d < axis.hi) out.push({ at: d, text: String(y) });
  }
  return out;
}

function everyDay(axis: TimeAxis, step: number): number[] {
  if ((axis.hi - axis.lo) / step > 400) return [];
  const out: number[] = [];
  for (let d = Math.ceil(axis.lo); d < axis.hi; d += step) out.push(d);
  return out;
}

function monthStarts(axis: TimeAxis, step: 1 | 3): number[] {
  if ((axis.hi - axis.lo) / (30 * step) > 400) return [];
  const t = asDate(axis.lo);
  let y = t.getUTCFullYear(), m = t.getUTCMonth();
  m = Math.ceil(m / step) * step;
  if (dayOf(y, m, 1) < axis.lo) m += step;
  const out: number[] = [];
  for (let d = dayOf(y, m, 1); d < axis.hi; m += step, d = dayOf(y, m, 1)) out.push(d);
  return out;
}

const dayText = (d: number): string => { const t = asDate(d); return `${t.getUTCDate()} ${MONTH_ABBR[t.getUTCMonth()]}`; };

/** A month's mark: its name, with the year on the first mark and on each January when years were written. */
function monthText(axis: TimeAxis, d: number, i: number): string {
  const t = asDate(d), m = t.getUTCMonth();
  return axis.showYear && (i === 0 || m === 0) ? `${MONTH_ABBR[m]} ${t.getUTCFullYear()}` : MONTH_ABBR[m];
}

function quarterText(axis: TimeAxis, d: number, i: number): string {
  const t = asDate(d), q = Math.floor(t.getUTCMonth() / 3) + 1;
  return axis.showYear && (i === 0 || q === 1) ? `Q${q} ${t.getUTCFullYear()}` : `Q${q}`;
}
