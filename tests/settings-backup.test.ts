import { describe, it, expect } from 'vitest';
import { loadSettings, settingsText, parseSettings, SettingsStore } from '../src/settings';

function store(main: string | null, backup: string | null) {
  const s = { main, backup, aside: null as string | null };
  const api: SettingsStore = {
    read: async () => s.main,
    readBackup: async () => s.backup,
    writeBackup: async (t) => { s.backup = t; },
    setAside: async () => { s.aside = s.main; s.main = null; return 'settings.damaged-1.json'; },
  };
  return { s, api };
}

const mine = () => settingsText({ ...parseSettings(null), nicknames: { Tf: 'FC(F)(F)S(=O)(=O)*' } });

describe('settings that are damaged are not lost', () => {
  it('keeps a backup each time the settings read whole', async () => {
    const { s, api } = store(mine(), null);
    const got = await loadSettings(() => {}, api);
    expect(got.nicknames.Tf).toBeDefined();
    await Promise.resolve();
    expect(s.backup).toBe(mine());
  });

  it('puts the backup back when the file is damaged, and keeps the damaged file', async () => {
    const good = mine();
    const { s, api } = store(good.slice(0, 40), good);
    const notes: string[] = [];
    const got = await loadSettings((m) => notes.push(m), api);
    expect(got.nicknames.Tf).toBeDefined();
    expect(s.aside).toBe(good.slice(0, 40));
    expect(notes[0]).toMatch(/last good copy/);
  });

  it('says so when there is no good copy', async () => {
    const { api } = store('{"hotk', null);
    const notes: string[] = [];
    const got = await loadSettings((m) => notes.push(m), api);
    expect(got.nicknames).toEqual({});
    expect(notes[0]).toMatch(/no good copy/);
  });

  it('a first start (no file) is quiet', async () => {
    const { api } = store(null, null);
    const notes: string[] = [];
    await loadSettings((m) => notes.push(m), api);
    expect(notes).toEqual([]);
  });
});
