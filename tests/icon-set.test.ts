// @vitest-environment jsdom
//
// The ribbons' icon set (src/ui/icon-set.ts): every drawing different from the others, and no two
// different commands on the ribbons showing the same picture (the same command in another mode,
// Insert > Table in Document and in Spreadsheet, shares its picture on purpose).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ICON_SET, iconForButton } from '../src/ui/icon-set';

/** Commands with different names that are one command in different places. */
const SAME: Record<string, string> = {
  'draw-structure': 'structure', 'insert-structure': 'structure', 'design-size': 'page-size',
  'rotate-dialog': 'rotate-by', 'arrange-rotate': 'rotate-by', 'table-styles': 'table-style',
};

/** One name for a command wherever it is: without its mode's prefix or the words that only say where it is. */
function base(key: string): string {
  let k = key.replace(/^(sh|doc|tr|an):/, '');
  k = SAME[k] ?? k;
  for (;;) {
    const next = k.replace(/^(insert|slide|design|doc|sheet|arrange|dash-add)-(?=.)/, '').replace(/-(sheet|doc|gallery)$/, '');
    if (next === k) break;
    k = next;
  }
  return SAME[k] ?? k;
}

const commandOf = (b: HTMLElement) => {
  const d = b.dataset;
  return d.sh ? 'sh:' + d.sh : d.doc ? 'doc:' + d.doc : d.tr ? 'tr:' + d.tr : d.an ? 'an:' + d.an : d.cmd ?? '';
};

describe('the icon set', () => {
  beforeAll(() => {
    const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
    document.body.innerHTML = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '');
  });

  it('draws every icon differently', () => {
    const seen = new Map<string, string>();
    for (const [name, def] of Object.entries(ICON_SET)) {
      expect(seen.get(def.d), `${name} is drawn the same as ${seen.get(def.d)}`).toBeUndefined();
      seen.set(def.d, name);
    }
  });

  it('gives different commands on the ribbons different pictures', () => {
    const users = new Map<string, Map<string, string>>();
    let pictured = 0;
    for (const b of document.querySelectorAll<HTMLElement>('.ribbon button')) {
      const cmd = commandOf(b);
      if (!cmd) continue;
      const set = iconForButton(b);
      const glyph = (b.querySelector(':scope > .rb-icon')?.textContent ?? (b.classList.contains('rb-iconbtn') ? b.textContent : '') ?? '').trim();
      const pic = set ? `drawing ${set}` : glyph ? `symbol ${glyph}` : '';
      if (!pic) continue;
      pictured++;
      const m = users.get(pic) ?? new Map<string, string>();
      m.set(base(cmd), cmd);
      users.set(pic, m);
    }
    expect(pictured).toBeGreaterThan(200);
    const shared = [...users].filter(([, m]) => m.size > 1).map(([pic, m]) => `${pic}: ${[...m.values()].join(', ')}`);
    expect(shared).toEqual([]);
  });
});
