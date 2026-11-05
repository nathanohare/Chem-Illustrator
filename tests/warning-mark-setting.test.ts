import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings';

describe('how a warning is marked', () => {
  it('is the thin red box unless another look was chosen', () => {
    expect(DEFAULT_SETTINGS.warnLook).toBe('box');
    expect(parseSettings('{}').warnLook).toBe('box');
  });
  it('goes back to the box from settings saved while the disc was the default', () => {
    expect(parseSettings(JSON.stringify({ warnLook: 'disc' })).warnLook).toBe('box');
  });
  it('keeps a look that was chosen', () => {
    for (const look of ['soft', 'circle', 'dashed', 'corners']) expect(parseSettings(JSON.stringify({ warnLook: look })).warnLook).toBe(look);
  });
});
