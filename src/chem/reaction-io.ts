// Reactions as text other programs read: reaction SMILES (reactants>agents>products, each side's
// species joined by dots) and MDL RXN files (V2000: a $RXN header, the counts of reactants and
// products, then each species as a $MOL molfile). Agents are what is written over the arrow.

export interface ReactionParts<T> {
  reactants: T[];
  agents: T[];
  products: T[];
}

/** Is this text a reaction SMILES (two '>' and SMILES characters, nothing else)? */
export function isReactionSmiles(text: string): boolean {
  const t = text.trim().replace(/\s+\|.*\|$/, '');
  if (!t || /\s/.test(t)) return false;
  const parts = t.split('>');
  return parts.length === 3 && (parts[0] !== '' || parts[2] !== '') && parts.every((p) => /^[A-Za-z0-9@+\-[\]()=#$%/\\.:*~]*$/.test(p));
}

/** The species of a reaction SMILES. CXSMILES extensions (|…|) are dropped. */
export function splitReactionSmiles(text: string): ReactionParts<string> {
  const t = text.trim().replace(/\s+\|.*\|$/, '');
  const [r, a, p] = t.split('>');
  const each = (s: string) => s.split('.').filter(Boolean);
  return { reactants: each(r), agents: each(a), products: each(p) };
}

/** A reaction SMILES from each species' SMILES. */
export function reactionSmiles(parts: ReactionParts<string>): string {
  return `${parts.reactants.join('.')}>${parts.agents.join('.')}>${parts.products.join('.')}`;
}

/** Is this text an RXN file? */
export const isRxn = (text: string): boolean => text.trimStart().startsWith('$RXN');

const i3 = (n: number) => String(n).padStart(3, ' ');

/** An RXN file (V2000) from molfiles; agents are counted on the counts line as many programs do. */
export function rxnBlock(parts: ReactionParts<string>, name = ''): string {
  const counts = `${i3(parts.reactants.length)}${i3(parts.products.length)}${parts.agents.length ? i3(parts.agents.length) : ''}`;
  const mol = (m: string) => `$MOL\n${m.endsWith('\n') ? m : m + '\n'}`;
  return `$RXN\n${name}\n  Chemweave\n\n${counts}\n` + [...parts.reactants, ...parts.products, ...parts.agents].map(mol).join('');
}

/** The molfiles of an RXN file (V2000), or null when it can't be read. */
export function parseRxn(text: string): ReactionParts<string> | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = lines.findIndex((l) => l.startsWith('$RXN'));
  if (i < 0 || lines[i].includes('V3000')) return null;
  const counts = lines[i + 4] ?? '';
  const nr = parseInt(counts.slice(0, 3), 10), np = parseInt(counts.slice(3, 6), 10);
  const na = parseInt(counts.slice(6, 9), 10) || 0;
  if (!Number.isFinite(nr) || !Number.isFinite(np)) return null;
  i += 5;
  const mols: string[] = [];
  while (i < lines.length) {
    if (!lines[i].startsWith('$MOL')) { i++; continue; }
    const start = ++i;
    while (i < lines.length && !lines[i].startsWith('M  END')) i++;
    if (i >= lines.length) return null;
    mols.push(lines.slice(start, i + 1).join('\n') + '\n');
    i++;
  }
  if (mols.length < nr + np) return null;
  return { reactants: mols.slice(0, nr), products: mols.slice(nr, nr + np), agents: mols.slice(nr + np, nr + np + na) };
}
