// @vitest-environment jsdom
//
// Installing an update closes the app: once the user has agreed to lose unsaved tabs ("Install
// Anyway"), the app tidies up as a normal close does, so the next start doesn't offer those tabs
// back as unsaved work to recover.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/ui/ask', () => ({ ask: vi.fn(async () => true) }));

import { UpdateUI } from '../src/ui/update-ui';
import type { Release } from '../src/updates';

describe('installing an update', () => {
  it('tidies up after the download, before the installer takes over', async () => {
    const steps: string[] = [];
    const ui = new UpdateUI({ unsaved: () => ['Scheme 1'], skipped: () => null, skip: () => {}, channel: () => 'latest', closing: async () => { steps.push('closing'); } });
    const r: Release = {
      version: '9.9.9', notes: '',
      async install(progress, closing) { steps.push('download'); progress(1); await closing?.(); steps.push('install'); },
    };
    await (ui as unknown as { install(r: Release, bar: HTMLElement, row: HTMLElement): Promise<void> }).install(r, document.createElement('div'), document.createElement('div'));
    expect(steps).toEqual(['download', 'closing', 'install']);
  });
});
