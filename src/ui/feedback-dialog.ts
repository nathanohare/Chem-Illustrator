// The Send Feedback window (Help menu): pick what kind of feedback it is, write it, and Send it.
// Send passes it to the feedback relay, which files it for the sender (no GitHub account needed);
// the sender picks whether only the Chemweave team or everyone can read it, and may leave an email
// for a reply and attach a picture. Other ways: open it as a new issue on GitHub (in the computer's
// browser, to check and submit there), put it in an email, or copy it. Nothing leaves the computer
// until Send is pressed.

import { foldIntoInfo, infoIcon, setInfo } from './info-tip';
import {
  feedbackIssue, feedbackText, issueUrl, mailUrl, pictureFromDataUrl, relayReport, sendReport, KIND_NAMES, PICTURE_LIMIT, RELAY_URL, REPO_URL,
  type Feedback, type FeedbackKind, type Picture, type Sent, type Visibility,
} from '../feedback';

const EMAIL_KEY = 'chemweave.feedback-email';
const VIS_TIP: Record<Visibility, string> = {
  private: 'Only the Chemweave team can read it.',
  public: 'Shown on the public Chemweave issues page on GitHub, where anyone can read it. Your email is never shown; only the team sees it.',
};

export interface FeedbackHost {
  /** Open a web page in the computer's browser. */
  openWebPage(url: string): void;
  /** Copy text to the clipboard, saying so when it's done. */
  copyText(text: string, done: string): Promise<void>;
  /** The program's version, the computer and what is open, to add to the feedback if wanted. */
  about(): Record<string, string>;
  /** A picture of the current page (a PNG data: URL), or null when there is nothing on it. */
  pagePicture?(): string | null;
  /** The feedback relay's address (tests and builds may swap it); defaults to RELAY_URL. */
  relay?: string;
  /** Sends a report; tests swap it. */
  send?: typeof sendReport;
}

export class FeedbackDialog {
  /** What was written last time, kept until it is sent or copied, in case the window was closed by mistake. */
  private draft: Feedback = { kind: 'idea', title: '', details: '', steps: '' };
  private withAbout = true;
  /** Error details to go with a problem report (from the error notice), and whether to include them. */
  private extra = '';
  private withExtra = true;
  private visibility: Visibility = 'private';
  /** A picture chosen with Add a File… (kept with the draft). */
  private file: Picture | null = null;
  private withPicture = false;

  constructor(private host: FeedbackHost) {}

  /** The program's version, the computer and what is open. */
  about(): Record<string, string> {
    return this.host.about();
  }

