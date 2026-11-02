// Reading CIF files (Crystallographic Information File, version 1.1) for X-ray structures.
// Ported from Chem SI Assistant (si_assistant/core/cif.py, same author and licence).
//
// `readCif(text)` gives the file's data blocks; each holds its single items (tag → value as
// written) and its loops (tables of values). Values stay text; `cifNumber()` reads "12.345(6)"
// as 12.345, and "?" / "." (unknown / not applicable) as null. `cifPlain()` turns CIF's own text
// codes ("Mo K\a", "\%A^3^") into plain characters.
//
// The syntax handled is CIF 1.1's: comments (#), data_ blocks, loop_ tables, tags (_name), values
// unquoted, 'quoted', "quoted" (a quote ends a value only when white space follows it) or as text
// fields between lines starting with ";". Save frames and global_ blocks (dictionaries, not
// structures) are skipped. A damaged file never throws: what can be read is returned.

export type CifLoop = Map<string, string[]>;

export class CifBlock {
  /** Tag (lower case) → value. */
  items = new Map<string, string>();
  loops: CifLoop[] = [];
  constructor(public name: string) {}

  /** The value of the first of `tags` the block has (a single item, or a loop's only row); null if none (or only "?" / "."). */
  get(...tags: string[]): string | null {
    for (let tag of tags) {
      tag = tag.toLowerCase();
      let value = this.items.get(tag);
      if (value === undefined) {
        const loop = this.loopWith(tag);
        if (loop && loop.get(tag)!.length === 1) value = loop.get(tag)![0];
      }
      if (value !== undefined && value !== '?' && value !== '.') return value;
    }
    return null;
  }

  loopWith(tag: string): CifLoop | null {
    tag = tag.toLowerCase();
    return this.loops.find((l) => l.has(tag)) ?? null;
  }

  /** The rows of the loop holding `tag`, each {tag: value}. */
  rows(tag: string): Map<string, string>[] {
    const loop = this.loopWith(tag);
    if (!loop) return [];
    const n = Math.min(...[...loop.values()].map((v) => v.length));
    const out: Map<string, string>[] = [];
    for (let k = 0; k < n; k++) out.push(new Map([...loop].map(([t, v]) => [t, v[k]])));
    return out;
  }
}

type Token = ['tag' | 'value' | 'loop' | 'data' | 'save' | 'global' | 'stop', string];

function tokens(text: string): Token[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: Token[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith(';')) {
      // a text field, to the next ";" line
      const body = [line.slice(1)];
      i++;
      while (i < lines.length && !lines[i].startsWith(';')) body.push(lines[i++]);
      i++;
      out.push(['value', body.join('\n').replace(/^\n+|\n+$/g, '').trim()]);
      continue;
    }
    let pos = 0;
    const n = line.length;
    while (pos < n) {
      const ch = line[pos];
      if (ch === ' ' || ch === '\t') { pos++; continue; }
      if (ch === '#') break;
      if (ch === "'" || ch === '"') {
        // quoted: ends at the quote followed by white space (or the line's end)
        let end = pos + 1;
        while (end < n && !(line[end] === ch && (end + 1 === n || line[end + 1] === ' ' || line[end + 1] === '\t'))) end++;
        out.push(['value', line.slice(pos + 1, end)]);
        pos = end + 1;
        continue;
      }
      let end = pos;
      while (end < n && line[end] !== ' ' && line[end] !== '\t') end++;
      const word = line.slice(pos, end);
      pos = end;
      const low = word.toLowerCase();
      if (word.startsWith('_')) out.push(['tag', low]);
      else if (low === 'loop_') out.push(['loop', '']);
      else if (low.startsWith('data_')) out.push(['data', word.slice(5)]);
      else if (low.startsWith('save_')) out.push(['save', word.slice(5)]);
      else if (low === 'global_') out.push(['global', '']);
      else if (low === 'stop_') out.push(['stop', '']);
      else out.push(['value', word]);
    }
    i++;
  }
  return out;
}

/** The data blocks of a CIF file's text. */
export function readCif(text: string): CifBlock[] {
  const blocks: CifBlock[] = [];
  let block: CifBlock | null = null;
  const t = tokens(text);
  let inSave = false;
  for (let k = 0; k < t.length;) {
    const [kind, value] = t[k];
    if (kind === 'data') {
      block = new CifBlock(value);
      blocks.push(block);
      inSave = false;
      k++;
    } else if (kind === 'save' || kind === 'global') {
      inSave = kind === 'save' && !!value;
      if (kind === 'global') block = null;
      k++;
    } else if (kind === 'loop') {
      const tags: string[] = [];
      k++;
      while (k < t.length && t[k][0] === 'tag') tags.push(t[k++][1]);
      const values: string[] = [];
      while (k < t.length && t[k][0] === 'value') values.push(t[k++][1]);
      if (block && !inSave && tags.length) block.loops.push(new Map(tags.map((tag, j) => [tag, values.filter((_, i) => i % tags.length === j)])));
    } else if (kind === 'tag') {
      if (k + 1 < t.length && t[k + 1][0] === 'value') {
        if (block && !inSave) block.items.set(value, t[k + 1][1]);
        k += 2;
      } else k++;
    } else k++;
  }
  return blocks;
}

const NUMBER = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(?:\((\d+)\))?\s*$/;

/** "12.345(6)" → 12.345; "?", ".", null or text → null. */
export function cifNumber(value: string | null | undefined): number | null {
  if (value == null) return null;
  const m = NUMBER.exec(value);
  return m ? parseFloat(m[1]) : null;
}

/** "12.345(6)" → 0.006 (the standard uncertainty in the last digits); null if none. */
export function cifUncertainty(value: string | null | undefined): number | null {
  if (value == null) return null;
  const m = NUMBER.exec(value);
  if (!m || !m[2]) return null;
  const digits = m[1].split(/[eE]/)[0];
  const decimals = digits.includes('.') ? digits.split('.')[1].length : 0;
  return parseInt(m[2], 10) * 10 ** -decimals;
}

// CIF's text codes (International Tables, CIF 1.1 "markup"): \a α, \b β, \q θ, \l λ, \m μ,
// \s σ, \r ρ, \%A Å, \% °, ^…^ superscript, ~…~ subscript.
const GREEK: Record<string, string> = {
  a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε', z: 'ζ', h: 'η', q: 'θ', i: 'ι', k: 'κ', l: 'λ', m: 'μ', n: 'ν', x: 'ξ', p: 'π', r: 'ρ',
  s: 'σ', t: 'τ', f: 'φ', c: 'χ', y: 'ψ', w: 'ω', A: 'Α', B: 'Β', G: 'Γ', D: 'Δ', Q: 'Θ', L: 'Λ', P: 'Π', S: 'Σ', F: 'Φ', Y: 'Ψ', W: 'Ω',
};

/** CIF text codes as plain characters (super- and subscript marks left in). */
export function cifPlain(value: string): string {
  return value.replace(/\\%A/g, 'Å').replace(/\\%/g, '°').replace(/\\([A-Za-z])/g, (_, c: string) => GREEK[c] ?? c);
}

/** CIF text codes as the app's chemistry text marks: "R~int~" → "R_{int}", "\%A^3^" → "Å^{3}". */
export function cifMarked(value: string): string {
  return cifPlain(value).replace(/\^([^^]+)\^/g, '^{$1}').replace(/~([^~]+)~/g, '_{$1}');
}
