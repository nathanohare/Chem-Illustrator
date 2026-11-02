// Where the library is kept, and keeping it there. By default it sits in the app's own data
// folder (in a browser, the page's storage); in the desktop app it can instead be kept in a
// folder you pick, such as one in OneDrive or on a lab drive, so it follows you between
// computers or is shared by the group. Each save reads what is there first and merges it in
// (mergeLibraries), so changes made on another computer meanwhile are kept.

import { invoke, isTauri } from '@tauri-apps/api/core';
import { getText, keepStore, putText, type KeepStore } from '../keep/store';
import { joinPath } from '../io/workspace-file';
import { emptyLibrary, libraryText, mergeLibraries, parseLibrary, pruneDeleted, type LibraryData } from './library';

/** Where the library's file and its PDFs are read and written. */
export interface LibraryPlace {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  readFile(name: string): Promise<Uint8Array | null>;
  writeFile(name: string, data: Uint8Array): Promise<void>;
  /** Delete an attachment (a PDF taken off its reference). */
  removeFile(name: string): Promise<void>;
  /** In words, for the Library Location window. */
  where(): Promise<string>;
  /** Where an attachment is on disk, to open it in its own program (desktop app); null in a browser. */
  filePath(name: string): Promise<string | null>;
}

/** The library's file and PDFs in the app's own store (keys under "library/"). */
export function storePlace(store: KeepStore): LibraryPlace {
  return {
    read: () => getText(store, 'library/library.json'),
    write: (text) => putText(store, 'library/library.json', text),
    readFile: (name) => store.get(`library/attachments/${name}`),
    writeFile: (name, data) => store.put(`library/attachments/${name}`, data),
    removeFile: (name) => store.remove(`library/attachments/${name}`),
    where: async () => `${await store.where()} (library)`,
    filePath: async (name) => (isTauri() ? joinPath(joinPath(joinPath(await store.where(), 'library'), 'attachments'), name) : null),
  };
}

/** The file the library is kept in, in a folder you picked. */
export const LIBRARY_FILE = 'Chem Illustrator Library.json';
export const ATTACHMENTS_FOLDER = 'Chem Illustrator Library PDFs';

/** The library in a folder (desktop app): its file, and its PDFs in a folder beside it. */
export function folderPlace(folder: string): LibraryPlace {
  const file = joinPath(folder, LIBRARY_FILE);
  const pdfs = joinPath(folder, ATTACHMENTS_FOLDER);
  return {
    async read() {
      if (!(await invoke<boolean>('path_exists', { path: file }))) return null;
      return invoke<string>('read_text_file', { path: file });
    },
    write: (text) => invoke('write_text_file', { path: file, contents: text }),
    async readFile(name) {
      try { return new Uint8Array(await invoke<ArrayBuffer>('read_binary_file', { path: joinPath(pdfs, name) })); } catch { return null; }
    },
    async writeFile(name, data) {
      await invoke('make_folder', { path: pdfs });
      await invoke('write_binary_file', data, { headers: { path: encodeURIComponent(joinPath(pdfs, name)) } });
    },
    // a PDF in a shared folder is left there (someone else's copy of the library may still use it)
    async removeFile() {},
    where: async () => file,
    filePath: async (name) => joinPath(pdfs, name),
  };
}

/** Where this computer keeps its library: the app's store, or a folder (kept in the app's store, as it belongs to this computer). */
export interface PlaceChoice { folder: string | null }

const PLACE_KEY = 'library/place.json';

export async function readPlaceChoice(store: KeepStore): Promise<PlaceChoice> {
  try {
    const raw = JSON.parse((await getText(store, PLACE_KEY)) ?? '{}') as { folder?: unknown };
    return { folder: typeof raw.folder === 'string' && raw.folder.trim() ? raw.folder : null };
  } catch {
    return { folder: null };
  }
}

export function writePlaceChoice(store: KeepStore, c: PlaceChoice): Promise<void> {
  return putText(store, PLACE_KEY, JSON.stringify(c));
}

/**
 * The library while the app is open: loaded the first time it is needed, changed in memory
 * (each change tells the listeners), and saved a moment after the last change, merged with
 * whatever another computer wrote to the same place meanwhile.
 */
export class Library {
  private data: LibraryData = emptyLibrary();
  private loading: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  /** Why the last read or save failed (said in the windows), or ''. */
  problem = '';

  constructor(public place: LibraryPlace, private delayMs = 800) {}

  get loaded(): boolean { return this.loading !== null; }

  /** The library as it is now (load() first). */
  get now(): LibraryData { return this.data; }

  /** Read it from its place, once (later calls wait for the same read). */
  load(): Promise<void> {
    return (this.loading ??= (async () => {
      try {
        this.data = parseLibrary(await this.place.read());
      } catch (e) {
        this.problem = `Your library could not be read: ${e instanceof Error ? e.message : String(e)}`;
      }
      this.tell();
    })());
  }

  /** Read it again from its place (another computer may have changed it), keeping changes made here. */
  async reload(): Promise<void> {
    await this.load();
    try {
      const there = parseLibrary(await this.place.read());
      this.data = mergeLibraries(there, this.data);
      this.problem = '';
    } catch (e) {
      this.problem = `Your library could not be read: ${e instanceof Error ? e.message : String(e)}`;
    }
    this.tell();
  }

  /** Keep it somewhere else from now on: what is there is merged with what is here. */
  async moveTo(place: LibraryPlace): Promise<void> {
    await this.flush();
    await this.load();
    this.place = place;
    let there = emptyLibrary();
    try { there = parseLibrary(await place.read()); } catch { /* a new place */ }
    this.data = mergeLibraries(there, this.data);
    this.tell();
    await this.saveNow();
  }

  onChange(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  private tell(): void {
    for (const f of this.listeners) {
      try { f(); } catch { /* a window that closed */ }
    }
  }

  /** Change it (saved a moment later). `f` gives the library as it should be; the same object for no change. */
  change(f: (lib: LibraryData) => LibraryData): void {
    const next = f(this.data);
    if (next === this.data) return;
    this.data = next;
    this.tell();
    this.later();
  }

  private later(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.saveNow(); }, this.delayMs);
  }

  /** Save now: read what is there, merge, write. */
  saveNow(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.saving = this.saving.then(async () => {
      try {
        let there: LibraryData | null = null;
        try { there = parseLibrary(await this.place.read()); } catch { /* written fresh */ }
        const merged = pruneDeleted(there ? mergeLibraries(there, this.data) : this.data);
        await this.place.write(libraryText(merged));
        // what came from elsewhere shows here too
        const grew = there && (merged.references.length !== this.data.references.length || merged.compounds.length !== this.data.compounds.length || merged.collections.length !== this.data.collections.length);
        this.data = merged;
        this.problem = '';
        if (grew) this.tell();
      } catch (e) {
        this.problem = `Your library could not be saved: ${e instanceof Error ? e.message : String(e)}`;
        this.tell();
      }
    });
    return this.saving;
  }

  /** Save anything waiting (before the app closes). */
  async flush(): Promise<void> {
    if (this.timer) await this.saveNow();
    await this.saving;
  }
}

/** The library for where the app is running, in the place this computer chose. */
export async function openLibrary(): Promise<Library> {
  const store = keepStore();
  const choice = isTauri() ? await readPlaceChoice(store) : { folder: null };
  return new Library(choice.folder ? folderPlace(choice.folder) : storePlace(store));
}
