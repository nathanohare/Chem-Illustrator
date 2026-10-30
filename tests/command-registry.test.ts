// @vitest-environment jsdom
//
// The command list (src/commands/registry.ts) and the Insert menu made from it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INSERT_MENU, commandDef, commandDefs, renderMenu } from '../src/commands/registry';

const MODES = new Set(['drawing', 'slides', 'sheet', 'document', 'design']);

describe('command list', () => {
  it('names each command once, with known kinds of tab', () => {
    const ids = commandDefs().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of commandDefs()) {
      expect(c.label.trim()).not.toBe('');
      for (const m of c.modes?.split(' ') ?? []) expect(MODES.has(m)).toBe(true);
    }
    expect(commandDef('name-to-structure')?.label).toBe('Structure from Name or SMILES…');
  });

  it('builds the Insert menu with its submenus, lines and tab kinds', () => {
    const menu = document.createElement('div');
    renderMenu(menu, INSERT_MENU);
    const pic = menu.querySelector<HTMLButtonElement>('[data-cmd="insert-picture"]')!;
    expect(pic.getAttribute('role')).toBe('menuitem');
    expect(pic.dataset.modes).toBe('drawing slides design document');
    const doc = [...menu.querySelectorAll<HTMLElement>(':scope > .submenu')].find((s) => s.querySelector(':scope > button')?.textContent === 'Document')!;
    expect(doc.dataset.modes).toBe('document');
    expect(doc.querySelector<HTMLElement>(':scope > .menu.sub')!.hidden).toBe(true);
    expect(doc.querySelector('[data-cmd="insert-toc"]')).not.toBeNull();
    expect(menu.querySelectorAll('[data-cmd]').length).toBe(commandDefs().length);
    expect(menu.querySelector('.keyframes-only[data-cmd="add-keyframe"]')).not.toBeNull();
  });

  it('is not also written out in index.html', () => {
    const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
    for (const c of commandDefs()) {
      const inInsert = html.slice(html.indexOf('id="insert-menu"'), html.indexOf('id="btn-format"'));
      expect(inInsert).not.toContain(`data-cmd="${c.id}"`);
    }
  });
});
