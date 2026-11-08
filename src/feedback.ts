// Help > Send Feedback: a comment, idea or problem written in the program. Send passes it to the
// feedback relay (feedback-relay/worker.js), which files it as an issue for the sender, so no GitHub
// account is needed; the sender picks whether only the Chemweave team or everyone can read it.
// It can also be opened as a new issue on GitHub (the person's own browser, to check and submit),
// put in an email, or copied as plain text.

export const REPO_URL = 'https://github.com/nathanohare/Chem-Illustrator';
/**
 * The feedback relay's address (a Cloudflare Worker, see feedback-relay/README.md). Empty turns
 * Send off: the window then offers Open on GitHub as its main button, as before. A build can point
 * it elsewhere with VITE_FEEDBACK_RELAY.
 */
export const RELAY_URL: string = (import.meta.env?.VITE_FEEDBACK_RELAY as string | undefined) ?? 'https://chemweave-feedback.npo0001.workers.dev';
/** Where Email… addresses the message; empty leaves the To line for the person to fill in. */
export const FEEDBACK_EMAIL = '';
export const GUIDE_URL = `${REPO_URL}/blob/main/docs/README.md`;

export type FeedbackKind = 'idea' | 'problem' | 'comment';

export const KIND_NAMES: Record<FeedbackKind, string> = {
  idea: 'Feature request',
  problem: 'Problem (bug)',
  comment: 'Comment or question',
};

/** What a title starts with, so the kinds sort themselves on GitHub. */
const KIND_TAG: Record<FeedbackKind, string> = { idea: 'Feature', problem: 'Bug', comment: 'Feedback' };

export interface Feedback {
  kind: FeedbackKind;
  title: string;
  details: string;
  /** For a problem: what was done, step by step, so it can be made to happen again. */
  steps?: string;
  /** The program's version, the computer and the mode, when the person leaves them in. */
  about?: Record<string, string>;
  /** What the program wrote down about an error (src/diagnostics.ts), when the person leaves it in. */
  extra?: string;
}

export interface Issue { title: string; body: string }

