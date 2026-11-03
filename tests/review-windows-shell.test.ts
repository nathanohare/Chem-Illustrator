// @vitest-environment jsdom
// Review 2026-11-03 (windows and AI Assistant): findings proved here, kept once fixed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiAsk, setAiKey, type AiPrefs } from '../src/ai/link';

describe('an AI key in a browser goes only to the address it was typed for', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => vi.unstubAllGlobals());

  it('is not sent to another address after Other\'s address is changed', async () => {
    const a: AiPrefs = { provider: 'compatible', model: 'm', base: 'https://openrouter.ai/api/v1', localOnly: false, assistant: false };
    await setAiKey(a, 'sk-or-secret');
    const seen: { url: string; auth: string | undefined }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, auth: (init.headers as Record<string, string>).Authorization });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
    }));
    // the person points Other at another service (or a model on this computer) without a new key
    await aiAsk({ ...a, base: 'https://example.net/v1' }, { text: 'hi' });
    expect(seen[0].url).toBe('https://example.net/v1/chat/completions');
    expect(seen[0].auth).toBeUndefined();
    // the address it was typed for still gets it
    await aiAsk(a, { text: 'hi' });
    expect(seen[1].auth).toBe('Bearer sk-or-secret');
  });
});

// ---------------------------------------------------------------- 3-D Model window: xTB Refine
vi.mock('../src/ui/ask', () => ({ ask: vi.fn(async (_t: string, fields: { name: string; value?: string }[]) => Object.fromEntries(fields.map((f) => [f.name, f.value ?? '']))) }));
import { Viewer3d, type ConformerTools } from '../src/ui/viewer3d';
import type { Model3d } from '../src/chem/model3d-build';

const tiny = (z: number): Model3d => ({ atoms: [{ z, charge: 0 }, { z: 1, charge: 0 }], bonds: [{ a: 0, b: 1, order: 1, aromatic: false }], conformers: [{ xyz: [0, 0, 0, 1, 0, 0], energy: 0 }] });

