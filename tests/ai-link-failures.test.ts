// @vitest-environment jsdom
//
// The AI model link in a browser, when the service is stuck: a request is given up on after
// 180 s, as in the desktop app, with a message that says so.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiAsk, type AiPrefs } from '../src/ai/link';

const local: AiPrefs = { provider: 'compatible', model: 'llava', base: 'http://127.0.0.1:11434/v1' };

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('AI model in a browser, when the service is not there or stuck', () => {
  it('a service that takes the request and never answers gives up after 3 minutes', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise((_ok, fail) => signal?.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError'))));
    }));
    let err: string | null = null;
    const asked = aiAsk(local, { text: 'hi' }).then(() => { err = 'answered'; }, (e: Error) => { err = e.message; });
    await vi.advanceTimersByTimeAsync(179_000);
    expect(err, 'gave up too soon').toBeNull();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(signal, 'the request has no way to be stopped (no AbortSignal)').toBeDefined();
    expect(err).toBe('The AI service did not answer in 3 minutes.');
    await asked;
  });
});
