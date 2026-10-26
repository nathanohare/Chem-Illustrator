// File > Open Recent in the web version: a browser that lets a page open files by itself
// (Chrome and Edge) can remember the files opened and saved, as "handles" kept in the page's own
// storage (IndexedDB). The recent list holds them as "handle:<id>:<name>"; the handle itself, which
// can't be written in the settings, stays here under its id. The browser asks the person once
// before such a file is opened again.

import type { FileHandle } from './io/files';

type Handle = FileHandle & {
  isSameEntry?(other: FileHandle): Promise<boolean>;
  queryPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
};

const PREFIX = 'handle:';

/** A recent-list entry for a file the browser keeps a handle to. */
export const isHandleEntry = (entry: string): boolean => entry.startsWith(PREFIX);

/** The entry's id and file name ("handle:7f3a:Scheme.cdxml"). */
export function handleEntry(entry: string): { id: string; name: string } | null {
  const m = /^handle:([^:]+):(.*)$/.exec(entry);
  return m ? { id: m[1], name: m[2] } : null;
}

/** Can this browser keep file handles? */
export const canKeepHandles = (): boolean => typeof indexedDB !== 'undefined' && 'showOpenFilePicker' in globalThis;

let db: Promise<IDBDatabase> | null = null;
const open = () => db ??= new Promise((resolve, reject) => {
  const r = indexedDB.open('chem-illustrator-recent', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('handles');
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const run = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const s = (await open()).transaction('handles', mode).objectStore('handles');
  return new Promise((resolve, reject) => {
    const r = f(s);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
};

/**
 * Keep a handle and give its entry for the recent list. A file already in the list (`list`)
 * keeps its id, so it moves to the top rather than showing twice.
 */
export async function keepHandle(handle: FileHandle, list: readonly string[]): Promise<string> {
  const h = handle as Handle;
  for (const entry of list) {
    const e = handleEntry(entry);
    if (!e || e.name !== h.name) continue;
    const old = await run('readonly', (s) => s.get(e.id)) as Handle | undefined;
    if (old && (await old.isSameEntry?.(h).catch(() => false))) return entry;
  }
  const id = Math.random().toString(36).slice(2, 10);
  await run('readwrite', (s) => s.put(h, id));
  return `${PREFIX}${id}:${h.name}`;
}

/** The kept handle for an entry, with the browser's leave to read it (asked for if need be), or null. */
export async function handleFor(entry: string): Promise<FileHandle | null> {
  const e = handleEntry(entry);
  if (!e) return null;
  const h = await run('readonly', (s) => s.get(e.id)) as Handle | undefined;
  if (!h) return null;
  const ok = (await h.queryPermission?.({ mode: 'readwrite' })) === 'granted' || (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted';
  return ok ? h : null;
}

/** Forget the handles no longer in the list. */
export async function forgetHandles(list: readonly string[]): Promise<void> {
  const keep = new Set(list.map((x) => handleEntry(x)?.id).filter(Boolean));
  const keys = await run('readonly', (s) => s.getAllKeys());
  for (const k of keys) if (!keep.has(String(k))) await run('readwrite', (s) => s.delete(k));
}
