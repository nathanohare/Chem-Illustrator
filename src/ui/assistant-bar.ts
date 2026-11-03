// The Assistant's prompt bar (review item 35, layout C): a slim bar at the bottom of the work
// area, opened with Ctrl+/ or Edit > Assistant, in every mode. Answers and the changes they
// propose show just above it; "Open as Pane" makes it a taller pane down the right for a long
// chat, and "Float as Window" a window of its own to move and size (layout B). The look chosen
// is kept. Under the box, "Will send" names each thing a question would carry (click one to leave
// it out), and Local only can be switched on right there. Nothing is sent until the person has
// turned the Assistant on once, having been told what goes where.

import { aiAsk, aiName, aiBase, isLocalAddress, localOnlyBlock, type AiPrefs, type AssistantLook } from '../ai/link';
import { buildQuestion, clearRequestLog, logRequest, parseAnswer, requestLog, requestLogPlace, sendSummary, type AssistantAction, type AssistantMode, type SendItem } from '../ai/assistant';
import { showDialog } from './dialog-host';

export interface AssistantHost {
  prefs(): AiPrefs;
  savePrefs(p: AiPrefs): void;
  mode(): AssistantMode;
  /** What could be sent from the page as it is now. */
  items(): Promise<SendItem[]>;
  /** Carry out an accepted proposal (one step of Undo); what happened. */
  apply(a: AssistantAction): Promise<string>;
  /** Select a scheme step's arrow; false when there is no such step. */
  markStep(n: number): boolean;
  undo(): void;
  /** Edit > Settings > AI Model. */
  openSettings(): Promise<void>;
  /** The work area, to sit over. */
  area(): DOMRect | null;
  /** The tab in use: the conversation starts afresh in another one. */
  tab(): object;
}

const MODE_HINT: Record<AssistantMode, string> = {
  drawing: 'Ask about the structure or scheme, or ask for one: "draw the Boc-protected amine"',
  slides: 'Ask about the structures on this slide, or ask for one',
  design: 'Ask about the structures on this page, or ask for one',
  document: 'Ask for help writing: "write the experimental for step 2", "tighten this paragraph"',
  sheet: 'Ask about the selected cells',
};

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function button(label: string, run: () => void, cls = '', title = ''): HTMLButtonElement {
  const b = h('button', cls, label);
  b.type = 'button';
  if (title) b.title = title;
  b.addEventListener('click', run);
  return b;
}

export class AssistantBar {
  readonly el: HTMLDivElement;
  private msgs: HTMLDivElement;
  private input: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private local: HTMLInputElement;
  private chips: HTMLDivElement;
  private looks: HTMLSpanElement;
  private head: HTMLDivElement;
  private items: SendItem[] = [];
  /** Things the person switched off, kept while the bar is open between questions. */
  private off = new Set<SendItem['id']>();
  private busy = 0;
  private tab: object | null = null;
  /** Where the floating window was left, and whether it has been given its size yet. */
  private at: { x: number; y: number } | null = null;
  private sized = false;

