// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { aiKeyRemembered, hasAiKey, rememberAiKey, setAiKey, type AiPrefs } from '../src/ai/link';

const p: AiPrefs = { provider: 'anthropic', model: '', base: '' };

describe('AI key in a browser', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('lasts only for the tab unless remembered', async () => {
    await setAiKey(p, 'sk-tab');
    expect(await hasAiKey(p)).toBe(true);
    expect(localStorage.length).toBe(0);
    expect(aiKeyRemembered(p)).toBe(false);
  });

  it('moves between the tab and the browser without typing it again', async () => {
    await setAiKey(p, 'sk-kept', true);
    expect(aiKeyRemembered(p)).toBe(true);
    expect(sessionStorage.length).toBe(0);
    await rememberAiKey(p, false);
    expect(aiKeyRemembered(p)).toBe(false);
    expect(localStorage.length).toBe(0);
    expect(await hasAiKey(p)).toBe(true);
    await setAiKey(p, '');
    expect(await hasAiKey(p)).toBe(false);
  });
});
