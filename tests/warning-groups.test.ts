import { describe, it, expect } from 'vitest';
import { groupWarnings } from '../src/ui/warning-groups';

describe('groupWarnings', () => {
  it('puts the same problem in one row, in the order first met', () => {
    const on = ['This atom is almost on top of another one.'];
    const g = groupWarnings([
      { kind: 'atom', id: 1, text: on },
      { kind: 'atom', id: 2, text: ['Too many bonds.'] },
      { kind: 'atom', id: 3, text: on },
      { kind: 'bond', id: 9, text: on },
    ]);
    expect(g.map((x) => [x.text, x.items.map((i) => i.id)])).toEqual([[on[0], [1, 3, 9]], ['Too many bonds.', [2]]]);
  });
});