  constructor(private host: AssistantHost) {
    this.el = h('div', 'ai-bar');
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Assistant');
    this.head = h('div', 'ai-head');
    this.head.append(h('span', 'ai-title', 'Assistant'), button('×', () => this.close(), 'ai-x', 'Close (Esc)'));
    this.wireDrag(this.head);
    this.msgs = h('div', 'ai-msgs');
    this.msgs.setAttribute('aria-live', 'polite');

    const box = h('div', 'ai-in');
    const row = h('div', 'ai-row');
    const spark = h('span', 'ai-spark', '✦');
    spark.setAttribute('aria-hidden', 'true');
    this.input = h('textarea');
    this.input.rows = 1;
    this.input.setAttribute('aria-label', 'Ask the Assistant');
    this.input.addEventListener('input', () => this.fit());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void this.send(); }
    });
    const tog = h('label', 'ai-tog');
    this.local = h('input');
    this.local.type = 'checkbox';
    this.local.addEventListener('change', () => this.setLocalOnly(this.local.checked));
    tog.append(this.local, document.createTextNode('Local only'));
    tog.title = 'Only a model on this computer is asked; nothing is sent anywhere else';
    this.sendBtn = button('Send', () => void this.send(), 'primary', 'Send (Enter); Shift+Enter starts a new line');
    const close = button('×', () => this.close(), 'ai-x', 'Close (Esc)');
    row.append(spark, this.input, tog, this.sendBtn, close);

    const foot = h('div', 'ai-foot');
    this.chips = h('div', 'ai-chips');
    const links = h('div', 'ai-links');
    this.looks = h('span', 'ai-looks');
    links.append(
      button('Request Log', () => this.showLog(), 'ai-link', `Every question sent, kept ${requestLogPlace()}`),
      this.looks,
      button('Settings', () => void this.host.openSettings().then(() => { this.applyLook(); return this.refresh(); }), 'ai-link', 'Edit > Settings > AI Model'),
    );
    foot.append(this.chips, links);
    box.append(row, foot);
    this.el.append(this.head, this.msgs, box);
    this.el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.close(); } });
    document.body.append(this.el);
    window.addEventListener('resize', () => { if (this.open) this.place(); });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  async show(): Promise<void> {
    this.el.hidden = false;
    // a conversation is about one tab's page; Accept on another's proposals would land in the wrong place
    const tab = this.host.tab();
    if (tab !== this.tab) { this.tab = tab; this.msgs.replaceChildren(); this.off.clear(); this.busy++; }
    this.applyLook();
    this.input.placeholder = MODE_HINT[this.host.mode()];
    await this.refresh();
    this.input.focus();
  }

  close(): void {
    this.el.hidden = true;
  }

  toggle(): void {
    if (this.open && (document.activeElement === this.input || this.el.contains(document.activeElement))) this.close();
    else void this.show();
  }

  private get look(): AssistantLook {
    return this.host.prefs().assistantLook ?? 'bar';
  }

  /** Show it as a bar, a pane or a floating window, and keep that for next time. */
  private setLook(look: AssistantLook): void {
    const { assistantLook: _old, ...p } = this.host.prefs();
    this.host.savePrefs(look === 'bar' ? p : { ...p, assistantLook: look });
    this.applyLook();
  }

  private applyLook(): void {
    const look = this.look;
    this.el.classList.toggle('wide', look !== 'bar');
    this.el.classList.toggle('float', look === 'window');
    this.head.hidden = look !== 'window';
    const names: Record<AssistantLook, [string, string]> = {
      bar: ['Make Bar', 'A slim bar at the bottom of the page'],
      pane: ['Open as Pane', 'A taller pane down the right, for a longer conversation'],
      window: ['Float as Window', 'A window of its own that you can move and size'],
    };
    this.looks.replaceChildren(...(['bar', 'pane', 'window'] as const).filter((l) => l !== look).map((l) => button(names[l][0], () => this.setLook(l), 'ai-link', names[l][1])));
    this.place();
  }

  /** Sit over the bottom middle of the work area, down its right side as a pane, or where the window was left. */
  private place(): void {
    const a = this.host.area();
    if (!a) return;
    const s = this.el.style;
    const look = this.look;
    if (look === 'window') {
      if (!this.sized) {
        s.width = `${Math.min(420, a.width - 24)}px`;
        s.height = `${Math.min(560, a.height - 24)}px`;
        this.sized = true;
      }
      const w = this.el.offsetWidth || 420, ht = this.el.offsetHeight || 560;
      const at = this.at ?? { x: a.right - w - 12, y: a.top + 12 };
      s.left = `${Math.max(0, Math.min(at.x, window.innerWidth - w))}px`;
      s.top = `${Math.max(0, Math.min(at.y, window.innerHeight - ht))}px`;
      s.bottom = '';
      return;
    }
    s.height = '';
    this.sized = false;
    s.bottom = `${Math.max(8, window.innerHeight - a.bottom + 12)}px`;
    if (look === 'pane') {
      const w = Math.min(420, a.width - 24);
      s.width = `${w}px`;
      s.left = `${a.right - w - 12}px`;
      s.top = `${a.top + 12}px`;
    } else {
      const w = Math.min(760, a.width - 32);
      s.width = `${w}px`;
      s.left = `${a.left + (a.width - w) / 2}px`;
      s.top = '';
    }
  }

  /** The floating window moves by its title bar. */
  private wireDrag(head: HTMLElement): void {
    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      const r = this.el.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = (m: PointerEvent) => { this.at = { x: m.clientX - dx, y: m.clientY - dy }; this.place(); };
      const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
      e.preventDefault();
    });
  }

  private fit(): void {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(140, this.input.scrollHeight)}px`;
  }

  /** The Local only box, the "Will send" list, and the setup or opt-in when either is still needed. */
  private async refresh(): Promise<void> {
    const p = this.host.prefs();
    this.local.checked = p.localOnly;
    this.el.querySelector('.ai-setup')?.remove();
    const ready = p.provider !== 'none' && p.assistant;
    this.input.disabled = this.sendBtn.disabled = !ready;
    if (p.provider === 'none') this.setup();
    else if (!p.assistant) this.consent(p);
    this.items = (await this.host.items().catch(() => [])).map((i) => ({ ...i, on: i.on && !this.off.has(i.id) }));
    this.drawChips();
  }

  private drawChips(): void {
    const c = this.chips;
    c.replaceChildren(h('span', 'ai-muted', 'Will send:'));
    for (const it of this.items) {
      const b = button(it.label, () => {
        it.on = !it.on;
        if (it.on) this.off.delete(it.id); else this.off.add(it.id);
        this.drawChips();
      }, 'ai-chip' + (it.on ? '' : ' off'), (it.on ? 'Sent with your question. Click to leave it out.' : 'Left out. Click to send it.') + '\n\n' + it.text.slice(0, 600) + (it.text.length > 600 ? '…' : ''));
      b.setAttribute('aria-pressed', String(it.on));
      c.append(b);
    }
    c.append(h('span', 'ai-chip fixed', 'your question'));
    const p = this.host.prefs();
    if (p.provider !== 'none') {
      const local = isLocalAddress(aiBase(p));
      c.append(h('span', 'ai-muted' + (local ? ' ai-local' : ''), `to ${aiName(p)}${local ? ' (this computer)' : ''}`));
    }
  }

  /** No AI model linked yet. */
  private setup(): void {
    const d = h('div', 'ai-it ai-setup');
    d.append(h('p', '', 'The Assistant uses an AI model of your own: Claude, ChatGPT or Gemini with your API key, or a model on this computer (Ollama or LM Studio) so that nothing leaves it.'));
    d.append(button('Link an AI Model…', () => void this.host.openSettings().then(() => this.refresh()), 'primary'));
    this.msgs.prepend(d);
  }

  /** The first time: what is sent, where, and that nothing goes until it is turned on. */
  private consent(p: AiPrefs): void {
    const local = isLocalAddress(aiBase(p));
    const d = h('div', 'ai-it ai-setup');
    d.append(h('b', '', 'Turn on the Assistant?'));
    const ul = h('ul');
    for (const t of [
      `Questions go to ${aiName(p)}${local ? ', on this computer: nothing leaves it.' : ', over the internet. It is billed to your account there, and its own terms say what it keeps.'}`,
      'Each question carries only what "Will send" lists under the box (such as the selected structure as SMILES, or the selected text). Click any of them to leave it out. Other files, other tabs, file names and your key are never sent.',
      'The Assistant only proposes. Nothing on the page changes until you click Accept, and Undo takes it back.',
      `Every question sent is kept in a Request Log ${requestLogPlace()}, which you can read or clear.`,
      ...(local ? [] : ['For unpublished structures, tick Local only and use a model on this computer.']),
    ]) ul.append(h('li', '', t));
    d.append(ul);
    const row = h('div', 'ai-actions');
    row.append(
      button('Turn On Assistant', () => { this.host.savePrefs({ ...this.host.prefs(), assistant: true }); void this.refresh().then(() => this.input.focus()); }, 'primary'),
      button('Not Now', () => this.close()),
    );
    d.append(row);
    this.msgs.prepend(d);
  }

  private setLocalOnly(on: boolean): void {
    const p = { ...this.host.prefs(), localOnly: on };
    this.host.savePrefs(p);
    const blocked = localOnlyBlock(p);
    if (blocked) this.note(blocked, 'warn');
    this.drawChips();
  }

  private note(text: string, cls = ''): HTMLDivElement {
    const d = h('div', 'ai-it' + (cls ? ' ' + cls : ''), text);
    this.msgs.append(d);
    this.msgs.scrollTop = this.msgs.scrollHeight;
    return d;
  }

  private async send(): Promise<void> {
    const question = this.input.value.trim();
    const p = this.host.prefs();
    if (!question || p.provider === 'none' || !p.assistant) return;
    const blocked = localOnlyBlock(p);
    if (blocked) { this.note(blocked, 'warn'); return; }
    // another tab chosen while the bar stayed open: a new conversation, about that tab's page
    const tab = this.host.tab();
    if (tab !== this.tab) { this.tab = tab; this.msgs.replaceChildren(); this.busy++; }
    // what is on the page now (the selection may have changed since the bar opened)
    this.items = (await this.host.items().catch(() => [])).map((i) => ({ ...i, on: i.on && !this.off.has(i.id) }));
    this.drawChips();
    const mode = this.host.mode();
    const q = buildQuestion(this.items, question, mode);
    logRequest({ time: Date.now(), service: aiName(p), local: isLocalAddress(aiBase(p)), sent: sendSummary(this.items), text: q.text, images: q.images?.length ?? 0 });
    this.msgs.append(h('div', 'ai-me', question));
    this.input.value = '';
    this.fit();
    const wait = this.note('Thinking…', 'ai-muted');
    const seq = ++this.busy;
    try {
      const answer = await aiAsk(p, q);
      if (seq !== this.busy) return;
      wait.remove();
      this.answer(answer, tab);
    } catch (e) {
      if (seq !== this.busy) return;
      wait.remove();
      this.note(`The model didn't answer: ${e instanceof Error ? e.message : String(e)}`, 'warn');
    }
  }

  /** The answer's words, then a card for each change it proposes. */
  private answer(text: string, tab: object): void {
    const { prose, actions } = parseAnswer(text);
    const d = h('div', 'ai-it');
    for (const para of prose.split(/\n{2,}/).filter((x) => x.trim())) d.append(h('p', '', para.trim()));
    for (const a of actions) d.append(this.card(a, tab));
    if (!d.childNodes.length) d.append(h('p', 'ai-muted', '(No answer.)'));
    this.msgs.append(d);
    this.msgs.scrollTop = this.msgs.scrollHeight;
  }

  private card(a: AssistantAction, tab: object): HTMLElement {
    const c = h('div', 'ai-prop');
    if (a.type === 'check') {
      c.append(h('b', '', 'Check'));
      const ul = h('ul', 'ai-checks');
      for (const f of a.findings) {
        const li = h('li', 'ai-' + f.level);
        li.append(h('span', 'ai-level', f.level === 'warn' ? 'Problem' : f.level === 'ok' ? 'OK' : 'Note'), document.createTextNode(' ' + f.text + ' '));
        if (f.step !== undefined) {
          const n = f.step;
          li.append(button(`Show step ${n}`, () => { if (!this.host.markStep(n)) this.note(`There is no step ${n} on this page.`, 'ai-muted'); }, 'ai-link'));
        }
        ul.append(li);
      }
      c.append(ul);
      return c;
    }
    const head = h('div', 'ai-actions');
    if (a.type === 'structure') {
      head.append(h('b', '', a.replace ? 'Proposed: in place of the selected structure' : 'Proposed: a new structure'));
      c.append(head);
      if (a.name) c.append(h('div', '', a.name));
      c.append(h('code', 'ai-smiles', a.smiles));
    } else {
      head.append(h('b', '', a.replace ? 'Proposed: in place of the selected text' : 'Proposed: text to add'));
      c.append(head, h('div', 'ai-text', a.text));
    }
    const row = h('div', 'ai-actions');
    const status = h('span', 'ai-muted');
    // a proposal is for the tab it was asked in: the bar can stay open while another tab is chosen
    const accept = button('Accept', () => void (async () => {
      if (this.host.tab() !== tab) { status.textContent = 'This was asked about another tab. Go back to that tab to accept it.'; return; }
      accept.disabled = reject.disabled = true;
      const said = await this.host.apply(a).catch((e) => `Could not: ${String(e)}`);
      status.textContent = said;
      if (!/^(Replaced|Drew|Added)/.test(said)) return;
      const undo = button('Undo', () => { this.host.undo(); status.textContent = 'Undone.'; undo.remove(); }, '', 'Take it back (Ctrl+Z)');
      row.append(undo);
    })(), 'primary');
    const reject = button('Reject', () => { accept.disabled = reject.disabled = true; status.textContent = 'Rejected.'; });
    row.append(accept, reject, status);
    c.append(row);
    return c;
  }

  /** The Request Log: every question sent, newest first, with Clear. */
  private showLog(): void {
    const d = h('dialog', 'ai-log');
    d.setAttribute('aria-label', 'Request Log');
    const fill = () => {
      const list = requestLog();
      const body = h('div', 'ai-log-list');
      if (!list.length) body.append(h('p', 'ai-muted', 'Nothing has been sent.'));
      for (const e of list) {
        const det = h('details');
        const sum = h('summary');
        sum.textContent = `${new Date(e.time).toLocaleString()} · ${e.service}${e.local ? ' (this computer)' : ''} · ${e.sent}${e.images ? ` · ${e.images} picture${e.images > 1 ? 's' : ''}` : ''}`;
        det.append(sum, h('pre', '', e.text));
        body.append(det);
      }
      d.replaceChildren(
        h('h2', '', 'Request Log'),
        h('p', 'ai-muted', `Every question the Assistant sent, and everything sent with it. Kept ${requestLogPlace()} only (the last 200).`),
        body,
        (() => {
          const row = h('div', 'ai-actions');
          row.append(button('Clear Log', () => { clearRequestLog(); fill(); }, '', 'Forget every request kept here'), h('span', 'grow'), button('Close', () => d.close(), 'primary'));
          return row;
        })(),
      );
    };
    fill();
    d.addEventListener('close', () => d.remove());
    showDialog(d);
  }
}
