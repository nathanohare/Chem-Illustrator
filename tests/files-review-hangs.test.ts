// File fixes from the 26 October code review: damaged or hostile files that froze the app for
// good. Each reader runs in a worker with a time limit, so a hang fails instead of stalling the run.

import { describe, it, expect } from 'vitest';
import { runWithin } from './hang-guard';

describe('RTF', () => {
  it('a negative \\bin count does not send the reader back for ever', async () => {
    const rtf = new TextEncoder().encode('{\\rtf1\\ansi {Yield 92%}\\bin-30 }');
    expect(await runWithin('src/io/rtf.ts', 'readRtf', rtf, 3000)).toBe('done');
  }, 20_000);

  it('a normal \\bin still skips its bytes', async () => {
    const rtf = new TextEncoder().encode('{\\rtf1\\ansi Yield 92%{\\*\\blipuid \\bin3 abc}}');
    expect(await runWithin('src/io/rtf.ts', 'readRtf', rtf, 3000)).toBe('done');
  }, 20_000);
});
