// Help > Send Feedback: the issue it fills in on GitHub, and the text it copies.

import { describe, it, expect } from 'vitest';
import { feedbackIssue, issueUrl, feedbackText, computerName, REPO_URL } from '../src/feedback';

describe('the issue', () => {
  it('names the kind in the title and gives the details, steps and program', () => {
    const i = feedbackIssue({
      kind: 'problem', title: 'Wedges flip on paste', details: 'Pasting from ChemDraw turns wedges into hashes.',
      steps: '1. Copy in ChemDraw\n2. Paste', about: { Version: 'Version 0.1.80', Computer: 'Windows 10 or 11', Mode: 'drawing' },
    });
    expect(i.title).toBe('[Bug] Wedges flip on paste');
    expect(i.body).toContain('**Problem (bug)**');
    expect(i.body).toContain('Pasting from ChemDraw turns wedges into hashes.');
    expect(i.body).toContain('**Steps to make it happen**\n\n1. Copy in ChemDraw\n2. Paste');
    expect(i.body).toContain('- Version: Version 0.1.80\n- Computer: Windows 10 or 11\n- Mode: drawing');
  });
  it('leaves out steps for an idea, and the program when it is not wanted', () => {
    const i = feedbackIssue({ kind: 'idea', title: 'NMR tables', details: 'A table maker for NMR data.', steps: 'ignored' });
    expect(i.title).toBe('[Feature] NMR tables');
    expect(i.body).not.toContain('Steps');
    expect(i.body).not.toContain('About the program');
  });
  it('takes a title from the details when none is typed', () => {
    expect(feedbackIssue({ kind: 'comment', title: '  ', details: 'Love the dark page.\nThanks!' }).title).toBe('[Feedback] Love the dark page.');
    const long = feedbackIssue({ kind: 'idea', title: '', details: 'Please add a way to number every compound in a scheme by the order they appear in the text' }).title;
    expect(long.length).toBeLessThan(75);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('the GitHub address', () => {
  it('fills in the new issue page', () => {
    const { url, cut } = issueUrl({ title: 'A & B', body: 'x = 1\n2' });
    expect(cut).toBe(false);
    expect(url).toBe(`${REPO_URL}/issues/new?title=A%20%26%20B&body=x%20%3D%201%0A2`);
    const u = new URL(url);
    expect(u.searchParams.get('title')).toBe('A & B');
    expect(u.searchParams.get('body')).toBe('x = 1\n2');
  });
  it('cuts very long text to fit, with a note, without breaking a character', () => {
    const body = 'α→β '.repeat(3000);
    const { url, cut } = issueUrl({ title: 'Long', body }, 4000);
    expect(cut).toBe(true);
    expect(url.length).toBeLessThanOrEqual(4000);
    const got = new URL(url).searchParams.get('body')!;
    expect(got).toContain('was cut here');
    expect(body.startsWith(got.slice(0, got.indexOf('\n\n_(')))).toBe(true);
  });
});

describe('copied text', () => {
  it('reads as plain text', () => {
    const t = feedbackText(feedbackIssue({ kind: 'idea', title: 'X', details: 'Y' }));
    expect(t).toMatch(/^\[Feature\] X\n\nFeature request\n\nY\n/);
    expect(t).not.toContain('**');
    expect(t).toContain('Sent from Chemweave');
  });
});

describe('the computer', () => {
  it('is named from the browser description', () => {
    expect(computerName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe('Windows 10 or 11');
    expect(computerName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macOS');
    expect(computerName('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux');
  });
});

import { relayReport, pictureFromDataUrl, sendReport, mailUrl } from '../src/feedback';

describe('sending through the relay', () => {
  const f = { kind: 'problem' as const, title: 'Wedge flips', details: 'It flips after Clean Up.' };
  it('sends the same title and text as the GitHub issue, with who can read it', () => {
    const r = relayReport(f, 'public', '  me@lab.edu ', null);
    expect(r).toMatchObject({ kind: 'problem', visibility: 'public', title: '[Bug] Wedge flips', email: 'me@lab.edu' });
    expect(r.body).toContain('It flips after Clean Up.');
    expect(r.picture).toBeUndefined();
    expect(relayReport(f, 'private', '   ').email).toBeUndefined();
  });
  it('takes PNG and JPEG pictures, not other data', () => {
    expect(pictureFromDataUrl('data:image/png;base64,iVBORw0KGgo=', 'page.png')).toEqual({ name: 'page.png', type: 'image/png', data: 'iVBORw0KGgo=' });
    expect(pictureFromDataUrl('data:text/html;base64,PGI+', 'x')).toBeNull();
    expect(pictureFromDataUrl(`data:image/png;base64,${'A'.repeat(4_100_000)}`, 'big')).toBeNull();
  });
  it('posts to the relay and gives back the report number', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ number: 7, visibility: 'public', url: 'https://github.com/x/y/issues/7' }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await sendReport(relayReport(f, 'public'), 'https://relay.example/', fake);
    expect(out).toEqual({ number: 7, visibility: 'public', url: 'https://github.com/x/y/issues/7' });
    expect(seen!.url).toBe('https://relay.example/feedback');
    expect((seen!.init.headers as Record<string, string>)['X-Chemweave']).toBe('1');
    expect(JSON.parse(String(seen!.init.body)).visibility).toBe('public');
  });
  it('shows the relay\'s own words when it refuses, and a plain message when offline', async () => {
    const refused = (async () => new Response(JSON.stringify({ error: 'Please wait a while.' }), { status: 429 })) as unknown as typeof fetch;
    await expect(sendReport(relayReport(f, 'private'), 'https://r.example', refused)).rejects.toThrow('Please wait a while.');
    const offline = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(sendReport(relayReport(f, 'private'), 'https://r.example', offline)).rejects.toThrow(/no internet connection/);
    await expect(sendReport(relayReport(f, 'private'), '', offline)).rejects.toThrow(/isn’t set up/);
  });
  it('fills in an email, cutting very long text', () => {
    const issue = { title: '[Bug] Wedge flips', body: 'x'.repeat(5000) };
    const url = mailUrl(issue, 'team@lab.edu');
    expect(url.startsWith('mailto:team@lab.edu?subject=%5BBug%5D%20Wedge%20flips&body=')).toBe(true);
    expect(url.length).toBeLessThanOrEqual(1800 + 200);
    expect(decodeURIComponent(url)).toContain('cut short');
  });
});
