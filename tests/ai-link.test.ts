import { describe, expect, it } from 'vitest';
import { aiBase, aiModel, answerText, keyHeaders, modelNames, parseAiPrefs, questionRequest, type AiPrefs } from '../src/ai/link';
import { parseSettings } from '../src/settings';

const img = { mime: 'image/png', data: 'iVBORw0KGgo=' };
const q = { system: 'Read structures.', text: 'What is this?', images: [img], maxTokens: 100 };

describe('AI model link', () => {
  it('is off unless linked, and keeps no key in settings', () => {
    expect(parseSettings(null).ai.provider).toBe('none');
    const s = parseSettings(JSON.stringify({ ai: { provider: 'openai', model: 'gpt-5', key: 'sk-secret' } }));
    expect(s.ai).toEqual({ provider: 'openai', model: 'gpt-5', base: '' });
    expect(parseAiPrefs({ provider: 'nonsense' }).provider).toBe('none');
  });

  it('asks Claude with its Messages API', () => {
    const p: AiPrefs = { provider: 'anthropic', model: '', base: '' };
    const r = questionRequest(p, q) as any;
    expect(aiBase(p) + r.path).toBe('https://api.anthropic.com/v1/messages');
    expect(r.body.model).toBe(aiModel(p));
    expect(r.body.system).toBe('Read structures.');
    expect(r.body.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: img.data } });
    expect(answerText(p, { content: [{ type: 'text', text: 'CCO' }] })).toBe('CCO');
    expect(keyHeaders(p, 'k')['x-api-key']).toBe('k');
  });

  it('asks OpenAI and compatible services with chat completions', () => {
    const p: AiPrefs = { provider: 'compatible', model: 'llava', base: 'http://localhost:11434/v1/' };
    const r = questionRequest(p, q) as any;
    expect(aiBase(p) + r.path).toBe('http://localhost:11434/v1/chat/completions');
    expect(r.body.messages[0]).toEqual({ role: 'system', content: 'Read structures.' });
    expect(r.body.messages[1].content[1].image_url.url).toBe('data:image/png;base64,' + img.data);
    expect(r.body.max_tokens).toBe(100);
    expect((questionRequest({ ...p, provider: 'openai' }, q) as any).body.max_completion_tokens).toBe(100);
    expect(answerText(p, { choices: [{ message: { content: 'CCO' } }] })).toBe('CCO');
    expect(keyHeaders(p, '')).toEqual({});
    expect(modelNames(p, { data: [{ id: 'llava' }, { id: 'qwen' }] })).toEqual(['llava', 'qwen']);
  });

  it('asks Gemini with generateContent', () => {
    const p: AiPrefs = { provider: 'gemini', model: 'gemini-2.5-flash', base: '' };
    const r = questionRequest(p, q) as any;
    expect(r.path).toBe('/models/gemini-2.5-flash:generateContent');
    expect(r.body.contents[0].parts[0]).toEqual({ inline_data: { mime_type: 'image/png', data: img.data } });
    expect(answerText(p, { candidates: [{ content: { parts: [{ text: 'C' }, { text: 'CO' }] } }] })).toBe('CCO');
    expect(modelNames(p, { models: [{ name: 'models/gemini-2.5-pro' }] })).toEqual(['gemini-2.5-pro']);
  });

  it('passes on what the service said went wrong', () => {
    expect(() => answerText({ provider: 'openai', model: '', base: '' }, { error: { message: 'bad model' } })).toThrow('bad model');
  });
});
