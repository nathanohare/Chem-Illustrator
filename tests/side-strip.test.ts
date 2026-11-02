import { describe, it, expect } from 'vitest';
import { parseToolboxes, stripHeight, STRIP_HEIGHT, STRIP_MIN } from '../src/ui/toolboxes';

describe('the side panel docked along the top or bottom', () => {
  it('is a short strip to start with, not the window\'s height', () => {
    expect(stripHeight({}, 900)).toBe(STRIP_HEIGHT);
    expect(STRIP_HEIGHT).toBeLessThan(900 / 3);
  });
  it('is never taller than most of the window, nor too short to use', () => {
    expect(stripHeight({ stripHeight: 5000 }, 800)).toBe(480);
    expect(stripHeight({ stripHeight: 3 }, 800)).toBe(STRIP_MIN);
  });
  it('keeps the height it was dragged to with the settings', () => {
    expect(parseToolboxes({ stripHeight: 260 }).stripHeight).toBe(260);
    expect(parseToolboxes({ stripHeight: 'tall' }).stripHeight).toBeUndefined();
    expect(parseToolboxes({ stripHeight: -40 }).stripHeight).toBe(STRIP_MIN);
  });
});
