import { describe, expect, it } from 'vitest';
import { CANVAS_TABS } from '../src/ui/canvas-ribbon';
import { RIBBON_ONLY_ICONS, commandIcon } from '../src/ui/command-icons';
import { CONTEXT_BOXES, TOOLBOX_IDS, defaultToolboxes } from '../src/ui/toolboxes';

describe('Canvas ribbon', () => {
  it('gives every command button a picture (only group names and major commands carry words)', () => {
    const bare = CANVAS_TABS.flatMap((t) => t.groups.flatMap((g) => g.items)).filter((it) => 'cmd' in it && !(commandIcon(it.cmd) ?? RIBBON_ONLY_ICONS[it.cmd])).map((it) => ('cmd' in it ? it.cmd : ''));
    expect(bare).toEqual([]);
  });

  it('has Home first, with Format Favorites as its first group, and the object tabs last', () => {
    expect(CANVAS_TABS[0].id).toBe('home');
    expect(CANVAS_TABS[0].groups[0].gallery).toBe('favorites');
    const ctx = CANVAS_TABS.filter((t) => t.context).map((t) => t.id);
    expect(ctx).toEqual(['arrow', 'ring', 'bond']);
    expect(CANVAS_TABS.slice(-3).every((t) => t.context)).toBe(true);
  });
});

describe('context toolboxes', () => {
  it('are toolboxes, hidden until opened', () => {
    const st = defaultToolboxes();
    for (const id of CONTEXT_BOXES) {
      expect(TOOLBOX_IDS).toContain(id);
      expect(st.places[id].shown).toBe(false);
    }
  });
});