/** The issue's title and text, in Markdown (GitHub shows it formatted; it reads fine as plain text too). */
export function feedbackIssue(f: Feedback): Issue {
  const title = `[${KIND_TAG[f.kind]}] ${f.title.trim() || firstWords(f.details) || KIND_NAMES[f.kind]}`;
  const parts: string[] = [];
  const details = f.details.trim();
  parts.push(`**${KIND_NAMES[f.kind]}**`, '', details || '_(no details given)_');
  if (f.kind === 'problem' && f.steps?.trim()) parts.push('', '**Steps to make it happen**', '', f.steps.trim());
  if (f.extra?.trim()) parts.push('', '**Error details**', '', '```', f.extra.trim().replace(/```/g, '``\u200b`'), '```');
  const about = Object.entries(f.about ?? {}).filter(([, v]) => v);
  if (about.length) parts.push('', '**About the program**', '', ...about.map(([k, v]) => `- ${k}: ${v}`));
  parts.push('', '_Sent from Chemweave (Help ▸ Send Feedback)._');
  return { title, body: parts.join('\n') };
}

/** The first few words of the details, for a title when none was typed. */
function firstWords(s: string, max = 60): string {
  const line = s.trim().split(/\r?\n/)[0] ?? '';
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 30 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

/**
 * The address of GitHub's New Issue page with the title and text filled in. Browsers and GitHub
 * refuse very long addresses, so text past `maxLength` characters is cut, with a note saying so
 * (`cut` is then true, and the window offers to copy the whole text to paste in instead).
 */
export function issueUrl(issue: Issue, maxLength = 7000): { url: string; cut: boolean } {
  const base = `${REPO_URL}/issues/new?title=${encodeURIComponent(issue.title)}&body=`;
  const full = base + encodeURIComponent(issue.body);
  if (full.length <= maxLength) return { url: full, cut: false };
  const note = '\n\n_(The text was too long to send this way and was cut here: paste the full text from the program over this.)_';
  const room = maxLength - base.length - encodeURIComponent(note).length;
  // cut by characters until the encoded text fits (encoding can make one character up to 12 long)
  let body = issue.body;
  let lo = 0, hi = body.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (encodeURIComponent(body.slice(0, mid)).length <= room) lo = mid; else hi = mid - 1;
  }
  body = body.slice(0, lo);
  // don't split a surrogate pair
  if (/[\uD800-\uDBFF]$/.test(body)) body = body.slice(0, -1);
  return { url: base + encodeURIComponent(body + note), cut: true };
}

/** The feedback as plain text, to paste into an email or message. */
export function feedbackText(issue: Issue): string {
  return `${issue.title}\n\n${issue.body.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^_(.*)_$/gm, '$1')}\n`;
}

/** The computer the program is running on, in a few words (from the browser's description of itself). */
export function computerName(userAgent: string): string {
  if (/Windows NT 10/.test(userAgent)) return 'Windows 10 or 11';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(userAgent)) return 'macOS';
  if (/Android/.test(userAgent)) return 'Android';
  if (/iPhone|iPad/.test(userAgent)) return 'iOS';
  if (/Linux/.test(userAgent)) return 'Linux';
  return 'unknown';
}

/** Who can read a report sent through the relay. */
export type Visibility = 'private' | 'public';

export interface Picture { name: string; type: string; /** base64, without the data: prefix */ data: string }

/** What Send passes to the relay. */
export interface RelayReport {
  kind: FeedbackKind;
  visibility: Visibility;
  title: string;
  body: string;
  email?: string;
  picture?: Picture;
}

/** The largest picture the relay takes (bytes). */
export const PICTURE_LIMIT = 3_000_000;

/** A data: URL as a picture to send, or null when it isn't one the relay takes. */
export function pictureFromDataUrl(url: string, name: string): Picture | null {
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(url);
  if (!m || m[2].length * 0.75 > PICTURE_LIMIT) return null;
  return { name, type: m[1], data: m[2] };
}

/** The report for the relay: the same title and text as the GitHub issue. */
export function relayReport(f: Feedback, visibility: Visibility, email?: string, picture?: Picture | null): RelayReport {
  const { title, body } = feedbackIssue(f);
  return { kind: f.kind, visibility, title, body, ...(email?.trim() ? { email: email.trim() } : {}), ...(picture ? { picture } : {}) };
}

/** What the relay answered: the report's number, and its page when it is public. */
export interface Sent { number: number; visibility: Visibility; url?: string }

/**
 * Send a report through the relay. Throws an Error whose message can be shown as it is (the relay's
 * own words when it refused the report, or a plain one when it couldn't be reached).
 */
export async function sendReport(report: RelayReport, relay = RELAY_URL, fetcher: typeof fetch = fetch, timeoutMs = 30000): Promise<Sent> {
  if (!relay) throw new Error('Sending from the app isn’t set up yet. Use Open on GitHub or Copy Text.');
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetcher(`${relay.replace(/\/$/, '')}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Chemweave': '1' },
      body: JSON.stringify(report),
      signal: stop.signal,
    });
  } catch {
    throw new Error('Couldn’t send (no internet connection?). Your text is kept: try again, or Copy Text to send it another way.');
  } finally {
    clearTimeout(timer);
  }
  const out = await res.json().catch(() => ({})) as Partial<Sent> & { error?: string };
  if (!res.ok || typeof out.number !== 'number') throw new Error(out.error || `Couldn’t send (the feedback service answered ${res.status}). Your text is kept: try again later, or Copy Text.`);
  return { number: out.number, visibility: out.visibility === 'public' ? 'public' : 'private', url: out.url };
}

/** A mailto: address with the feedback filled in (long text is cut, as mail programs refuse very long addresses). */
export function mailUrl(issue: Issue, to = FEEDBACK_EMAIL, maxLength = 1800): string {
  const text = feedbackText(issue).split('\n').slice(2).join('\n');
  const base = `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?subject=${encodeURIComponent(issue.title)}&body=`;
  let body = text;
  while (body && (base + encodeURIComponent(body)).length > maxLength) body = body.slice(0, Math.floor(body.length * 0.9));
  if (body.length < text.length) body = `${body.trimEnd()}\n\n(cut short: use Copy Text in Chemweave for the rest)`;
  return base + encodeURIComponent(body);
}
