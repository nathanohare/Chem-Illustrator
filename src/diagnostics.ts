// Crash handling: errors the program didn't expect are written to a small log kept on this
// computer (in the app's "Kept" folder, or the browser's storage for the web version), with a
// notice offering to report them. Nothing is sent anywhere: a report goes through Help > Send
// Feedback, filled in for the person to read, change and send themselves.
//
// The desktop app also notices when it stopped without closing last time (a crash, or Windows
// ending it): each running app keeps a small marker file up to date, and a normal close deletes
// it. A Rust panic is written to "diagnostics/panic-<time>.txt" by src-tauri/src/lib.rs.

import type { KeepStore } from './keep/store';
import { getText, putText, keyPart } from './keep/store';
import type { Feedback } from './feedback';

export type LogLevel = 'error' | 'warning' | 'note';

export interface LogEntry {
  /** Milliseconds since 1970. */
  time: number;
  level: LogLevel;
  message: string;
  /** Where it happened (a stack trace), when known. */
  detail?: string;
  /** How many times in a row it happened. */
  count: number;
}

/** A session that stopped without closing. */
export interface UnexpectedClose {
  started: number;
  /** When it last said it was running. */
  beat: number;
  version: string;
  /** What the Rust side wrote when it panicked, if it did. */
  panics: string[];
}

const FOLDER = 'diagnostics';
const LOG = `${FOLDER}/log.txt`;
const SESSIONS = `${FOLDER}/sessions`;
/** How often a running app says it still is. */
export const BEAT_MS = 30_000;
/** A marker not updated for this long belongs to an app that stopped. */
export const STALE_MS = 4 * BEAT_MS;
/** Entries kept for this session (the oldest go first). */
const MAX_ENTRIES = 200;
/** How much of the log file is kept from earlier sessions. */
const MAX_LOG_CHARS = 200_000;

