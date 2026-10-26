import { describe, expect, it } from 'vitest';
import { handleEntry, isHandleEntry } from '../src/recent-handles';
import { recentLabel } from '../src/recent';

describe('recent files in the web version', () => {
  it('reads a kept file entry back as its id and name', () => {
    expect(isHandleEntry('handle:ab12:Scheme 3.cdxml')).toBe(true);
    expect(isHandleEntry('C:\\Work\\a.cdxml')).toBe(false);
    expect(handleEntry('handle:ab12:Scheme: draft.cdxml')).toEqual({ id: 'ab12', name: 'Scheme: draft.cdxml' });
    expect(handleEntry('/home/a.cdxml')).toBeNull();
  });
  it('lists it by name, as kept by the browser', () => {
    expect(recentLabel('handle:ab12:Scheme 3.cdxml')).toEqual({ name: 'Scheme 3.cdxml', folder: 'kept by this browser' });
  });
});
