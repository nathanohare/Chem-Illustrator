// @vitest-environment jsdom
// Crash handling: the error log, the unexpected-close marker and the problem report it fills in.

import { describe, it, expect, vi } from 'vitest';
import { Diagnostics, catchErrors, errorReport, redact, describe as describeError, tail, BEAT_MS, STALE_MS, NOTICE_GAP_MS } from '../src/diagnostics';
import { memoryStore, putText, getText } from '../src/keep/store';
import { feedbackIssue } from '../src/feedback';

describe('the log', () => {
  it('hides the person\'s user name in file paths', () => {
    expect(redact('at C:\\Users\\npo00\\OneDrive\\x.cdxml')).toBe('at ~\\OneDrive\\x.cdxml');
    expect(redact('file:///Users/nate/Desktop/a.js /home/lab/b')).toBe('file://~/Desktop/a.js ~/b');
  });
  it('describes errors, strings and other things thrown', () => {
    const e = new TypeError('x is undefined');
    e.stack = 'TypeError: x is undefined\n    at draw (main.js:1:2)';
    expect(describeError(e)).toEqual({ message: 'TypeError: x is undefined', detail: 'at draw (main.js:1:2)' });
    expect(describeError('plain')).toEqual({ message: 'plain' });
    expect(describeError({ code: 3 }).message).toBe('{"code":3}');
  });
  it('counts the same error in a row once, and saves the log', async () => {
    const store = memoryStore();
    const d = new Diagnostics({ store, version: 'Version 1.0' });
    await d.start();
    d.record('error', 'boom');
    d.record('error', 'boom');
    d.record('warning', 'careful');
    expect(d.entries).toHaveLength(2);
    expect(d.entries[0].count).toBe(2);
    expect(d.errorCount).toBe(2);
    await d.write();
    const log = await getText(store, 'diagnostics/log.txt');
    expect(log).toContain('Version 1.0');
    expect(log).toContain('ERROR (×2) boom');
    expect(log).toContain('WARNING careful');
  });
  it('keeps earlier sessions\' log, and only the end of a long one', async () => {
    const store = memoryStore();
    await putText(store, 'diagnostics/log.txt', 'x'.repeat(10) + '\n' + 'old line\n'.repeat(40_000));
    const d = new Diagnostics({ store });
    await d.start();
    d.record('error', 'new');
    const text = d.logText();
    expect(text.length).toBeLessThan(260_000);
    expect(text).toContain('old line');
    expect(text.trimEnd().endsWith('ERROR new')).toBe(true);
  });
  it('cuts text at a line break', () => {
    expect(tail('aaa\nbbb\nccc', 6)).toBe('ccc');
    expect(tail('short', 10)).toBe('short');
  });
});

describe('closing unexpectedly', () => {
  it('notices a session that never closed, and not one that did', async () => {
    let now = 1_000_000;
    const store = memoryStore(() => now);
    const first = new Diagnostics({ store, markers: true, now: () => now, version: 'Version 1.0' });
    expect(await first.start()).toBeNull();
    // the app is ended without closing
    now += STALE_MS + BEAT_MS;
    const second = new Diagnostics({ store, markers: true, now: () => now });
    const closed = await second.start();
    expect(closed?.version).toBe('Version 1.0');
    expect(second.logText()).toContain('stopped without closing');
    await second.end();
    now += STALE_MS * 2;
    const third = new Diagnostics({ store, markers: true, now: () => now });
    expect(await third.start()).toBeNull();
    await third.end();
  });
  it('leaves alone another copy of the app that is still running', async () => {
    let now = 5_000_000;
    const store = memoryStore(() => now);
    const running = new Diagnostics({ store, markers: true, now: () => now });
    await running.start();
    now += BEAT_MS;
    expect(await new Diagnostics({ store, markers: true, now: () => now }).start()).toBeNull();
    await running.end();
  });
  it('reads what the desktop app wrote when it panicked, once', async () => {
    const store = memoryStore();
    await putText(store, 'diagnostics/panic-123.txt', "Version 1.0, thread 'main' panicked at src/lib.rs:4:5:\noops");
    const d = new Diagnostics({ store });
    const closed = await d.start();
    expect(closed?.panics[0]).toContain('oops');
    expect(d.logText()).toContain('panicked at src/lib.rs');
    expect(await new Diagnostics({ store }).start()).toBeNull();
  });
});

describe('the report', () => {
  it('fills in a problem report with the error and the entries before it', async () => {
    const d = new Diagnostics({ store: memoryStore() });
    d.record('warning', 'first');
    const e = d.record('error', 'TypeError: a is null', 'at x (y.js:1:1)');
    const r = errorReport(d, { entry: e });
    expect(r.title).toBe('Error: TypeError: a is null');
    expect(r.extra).toContain('WARNING first');
    expect(r.extra).toContain('at x (y.js:1:1)');
    const issue = feedbackIssue({ kind: 'problem', title: r.title, details: '', extra: r.extra });
    expect(issue.body).toContain('**Error details**\n\n```\n');
  });
  it('describes an unexpected close', () => {
    const r = errorReport(new Diagnostics({ store: memoryStore() }), { closed: { started: 0, beat: 1000, version: 'Version 2', panics: ['panicked at a.rs'] } });
    expect(r.title).toBe('The program closed unexpectedly');
    expect(r.extra).toContain('Version 2');
    expect(r.extra).toContain('panicked at a.rs');
  });
});

describe('catching errors', () => {
  it('logs uncaught errors, failed promises and console errors, and shows at most one notice per half minute', () => {
    let now = 0;
    const d = new Diagnostics({ store: memoryStore() });
    const show = vi.fn();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stop = catchErrors(window, { diagnostics: d, show, now: () => now });
    window.dispatchEvent(new ErrorEvent('error', { message: 'Uncaught Error: one', error: new Error('one') }));
    const rejected = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.assign(rejected, { reason: new Error('two') });
    window.dispatchEvent(rejected);
    window.dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop completed with undelivered notifications.' }));
    console.error('three');
    expect(d.entries.map((e) => e.message)).toEqual(['Error: one', 'Error: two', 'three']);
    expect(show).toHaveBeenCalledTimes(1);
    now += NOTICE_GAP_MS;
    window.dispatchEvent(new ErrorEvent('error', { message: 'four', error: new Error('four') }));
    expect(show).toHaveBeenCalledTimes(2);
    stop();
    quiet.mockRestore();
  });
});
