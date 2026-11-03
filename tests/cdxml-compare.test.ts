// @vitest-environment jsdom
//
// The helpers the save tests use to compare files.

import { describe, it, expect } from 'vitest';
import { duplicateIds } from './cdxml-compare';

const file = (body: string) => `<?xml version="1.0"?><CDXML><fonttable><font id="1" name="Arial"/></fonttable><page id="1">${body}</page></CDXML>`;

describe('duplicateIds', () => {
  it('lists ids used more than once', () => {
    expect(duplicateIds(file('<fragment id="2"><n id="3"/><n id="3"/></fragment>'))).toEqual(['n 3']);
  });

  it('leaves out ids the source file already used more than once', () => {
    // ChemDraw itself sometimes writes the same id twice (object tags in different objects)
    const source = file('<fragment id="2"><objecttag id="5"/></fragment><t id="4"><objecttag id="5"/></t>');
    const saved = file('<fragment id="2"><objecttag id="5"/><n id="6"/></fragment><t id="4"><objecttag id="5"/></t><t id="6"/>');
    expect(duplicateIds(saved, source)).toEqual(['t 6']);
  });

  it('still lists a new object that reuses an id the source file used twice', () => {
    const source = file('<fragment id="2"><objecttag id="5"/></fragment><t id="4"><objecttag id="5"/></t>');
    const saved = file('<fragment id="2"><objecttag id="5"/><n id="5"/></fragment><t id="4"><objecttag id="5"/></t>');
    expect(duplicateIds(saved, source)).toEqual(['objecttag 5']);
  });
});
