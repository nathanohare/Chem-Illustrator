// Chemweave feedback relay: a Cloudflare Worker that takes a report from Help ▸ Send Feedback
// and files it as a GitHub issue for the sender, so testers need no GitHub account.
//
// The sender picks who can read it: "private" files it in PRIVATE_REPO (only the team can read
// it), "public" files it in PUBLIC_REPO (the project's public issues). An email address left for a
// reply never appears on a public issue: it goes into a private note in PRIVATE_REPO that links to
// the public one. Pictures for private reports are committed to PRIVATE_REPO; pictures for public
// reports are kept here (in the FEEDBACK_KV store) and served from /img/<id>, so the public repo
// doesn't grow.
//
// Settings (wrangler.toml / Cloudflare dashboard):
//   GITHUB_TOKEN  secret: fine-grained token, both repos, Issues + Contents read and write
//   PUBLIC_REPO   e.g. nathanohare/Chem-Illustrator
//   PRIVATE_REPO  e.g. nathanohare/Chemweave-feedback
//   PAUSED        "1" turns sending off (the app then offers Copy Text and GitHub instead)
//   PER_HOUR      most reports one computer may send in an hour (default 5)
//   FEEDBACK_KV   KV namespace binding: rate counts and public pictures

const LIMITS = { title: 200, body: 30000, email: 200, picture: 3_000_000 /* bytes after decoding */ };
const KINDS = new Set(['idea', 'problem', 'comment']);
const PICTURE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Chemweave',
  'Access-Control-Max-Age': '86400',
};

function reply(status, data, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...headers } });
}
const refuse = (status, error) => reply(status, { error });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'GET' && url.pathname.startsWith('/img/')) return picture(url.pathname.slice(5), env);
    if (request.method === 'GET' && url.pathname === '/') return reply(200, { ok: true, paused: env.PAUSED === '1' });
    if (request.method !== 'POST' || url.pathname !== '/feedback') return refuse(404, 'Not found.');
    try {
      return await feedback(request, env);
    } catch (e) {
      console.error(e);
      return refuse(502, 'The report couldn’t be filed just now. Try again later, or use Copy Text.');
    }
  },
};

async function feedback(request, env) {
  if (env.PAUSED === '1') return refuse(503, 'Sending from the app is turned off for now. Use Copy Text or Open on GitHub instead.');
  if (request.headers.get('X-Chemweave') !== '1') return refuse(400, 'Reports can only be sent from Chemweave.');
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > LIMITS.picture * 1.4 + LIMITS.body * 4 + 10_000) return refuse(413, 'This report is too large. Try a smaller picture.');

  let r;
  try { r = await request.json(); } catch { return refuse(400, 'The report couldn’t be read.'); }
  const v = check(r);
  if (typeof v === 'string') return refuse(400, v);
  if (v.trap) return reply(200, { number: 0, visibility: v.visibility }); // filled-in hidden field: quietly drop it

  // a few reports per computer per hour
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const hour = Math.floor(Date.now() / 3_600_000);
  const key = `rate:${ip}:${hour}`;
  const used = Number((await env.FEEDBACK_KV.get(key)) ?? 0);
  const perHour = Number(env.PER_HOUR ?? 5);
  if (used >= perHour) return refuse(429, `That’s ${perHour} reports from this computer in the last hour. Please wait a while and send again.`);
  await env.FEEDBACK_KV.put(key, String(used + 1), { expirationTtl: 3700 });

  const gh = github(env.GITHUB_TOKEN);
  const isPublic = v.visibility === 'public';
  const repo = isPublic ? env.PUBLIC_REPO : env.PRIVATE_REPO;
  const id = crypto.randomUUID();

  let body = v.body;
  if (v.picture) {
    const link = isPublic ? await keepPublicPicture(env, id, v.picture, new URL(request.url).origin)
      : await commitPicture(gh, env.PRIVATE_REPO, id, v.picture);
    body += `\n\n**Picture**\n\n![${v.picture.name.replace(/[[\]]/g, '')}](${link})`;
  }
  if (!isPublic && v.email) body += `\n\n**Reply to:** ${v.email}`;

  const issue = await gh.issue(repo, v.title, body, ['from-app', LABEL[v.kind]]);
  if (isPublic && v.email) {
    await gh.issue(env.PRIVATE_REPO, `Contact for ${repo}#${issue.number}`,
      `The sender of ${issue.html_url} left an email for a reply: ${v.email}\n\n(Kept here so it isn’t shown publicly.)`, ['contact']);
  }
  return reply(200, { number: issue.number, visibility: v.visibility, url: isPublic ? issue.html_url : undefined });
}