  /** Open the window; `prefill` fills in a problem report about an error (its title and details). */
  open(kind?: FeedbackKind, prefill?: Pick<Feedback, 'title' | 'extra'>): void {
    if (kind) this.draft.kind = kind;
    if (prefill) {
      this.draft = { kind: kind ?? 'problem', title: prefill.title, details: '', steps: '' };
      this.extra = prefill.extra ?? '';
      this.withExtra = true;
    }
    const d = document.createElement('dialog');
    d.className = 'ask feedback-dialog';
    const form = document.createElement('form');
    const h = document.createElement('h2');
    h.textContent = 'Send Feedback';
    const note = document.createElement('p');
    note.className = 'muted';
    const relay = this.host.relay ?? RELAY_URL;
    note.textContent = relay
      ? 'Ideas, problems and questions are all welcome. Send passes it straight to the Chemweave team; no account is needed. Or open it on GitHub with your own account, put it in an email, or copy it.'
      : 'Ideas, problems and questions are all welcome. Open on GitHub fills in a new issue on the project\'s page for you to check and submit (a free GitHub account is needed). No account? Copy Text, and send it to whoever looks after Chemweave in your lab.';

    const kinds = document.createElement('div');
    kinds.className = 'feedback-kinds';
    kinds.setAttribute('role', 'radiogroup');
    kinds.setAttribute('aria-label', 'Kind of feedback');
    for (const k of Object.keys(KIND_NAMES) as FeedbackKind[]) {
      const lab = document.createElement('label');
      const r = document.createElement('input');
      r.type = 'radio';
      r.name = 'feedback-kind';
      r.value = k;
      r.checked = this.draft.kind === k;
      r.addEventListener('change', () => { this.draft.kind = k; show(); });
      lab.append(r, ` ${KIND_NAMES[k]}`);
      kinds.append(lab);
    }

    const row = (label: string, field: HTMLElement): HTMLLabelElement => {
      const l = document.createElement('label');
      l.className = 'feedback-field';
      const s = document.createElement('span');
      s.textContent = label;
      l.append(s, field);
      return l;
    };
    const title = document.createElement('input');
    title.type = 'text';
    title.maxLength = 120;
    title.value = this.draft.title;
    const details = document.createElement('textarea');
    details.rows = 6;
    details.value = this.draft.details;
    const steps = document.createElement('textarea');
    steps.rows = 4;
    steps.value = this.draft.steps ?? '';
    steps.placeholder = '1. Open a drawing\n2. …\n3. Then this happens:';
    const titleRow = row('Title (a few words)', title);
    const email = document.createElement('input');
    email.type = 'email';
    email.maxLength = 200;
    email.autocomplete = 'email';
    try { email.value = localStorage.getItem(EMAIL_KEY) ?? ''; } catch { /* no storage */ }
    const emailRow = row('Email for a reply (optional)', email);
    emailRow.title = 'Only the Chemweave team sees it, even on a public report.';
    const titleLine = document.createElement('div');
    titleLine.className = 'feedback-title-line';
    titleLine.append(titleRow);
    if (relay) titleLine.append(emailRow);
    const detailsRow = row('', details);
    const stepsRow = row('Steps to make it happen (if you know them)', steps);

    // who can read it: a two-button switch (radio group)
    const visRow = document.createElement('div');
    visRow.className = 'feedback-visibility';
    visRow.hidden = !relay;
    const visLab = document.createElement('span');
    visLab.id = 'feedback-vis-label';
    visLab.textContent = 'Who can read it';
    const seg = document.createElement('span');
    seg.className = 'seg';
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-labelledby', visLab.id);
    const visTip = infoIcon(VIS_TIP[this.visibility]);
    const visButtons = (['private', 'public'] as Visibility[]).map((v) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.vis = v;
      b.textContent = v === 'private' ? 'Only the Chemweave team' : 'Everyone (public on GitHub)';
      b.addEventListener('click', () => { this.visibility = v; show(); });
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        this.visibility = v === 'private' ? 'public' : 'private';
        show();
        seg.querySelector<HTMLButtonElement>(`[data-vis="${this.visibility}"]`)?.focus();
      });
      seg.append(b);
      return b;
    });
    visRow.append(visLab, seg, visTip);

    // a picture: the current page, or a file
    const page = this.host.pagePicture?.() ?? null;
    const picRow = document.createElement('div');
    picRow.className = 'feedback-picture';
    picRow.hidden = !relay;
    const picBox = document.createElement('input');
    picBox.type = 'checkbox';
    picBox.id = 'feedback-picture';
    picBox.checked = this.withPicture;
    const picLab = document.createElement('label');
    picLab.htmlFor = picBox.id;
    const thumb = document.createElement('img');
    thumb.alt = 'The picture to attach';
    const pick = document.createElement('input');
    pick.type = 'file';
    pick.accept = 'image/png,image/jpeg,image/gif,image/webp';
    pick.hidden = true;
    const pickButton = document.createElement('button');
    pickButton.type = 'button';
    pickButton.textContent = 'Add a File…';
    const picNote = document.createElement('span');
    picNote.className = 'feedback-picture-note';
    picRow.append(picBox, picLab, thumb, pickButton, pick, picNote);
    picBox.addEventListener('change', () => { this.withPicture = picBox.checked; show(); });
    pickButton.addEventListener('click', () => pick.click());
    pick.addEventListener('change', () => {
      const f = pick.files?.[0];
      pick.value = '';
      if (!f) return;
      if (f.size > PICTURE_LIMIT) { say('That picture is too large (3 MB at most).', true); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const p = pictureFromDataUrl(String(reader.result), f.name);
        if (!p) { say('Pictures can be PNG, JPEG, GIF or WebP, up to 3 MB.', true); return; }
        this.file = p;
        this.withPicture = true;
        show();
      };
      reader.readAsDataURL(f);
    });
    const picture = (): Picture | null => {
      if (!this.withPicture) return null;
      if (this.file) return this.file;
      return page ? pictureFromDataUrl(page, 'page.png') : null;
    };

    const aboutBox = document.createElement('input');
    aboutBox.type = 'checkbox';
    aboutBox.checked = this.withAbout;
    const aboutLab = document.createElement('label');
    aboutLab.className = 'feedback-about';
    const aboutText = document.createElement('span');
    aboutLab.append(aboutBox, aboutText);

    // the error details, shown so the person can read what would be sent before leaving them in
    const extraWrap = document.createElement('div');
    extraWrap.className = 'feedback-extra';
    extraWrap.hidden = !this.extra;
    const extraBox = document.createElement('input');
    extraBox.type = 'checkbox';
    extraBox.checked = this.withExtra;
    const extraLab = document.createElement('label');
    extraLab.className = 'feedback-about';
    extraLab.append(extraBox, ' Include the error details the program wrote down');
    const extraShow = document.createElement('details');
    const extraSum = document.createElement('summary');
    extraSum.textContent = 'Show them';
    const extraPre = document.createElement('pre');
    extraPre.textContent = this.extra;
    extraShow.append(extraSum, extraPre);
    extraWrap.append(extraLab, extraShow);

    const status = document.createElement('p');
    status.className = 'name-status';
    status.setAttribute('role', 'status');

    const buttons = document.createElement('p');
    buttons.className = 'ask-buttons';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Close';
    const link = (text: string, tip: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'link';
      b.textContent = text;
      b.title = tip;
      return b;
    };
    const github = link('Open on GitHub', `Open a new issue on ${REPO_URL.replace('https://', '')}, filled in, in your browser (needs a GitHub account)`);
    const mail = link('Email…', 'Open your email program with the feedback filled in');
    const copy = link('Copy Text', 'Copy the feedback, to paste into an email or message');
    const others = document.createElement('span');
    others.className = 'feedback-other-ways';
    others.append('Or:', ...(relay ? [github] : []), mail, copy);
    const send = document.createElement('button');
    send.type = 'submit';
    send.className = 'primary';
    send.textContent = relay ? 'Send' : 'Open on GitHub';
    if (!relay) send.title = github.title;
    buttons.append(others, cancel, send);

    foldIntoInfo(note, h);
    form.append(h, note, kinds, titleLine, detailsRow, stepsRow, extraWrap, visRow, picRow, aboutLab, status, buttons);
    d.append(form);

    const about = this.host.about();
    const show = (): void => {
      const k = this.draft.kind;
      (detailsRow.firstChild as HTMLElement).textContent =
        k === 'idea' ? 'What would you like it to do? How would it help?' :
        k === 'problem' ? 'What went wrong? What did you expect to happen?' : 'Your comment or question';
      stepsRow.hidden = k !== 'problem';
      extraWrap.hidden = !this.extra || k !== 'problem';
      aboutText.textContent = ` Include the program's version and computer (${Object.values(about).filter(Boolean).join(', ')})`;
      for (const b of visButtons) b.setAttribute('aria-checked', String(b.dataset.vis === this.visibility));
      for (const b of visButtons) b.tabIndex = b.dataset.vis === this.visibility ? 0 : -1;
      setInfo(visTip, VIS_TIP[this.visibility]);
      const src = this.file ? `data:${this.file.type};base64,${this.file.data}` : page;
      picLab.textContent = this.file ? `Attach ${this.file.name}` : 'Attach a picture of the current page';
      picBox.disabled = !src;
      picBox.checked = this.withPicture && !!src;
      thumb.hidden = !src;
      if (src && thumb.src !== src) thumb.src = src;
      picNote.textContent = this.visibility === 'public' && picBox.checked ? 'The picture will be public too.' : '';
    };
    const say = (text: string, error = false): void => {
      status.textContent = text;
      status.classList.toggle('error', error);
    };
    const read = (): Feedback => {
      this.draft.title = title.value;
      this.draft.details = details.value;
      this.draft.steps = steps.value;
      this.withAbout = aboutBox.checked;
      this.withExtra = extraBox.checked;
      try { if (relay) localStorage.setItem(EMAIL_KEY, email.value.trim()); } catch { /* no storage */ }
      const extra = this.extra && extraBox.checked && this.draft.kind === 'problem' ? this.extra : undefined;
      return { ...this.draft, about: aboutBox.checked ? about : undefined, extra };
    };
    const empty = (f: Feedback): boolean => !f.title.trim() && !f.details.trim() && !f.extra;
    show();

    const close = () => { read(); if (d.open) d.close(); };
    const sent = () => { this.draft = { kind: this.draft.kind, title: '', details: '', steps: '' }; this.extra = ''; this.file = null; this.withPicture = false; };
    const openOnGitHub = (f: Feedback): void => {
      const issue = feedbackIssue(f);
      const { url, cut } = issueUrl(issue);
      this.host.openWebPage(url);
      if (cut) {
        void this.host.copyText(feedbackText(issue), 'Copied the full text: paste it over the shortened text on GitHub.');
        say('This was too long to fill in completely, so the full text is on the clipboard: paste it into the issue on GitHub.');
        sent();
        return;
      }
      sent();
      if (d.open) d.close();
    };
    /** The window after a report went through: its number, and its page when public. */
    const done = (r: Sent): void => {
      sent();
      for (const el of [...form.children]) if (el !== h) el.remove();
      const ok = document.createElement('p');
      ok.className = 'feedback-sent';
      ok.textContent = '✓ Sent. Thank you!';
      const more = document.createElement('p');
      more.append(`It is report ${r.number}${r.visibility === 'private' ? ', which only the Chemweave team can read' : ''}. `);
      if (r.url) {
        const a = link('See it on GitHub', r.url);
        a.addEventListener('click', () => this.host.openWebPage(r.url!));
        more.append(a, '. ');
      }
      if (email.value.trim()) more.append(`Any reply goes to ${email.value.trim()}.`);
      const row2 = document.createElement('p');
      row2.className = 'ask-buttons';
      const again = document.createElement('button');
      again.type = 'button';
      again.textContent = 'Send Another';
      const shut = document.createElement('button');
      shut.type = 'button';
      shut.className = 'primary';
      shut.textContent = 'Close';
      row2.append(again, shut);
      form.append(ok, more, row2);
      again.addEventListener('click', () => { d.close(); this.open(); });
      shut.addEventListener('click', () => d.close());
      shut.focus();
    };
    let sending = false;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (sending) return;
      const f = read();
      if (empty(f)) { say('Write a title or a few words first.', true); details.focus(); return; }
      if (!relay) { openOnGitHub(f); return; }
      if (email.value.trim() && !email.checkValidity()) { say('That email address doesn’t look right.', true); email.focus(); return; }
      sending = true;
      send.disabled = true;
      send.textContent = 'Sending…';
      say('');
      const report = relayReport(f, this.visibility, email.value, picture());
      void (this.host.send ?? sendReport)(report, relay).then(done, (err: unknown) => {
        sending = false;
        send.disabled = false;
        send.textContent = 'Try Again';
        say(err instanceof Error ? err.message : String(err), true);
      });
    });
    github.addEventListener('click', () => {
      const f = read();
      if (empty(f)) { say('Write a title or a few words first.', true); details.focus(); return; }
      openOnGitHub(f);
    });
    mail.addEventListener('click', () => {
      const f = read();
      if (empty(f)) { say('Write a title or a few words first.', true); details.focus(); return; }
      this.host.openWebPage(mailUrl(feedbackIssue(f)));
    });
    copy.addEventListener('click', () => {
      const f = read();
      if (empty(f)) { say('Write a title or a few words first.', true); details.focus(); return; }
      void this.host.copyText(feedbackText(feedbackIssue(f)), 'Copied your feedback, ready to paste into an email or message.');
      sent();
      if (d.open) d.close();
    });
    for (const el of [title, details, steps, email]) el.addEventListener('input', () => say(''));
    cancel.addEventListener('click', close);
    d.addEventListener('cancel', () => read());
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
    (this.draft.title ? details : title).focus();
  }
}
