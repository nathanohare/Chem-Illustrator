// The feedback relay (feedback-relay/worker.js): files a report from Send Feedback as an issue in
// the private or public repo, keeps the email off public issues, and turns away spam.
import { describe, it, expect, beforeEach, vi } from 'vitest';
// @ts-expect-error plain JavaScript (it runs on Cloudflare, not in the app)
import worker, { check } from '../feedback-relay/worker.js';

class Kv {
  m = new Map<string, { v: unknown; meta?: unknown }>();
  async get(k: string) { return (this.m.get(k)?.v as string) ?? null; }
  async put(k: string, v: unknown, o?: { metadata?: unknown }) { this.m.set(k, { v, meta: o?.metadata }); }
  async getWithMetadata(k: string) { const e = this.m.get(k); return { value: e?.v ?? null, metadata: e?.meta ?? null }; }
}

let calls: { url: string; body: Record<string, unknown> }[];
let env: Record<string, unknown>;
beforeEach(() => {
  calls = [];
  env = { GITHUB_TOKEN: 't', PUBLIC_REPO: 'o/public', PRIVATE_REPO: 'o/private', PAUSED: '0', PER_HOUR: '2', FEEDBACK_KV: new Kv() };
  let n = 100;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body ?? '{}'));
    calls.push({ url, body });
    if (url.includes('/contents/')) return new Response(JSON.stringify({ content: { html_url: `https://github.com/o/private/blob/main/${url.split('/contents/')[1]}` } }), { status: 201 });
    n += 1;
    return new Response(JSON.stringify({ number: n, html_url: `https://github.com/${url.split('/repos/')[1].replace('/issues', '')}/issues/${n}` }), { status: 201 });
  });
});

const post = (report: unknown, headers: Record<string, string> = { 'X-Chemweave': '1' }) =>
  worker.fetch(new Request('https://relay.example/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', ...headers }, body: JSON.stringify(report) }), env);

const png = { name: 'page.png', type: 'image/png', data: 'iVBORw0KGgo=' };

describe('the relay', () => {
  it('files a private report in the private repo, with the email and the picture committed there', async () => {
    const res = await post({ kind: 'problem', visibility: 'private', title: '[Bug] Wedge', body: 'Flips.', email: 'me@lab.edu', picture: png });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ number: 101, visibility: 'private' });
    expect(calls[0].url).toContain('/repos/o/private/contents/pictures/');
    expect(calls[1].url).toBe('https://api.github.com/repos/o/private/issues');
    expect(calls[1].body.body).toContain('**Reply to:** me@lab.edu');
    expect(calls[1].body.body).toContain('?raw=true)');
    expect(calls[1].body.labels).toEqual(['from-app', 'bug']);
  });
  it('files a public report publicly, keeping the email in a private note and the picture in the relay', async () => {
    const res = await post({ kind: 'idea', visibility: 'public', title: '[Feature] Tables', body: 'Please.', email: 'me@lab.edu', picture: png });
    const out = await res.json();
    expect(out).toMatchObject({ number: 101, visibility: 'public', url: 'https://github.com/o/public/issues/101' });
    const pub = calls.find((c) => c.url.includes('/repos/o/public/issues'))!;
    expect(pub.body.body).not.toContain('me@lab.edu');
    expect(pub.body.body).toMatch(/!\[page\.png\]\(https:\/\/relay\.example\/img\/[0-9a-f-]{36}\)/);
    const note = calls.find((c) => c.url.includes('/repos/o/private/issues'))!;
    expect(note.body.body).toContain('me@lab.edu');
    expect(note.body.title).toBe('Contact for o/public#101');
    // the picture is served back
    const id = /img\/([0-9a-f-]{36})/.exec(String(pub.body.body))![1];
    const img = await worker.fetch(new Request(`https://relay.example/img/${id}`), env);
    expect(img.headers.get('Content-Type')).toBe('image/png');
  });
  it('turns away reports not from the app, too many from one computer, and when paused', async () => {
    expect((await post({ title: 'x' }, {})).status).toBe(400);
    expect((await post({ title: 'a' })).status).toBe(200);
    expect((await post({ title: 'b' })).status).toBe(200);
    expect((await post({ title: 'c' })).status).toBe(429);
    env.PAUSED = '1';
    expect((await post({ title: 'd' })).status).toBe(503);
  });
  it('quietly drops a report whose hidden field was filled in (a spam robot)', async () => {
    const res = await post({ title: 'Buy now', body: 'spam', website: 'http://spam.example' });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });
  it('files the report without labels when GitHub refuses them', async () => {
    let first = true;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      if (first) { first = false; return new Response('{}', { status: 422 }); }
      return new Response(JSON.stringify({ number: 5, html_url: 'u' }), { status: 201 });
    });
    const res = await post({ title: 'x', body: 'y' });
    expect(res.status).toBe(200);
    expect(calls[1].body.labels).toBeUndefined();
  });
  it('checks the report', () => {
    expect(check({ title: '', body: ' ' })).toBe('Write a title or a few words first.');
    expect(check({ title: 'x', email: 'not an email' })).toBe('That email address doesn’t look right.');
    expect(check({ title: 'x', picture: { type: 'image/svg+xml', data: 'AA==' } })).toBe('Pictures can be PNG, JPEG, GIF or WebP.');
    expect(check({ title: 'x', visibility: 'anything' })).toMatchObject({ visibility: 'private', kind: 'comment' });
  });
});

describe('relay set-up problems', () => {
  it('says what is missing, and which GitHub step failed', async () => {
    delete env.FEEDBACK_KV;
    const a = await (await post({ title: 'x' })).json();
    expect(a.setup).toBe('missing: FEEDBACK_KV');
    env.FEEDBACK_KV = new Kv();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 }));
    const res = await post({ title: 'x' });
    expect(res.status).toBe(502);
    expect((await res.json()).detail).toBe('GitHub 401 filing an issue in o/private: Bad credentials');
  });
});
