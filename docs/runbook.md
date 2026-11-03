# Runbook

One-time setup, deploys and rollbacks. The design behind all of this is in [tech-spec.md](tech-spec.md).

## Local development

| Command                                   | What runs                                                       | URL                   |
| ----------------------------------------- | --------------------------------------------------------------- | --------------------- |
| `pnpm dev:home`                           | Directory site (Astro dev server)                               | http://localhost:4321 |
| `pnpm --filter @teamtoolbox/home preview` | Built directory site through Wrangler, with the real `_headers` | http://localhost:4322 |
| `pnpm dev:rooms`                          | Rooms service                                                   | ws://localhost:8787   |
| `pnpm dev:ads`                            | Ads service                                                     | http://localhost:8788 |

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

### 3. Email records

This is still open in the spec (§18, question 1). Pick one:

- **No email on the domain:** add `MX @ .` (priority 0, a "null MX"), `TXT @ "v=spf1 -all"` and `TXT _dmarc "v=DMARC1; p=reject"`.
- **Forwarding only:** enable Email Routing and forward `security@` and `privacy@` to your inbox. Keep the DMARC record.

### 4. First deploy (from your machine)

Log in once with `pnpm --filter @teamtoolbox/rooms exec wrangler login`, then deploy the services before the site:

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
6. **Security** (Settings → Code security): turn on private vulnerability reporting, secret scanning with push protection, and Dependabot alerts. Add Renovate or Dependabot version updates for `npm` and `github-actions`. Consider pinning actions to commit SHAs.
7. Update `SITE_LINKS.source` in `packages/registry/src/index.ts` and the about page to point at the repository.

## Workflows

| Workflow      | Trigger                        | What it does                                                                                                                                    |
| ------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`      | Every PR and push to `main`    | Biome, headers check, typecheck, tests, build                                                                                                   |
| `preview.yml` | PRs from branches in this repo | Uploads preview versions of changed apps (`pr-<number>` alias) and deploys changed services to staging. Fork PRs are skipped and get no secrets |
| `deploy.yml`  | Push to `main`                 | Re-runs checks and tests, then deploys every changed app and service, plus anything that depends on a changed package                           |

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
- [ ] Publish the repository link (GitHub setup, step 7)
- [ ] Decide on email (above) and add a contact to the about page
- [ ] Switch to Workers Paid (~$5/month) before any launch push
- [ ] Apply for AdSense for the directory site once the guide content exists (spec §11.2)
- [ ] Turn on HSTS, then submit to the preload list

## Notes for M1 (first tool app)

- Tool apps ship their CSP in `public/_headers`. Preview builds talk to `rooms-staging` and `ads-staging` on `workers.dev`, so the build needs to write an environment-specific `_headers`. `scripts/check-headers.ts` must then allow those staging origins for preview builds only.
- Add each tool's subdomain to its `wrangler.jsonc` `routes`. The first deploy creates the DNS record and certificate.