describe('the 3-D Model window, xTB Refine', () => {
  it('a refinement still running when another structure is shown does not land on the new one', async () => {
    let finish!: (r: { xyz: string; energy: number }) => void;
    const tools: ConformerTools = {
      search: vi.fn(), stop: vi.fn(), saveFiles: vi.fn(),
      xtb: () => new Promise((ok) => { finish = ok; }),
      prefs: { xtb: { exe: 'xtb', solvent: '', opt: false, count: 1 }, qm: {}, save: () => {} },
    };
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    if (!HTMLDialogElement.prototype.show) HTMLDialogElement.prototype.show = function () { this.open = true; };
    const v = new Viewer3d(() => {});
    v.tools = tools;
    v.show(tiny(8), 'Water-ish', () => {});
    ((v as any).box.el.querySelector('[data-tier="xtb"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    // the person opens 3-D Model on another structure while xtb works on the first
    v.show(tiny(9), 'HF', () => {});
    finish({ xyz: '', energy: -5 });
    await new Promise((r) => setTimeout(r, 0));
    const shown = (v as unknown as { model: Model3d }).model;
    expect(shown.atoms[0].z).toBe(9);
    expect(shown.method ?? 'MMFF94s+').toBe('MMFF94s+');
    // and the new structure's method switch works
    expect(((v as any).box.el.querySelector('[data-tier="search"]') as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------- 3-D model worker: Stop while it starts
import { Model3dBuilder } from '../src/chem/model3d';

describe('the 3-D model worker', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('a search waiting for the worker to start ends when Stop is pressed', async () => {
    const made: { terminate: () => void }[] = [];
    vi.stubGlobal('Worker', class { onmessage = null; onerror = null; postMessage() {} terminate() {} constructor() { made.push(this); } });
    const b = new Model3dBuilder('ocl-resources.json');
    const search = b.search('molblock', { starts: 10, window: 10, rmsd: 0.5 });
    await Promise.resolve();
    b.stop();
    const out = await Promise.race([search.then(() => 'found', () => 'stopped'), new Promise((r) => setTimeout(() => r('still waiting'), 200))]);
    expect(out).toBe('stopped');
    // and the next request starts a fresh worker that is not torn down by the old start's failure
    void b.build('molblock').catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(made.length).toBe(2);
    expect((b as unknown as { worker: unknown }).worker).toBe(made[1]);
  });
});

// ---------------------------------------------------------------- the Assistant: Accept after changing tabs
import { AssistantBar, type AssistantHost } from '../src/ui/assistant-bar';
import type { AssistantAction } from '../src/ai/assistant';

describe('the Assistant bar, with another tab chosen', () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); localStorage.clear(); });

  it('does not carry out a proposal in a tab other than the one it was asked in', async () => {
    const answer = 'Benzene.\n\n```json\n{"actions":[{"type":"structure","smiles":"c1ccccc1","replace":false}]}\n```';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: answer } }] }), { status: 200 })));
    let prefs: AiPrefs = { provider: 'compatible', model: 'm', base: 'http://localhost:11434/v1', localOnly: true, assistant: true };
    const tabs = [{}, {}];
    let tab = tabs[0];
    const applied: AssistantAction[] = [];
    const host: AssistantHost = {
      prefs: () => prefs, savePrefs: (p) => { prefs = p; }, mode: () => 'drawing', items: async () => [],
      apply: async (a) => { applied.push(a); return 'Drew the structure.'; }, markStep: () => true, undo: vi.fn(),
      openSettings: async () => {}, area: () => new DOMRect(0, 0, 1000, 700), tab: () => tab,
    };
    const bar = new AssistantBar(host);
    await bar.show();
    bar.el.querySelector('textarea')!.value = 'draw benzene';
    [...bar.el.querySelectorAll('button')].find((b) => b.textContent === 'Send')!.click();
    await vi.waitFor(() => expect(bar.el.querySelector('.ai-prop')).not.toBeNull());
    // the bar stays open while the person picks another tab, then clicks Accept
    tab = tabs[1];
    [...bar.el.querySelectorAll('button')].find((b) => b.textContent === 'Accept')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(applied).toEqual([]);
    expect(bar.el.textContent).toContain('another tab');
    // back in the tab it was asked in, it goes ahead
    tab = tabs[0];
    [...bar.el.querySelectorAll('button')].find((b) => b.textContent === 'Accept')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(applied).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- the Knowledge Base: typing stays quick
import { KnowledgeBaseWindow } from '../src/ui/knowledge-base';

describe('the Knowledge Base window', () => {
  afterEach(() => { document.body.replaceChildren(); });
  it('builds only the first rows of a big table, and more as it is scrolled', async () => {
    if (!HTMLDialogElement.prototype.show) HTMLDialogElement.prototype.show = function () { this.open = true; };
    if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
    const kb = new KnowledgeBaseWindow({
      flash: () => {}, canonical: async () => null, readImported: async () => null, writeImported: async () => {},
      pickTable: async () => null, copyText: async () => {}, openUrl: () => {},
    });
    await kb.open();
    const rows = () => document.querySelectorAll('.kb-window .kb-table tbody tr').length;
    const count = document.querySelector('.kb-window .refs-edit .muted')!.textContent!;
    // Reagent Safety: thousands of compounds, of which only the first rows are built
    expect(parseInt(count.replace(/\D/g, ''), 10)).toBeGreaterThan(5000);
    expect(rows()).toBeLessThanOrEqual(60);
    // scrolled near its end, the table grows (each row can be reached, not only the first 2,000)
    const wrap = document.querySelector<HTMLElement>('.kb-window .kb-table-wrap')!;
    Object.defineProperty(wrap, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(wrap, 'clientHeight', { value: 500, configurable: true });
    wrap.scrollTop = 400;
    wrap.dispatchEvent(new Event('scroll'));
    expect(rows()).toBe(360);
    // a search typed rebuilds only its first rows too
    const box = document.querySelector<HTMLInputElement>('.kb-window input[type=search]')!;
    box.value = 'ac';
    box.dispatchEvent(new Event('input'));
    expect(rows()).toBeLessThanOrEqual(60);
  });
});
