// Edit > Settings > AI Model: an AI model of the person's own (Claude, ChatGPT, Gemini, or any
// service that speaks OpenAI's API, such as OpenRouter, Ollama or LM Studio), linked with their own
// API key. Off until they link one: nothing is sent anywhere before that, and then only what a
// command they chose sends (such as the picture of a structure to read). Later AI features ask
// through aiAsk() here and never need to know which service is linked.
//
// The key is not kept with the other settings (so Export Settings never carries it): in the
// desktop app the app keeps it in its own file and adds it to each request itself, sending it
// only to the service it is for; in a browser it stays in this tab, or in this browser's storage
// if the person asks for it to be remembered.

import { invoke, isTauri } from '@tauri-apps/api/core';

export type AiProvider = 'none' | 'anthropic' | 'openai' | 'gemini' | 'compatible';

/** The linked service and model (kept in settings; the key is kept apart). */
export interface AiPrefs {
  provider: AiProvider;
  /** The model's name as the service knows it; empty for the service's suggested one. */
  model: string;
  /** For an OpenAI-compatible service: its address, such as http://localhost:11434/v1. */
  base: string;
}

export const DEFAULT_AI: AiPrefs = { provider: 'none', model: '', base: '' };

export function parseAiPrefs(v: unknown): AiPrefs {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const provider = (['none', 'anthropic', 'openai', 'gemini', 'compatible'] as const).find((p) => p === r.provider) ?? 'none';
  return { provider, model: typeof r.model === 'string' ? r.model.trim() : '', base: typeof r.base === 'string' ? r.base.trim() : '' };
}

interface ProviderInfo {
  name: string;
  /** The suggested model, and others offered in the list. */
  model: string;
  models: string[];
  base: string;
  keyHelp: string;
}

export const PROVIDERS: Record<Exclude<AiProvider, 'none'>, ProviderInfo> = {
  anthropic: {
    name: 'Claude (Anthropic)', model: 'claude-sonnet-5-5', models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
    base: 'https://api.anthropic.com', keyHelp: 'Make a key at console.anthropic.com > API Keys.',
  },
  openai: {
    name: 'ChatGPT (OpenAI)', model: 'gpt-5', models: ['gpt-5', 'gpt-5-mini'],
    base: 'https://api.openai.com/v1', keyHelp: 'Make a key at platform.openai.com > API keys.',
  },
  gemini: {
    name: 'Gemini (Google)', model: 'gemini-2.5-pro', models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    base: 'https://generativelanguage.googleapis.com/v1beta', keyHelp: 'Make a key at aistudio.google.com > Get API key.',
  },
  compatible: {
    name: 'Other (OpenAI-compatible)', model: '', models: [],
    base: '', keyHelp: 'OpenRouter, Groq, Together, Mistral, or a model on this computer (Ollama, LM Studio). A model on this computer needs no key.',
  },
};

/** One picture sent with a question, as base64 (no data: prefix). */
export interface AiImage { mime: string; data: string }

export interface AiQuestion {
  system?: string;
  text: string;
  images?: AiImage[];
  maxTokens?: number;
}

/** The address requests go to (no trailing slash). */
export function aiBase(p: AiPrefs): string {
  if (p.provider === 'none') return '';
  return (p.provider === 'compatible' ? p.base : PROVIDERS[p.provider].base).replace(/\/+$/, '');
}

export function aiModel(p: AiPrefs): string {
  return p.provider === 'none' ? '' : p.model || PROVIDERS[p.provider].model;
}

/** "Claude (Anthropic), claude-sonnet-5-5", for messages. */
export function aiName(p: AiPrefs): string {
  if (p.provider === 'none') return 'No AI model';
  const name = p.provider === 'compatible' ? (safeHost(p.base) || 'Other') : PROVIDERS[p.provider].name;
  return `${name}, ${aiModel(p)}`;
}

function safeHost(url: string): string {
  try { return new URL(url).host; } catch { return ''; }
}