/** File paths name the person (C:\Users\nate\…): shorten the home folder to ~. */
export function redact(s: string): string {
  return s
    .replace(/\b[A-Za-z]:[\\/]+Users[\\/]+[^\\/:\s"'<>|]+/gi, '~')
    .replace(/\/(?:Users|home)\/[^/\s"'<>:]+/g, '~');
}

/** The message and stack trace of anything thrown (an Error, a string, or something else). */
export function describe(reason: unknown): { message: string; detail?: string } {
  if (reason instanceof Error) {
    const stack = reason.stack ?? '';
    // Chromium's stack starts with the message again
    const detail = stack.startsWith(`${reason.name}: ${reason.message}`) ? stack.split('\n').slice(1).join('\n') : stack;
    return { message: `${reason.name}: ${reason.message}`, detail: detail.trim() || undefined };
  }
  if (typeof reason === 'string') return { message: reason };
  try { return { message: JSON.stringify(reason) ?? String(reason) }; } catch { return { message: String(reason) }; }
}

/** Errors that say nothing about the program: the browser's own noise, and other sites' scripts. */
export function ignorable(message: string): boolean {
  return /ResizeObserver loop/.test(message) || /^Script error\.?$/.test(message.trim());
}

const pad = (n: number) => String(n).padStart(2, '0');
export function stamp(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** One entry as log text: time, level and message, then its stack trace indented. */
export function formatEntry(e: LogEntry, stackLines = Infinity): string {
  const head = `${stamp(e.time)} ${e.level.toUpperCase()}${e.count > 1 ? ` (×${e.count})` : ''} ${e.message}`;
  if (!e.detail) return head;
  const lines = e.detail.split('\n').map((l) => l.trim()).filter(Boolean);
  const shown = lines.slice(0, stackLines);
  if (lines.length > shown.length) shown.push('…');
  return `${head}\n${shown.map((l) => `    ${l}`).join('\n')}`;
}

/** The end of a text, cut at a line break, at most `max` characters long. */
export function tail(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(text.length - max);
  const nl = cut.indexOf('\n');
  return nl >= 0 ? cut.slice(nl + 1) : cut;
}

interface Marker { session: string; started: number; beat: number; version: string }

function parseMarker(text: string | null): Marker | null {
  if (!text) return null;
  try {
    const o = JSON.parse(text) as Partial<Marker>;
    return typeof o.beat === 'number' ? { session: String(o.session ?? ''), started: Number(o.started) || o.beat, beat: o.beat, version: String(o.version ?? '') } : null;
  } catch { return null; }
}

export interface DiagnosticsOptions {
  store: KeepStore;
  /** The program's version, for the log and the marker. */
  version?: string;
  /** Whether to watch for the app stopping without closing (the desktop app). */
  markers?: boolean;
  now?: () => number;
}

export class Diagnostics {
  /** This session's entries, oldest first. */
  readonly entries: LogEntry[] = [];
  /** What earlier sessions wrote to the log. */
  private earlier = '';
  readonly session: string;
  readonly started: number;
  private readonly now: () => number;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private beatTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private loaded = false;
  version: string;

  constructor(private opts: DiagnosticsOptions) {
    this.now = opts.now ?? Date.now;
    this.started = this.now();
    this.session = keyPart(`${this.started.toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    this.version = opts.version ?? '';
  }

  /** Call when the entries change (the Error Console). */
  onChange(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  /** Write something to the log. The same message again straight after only counts up. */
  record(level: LogLevel, message: string, detail?: string): LogEntry {
    message = redact(message).slice(0, 2000);
    detail = detail ? redact(detail).slice(0, 4000) : undefined;
    const last = this.entries[this.entries.length - 1];
    let e: LogEntry;
    if (last && last.level === level && last.message === message && last.detail === detail) {
      last.count++;
      last.time = this.now();
      e = last;
    } else {
      e = { time: this.now(), level, message, detail, count: 1 };
      this.entries.push(e);
      if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    for (const f of this.listeners) f();
    this.queueWrite();
    return e;
  }

  /** Something thrown, as an error entry. */
  recordError(reason: unknown, where?: string): LogEntry {
    const { message, detail } = describe(reason);
    return this.record('error', where ? `${where}: ${message}` : message, detail);
  }

  clear(): void {
    this.entries.length = 0;
    for (const f of this.listeners) f();
    this.queueWrite();
  }

  get errorCount(): number {
    return this.entries.reduce((n, e) => n + (e.level === 'error' ? e.count : 0), 0);
  }

  private sessionHeader(): string {
    return `=== Started ${stamp(this.started)}${this.version ? `, ${this.version}` : ''} ===`;
  }

  /** This session's log as text. */
  sessionText(stackLines = Infinity): string {
    return [this.sessionHeader(), ...this.entries.map((e) => formatEntry(e, stackLines))].join('\n');
  }

  /** The whole log: earlier sessions, then this one. */
  logText(): string {
    const earlier = this.earlier.trimEnd();
    return `${earlier ? `${earlier}\n` : ''}${this.sessionText()}\n`;
  }

  /** The newest entries as short text for a report (stack traces cut to a few lines). */
  reportText(max = 2500, from?: LogEntry): string {
    const list = from ? this.entries.slice(Math.max(0, this.entries.indexOf(from) - 9), this.entries.indexOf(from) + 1) : this.entries.slice(-10);
    return tail(list.map((e) => formatEntry(e, 6)).join('\n'), max);
  }

  private queueWrite(): void {
    if (this.writeTimer || !this.loaded) return;
    this.writeTimer = setTimeout(() => { this.writeTimer = null; void this.write(); }, 1000);
  }

  /** Save the log now. */
  async write(): Promise<void> {
    if (this.writeTimer) { clearTimeout(this.writeTimer); this.writeTimer = null; }
    try { await putText(this.opts.store, LOG, tail(this.logText(), MAX_LOG_CHARS + 50_000)); } catch { /* nowhere to keep it: the log stays in memory */ }
  }

  private async writeMarker(): Promise<void> {
    const m: Marker = { session: this.session, started: this.started, beat: this.now(), version: this.version };
    try { await putText(this.opts.store, `${SESSIONS}/${this.session}.json`, JSON.stringify(m)); } catch { /* as above */ }
  }

  /**
   * Read the log kept from earlier sessions and start this session's marker. Returns the
   * session that stopped without closing last time, if one did (and forgets its marker).
   */
  async start(): Promise<UnexpectedClose | null> {
    const store = this.opts.store;
    try { this.earlier = tail((await getText(store, LOG)) ?? '', MAX_LOG_CHARS); } catch { this.earlier = ''; }
    this.loaded = true;
    let found: UnexpectedClose | null = null;
    // what the Rust side wrote when it panicked
    const panics: { time: number; text: string }[] = [];
    try {
      for (const e of await store.list(FOLDER)) {
        if (e.folder || !/^panic-.*\.txt$/.test(e.name)) continue;
        const text = (await getText(store, `${FOLDER}/${e.name}`))?.trim();
        if (text) panics.push({ time: e.modified, text: redact(text) });
        await store.remove(`${FOLDER}/${e.name}`);
      }
    } catch { /* none */ }
    panics.sort((a, b) => a.time - b.time);
    if (this.opts.markers) {
      try {
        const now = this.now();
        for (const e of await store.list(SESSIONS)) {
          if (e.folder) continue;
          const key = `${SESSIONS}/${keyPart(e.name)}`;
          const m = parseMarker(await getText(store, key));
          const beat = m?.beat ?? e.modified;
          if (now - beat < STALE_MS) continue; // another copy of the app, still running
          await store.remove(key);
          if (!found || beat > found.beat) found = { started: m?.started ?? beat, beat, version: m?.version ?? '', panics: [] };
        }
      } catch { /* none */ }
    }
    if (panics.length) {
      found ??= { started: panics[0].time, beat: panics[panics.length - 1].time, version: '', panics: [] };
      found.panics = panics.map((p) => p.text);
      this.earlier += `\n${panics.map((p) => `${stamp(p.time)} ERROR (desktop app) ${p.text}`).join('\n')}`;
    }
    if (found) this.earlier += `\n=== ${stamp(found.beat)}: last heard from before it stopped without closing ===`;
    this.earlier = tail(this.earlier.replace(/^\n+/, ''), MAX_LOG_CHARS);
    if (this.opts.markers) {
      await this.writeMarker();
      this.beatTimer = setInterval(() => void this.writeMarker(), BEAT_MS);
    }
    await this.write();
    return found;
  }

  /** The app is closing normally: save the log and take away the marker. */
  async end(): Promise<void> {
    if (this.beatTimer) { clearInterval(this.beatTimer); this.beatTimer = null; }
    await this.write();
    if (this.opts.markers) {
      try { await this.opts.store.remove(`${SESSIONS}/${this.session}.json`); } catch { /* it will look like a crash next time; harmless */ }
    }
  }
}

/** A problem report, filled in for Send Feedback, about an error or an unexpected close. */
export function errorReport(d: Diagnostics, about: { entry?: LogEntry; closed?: UnexpectedClose }): Pick<Feedback, 'title' | 'extra'> {
  if (about.closed) {
    const c = about.closed;
    const lines = [`Stopped without closing; last heard from at ${stamp(c.beat)} (started ${stamp(c.started)}${c.version ? `, ${c.version}` : ''}).`];
    for (const p of c.panics) lines.push('', tail(p, 1500));
    return { title: 'The program closed unexpectedly', extra: lines.join('\n') };
  }
  const e = about.entry;
  const msg = e?.message.split('\n')[0] ?? 'Error';
  return { title: `Error: ${msg.length > 80 ? `${msg.slice(0, 79)}…` : msg}`, extra: d.reportText(2500, e) };
}

export interface CatchHost {
  diagnostics: Diagnostics;
  /** An error worth telling the person about (not called more than once every half minute). */
  show(entry: LogEntry): void;
  now?: () => number;
}

/** How long after one notice before another is shown. */
export const NOTICE_GAP_MS = 30_000;

/**
 * Catch errors nothing else caught (and promises that failed with nobody waiting on them),
 * and copy console warnings and errors into the log. Returns a function that stops it.
 */
export function catchErrors(win: Window & typeof globalThis, host: CatchHost): () => void {
  const now = host.now ?? Date.now;
  let lastShown = -Infinity;
  const caught = (reason: unknown, fallback?: string): void => {
    const { message } = describe(reason ?? fallback);
    if (ignorable(message)) return;
    const entry = host.diagnostics.recordError(reason ?? fallback);
    if (now() - lastShown < NOTICE_GAP_MS) return;
    lastShown = now();
    host.show(entry);
  };
  const onError = (e: ErrorEvent): void => caught(e.error, e.message);
  const onRejection = (e: PromiseRejectionEvent): void => caught(e.reason, 'A promise failed');
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  const con = win.console;
  const { warn, error } = con;
  const text = (args: unknown[]) => args.map((a) => (typeof a === 'string' ? a : describe(a).message)).join(' ');
  const stackOf = (args: unknown[]) => args.find((a): a is Error => a instanceof Error)?.stack;
  con.warn = (...args: unknown[]) => { host.diagnostics.record('warning', text(args), stackOf(args)); warn.apply(con, args); };
  con.error = (...args: unknown[]) => { host.diagnostics.record('error', text(args), stackOf(args)); error.apply(con, args); };
  return () => {
    win.removeEventListener('error', onError);
    win.removeEventListener('unhandledrejection', onRejection);
    con.warn = warn;
    con.error = error;
  };
}
