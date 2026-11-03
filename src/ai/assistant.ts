// The Assistant (review item 35): the person's own AI model, asked about what is on the page.
// Off until they turn it on. Before anything goes, the "Will send" list names each thing a
// request would carry (the selected structure as SMILES, the scheme, the selected text, the
// question), and any of them can be left out; nothing else (files, other tabs, file names, the
// key) is ever sent. Each request is kept in a log that can be cleared: on this computer in the
// desktop app, and only until the tab closes in a browser (see requestLogPlace). Under
// Local only (link.ts) nothing goes to any address but this computer's own.
//
// What the model may do is propose, never change: a structure (drawn new, or in place of the
// selection), findings on a scheme, or text (written new, or in place of the selection). Each
// proposal is checked here (structures again with RDKit by the app) and the person accepts or
// rejects it; an accepted one is one undoable step.

import { isTauri } from '@tauri-apps/api/core';
import type { AiQuestion, AiImage } from './link';

/** One thing a request would carry, shown in the "Will send" list (the person can switch it off). */
export interface SendItem {
  id: 'selection' | 'scheme' | 'drawing' | 'text' | 'document' | 'sheet' | 'picture';
  /** What the list shows: "the selected structure as SMILES". */
  label: string;
  /** What goes, as text. */
  text: string;
  on: boolean;
  image?: AiImage;
}

/** The most text one item carries: selected text, or a whole document (about 15,000 words). */
export const TEXT_CAP = { selection: 20_000, document: 100_000 } as const;

/** Text to send, cut at `max` characters, and how the "Will send" list names it then. */
export function cappedText(label: string, text: string, max: number): { label: string; text: string } {
  if (text.length <= max) return { label, text };
  return { label: `${label} (the first ${max.toLocaleString('en-US')} characters)`, text: text.slice(0, max) };
}

export type Finding = { level: 'ok' | 'note' | 'warn'; text: string; step?: number };

export type AssistantAction =
  /** A structure: drawn as a new one, or in place of the selected one. */
  | { type: 'structure'; smiles: string; name?: string; replace: boolean }
  /** Findings from checking a scheme or a structure. */
  | { type: 'check'; findings: Finding[] }
  /** Text: in place of the selected text, or added after it. */
  | { type: 'text'; text: string; replace: boolean };

export type AssistantMode = 'drawing' | 'slides' | 'design' | 'sheet' | 'document';

/** What the model is told about itself and how to answer. */
export function systemPrompt(mode: AssistantMode): string {
  return [
    'You are the assistant inside Chem Illustrator, a chemical drawing program used by synthetic organic chemists.',
    `The person is working in ${mode === 'drawing' ? 'a Canvas (a chemical drawing)' : mode === 'document' ? 'a Document (like Word)' : mode === 'slides' ? 'a Presentation' : mode === 'sheet' ? 'a Spreadsheet' : 'a Design page'}.`,
    'You see only what is listed under CONTEXT; you cannot see anything else on their computer.',
    'Answer briefly and precisely, as an experienced chemist would. Use IUPAC names and conventions; say so when you are unsure.',
    'You cannot change the document yourself. To propose a change, end your answer with one fenced block of JSON, ```json … ```, holding {"actions": [ … ]}, where each action is one of:',
    '  {"type": "structure", "smiles": "<valid SMILES with stereo>", "name": "<name>", "replace": true|false}  (replace: in place of the selected structure; false: drawn as a new one)',
    '  {"type": "check", "findings": [{"level": "ok"|"note"|"warn", "text": "<one sentence>", "step": <step number, if about one>}]}  (for checking a scheme or a structure)',
    '  {"type": "text", "text": "<the text>", "replace": true|false}  (replace: in place of the selected text; false: added after it)',
    'Propose an action only when the person asks for a change, a drawing, a check or writing. Give SMILES that RDKit can read, with the stereochemistry the person drew kept.',
    'For an experimental write-up, follow common journal style (ACS): reagent amounts in mmol and equivalents, yields, and characterization placeholders such as [1H NMR] where data is not given. Never invent data.',
  ].join('\n');
}

/** The question as sent: the switched-on context items, then the person's words. */
export function buildQuestion(items: readonly SendItem[], question: string, mode: AssistantMode): AiQuestion {
  const on = items.filter((i) => i.on);
  const context = on.filter((i) => i.text).map((i) => `## ${i.label}\n${i.text}`).join('\n\n');
  const images = on.filter((i) => i.image).map((i) => i.image!);
  return {
    system: systemPrompt(mode),
    text: `${context ? `CONTEXT\n\n${context}\n\n` : 'CONTEXT: none\n\n'}QUESTION\n${question.trim()}`,
    ...(images.length ? { images } : {}),
    maxTokens: 4096,
  };
}

