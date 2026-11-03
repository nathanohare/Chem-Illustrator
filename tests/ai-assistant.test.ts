// @vitest-environment jsdom
// The Assistant (review item 35): what a request carries, what the model may propose, Local only
// and the request log.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildQuestion, parseAnswer, sendSummary, logRequest, requestLog, requestLogPlace, clearRequestLog, type SendItem } from '../src/ai/assistant';
import { aiAsk, isLocalAddress, localOnlyBlock, parseAiPrefs, type AiPrefs } from '../src/ai/link';

const items: SendItem[] = [
  { id: 'selection', label: 'the selected structure as SMILES', text: 'CC(=O)O', on: true },
  { id: 'scheme', label: "the scheme's reaction SMILES", text: 'CC(=O)O>>CC(=O)OC', on: false },
];

describe('what a request carries', () => {
  it('sends only the items switched on, then the question', () => {
    const q = buildQuestion(items, '  Make the methyl ester ', 'drawing');
    expect(q.text).toContain('the selected structure as SMILES\nCC(=O)O');
    expect(q.text).not.toContain('>>');
    expect(q.text.endsWith('QUESTION\nMake the methyl ester')).toBe(true);
    expect(q.system).toMatch(/Canvas/);
    expect(q.images).toBeUndefined();
    expect(sendSummary(items)).toBe('the selected structure as SMILES, your question');
  });

  it('says when nothing but the question goes', () => {
    expect(buildQuestion(items.map((i) => ({ ...i, on: false })), 'hello', 'document').text).toBe('CONTEXT: none\n\nQUESTION\nhello');
  });
});

describe('what the model may propose', () => {
  it('reads the actions block and keeps the words apart', () => {
    const a = parseAnswer('Here is the ester.\n\n```json\n{"actions":[{"type":"structure","smiles":"CC(=O)OC","name":"methyl acetate","replace":true},{"type":"check","findings":[{"level":"warn","text":"Step 2 loses the stereocentre.","step":2},{"level":"bad","text":"x"}]},{"type":"text","text":"To a solution of…"}]}\n```');
    expect(a.prose).toBe('Here is the ester.');
    expect(a.actions).toEqual([
      { type: 'structure', smiles: 'CC(=O)OC', name: 'methyl acetate', replace: true },
      { type: 'check', findings: [{ level: 'warn', text: 'Step 2 loses the stereocentre.', step: 2 }, { level: 'note', text: 'x' }] },
      { type: 'text', text: 'To a solution of…', replace: false },
    ]);
  });

  it('leaves out anything malformed, and keeps an answer with no block as words', () => {
    expect(parseAnswer('Just words.')).toEqual({ prose: 'Just words.', actions: [] });
    expect(parseAnswer('x\n```json\n{not json}\n```').actions).toEqual([]);
    const bad = parseAnswer('```json\n[{"type":"structure","smiles":"C C; rm -rf"},{"type":"run","cmd":"x"},{"type":"text","text":""}]\n```');
    expect(bad.actions).toEqual([]);
  });
});

describe('Local only', () => {
  it('knows this computer\'s addresses', () => {
    for (const u of ['http://localhost:11434/v1', 'http://127.0.0.1:1234/v1', 'http://[::1]:8080']) expect(isLocalAddress(u)).toBe(true);
    for (const u of ['https://api.openai.com/v1', 'http://localhost.example.com/v1', 'http://127.0.0.1.example.com', 'not a url']) expect(isLocalAddress(u)).toBe(false);
  });

  it('blocks every other address before anything is sent', async () => {
    const far: AiPrefs = { provider: 'anthropic', model: '', base: '', localOnly: true, assistant: true };
    expect(localOnlyBlock(far)).toMatch(/Local only is on/);
    expect(localOnlyBlock({ ...far, localOnly: false })).toBeNull();
    expect(localOnlyBlock({ provider: 'compatible', model: 'qwen3', base: 'http://localhost:11434/v1', localOnly: true, assistant: true })).toBeNull();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(aiAsk(far, { text: 'hi' })).rejects.toThrow(/Local only is on/);
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('is off, and the Assistant too, until the person turns them on', () => {
    expect(parseAiPrefs({ provider: 'openai' })).toMatchObject({ localOnly: false, assistant: false });
    expect(parseAiPrefs({ provider: 'openai', localOnly: true, assistant: true })).toMatchObject({ localOnly: true, assistant: true });
  });
});

describe('the request log', () => {
  beforeEach(() => clearRequestLog());

  it('keeps each request, newest first, and clears', () => {
    logRequest({ time: 1, service: 'Ollama', local: true, sent: 'your question', text: 'a', images: 0 });
    logRequest({ time: 2, service: 'Ollama', local: true, sent: 'your question', text: 'b'.repeat(9000), images: 0 });
    const log = requestLog();
    expect(log.map((e) => e.time)).toEqual([2, 1]);
    expect(log[0].text).toHaveLength(8000);
    clearRequestLog();
    expect(requestLog()).toEqual([]);
  });

  it('in a browser, lasts only as long as the tab (other pages on the site can read localStorage)', () => {
    localStorage.setItem('ci.ai-log', JSON.stringify([{ time: 0, service: 'old', local: false, sent: '', text: 'old', images: 0 }]));
    logRequest({ time: 3, service: 'OpenAI', local: false, sent: 'the selected structure as SMILES', text: 'CCO', images: 0 });
    expect(localStorage.getItem('ci.ai-log')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('ci.ai-log') ?? '[]')[0].text).toBe('CCO');
    expect(requestLogPlace()).toBe('in this browser tab until it is closed');
  });
});
