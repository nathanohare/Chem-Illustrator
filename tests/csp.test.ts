// The desktop app's Content-Security-Policy (src-tauri/tauri.conf.json): videos and sounds on
// slides are kept as data: URLs, so media-src must let them play (default-src 'self' doesn't),
// as the web version's policy (vite.config.ts) already does.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const conf = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const csp: Record<string, string> = conf.app.security.csp;
const web = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

describe('desktop content security policy', () => {
  it('lets videos and sounds kept in the file play', () => {
    expect(csp['media-src']?.split(/\s+/)).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']));
  });

  it('allows media and fonts from the same places as the web version', () => {
    for (const d of ['media-src', 'font-src']) {
      const line = new RegExp(`"${d} ([^"]+)"`).exec(web)?.[1];
      expect(line, d).toBeTruthy();
      expect(csp[d], d).toBe(line);
    }
  });
});
