// The Warnings list in the side panel: the same problem on many atoms (a pasted structure on top
// of another, every atom of a ring with too many bonds) is one row with a count, so the list stays
// short. Clicking the row shows the next one on the drawing; Ignore All stops flagging them all.

export interface WarningItem {
  kind: 'atom' | 'bond' | 'caption';
  id: number;
  text: string[];
}

export interface WarningGroup {
  text: string;
  items: WarningItem[];
}

/** The warnings with the same words together, in the order each was first met. */
export function groupWarnings(list: readonly WarningItem[]): WarningGroup[] {
  const groups = new Map<string, WarningGroup>();
  for (const w of list) {
    const text = w.text.join(' ');
    const g = groups.get(text);
    if (g) g.items.push(w);
    else groups.set(text, { text, items: [w] });
  }
  return [...groups.values()];
}
