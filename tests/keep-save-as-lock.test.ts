// @vitest-environment jsdom
//
// Laptop bench (xl-finishing): after Save As under a new name, a notice said the NEW file "is no
// longer open anywhere else". Who had the old file open says nothing about the new one, so the
// watch starts again for the new file without a notice.

import { describe, it, expect, vi } from 'vitest';

const disk = new Map<string, Uint8Array>();
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: async (cmd: string, args: Record<string, string>) => {
    if (cmd === 'read_binary_file') {
      const b = disk.get(args.path);
      if (!b) throw new Error('not found');
      return b.slice().buffer;
    }
    if (cmd === 'write_lock_file') { disk.set(args.path, new TextEncoder().encode(args.contents)); return; }
    if (cmd === 'remove_lock_file') { disk.delete(args.path); return; }
    if (cmd === 'path_exists') return disk.has(args.path);
    if (cmd === 'file_held') return false;
    if (cmd === 'file_stamp') return null;
    throw new Error('unexpected ' + cmd);
  },
}));

import { Keeper } from '../src/keep/keeper';
import { memoryStore } from '../src/keep/store';
import { DEFAULT_KEEP } from '../src/keep/prefs';
import { lockPath, lockText } from '../src/keep/shared';
import type { Tab, Workspace } from '../src/workspace';

const titles = () => [...document.querySelectorAll('.keep-notice strong')].map((s) => s.textContent);

describe('open elsewhere, after Save As', () => {
  it('watches the new file afresh, with no "no longer open" notice for it', async () => {
    disk.clear();
    document.body.replaceChildren();
    disk.set('/w/a.cdxml', new Uint8Array(4));
    disk.set(lockPath('/w/a.cdxml'), new TextEncoder().encode(lockText({ user: 'sam', host: 'lab-pc' }, 'their-session')));
    const tab = { id: 1, name: 'a.cdxml', ref: { kind: 'path', path: '/w/a.cdxml' } } as unknown as Tab;
    const ws = { tabs: [tab], fileTabs: [tab] } as unknown as Workspace;
    const prefs = { ...DEFAULT_KEEP, warnOpenElsewhere: true, lockFiles: true };
    const keeper = new Keeper({ ws, prefs: () => prefs, setPrefs: () => {}, flash: () => {}, refresh: () => {} }, memoryStore());
    keeper.opened(tab);
    await vi.waitFor(() => expect(titles()).toEqual(['a.cdxml is open somewhere else']));
    // Save As b.cdxml
    const was = tab.ref;
    tab.ref = { kind: 'path', path: '/w/b.cdxml' };
    tab.name = 'b.cdxml';
    keeper.saved(tab, new Uint8Array(4), 'saved', was);
    // the new file gets this app's lock, and no notice about who had the old one
    await vi.waitFor(() => expect(disk.has(lockPath('/w/b.cdxml'))).toBe(true));
    expect(titles()).toEqual([]);
  });
});
