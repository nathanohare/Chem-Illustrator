// @vitest-environment jsdom
// The Send Feedback window: Send goes through the relay with who can read it, the email and a
// picture; a failure keeps the text; without a relay it opens GitHub as before.
import { describe, expect, it } from 'vitest';
import { FeedbackDialog } from '../src/ui/feedback-dialog';
import type { RelayReport } from '../src/feedback';

(HTMLDialogElement.prototype as unknown as { showModal: () => void }).showModal = function (this: HTMLDialogElement) { this.open = true; };
(HTMLDialogElement.prototype as unknown as { close: () => void }).close = function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')); };

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
function setup(send: (r: RelayReport) => Promise<{ number: number; visibility: 'private' | 'public'; url?: string }>, relay = 'https://relay.example') {
  const opened: string[] = [];
  const sent: RelayReport[] = [];
  const dlg = new FeedbackDialog({
    openWebPage: (u) => { opened.push(u); },
    copyText: async () => {},
    about: () => ({ Version: 'Version 1', Computer: 'Linux', Mode: 'drawing' }),
    pagePicture: () => PNG,
    relay,
    send: async (r) => { sent.push(r); return send(r); },
  });
  dlg.open('problem');
  const d = document.querySelector<HTMLDialogElement>('dialog.feedback-dialog')!;
  const q = <T extends Element>(s: string) => d.querySelector<T>(s)!;
  return { d, q, opened, sent };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Send Feedback', () => {
  it('sends a private report by default, and a public one with the picture when chosen', async () => {
    const { d, q, sent } = setup(async (r) => ({ number: 42, visibility: r.visibility, url: r.visibility === 'public' ? 'https://github.com/o/p/issues/42' : undefined }));
    q<HTMLInputElement>('input[type=text]').value = 'Wedge flips';
    expect(q('.feedback-visibility [aria-checked="true"]').textContent).toBe('Only the Chemweave team');
    q<HTMLButtonElement>('.feedback-visibility [data-vis="public"]').click();
    q<HTMLInputElement>('#feedback-picture').click();
    expect(q('.feedback-picture-note').textContent).toBe('The picture will be public too.');
    q<HTMLInputElement>('input[type=email]').value = 'me@lab.edu';
    q<HTMLFormElement>('form').requestSubmit();
    await flush();
    expect(sent[0]).toMatchObject({ visibility: 'public', title: '[Bug] Wedge flips', email: 'me@lab.edu', picture: { type: 'image/png', name: 'page.png' } });
    expect(d.textContent).toContain('Sent. Thank you!');
    expect(d.textContent).toContain('report 42');
    expect(d.textContent).toContain('See it on GitHub');
    d.close();
  });
  it('keeps the text and offers Try Again when sending fails', async () => {
    const { d, q } = setup(async () => { throw new Error('Couldn’t send (no internet connection?).'); });
    q<HTMLInputElement>('input[type=text]').value = 'Wedge flips';
    q<HTMLFormElement>('form').requestSubmit();
    await flush();
    expect(q('.name-status').textContent).toContain('no internet');
    expect(q<HTMLButtonElement>('button[type=submit]').textContent).toBe('Try Again');
    expect(q<HTMLInputElement>('input[type=text]').value).toBe('Wedge flips');
    d.close();
  });
  it('opens GitHub as before when no relay is set up', async () => {
    const { d, q, opened, sent } = setup(async () => ({ number: 1, visibility: 'private' }), '');
    expect(q('button[type=submit]').textContent).toBe('Open on GitHub');
    expect(q<HTMLElement>('.feedback-visibility').hidden).toBe(true);
    q<HTMLInputElement>('input[type=text]').value = 'Wedge flips';
    q<HTMLFormElement>('form').requestSubmit();
    expect(opened[0]).toContain('/issues/new?title=');
    expect(sent).toHaveLength(0);
    expect(d.open).toBe(false);
  });
});
