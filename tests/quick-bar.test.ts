// The quick bar beside the menus (Quick Access Toolbar): what it keeps in the settings.

import { describe, expect, it } from 'vitest';
import { parseQuick, withQuick, QUICK_DEFAULT } from '../src/ui/quick-bar';

describe('quick bar', () => {
  it('starts with Save, Undo, Redo, Fit, the toolbox lock and the dark page', () => {
    expect(QUICK_DEFAULT).toEqual(['save', 'undo', 'redo', 'zoom-fit', 'lock-toolboxes', 'dark-page']);
  });

  it('reads its list from the settings, keeping only command names, once each', () => {
    expect(parseQuick(undefined)).toBeNull();
    expect(parseQuick('save')).toBeNull();
    expect(parseQuick(['save', 'save', 'Print', '<b>', 7, 'zoom-fit'])).toEqual(['save', 'zoom-fit']);
    expect(parseQuick([])).toEqual([]);
  });

  it('puts commands on, takes them off, and never doubles one', () => {
    expect(withQuick(['save', 'undo'], 'print', true)).toEqual(['save', 'undo', 'print']);
    expect(withQuick(['save', 'undo'], 'print', true, 1)).toEqual(['save', 'print', 'undo']);
    expect(withQuick(['save', 'undo', 'print'], 'save', true)).toEqual(['undo', 'print', 'save']);
    expect(withQuick(['save', 'undo'], 'save', false)).toEqual(['undo']);
  });
});
