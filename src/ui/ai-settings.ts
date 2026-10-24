// Edit > Settings > AI Model: link (or unlink) an AI model of the person's own, with their own key.

import { ask } from './ask';
import { PROVIDERS, aiModel, aiModels, aiAsk, aiName, hasAiKey, setAiKey, type AiPrefs, type AiProvider } from '../ai/link';

const NOTE = 'Optional. Link an AI model with your own API key to use it where the app offers "Use AI model", such as reading hand-drawn structures. '
  + 'Nothing is sent anywhere until you link one; after that, only what you choose to send (such as the picture being read) goes to that service, '
  + 'and it is billed to your account there. The key is kept on this computer only, never in exported settings.';

/** Show the settings; `save` keeps the new choice. */
export async function aiSettingsDialog(now: AiPrefs, save: (p: AiPrefs) => void): Promise<void> {
  let cur = now;
  for (;;) {
    const had = await hasAiKey(cur).catch(() => false);
    const models = [...new Set(Object.values(PROVIDERS).flatMap((p) => p.models))];
    const r = await ask('AI Model', [
      { name: 'provider', label: 'AI service', value: cur.provider, options: [
        { value: 'none', label: 'None (nothing is sent)' },
        ...(Object.keys(PROVIDERS) as Exclude<AiProvider, 'none'>[]).map((k) => ({ value: k, label: PROVIDERS[k].name })),
      ] },
      { name: 'key', label: 'API key', type: 'password', value: '', placeholder: had ? 'Saved (leave empty to keep it)' : 'Paste your key',
        help: Object.values(PROVIDERS).map((p) => p.keyHelp).join(' ') },
      { name: 'model', label: 'Model', value: cur.model, placeholder: 'The service\'s suggested model', suggestions: models,
        help: 'Leave empty for: ' + (['anthropic', 'openai', 'gemini'] as const).map((k) => `${PROVIDERS[k].name.split(' ')[0]} ${PROVIDERS[k].model}`).join(', ') + '. A model must read pictures to read structures.' },
      { name: 'base', label: 'Address (Other only)', value: cur.base, placeholder: 'http://localhost:11434/v1',
        help: 'For Other: the service\'s OpenAI-style address, such as https://openrouter.ai/api/v1 or Ollama\'s http://localhost:11434/v1.' },
      { name: 'forget', label: 'Forget the saved key for this service', type: 'checkbox', value: 'false' },
    ], { ok: 'Save and Test', note: NOTE });
    if (!r) return;
    const provider = (r.provider as AiProvider) || 'none';
    const next: AiPrefs = { provider, model: r.model.trim(), base: r.base.trim() };
    if (provider === 'compatible' && !/^https?:\/\//i.test(next.base)) {
      await ask('AI Model', [], { noCancel: true, note: 'For Other, type the service\'s address, starting with http:// or https://.' });
      cur = next;
      continue;
    }
    try {
      if (r.forget === 'true') await setAiKey(next, '');
      else if (r.key.trim()) await setAiKey(next, r.key.trim());
    } catch (e) {
      await ask('AI Model', [], { noCancel: true, note: 'Could not save the key: ' + String(e) });
      return;
    }
    save(next);
    if (provider === 'none') return;
    const problem = await test(next);
    if (!problem) {
      await ask('AI Model', [], { noCancel: true, note: `Linked: ${aiName(next)}. The key works.` });
      return;
    }
    const again = await ask('AI Model', [], { ok: 'Change', note: `Saved, but the test did not work: ${problem}` });
    if (!again) return;
    cur = next;
  }
}

/** Null when the service answers; else why not. */
async function test(p: AiPrefs): Promise<string | null> {
  try {
    // listing models costs nothing; a service that can't list them gets a tiny question instead
    const names = await aiModels(p).catch(() => null);
    if (names && names.length && !names.includes(aiModel(p))) return `the service doesn't offer a model called "${aiModel(p)}". It offers: ${names.slice(0, 12).join(', ')}${names.length > 12 ? '…' : ''}.`;
    if (names && names.length) return null;
    await aiAsk(p, { text: 'Reply with the word OK.', maxTokens: 16 });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
