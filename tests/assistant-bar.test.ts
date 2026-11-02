// @vitest-environment jsdom
// The Assistant's prompt bar (review item 35): nothing is sent before the person turns it on,
// a question carries only what "Will send" lists, and a proposal changes nothing until Accept.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AssistantBar, type AssistantHost } from '../src/ui/assistant-bar';
import { clearRequestLog, requestLog, type AssistantAction, type SendItem } from '../src/ai/assistant';
import type { AiPrefs } from '../src/ai/link';

const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(start: Partial<AiPrefs> = {}) {
  let prefs: AiPrefs = { provider: 'compatible', model: 'qwen3', base: 'http://localhost:11434/v1', localOnly: true, assistant: false, ...start };
  const applied: AssistantAction[] = [];
  const items: SendItem[] = [
    { id: 'selection', label: 'the selected structure as SMILES', text: 'CC(=O)O', on: true },
    { id: 'drawing', label: 'the structures in the drawing as SMILES', text: 'CC(=O)O\nCCO', on: true },
  ];
  const tab = {};
  const host: AssistantHost = {
    prefs: () => prefs,
    savePrefs: (p) => { prefs = p; },
    mode: () => 'drawing',
    items: async () => items.map((i) => ({ ...i })),
    apply: async (a) => { applied.push(a); return 'Drew the structure.'; },
    markStep: () => true,
    undo: vi.fn(),
    openSettings: async () => {},
    area: () => new DOMRect(0, 0, 1000, 700),
    tab: () => tab,
  };
  const bar = new AssistantBar(host);
  return { bar, host, applied, prefs: () => prefs };
}

const click = (bar: AssistantBar, label: string) => {
  const b = [...bar.el.querySelectorAll('button')].find((x) => x.textContent === label);
  if (!b) throw new Error(`no ${label} button`);
  b.click();
};

afterEach(() => { vi.unstubAllGlobals(); clearRequestLog(); document.body.replaceChildren(); });

describe('the Assistant bar', () => {
  it('asks first, and sends nothing until it is turned on', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const s = setup();
    await s.bar.show();
    expect(s.bar.el.textContent).toContain('Turn on the Assistant?');
    expect(s.bar.el.textContent).toContain('on this computer: nothing leaves it');
    expect(s.bar.el.querySelector('textarea')!.disabled).toBe(true);
    click(s.bar, 'Turn On Assistant');
    await tick();
    expect(s.prefs().assistant).toBe(true);
    expect(s.bar.el.querySelector('textarea')!.disabled).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends only what is switched on, logs it, and changes nothing until Accept', async () => {
    const answer = 'The ester.\n\n```json\n{"actions":[{"type":"structure","smiles":"CC(=O)OC","replace":true}]}\n```';
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: answer } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const s = setup({ assistant: true });
    await s.bar.show();
    click(s.bar, 'the structures in the drawing as SMILES');
    const ta = s.bar.el.querySelector('textarea')!;
    ta.value = 'Make the methyl ester';
    click(s.bar, 'Send');
    await vi.waitFor(() => expect(s.bar.el.querySelector('.ai-prop')).not.toBeNull());
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    const sent = JSON.stringify(body);
    expect(sent).toContain('CC(=O)O');
    expect(sent).not.toContain('CCO');
    expect(requestLog()[0].sent).toBe('the selected structure as SMILES, your question');
    expect(s.applied).toEqual([]);
    click(s.bar, 'Accept');
    await tick();
    expect(s.applied).toEqual([{ type: 'structure', smiles: 'CC(=O)OC', replace: true }]);
    click(s.bar, 'Undo');
    expect(s.host.undo).toHaveBeenCalledOnce();
  });

  it('blocks a cloud model under Local only, from the bar', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const s = setup({ provider: 'openai', base: '', assistant: true, localOnly: false });
    await s.bar.show();
    const local = s.bar.el.querySelector<HTMLInputElement>('.ai-tog input')!;
    local.checked = true;
    local.dispatchEvent(new Event('change'));
    expect(s.prefs().localOnly).toBe(true);
    expect(s.bar.el.textContent).toContain('Local only is on');
    s.bar.el.querySelector('textarea')!.value = 'hi';
    click(s.bar, 'Send');
    await tick();
    expect(fetch).not.toHaveBeenCalled();
    expect(requestLog()).toEqual([]);
  });
});
