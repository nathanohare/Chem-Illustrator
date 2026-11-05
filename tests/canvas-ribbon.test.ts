import { describe, expect, it } from 'vitest';
import { CANVAS_TABS } from '../src/ui/canvas-ribbon';
import { RIBBON_ONLY_ICONS, commandIcon } from '../src/ui/command-icons';
import { CONTEXT_BOXES, TOOLBOX_IDS, defaultToolboxes } from '../src/ui/toolboxes';

describe('Canvas ribbon', () => {
  it('gives every command button a picture (only group names and major commands carry words)', () => {
    const bare = CANVAS_TABS.flatMap((t) => t.groups.flatMap((g) => g.items)).filter((it) => 'cmd' in it && !(commandIcon(it.cmd) ?? RIBBON_ONLY_ICONS[it.cmd])).map((it) => ('cmd' in it ? it.cmd : ''));
    expect(bare).toEqual([]);
  });

  it('has Home first, opening with Clipboard, Font and Paragraph (as the Spreadsheet does), then Format Favorites, and the object tabs last', () => {
    expect(CANVAS_TABS[0].id).toBe('home');
    const [clip, font, para, favs] = CANVAS_TABS[0].groups;
    expect([clip.name, clip.special]).toEqual(['Clipboard', 'clipboard']);
    expect([font.name, font.special]).toEqual(['Font', 'font']);
    expect([para.name, para.special]).toEqual(['Paragraph', 'paragraph']);
    expect(favs.gallery).toBe('favorites');
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
