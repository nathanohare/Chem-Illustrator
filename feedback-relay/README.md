# Feedback relay

**Help ▸ Send Feedback ▸ Send** posts the report here. This small [Cloudflare Worker](https://developers.cloudflare.com/workers/) files it as a GitHub issue for the sender, so testers need no GitHub account.

- **Only the Chemweave team** (the default) files it in the private repo `nathanohare/Chemweave-feedback`.
- **Everyone (public on GitHub)** files it in the public repo. An email left for a reply never goes on a public issue: it goes in a private note (an issue titled "Contact for …#N" in the private repo).
- Pictures: for private reports they are committed to the private repo under `pictures/`; for public reports they are kept by the relay and served from `/img/<id>`, so the public repo doesn't grow.
- Every issue gets the `from-app` label, plus `bug`, `enhancement` or `question`.

It costs nothing: Cloudflare's free plan allows 100,000 requests a day, and the KV store it uses for pictures and rate counts is free up to 1 GB.

## Spam and safety

- Reports must come from the app (it sends an `X-Chemweave` header), with size limits on the text and a 3 MB limit on pictures.
- At most `PER_HOUR` reports (default 5) from one internet address per hour.
- A hidden form field that only robots fill in; those reports are dropped quietly.
- The GitHub token lives only in Cloudflare, never in the app, and can only touch these two repos.
- To switch sending off, set `PAUSED` to `1` (Cloudflare dashboard ▸ the worker ▸ Settings ▸ Variables). The app then tells people to use Copy Text or Open on GitHub.

## Setting it up (about 10 minutes, once)

### 1. A GitHub token

In a web browser (the GitHub phone app doesn't have this), open <https://github.com/settings/personal-access-tokens/new>. Or click through: your picture (top right) ▸ **Settings** ▸ at the very bottom of the left-hand list, **Developer settings ▸ Personal access tokens ▸ Fine-grained tokens ▸ Generate new token**.

- **Token name**: Chemweave feedback relay
- **Expiration**: the longest offered (when it runs out, Send says it can't send and people can still use Copy Text; make a new token and put it in as in step 3)
- **Repository access**: Only select repositories: `Chemweave` and `Chemweave-feedback`
- **Permissions ▸ Repository permissions**: **Issues**: Read and write; **Contents**: Read and write (used only on the private repo, for pictures)

Click **Generate token** and copy it (it is shown only once). Don't send it to anyone.

### 2. A Cloudflare account

Sign up free at <https://dash.cloudflare.com/sign-up> (no card needed).

### 3. Put the relay on Cloudflare

**Either from the command line** (needs Node.js), in this folder:

```sh
npx wrangler login                               # opens the browser to sign in to Cloudflare
npx wrangler kv namespace create FEEDBACK_KV     # prints an id: paste it into wrangler.toml
npx wrangler secret put GITHUB_TOKEN             # paste the token from step 1 when asked
npx wrangler deploy                              # prints the relay's address
```

**Or in the Cloudflare dashboard only:**

1. **Storage & databases ▸ Workers KV ▸ Create instance**, named `FEEDBACK_KV`.
2. **Compute ▸ Workers & Pages ▸ Create ▸ Start with Hello World**, named `chemweave-feedback`, then **Deploy**.
3. **Edit code**: replace everything with the contents of `worker.js`, then **Deploy**.
4. The worker's **Settings ▸ Bindings ▸ Add ▸ KV namespace**: variable name `FEEDBACK_KV`, the namespace from step 1.
5. **Settings ▸ Variables and Secrets ▸ Add**: text `PUBLIC_REPO` = `nathanohare/Chemweave`, text `PRIVATE_REPO` = `nathanohare/Chemweave-feedback`, text `PER_HOUR` = `5`, and secret `GITHUB_TOKEN` = the token from step 1.

The relay's address looks like `https://chemweave-feedback.<your-account>.workers.dev`. Opening it in a browser shows `{"ok":true,"paused":false}`.

### 4. Point the app at it

The app's relay is `https://chemweave-feedback.npo0001.workers.dev`. A new address goes in `RELAY_URL` in `src/feedback.ts` and in `connect-src` in `src-tauri/tauri.conf.json` (the desktop app may only reach addresses listed there).

## Tests

`tests/feedback-relay.test.ts` runs the worker with a stand-in for GitHub and the KV store (`npx vitest run tests/feedback-relay.test.ts`).
