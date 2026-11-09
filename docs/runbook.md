# Runbook

One-time setup, deploys and rollbacks. The design behind all of this is in [tech-spec.md](tech-spec.md).

## Local development

| Command                                   | What runs                                                       | URL                   |
| ----------------------------------------- | --------------------------------------------------------------- | --------------------- |
| `pnpm dev:home`                           | Directory site (Astro dev server)                               | http://localhost:4321 |
| `pnpm --filter @teamtoolbox/home preview` | Built directory site through Wrangler, with the real `_headers` | http://localhost:4322 |
| `pnpm dev:rooms`                          | Rooms service                                                   | ws://localhost:8787   |
| `pnpm dev:ads`                            | Ads service                                                     | http://localhost:8788 |
| `pnpm --filter @teamtoolbox/retro dev`    | Retro, talking to the local rooms and ads services              | http://localhost:5173 |

To try a tool as several people, open it on two ports, so each has its own storage. For example, run a second copy with `pnpm --filter @teamtoolbox/retro exec vite --port 5175`. The `.claude/launch.json` configurations set this up, including a rooms service that accepts both ports.

- Local runtimes can't pin Durable Objects to a jurisdiction, so `dev:rooms` and the rooms tests set `ROOM_JURISDICTION=none`. Deployed Workers never set it, and a missing value means EU.
- Astro and Wrangler telemetry are switched off in the scripts and in CI (`ASTRO_TELEMETRY_DISABLED`, `send_metrics: false`, `WRANGLER_SEND_METRICS=false`).
- pnpm only runs install scripts for packages listed under `allowBuilds` in `pnpm-workspace.yaml`. It also refuses versions published in the last day or so; when a brand-new release is blocked, widen the version range instead of adding an exception.

## One-time Cloudflare setup

### 1. Move DNS to Cloudflare

1. Create a Cloudflare account and add `teamtoolbox.org` on the **Free** plan.
2. Review the DNS records Cloudflare imports. Keep anything you rely on, especially email records.
3. If DNSSEC is on at the registrar, **turn it off first**, or the domain stops resolving during the switch.
4. At the registrar, replace the nameservers with the two Cloudflare shows. Wait until the zone shows as **Active**.
5. Turn on DNSSEC in Cloudflare (DNS → Settings) and add the DS record it gives you at the registrar.

`teamtoolbox.org` is registered at Name.com, and its DS record is managed there under Account → DNSSEC. To check that DNSSEC validates, run `dig +dnssec teamtoolbox.org @1.1.1.1` and look for the `ad` flag.

### 2. Zone settings

| Where in the dashboard      | Setting                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| SSL/TLS → Edge Certificates | Always Use HTTPS: on. Minimum TLS version: 1.2                                                                     |
| SSL/TLS → Edge Certificates | HSTS: on, with `includeSubDomains`, once every site works over HTTPS. Submit to hstspreload.org later              |
| Speed → Optimization        | Rocket Loader: **off**                                                                                             |
| Scrape Shield               | Email Address Obfuscation: **off**                                                                                 |
| Web Analytics               | No automatic setup for this zone (it would inject a script into tool pages)                                        |
| Zaraz                       | Off                                                                                                                |
| Security → Bots             | Bot Fight Mode: **off** (it injects detection scripts)                                                             |
| Rules → Redirect Rules      | Use the template "Redirect from WWW to root" (301). It needs a proxied DNS record for `www`, e.g. `AAAA www 100::` |

The script-injecting features must stay off because tool pages promise that no third-party code runs on them. Their CSP would block those scripts anyway, but they'd still cause errors.

### 3. Email

The domain has no mailboxes, only forwarding (spec §10.3):

- **Email Routing** forwards `security@` and `privacy@` to a personal inbox. The catch-all rule is off, so mail to any other address isn't delivered.
- Turning on Email Routing adds its own MX, SPF and DKIM records. Leave them as they are.
- Keep `TXT _dmarc "v=DMARC1; p=reject"`, so nobody can send mail as `@teamtoolbox.org`.

To forward somewhere else, add and verify the new inbox under Email Routing → Destination addresses, then edit both routing rules.

### 4. Workers account setup

Two one-time steps, or the first deploy fails:

- **workers.dev subdomain:** open Workers & Pages in the dashboard once, which creates it. Without it, Cloudflare rejects deploys with error 10063, even though production doesn't serve from workers.dev. Previews and staging do. This account's subdomain is `amoritan.workers.dev`.
- **Analytics Engine:** turn it on under Storage & databases → Analytics Engine. The ads service writes its view and click counts there, and Cloudflare rejects its deploy with error 10089 until it's on. It's included in the Free plan.

### 5. First deploy

The simplest way is to approve the Deploy workflow's `production` run, which starts on every push to `main`. It deploys the services first, then the site.