const LABEL = { idea: 'enhancement', problem: 'bug', comment: 'question' };

/** The report, checked and tidied, or what is wrong with it. */
export function check(r) {
  if (!r || typeof r !== 'object') return 'The report is empty.';
  const str = (x) => (typeof x === 'string' ? x : '');
  const kind = KINDS.has(r.kind) ? r.kind : 'comment';
  const visibility = r.visibility === 'public' ? 'public' : 'private';
  const title = str(r.title).replace(/\s+/g, ' ').trim().slice(0, LIMITS.title);
  const body = str(r.body).slice(0, LIMITS.body);
  if (!title && !body.trim()) return 'Write a title or a few words first.';
  let email = str(r.email).trim();
  if (email.length > LIMITS.email || (email && !/^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/.test(email))) return 'That email address doesn’t look right.';
  let picture = null;
  if (r.picture) {
    const type = str(r.picture.type);
    const data = str(r.picture.data);
    if (!PICTURE_TYPES[type]) return 'Pictures can be PNG, JPEG, GIF or WebP.';
    if (!/^[A-Za-z0-9+/]+=*$/.test(data)) return 'The picture couldn’t be read.';
    if (data.length * 0.75 > LIMITS.picture) return 'The picture is too large (3 MB at most).';
    picture = { type, data, name: str(r.picture.name).slice(0, 80) || 'picture' };
  }
  return { kind, visibility, title: title || 'Feedback from the app', body, email, picture, trap: !!str(r.website) };
}

function github(token) {
  const call = async (method, path, data) => {
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'chemweave-feedback-relay',
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    const out = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, out };
  };
  return {
    async issue(repo, title, body, labels) {
      let r = await call('POST', `/repos/${repo}/issues`, { title, body, labels });
      // labels the token may not create: file it without them rather than lose the report
      if (!r.ok && r.status === 422) r = await call('POST', `/repos/${repo}/issues`, { title, body });
      if (!r.ok) throw new Error(`GitHub ${r.status}: ${JSON.stringify(r.out).slice(0, 300)}`);
      return r.out;
    },
    async put(repo, path, base64, message) {
      const r = await call('PUT', `/repos/${repo}/contents/${path}`, { message, content: base64 });
      if (!r.ok) throw new Error(`GitHub ${r.status}: ${JSON.stringify(r.out).slice(0, 300)}`);
      return r.out;
    },
  };
}

async function commitPicture(gh, repo, id, p) {
  const month = new Date().toISOString().slice(0, 7);
  const path = `pictures/${month}/${id}.${PICTURE_TYPES[p.type]}`;
  const out = await gh.put(repo, path, p.data, `Picture for a report from the app`);
  // the file's page with ?raw=true shows the picture to anyone signed in who can read the repo
  return `${out.content?.html_url ?? `https://github.com/${repo}/blob/main/${path}`}?raw=true`;
}

async function keepPublicPicture(env, id, p, origin) {
  const bytes = Uint8Array.from(atob(p.data), (c) => c.charCodeAt(0));
  await env.FEEDBACK_KV.put(`img:${id}`, bytes, { metadata: { type: p.type } });
  return `${origin}/img/${id}`;
}

async function picture(id, env) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const { value, metadata } = await env.FEEDBACK_KV.getWithMetadata(`img:${id}`, { type: 'arrayBuffer' });
  if (!value) return new Response('Not found', { status: 404 });
  return new Response(value, { headers: { 'Content-Type': metadata?.type ?? 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
}
