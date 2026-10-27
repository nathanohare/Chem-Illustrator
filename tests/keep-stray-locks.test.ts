// @vitest-environment jsdom
//
// Laptop bench (v0.1.139): ".~lock.CI notes r5.xlsx#" files stayed beside workbooks after they
// were closed. A copy of the app that stops without closing (a crash, ending it from Task Manager)
// can't take its locks away, so it writes them down and the next start does; a lock written while
// its tab was being closed goes again at once.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const disk = new Map<string, Uint8Array>();
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: async (cmd: string, args: Record<string, string>) => {
    if (cmd === 'read_binary_file') {
      const b = disk.get(args.path);
      if (!b) throw new Error('not found');
      return b.slice().buffer;
    }
    if (cmd === 'write_lock_file') { await new Promise((r) => setTimeout(r, 5)); disk.set(args.path, new TextEncoder().encode(args.contents)); return; }
    if (cmd === 'remove_lock_file') { disk.delete(args.path); return; }
    if (cmd === 'path_exists') return disk.has(args.path);
    if (cmd === 'who_am_i') return { user: 'nate', host: 'lab-pc' };
    if (cmd === 'file_held') return false;
    if (cmd === 'file_stamp') return null;
    throw new Error('unexpected ' + cmd);
  },
}));

import { Keeper } from '../src/keep/keeper';
import { Recovery, parseSession } from '../src/keep/recovery';
import { memoryStore, getText } from '../src/keep/store';
import { DEFAULT_KEEP } from '../src/keep/prefs';
import { lockPath, lockText } from '../src/keep/shared';
import type { Tab, Workspace } from '../src/workspace';

const prefs = { ...DEFAULT_KEEP, warnOpenElsewhere: true, lockFiles: true };
const enc = (s: string) => new TextEncoder().encode(s);
const keeperFor = (ws: Workspace, store = memoryStore()) => new Keeper({ ws, prefs: () => prefs, setPrefs: () => {}, flash: () => {}, refresh: () => {} }, store);

beforeEach(() => { disk.clear(); document.body.replaceChildren(); });

describe('lock files', () => {
  it('writes the session’s locks down, and clears them when the app closes', async () => {
    const tab = { id: 1, name: 'a.xlsx', ref: { kind: 'path', path: '/w/a.xlsx' } } as unknown as Tab;
    const ws = { tabs: [tab], fileTabs: [tab] } as unknown as Workspace;
    const store = memoryStore();
    const keeper = keeperFor(ws, store);
    keeper.opened(tab);
    await vi.waitFor(() => expect(disk.has(lockPath('/w/a.xlsx'))).toBe(true));
    await vi.waitFor(async () => {
      const s = parseSession(await getText(store, `recovery/${keeper.recovery.session}/session.json`));
      expect(s?.locks).toEqual([lockPath('/w/a.xlsx')]);
    });
    await keeper.end();
    expect(disk.has(lockPath('/w/a.xlsx'))).toBe(false);
  });

  it('takes away the locks a crashed session left, at the next start', async () => {
    const store = memoryStore();
    const old = new Recovery(store, 'old-session', () => Date.now() - 10 * 60_000);
    const mineLeft = lockPath('/w/CI notes r5.xlsx'), theirs = lockPath('/w/b.xlsx');
    disk.set(mineLeft, enc(lockText({ user: 'nate', host: 'lab-pc' }, 'old-session')));
    // a lock someone else wrote since, at a path the old session listed, stays
    disk.set(theirs, enc(lockText({ user: 'sam', host: 'other-pc' }, 'their-session')));
    await old.setLocks([mineLeft, theirs]);
    const ws = { tabs: [], fileTabs: [] } as unknown as Workspace;
    const keeper = keeperFor(ws, store);
    await keeper.start();
    expect(disk.has(mineLeft)).toBe(false);
    expect(disk.has(theirs)).toBe(true);
    await keeper.end();
  });

  it('takes away a stale lock of its own found beside a file being opened', async () => {
    const path = '/w/c.xlsx';
    disk.set(lockPath(path), enc(lockText({ user: 'nate', host: 'lab-pc' }, 'long-gone')));
    const tab = { id: 1, name: 'c.xlsx', ref: { kind: 'path', path } } as unknown as Tab;
    const ws = { tabs: [tab], fileTabs: [tab] } as unknown as Workspace;
    const keeper = keeperFor(ws);
    await keeper.start();
    // replaced by this session's own lock, with no "open somewhere else" notice
    await vi.waitFor(() => expect(new TextDecoder().decode(disk.get(lockPath(path)))).toContain(keeper.recovery.session));
    expect(document.querySelector('.keep-notice')).toBeNull();
    await keeper.end();
    expect(disk.has(lockPath(path))).toBe(false);
  });

  it('takes the lock away again when the tab closes while it is being written', async () => {
    const tab = { id: 1, name: 'd.xlsx', ref: { kind: 'path', path: '/w/d.xlsx' } } as unknown as Tab;
    const ws = { tabs: [tab], fileTabs: [tab] } as unknown as Workspace;
    const keeper = keeperFor(ws);
    keeper.opened(tab);
    // closed before the (slow) write finishes
    await new Promise((r) => setTimeout(r, 1));
    (ws.tabs as Tab[]).length = 0;
    (ws.fileTabs as Tab[]).length = 0;
    keeper.dropped(tab);
    await new Promise((r) => setTimeout(r, 30));
    expect(disk.has(lockPath('/w/d.xlsx'))).toBe(false);
  });
});