To deploy from your machine instead, log in once with `pnpm --filter @teamtoolbox/rooms exec wrangler login`, then deploy the services before the site:

```bash
pnpm --filter @teamtoolbox/rooms deploy
```

```bash
pnpm --filter @teamtoolbox/ads deploy
```

```bash
pnpm --filter @teamtoolbox/home deploy
```

Each Worker's `routes` entry creates its DNS record and TLS certificate on first deploy, so the zone must be active first. Then check:

- https://teamtoolbox.org loads, and https://www.teamtoolbox.org redirects to it
- https://rooms.teamtoolbox.org/health and https://ads.teamtoolbox.org/health return `ok`

## GitHub setup

1. Create the public repository and push `main`.
2. **Environments** (Settings → Environments): create `production` (optionally with yourself as required reviewer) and `preview`.
3. **Cloudflare API token:** in Cloudflare, My Profile → API Tokens → Create Token → template "Edit Cloudflare Workers". Restrict it to your account and the `teamtoolbox.org` zone.
4. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as **environment secrets** on both environments, not as repository secrets.
5. **Branch protection** on `main`: require the `CI / check` status.
6. **Security** (Settings → Code security): turn on private vulnerability reporting, secret scanning with push protection, Dependabot alerts and Dependabot security updates. Weekly version updates for `npm` and `github-actions` are set up in `.github/dependabot.yml`. Consider pinning actions to commit SHAs.
7. The repository URL lives in `SITE_LINKS.source` in `packages/registry/src/index.ts`. Every footer and page that links to the code reads it from there, so if the repository moves, change it there.

## Workflows

| Workflow      | Trigger                        | What it does                                                                                                                                    |
| ------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`      | Every PR and push to `main`    | Biome, headers check, typecheck, tests, build                                                                                                   |
| `preview.yml` | PRs from branches in this repo | Uploads preview versions of changed apps (`pr-<number>` alias) and deploys changed services to staging. Fork PRs are skipped and get no secrets |
| `deploy.yml`  | Push to `main`                 | Re-runs checks and tests, then deploys every changed app and service, plus anything that depends on a changed package                           |

Both deploying workflows go through `scripts/deploy-changed.ts`. It runs services before apps, one at a time, and a failed deploy doesn't stop the others. The job still fails if any of them did, and the log ends with which ones.

Preview URLs are printed in the workflow log.

## Staging

`rooms` and `ads` have a `staging` environment (`wrangler deploy --env staging`). It runs on `workers.dev` with its own Durable Objects and dataset.

Staging accepts browser origins on any `.workers.dev` host. Once you know your account's workers.dev subdomain, narrow `ALLOWED_HOST_SUFFIXES` in both `wrangler.jsonc` files to `.<your-subdomain>.workers.dev`.

## Rollback

```bash
pnpm --filter @teamtoolbox/rooms exec wrangler rollback
```

Use the same command with `@teamtoolbox/ads` or `@teamtoolbox/home`, or pick an earlier version under Workers → the Worker → Deployments in the dashboard.

The rooms service stores data, so a rollback never undoes Durable Object migrations. Migrations must stay backward compatible.

## Before launch

- [ ] Review the privacy policy and terms, then remove `draft` from both pages
- [x] Publish the repository link (GitHub setup, step 7)
- [x] Decide on email (above) and add a contact to the about page
- [ ] Switch to Workers Paid (~$5/month) before any launch push
- [ ] Apply for AdSense for the directory site once the guide content exists (spec §11.2)
- [ ] Turn on HSTS, then submit to the preload list

## Tool apps

- **CSP:** each tool app ships its production CSP in `public/_headers`, and `check:headers` checks it.
- **Service URLs:** `scripts/tool-app-vite.ts` sets the rooms and ads URLs for each build:
  - the dev server uses the local services;
  - production builds use `rooms.` and `ads.teamtoolbox.org`;
  - preview builds (`TTB_PREVIEW=1`, set by `preview:upload`) use `rooms-staging` and `ads-staging` on `amoritan.workers.dev`, and rewrite exactly those two origins in `dist/_headers`.
- **Previews need staging:** a tool's preview only works once the staging services are deployed. That happens on the first PR that changes `services/rooms` or `services/ads`, or by hand:

  ```bash
  pnpm --filter @teamtoolbox/rooms exec wrangler deploy --env staging
  ```

  ```bash
  pnpm --filter @teamtoolbox/ads exec wrangler deploy --env staging
  ```

- **Domains:** add each tool's subdomain to its `wrangler.jsonc` `routes`. The first deploy creates the DNS record and certificate.
- **Going live:** a tool shows as "Coming soon" on the directory until its registry status moves from `soon` to `beta` or `live`.