/** "the selected structure as SMILES, your question", for the log and the list. */
export function sendSummary(items: readonly SendItem[]): string {
  return [...items.filter((i) => i.on).map((i) => i.label), 'your question'].join(', ');
}

const SMILES_CHARS = /^[A-Za-z0-9@+\-[\]()=#$%/\\.:*~]+$/;

/** The answer's words, and the actions it proposes (anything that isn't a well-formed action is left out). */
export function parseAnswer(text: string): { prose: string; actions: AssistantAction[] } {
  const fence = /```(?:json)?\s*\n([\s\S]*?)```\s*$/i.exec(text.trimEnd()) ?? /```json\s*\n([\s\S]*?)```/i.exec(text);
  if (!fence) return { prose: text.trim(), actions: [] };
  const prose = (text.slice(0, fence.index) + text.slice(fence.index + fence[0].length)).trim();
  let raw: unknown;
  try { raw = JSON.parse(fence[1]); } catch { return { prose: text.trim(), actions: [] }; }
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { actions?: unknown })?.actions) ? (raw as { actions: unknown[] }).actions : [];
  const actions: AssistantAction[] = [];
  for (const a of list.slice(0, 10)) {
    const r = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
    if (r.type === 'structure' && typeof r.smiles === 'string') {
      const smiles = r.smiles.trim();
      if (!smiles || smiles.length > 2000 || !SMILES_CHARS.test(smiles)) continue;
      actions.push({ type: 'structure', smiles, ...(typeof r.name === 'string' && r.name.trim() ? { name: r.name.trim().slice(0, 300) } : {}), replace: r.replace === true });
    } else if (r.type === 'check' && Array.isArray(r.findings)) {
      const findings: Finding[] = [];
      for (const f of r.findings.slice(0, 30)) {
        const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
        if (typeof o.text !== 'string' || !o.text.trim()) continue;
        const level = o.level === 'ok' || o.level === 'warn' ? o.level : 'note';
        const step = typeof o.step === 'number' && Number.isInteger(o.step) && o.step > 0 ? o.step : undefined;
        findings.push({ level, text: o.text.trim().slice(0, 600), ...(step ? { step } : {}) });
      }
      if (findings.length) actions.push({ type: 'check', findings });
    } else if (r.type === 'text' && typeof r.text === 'string' && r.text.trim()) {
      actions.push({ type: 'text', text: r.text.trim().slice(0, 20000), replace: r.replace === true });
    }
  }
  return { prose, actions };
}

// --- the request log ---------------------------------------------------------------------------

/** One request, as kept in the log on this computer. */
export interface LogEntry {
  /** When it went (ms since 1970). */
  time: number;
  /** The service and model, and whether it is on this computer. */
  service: string;
  local: boolean;
  /** What went, as the "Will send" list named it. */
  sent: string;
  /** The question, and everything sent with it as text (cut at 8000 characters). */
  text: string;
  /** How many pictures went. */
  images: number;
}

const LOG_KEY = 'ci.ai-log';
const LOG_MAX = 200;

/**
 * Where the log is kept. The desktop app keeps it on this computer. In a browser it lasts only
 * until the tab closes: localStorage there is shared by every page on the same site (other
 * projects under nathanohare.github.io could read the questions and structures sent).
 */
const inBrowser = () => !isTauri();
export const requestLogPlace = (): string => (inBrowser() ? 'in this browser tab until it is closed' : 'on this computer');

function storage(): Storage | null {
  try {
    if (!inBrowser()) return localStorage;
    // a log kept by an earlier version where other pages could read it is not kept
    try { localStorage.removeItem(LOG_KEY); } catch { /* none */ }
    return sessionStorage;
  } catch {
    return null;
  }
}

export function requestLog(): LogEntry[] {
  try {
    const v = JSON.parse(storage()?.getItem(LOG_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((e) => e && typeof e.time === 'number' && typeof e.text === 'string') : [];
  } catch {
    return [];
  }
}

/** Keep a request in the log (newest first, the oldest dropped past 200). */
export function logRequest(e: LogEntry): void {
  const st = storage();
  if (!st) return;
  const list = [{ ...e, text: e.text.slice(0, 8000) }, ...requestLog()].slice(0, LOG_MAX);
  try { st.setItem(LOG_KEY, JSON.stringify(list)); } catch { /* full: not kept */ }
}

export function clearRequestLog(): void {
  try { storage()?.removeItem(LOG_KEY); } catch { /* nothing kept */ }
}