/** A request to the service, before the key is added: the path after the base, and the body. */
export interface AiRequest { method: 'GET' | 'POST'; path: string; body?: unknown }

/** The request that asks the question, for this service. */
export function questionRequest(p: AiPrefs, q: AiQuestion): AiRequest {
  const model = aiModel(p);
  const max = q.maxTokens ?? 4096;
  const images = q.images ?? [];
  if (p.provider === 'anthropic') {
    return {
      method: 'POST', path: '/v1/messages', body: {
        model, max_tokens: max, ...(q.system ? { system: q.system } : {}),
        messages: [{ role: 'user', content: [
          ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.data } })),
          { type: 'text', text: q.text },
        ] }],
      },
    };
  }
  if (p.provider === 'gemini') {
    return {
      method: 'POST', path: `/models/${encodeURIComponent(model)}:generateContent`, body: {
        ...(q.system ? { systemInstruction: { parts: [{ text: q.system }] } } : {}),
        contents: [{ role: 'user', parts: [...images.map((im) => ({ inline_data: { mime_type: im.mime, data: im.data } })), { text: q.text }] }],
        generationConfig: { maxOutputTokens: max },
      },
    };
  }
  // OpenAI and every service that copies its API
  return {
    method: 'POST', path: '/chat/completions', body: {
      model, ...(p.provider === 'openai' ? { max_completion_tokens: max } : { max_tokens: max }),
      messages: [
        ...(q.system ? [{ role: 'system', content: q.system }] : []),
        { role: 'user', content: [
          { type: 'text', text: q.text },
          ...images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.data}` } })),
        ] },
      ],
    },
  };
}

/** The answer's text, from the service's reply. */
export function answerText(p: AiPrefs, reply: unknown): string {
  const r = reply as any;
  let text: unknown;
  if (p.provider === 'anthropic') text = Array.isArray(r?.content) ? r.content.filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('') : undefined;
  else if (p.provider === 'gemini') text = r?.candidates?.[0]?.content?.parts?.map((x: any) => x?.text ?? '').join('');
  else text = r?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error(errorText(reply) ?? 'The AI model sent back an answer the app could not read.');
  return text;
}

/** The service's own words about what went wrong, if it said. */
function errorText(reply: unknown): string | null {
  const e = (reply as any)?.error;
  if (typeof e === 'string') return e;
  if (e && typeof e.message === 'string') return e.message;
  return null;
}

/** The request listing the models this key can use. */
export function modelsRequest(p: AiPrefs): AiRequest {
  return { method: 'GET', path: p.provider === 'anthropic' ? '/v1/models?limit=100' : '/models' };
}

export function modelNames(p: AiPrefs, reply: unknown): string[] {
  const r = reply as any;
  const list: any[] = p.provider === 'gemini' ? r?.models ?? [] : r?.data ?? [];
  const names = list.map((m) => (p.provider === 'gemini' ? String(m?.name ?? '').replace(/^models\//, '') : String(m?.id ?? ''))).filter(Boolean);
  return [...new Set(names)];
}

/** The headers that carry the key, for a browser (the desktop app adds them itself). */
export function keyHeaders(p: AiPrefs, key: string): Record<string, string> {
  if (p.provider === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
  if (p.provider === 'gemini') return { 'x-goog-api-key': key };
  return key ? { Authorization: `Bearer ${key}` } : {};
}

// --- keys and sending -------------------------------------------------------------------------

const WEB_KEYS = 'chem-illustrator.ai-keys';

// In a browser a key lasts only while the tab is open (sessionStorage) unless the person ticks
// "Remember the key in this browser" (localStorage). Every site under the same github.io
// address shares that browser storage, so remembering is the person's choice, not the default.
function store(remember: boolean): Storage | null {
  try { return remember ? localStorage : sessionStorage; } catch { return null; }
}

function readKeys(remember: boolean): Record<string, string> {
  try { return JSON.parse(store(remember)?.getItem(WEB_KEYS) ?? '{}') ?? {}; } catch { return {}; }
}

function writeKeys(remember: boolean, k: Record<string, string>): void {
  try {
    const st = store(remember);
    if (!st) return;
    if (Object.keys(k).length) st.setItem(WEB_KEYS, JSON.stringify(k)); else st.removeItem(WEB_KEYS);
  } catch { /* storage refused: the key isn't kept */ }
}

function webKeys(): Record<string, string> {
  return { ...readKeys(true), ...readKeys(false) };
}

/** Keep the key for this service (empty forgets it). In a browser, `remember` keeps it after the tab closes. */
export async function setAiKey(p: AiPrefs, key: string, remember = false): Promise<void> {
  if (p.provider === 'none') return;
  if (isTauri()) { await invoke('ai_key_set', { provider: p.provider, key, base: aiBase(p) }); return; }
  for (const where of [true, false]) {
    const k = readKeys(where);
    if (key && where === remember) k[p.provider] = key; else delete k[p.provider];
    writeKeys(where, k);
  }
}

/** In a browser: whether this service's key is remembered after the tab closes. */
export function aiKeyRemembered(p: AiPrefs): boolean {
  return !isTauri() && p.provider !== 'none' && !!readKeys(true)[p.provider];
}

/** In a browser: move the kept key to where `remember` says, without typing it again. */
export async function rememberAiKey(p: AiPrefs, remember: boolean): Promise<void> {
  if (isTauri() || p.provider === 'none') return;
  const key = webKeys()[p.provider];
  if (key) await setAiKey(p, key, remember);
}

/** Whether a key is kept for this service. */
export async function hasAiKey(p: AiPrefs): Promise<boolean> {
  if (p.provider === 'none') return false;
  if (isTauri()) return invoke<boolean>('ai_key_has', { provider: p.provider });
  return !!webKeys()[p.provider];
}

/** Whether a model is linked and ready to ask (a service on this computer needs no key). */
export async function aiReady(p: AiPrefs): Promise<boolean> {
  if (p.provider === 'none') return false;
  if (p.provider === 'compatible') return !!aiBase(p) && !!aiModel(p);
  return hasAiKey(p);
}

async function send(p: AiPrefs, req: AiRequest): Promise<unknown> {
  const base = aiBase(p);
  if (!base) throw new Error('Link an AI model first (Edit > Settings > AI Model).');
  let status = 0;
  let text: string;
  if (isTauri()) {
    const r = await invoke<{ status: number; body: string }>('ai_request', {
      provider: p.provider, base, method: req.method, path: req.path, body: req.body === undefined ? null : JSON.stringify(req.body),
    });
    status = r.status; text = r.body;
  } else {
    const res = await fetch(base + req.path, {
      method: req.method,
      headers: { ...keyHeaders(p, webKeys()[p.provider] ?? ''), ...(req.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
    });
    status = res.status; text = await res.text();
  }
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not JSON: say what came back */ }
  if (status < 200 || status >= 300) {
    const said = errorText(json);
    const why = status === 401 || status === 403 ? 'The key was refused. Check it in Edit > Settings > AI Model.'
      : status === 429 ? 'The AI service says too many requests, or the account has run out of credit. Try again later.'
      : `The AI service answered with an error (${status}).`;
    throw new Error(said ? `${why} It said: ${said}` : why);
  }
  if (json === null) throw new Error('The AI service sent back something that was not an answer.');
  return json;
}

/** Ask the linked model a question (with pictures, if any). */
export async function aiAsk(p: AiPrefs, q: AiQuestion): Promise<string> {
  return answerText(p, await send(p, questionRequest(p, q)));
}

/** The models this key can use, for the list in Settings (empty when the service doesn't say). */
export async function aiModels(p: AiPrefs): Promise<string[]> {
  return modelNames(p, await send(p, modelsRequest(p)));
}
