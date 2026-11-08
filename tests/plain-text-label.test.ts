// @vitest-environment jsdom
//
// The analysis box's short label (src/ui/canvas-ribbon-boxes.ts) keeps only the words of its
// markup, and never a bracket, however the tags are nested or broken.

import { describe, expect, it } from 'vitest';
import { plainText } from '../src/ui/canvas-ribbon-boxes';

describe('plainText', () => {
  it('drops tags and keeps the words', () => {
    expect(plainText('C<sub>6</sub>H<sub>6</sub>')).toBe('C6H6');
    expect(plainText('M<sub>w</sub>')).toBe('Mw');
  });
  it('leaves no bracket from nested or broken tags', () => {
    expect(plainText('<scr<script>ipt>x')).not.toMatch(/[<>]/);
    expect(plainText('a > b < c')).not.toMatch(/[<>]/);
    expect(plainText('plain')).toBe('plain');
  });
});
