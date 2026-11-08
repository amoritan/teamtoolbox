# teamtoolbox.org — Technical Specification

|            |                                                                                                                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status** | Draft v0.4, for review                                                                                                                                                                                                                        |
| **Date**   | 2026-11-03                                                                                                                                                                                                                                    |
| **Scope**  | Platform architecture, privacy model, repo structure, hosting, monetisation, first two tools                                                                                                                                                  |
| **v0.2**   | Hosting moved from Google Cloud (Firebase Hosting + Firestore) to **Cloudflare (Workers + Durable Objects)**. The Google Cloud design and the comparison are kept in §17.1                                                                    |
| **v0.3**   | **Every tool app shows one small ad.** Our own code renders it from our own ad endpoint, so no ad-network script runs next to team data (§11.3). Confirmed: AdSense never runs on tool pages                                                  |
| **v0.4**   | Platform decisions confirmed:<br>• public repo on GitHub, licensed AGPL-3.0, with GitHub Actions<br>• DNS moves to Cloudflare<br>• React + TypeScript<br>• room storage in the EU<br>• start on Workers Free<br>See §18 for what's still open |

---

## 1. Summary

teamtoolbox.org is a collection of small, free tools for R&D teams (retros, health checks, and more over time).

- **`teamtoolbox.org`** is a static directory site: a grid of tools, a short guide page per tool, legal pages, and standard display ads.
- **Each tool is its own static web app on its own subdomain** (`retro.teamtoolbox.org`, `healthcheck.teamtoolbox.org`, …). Each one builds and deploys on its own.
- **Privacy comes from the architecture, not from a promise.** Tools either keep data entirely in the browser, or, for collaborative tools, **encrypt everything in the browser** with a key that lives only in the shared link. The server stores ciphertext it can't read, and deletes it at the room's expiry time.
- **Every tool shows one small ad** in its app shell. Our own code renders it from a JSON endpoint we run, so no ad-network script ever runs on a tool's page.
- **Two tiny shared services.** A `rooms` service (a Cloudflare Worker + one Durable Object per room) stores and relays encrypted records for every collaborative tool. An `ads` service picks the ad each tool shows. Neither has tool-specific logic.
- **No accounts, no logins, no cookies, and no third-party scripts on tool apps.**

---

## 2. Goals and non-goals

### Goals

1. **G1: Tools as independent apps.** Each tool is its own app on its own subdomain, with its own build and deploy. A broken tool can't take down another one.
2. **G2: Privacy by construction.** We _can't_ read team data, as opposed to merely promising we _won't_. No third-party scripts on any page that handles team data.
3. **G3: Low ops, near-zero cost.** Everything is serverless and scales to zero. On the free plan, cost can't run away: over the limits, requests fail instead of being billed.
4. **G4: Cheap to add tools.** Scaffolding and deploying a new tool should take minutes, not a day of setup.
5. **G5: Ads that don't compromise G2.** Every app carries one small ad, but no ad-network code runs on a tool's origin.

### Non-goals (v1)

- User accounts, teams, or cross-device history.
- Server-side rendering, or server-side logic beyond storing and relaying ciphertext and choosing ads.
- Integrations that need server-held secrets (Jira, GitHub OAuth, and so on).
- File uploads or attachments.
- Real-time co-editing of the same text field (e.g. Google Docs-style).
- Native mobile apps. The web apps should be responsive and work well on phones.

---

## 3. Decisions at a glance

| Area           | Decision                                                                                                                                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo           | One **public** monorepo on GitHub, licensed **AGPL-3.0**, pnpm workspaces, TypeScript everywhere                                                                                                                                                                                                                     |
| Directory site | Astro, static output, at `teamtoolbox.org`                                                                                                                                                                                                                                                                           |
| Tool apps      | React + Vite static SPAs, one per subdomain                                                                                                                                                                                                                                                                          |
| Hosting        | **Cloudflare Workers with static assets**: one Worker per site, with its custom domain declared in its own config. DNS and TLS are created automatically                                                                                                                                                             |
| Collaboration  | **`rooms` service**: a Worker plus **one Durable Object per room** over WebSockets. Payloads are **end-to-end encrypted** with WebCrypto (AES-256-GCM)                                                                                                                                                               |
| Room access    | A capability link: `https://<tool>.teamtoolbox.org/room#<secret>`. The secret never leaves the browser                                                                                                                                                                                                               |
| Retention      | Each room has a fixed lifetime chosen at creation (default 30 days). A Durable Object alarm wipes the room **exactly** at expiry                                                                                                                                                                                     |
| Data location  | Durable Objects restricted to the **EU jurisdiction** (compute and storage stay in the EU)                                                                                                                                                                                                                           |
| Accounts       | None                                                                                                                                                                                                                                                                                                                 |
| Ads            | **Directory site:** AdSense + Google's certified consent banner at launch. **Every tool app:** one small native ad slot filled by our `ads` service. House ads and direct sponsors at launch, then network ads (EthicalAds or Carbon) through their JSON ad API once approved. No ad-network scripts on tool origins |
| Analytics      | None on tool apps. Optional cookieless analytics on the directory site                                                                                                                                                                                                                                               |
| Config / infra | Each app's `wrangler.jsonc` _is_ its infra (domain, bindings, storage). A short runbook covers one-time account and zone settings. No Terraform needed in v1                                                                                                                                                         |
| CI/CD          | GitHub Actions + Wrangler. Preview URLs for PRs, auto-deploy of changed apps on merge                                                                                                                                                                                                                                |
| Plan           | Start on **Workers Free**. Move to **Workers Paid (~$5/month)** when usage approaches the free limits                                                                                                                                                                                                                |

---

## 4. Architecture overview

```
                     ┌─────────────────────────────────────────────┐
                     │  teamtoolbox.org   (Astro, static assets)   │
                     │  tool grid · guide pages · legal · ADS+CMP  │
                     └──────────────────────┬──────────────────────┘
                                            │ links out
          ┌─────────────────────────────────┼───────────────────────────────┐
          ▼                                 ▼                               ▼
 retro.teamtoolbox.org         healthcheck.teamtoolbox.org        <next>.teamtoolbox.org
 static React SPA              static React SPA                   static React SPA
 collaborative                 collaborative                      local-only (IndexedDB)
 every tool: our own JS only · one small native ad slot · no ad-network scripts
          │                                               │
          │ collaborative tools only:                     │ every tool:
          │ WebSocket, ciphertext only                    │ GET ad JSON (tool slug only)
          ▼                                               ▼
 ┌────────────────────────────────────────────────┐   ┌───────────────────────────────────┐
 │  rooms.teamtoolbox.org   (Worker)              │   │  ads.teamtoolbox.org   (Worker)   │
 │  origin check · per-IP rate limit · route      │   │  sponsor → network → house ad     │
 │          ▼                                     │   │  network API called server-side   │
 │  Durable Object "Room" × one per room (EU)     │   │  aggregate counters only          │
 │  encrypted records · broadcast · presence      │   └───────────────────────────────────┘
 │  alarm at expiresAt → wipe everything          │
 └────────────────────────────────────────────────┘

 Every box is a Cloudflare Worker with its own custom domain. Static sites are assets-only Workers.
```

### Why subdomains are a good idea here

Your one-subdomain-per-tool idea also helps on the technical side. Each subdomain is a separate **browser origin**, which gives each tool:

- **Isolated storage.** `localStorage` and IndexedDB on `retro.` can't be read by `healthcheck.` or by the ad scripts on the apex domain.
- **Its own Content-Security-Policy.** Tool apps can forbid every third-party script while the directory site allows the ad network.
- **Independent deploys and failure isolation.**

### Why a Durable Object per room

A room is exactly the shape a Durable Object is built for. It's a single-threaded, addressable object with its own small database that holds WebSocket connections. In practice that gives each room:

- **Strict ordering** of every update, so there's no conflict resolution between servers.
- **Free presence**, with no extra storage writes. It's just the set of open sockets.
- **Exact expiry** using an alarm.
- **Hibernation**, so idle rooms with open connections cost nothing.

---

## 5. Privacy model

This is the core of the product, and the rest of the design follows from it.

### 5.1 Principles

1. **Ciphertext or nothing.** Data either never leaves the browser, or it leaves already encrypted.
2. **No identities.** No accounts, emails, or logins. Display names typed into a tool live inside the encrypted data.
3. **Everything expires.** Every room has a hard expiry date and is wiped automatically.
4. **No third-party code where team data is.** Tool origins load only our own JS and talk only to our own `rooms.` and `ads.teamtoolbox.org`. The in-app ad is plain text and an image that our code renders, not an ad-network script.
5. **Verifiable.** The repo is public, so anyone can check these claims against the code we deploy.

### 5.2 Two kinds of tools

| Kind              | Example                                       | Where data lives                                                                                                                      | Server involvement                |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Local**         | Meeting cost calculator, team charter builder | IndexedDB in the user's browser. Export/import as JSON. Optionally shareable as a link with the state compressed into the `#fragment` | None                              |
| **Collaborative** | Retro, health check, planning poker           | Encrypted records in that room's Durable Object, shared by everyone holding the link                                                  | Stores and relays ciphertext only |

Each tool declares its kind in the registry (§6.5), and the UI shows a matching badge: _"Stays in your browser"_ or _"End-to-end encrypted"_.

### 5.3 End-to-end encryption for collaborative rooms

**The link is the key.** Creating a room generates a random 256-bit secret in the browser:

```
https://retro.teamtoolbox.org/room#k3J9x…(43 chars, base64url)
```

Browsers never send the `#fragment` to any server, so it doesn't appear in HTTP requests, server logs, or `Referer` headers. Everything is derived from that one secret using WebCrypto only, with no crypto dependencies:

| Value    | Derivation                                                                        | Who sees it                                             |
| -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `secret` | 32 random bytes (`crypto.getRandomValues`)                                        | Only people holding the link                            |
| `roomId` | `HKDF-SHA256(secret, info="teamtoolbox/v1/room-id")`, 128 bits                    | The rooms service. It can't be reversed into the secret |
| `encKey` | `HKDF-SHA256(secret, info="teamtoolbox/v1/enc")`, non-extractable AES-256-GCM key | Only browsers in the room                               |

Each record is encrypted as follows:

- The payload is JSON with a schema version. It's **padded to 256-byte buckets** to blur lengths, then encrypted with AES-256-GCM and a fresh random 96-bit IV.
- **Associated data** = `tool | roomId | recordId`. The server therefore can't silently move a record into another room or tool, and any tampering makes decryption fail.
- Decrypted payloads are **validated with a schema** (Zod) before use. Any participant could send malformed data, and invalid records are ignored.
- Record IDs are opaque random strings. The record _type_ (card, vote, …) lives inside the ciphertext.
- **Presence messages** ("Alex is here, typing") are encrypted the same way and are never stored.

The `v1` in the HKDF labels lets us move to new algorithms later without breaking old links.

**Possible later extensions (not v1):** passphrase-protected rooms (link + passphrase); read-only links (separate signing key using Ed25519 in WebCrypto); a facilitator key whose signed phase changes the room verifies.

### 5.4 What the infrastructure can and can't see

| Data                                                                | Visible to us / Cloudflare?                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Card text, votes, comments, names, board titles, settings, presence | **No.** Encrypted in the browser                                                                                                                                                                                   |
| Room secret (the `#fragment`)                                       | **No.** Never transmitted                                                                                                                                                                                          |
| Room ID                                                             | Yes. Random and unlinkable to content                                                                                                                                                                              |
| Which tool a room belongs to, creation and expiry time              | Yes                                                                                                                                                                                                                |
| Number, size bucket, and timing of messages                         | Yes                                                                                                                                                                                                                |
| IP address and user agent of requests                               | Cloudflare processes them to serve traffic. We don't log or store them, and per-IP rate limiting is in memory only                                                                                                 |
| Which ad a tool showed, and whether it was clicked                  | Our ads service counts it in aggregate, with no identifiers. For a network ad, the network also sees the viewer's IP and user agent when the ad image and view pixel load. It never learns anything about the room |

Durable Object storage is pinned to the EU jurisdiction. Cloudflare's edge still terminates TLS wherever the user connects, but it only ever sees ciphertext payloads.

### 5.5 Data retention

- The room lifetime is chosen at creation: **1, 7, 30 (default), or 90 days**. It's fixed and doesn't extend with activity. That keeps the promise simple: _"this room self-destructs on 3 Dec 2026"_, and the date is shown in the UI.
- At creation the Room object sets an **alarm for `expiresAt`**. When it fires, it closes all connections and **deletes all of its storage**. Joins after expiry are refused, even if the alarm is late.
- **"Destroy now" button:** anyone in the room can wipe it immediately.
- **Typos don't create rooms.** Joining a room that doesn't exist (without the create flag) returns `not_found` and stores nothing.
- Local tools store data only in the browser. A _"Forget everything"_ button clears that origin's storage.

### 5.6 The third-party-code boundary

| Origin                           | Third-party scripts       | Other third-party requests                   | Cookies    | Consent banner         |
| -------------------------------- | ------------------------- | -------------------------------------------- | ---------- | ---------------------- |
| `teamtoolbox.org` (directory)    | AdSense (+ Google's CMP)  | Yes                                          | Ad cookies | For EEA/UK/CH visitors |
| `<tool>.teamtoolbox.org` (tools) | **None**, enforced by CSP | Only a network ad's image and view pixel     | **None**   | **None**\*             |
| `rooms.` / `ads.teamtoolbox.org` | n/a (APIs, not pages)     | `ads` calls the ad network's API server-side | None       | n/a                    |

\* This holds as long as the in-app ad network doesn't set cookies or personalise ads. EthicalAds says it does neither. Any other network must be checked before it's added.

- The "recent rooms" list (which contains room secrets) is kept in `localStorage` on the tool's own origin. It's safe there only because nothing third-party ever runs on that origin, so this boundary is a hard rule.
- **Cloudflare features that inject scripts must stay off for tool hostnames:** Rocket Loader, Email Obfuscation, automatic Web Analytics injection, Zaraz, and bot-detection JS. The CSP would block them anyway, but they'd also cause noise. The runbook covers this, and a CI smoke test fetches each tool page and fails if any unexpected `<script>` is present.

### 5.7 Threat model

**Protected against:**

- Us, Cloudflare, a storage leak, or a legal request reading team content.
- Ad or analytics code reading team data. That includes the in-app ad, which our code renders from plain data.
- Room links leaking through `Referer` headers or server logs.
- The server undetectably _modifying_ records.

**Not protected against (accepted, and documented on the site's security page):**

- **Anyone who has the link.** It's the capability. Rooms expire, and links show up in browser history.
- **Malicious JavaScript served by us**, e.g. a compromised deploy. This is true of all web-based E2EE. Mitigations: deploys only from CI, a public repo, and no third-party scripts.
- **Metadata:** IPs (transiently), timing, message counts.
- **Ad networks learning tool usage.** When a network ad is shown, the network sees the viewer's IP and that an ad was viewed on a given tool. It learns nothing about the room or its content.
- **The server dropping or replaying messages.** Integrity of _freshness_ isn't guaranteed.
- **A compromised participant device.**
- **Ad cookies leaking to tool requests.** If AdSense sets first-party cookies on `.teamtoolbox.org`, browsers may also send them with requests for static files on tool subdomains. They carry no tool data.

---

## 6. Components

### 6.1 Directory site: `apps/home` → `teamtoolbox.org`

- **Astro, static build**, deployed as an assets-only Worker. Ships almost zero JavaScript, has good SEO, and is easy to fill with content.
- `www.teamtoolbox.org` redirects to the apex.
- **Pages:**

  | Page                              | Contents                                                                                       |
  | --------------------------------- | ---------------------------------------------------------------------------------------------- |
  | `/`                               | Tool grid, generated from the registry, with category filter and an ad slot                    |
  | `/tools/<slug>`                   | What the tool is, how to run the ceremony well, privacy badge, **Open tool →** button, ad slot |
  | `/privacy`, `/terms`, `/security` | The security page is a plain-language version of §5                                            |
  | `/about`                          | About the project                                                                              |
  | `/.well-known/security.txt`       | Security contact                                                                               |

- The guide pages carry the real content. Ad networks need it to approve the site (thin "just a grid" sites usually get rejected), and search engines need it for discovery.
- `sitemap.xml`, Open Graph images per tool, and an RSS feed or "new tools" list (optional).

### 6.2 Tool apps: `apps/<slug>` → `<slug>.teamtoolbox.org`

- **React + Vite + TypeScript static SPA**, deployed as an **assets-only Worker** (no server code), with SPA fallback routing. Security headers come from a `_headers` file.
- **Shared app shell** from `packages/ui`:
  - a top bar with a "teamtoolbox" link back to the directory, the tool name, and a privacy badge
  - a footer linking to privacy and security pages and to the source code
  - one small ad slot, `<AdSlot>` (§11.3)
- **Routes:**
  - `/` is the start screen: create a room, or reopen recent rooms stored locally.
  - `/room#<secret>` is the room view. The path is constant, so nothing room-specific is ever in it.
- **Performance budget:** under 100 KB of gzipped JS. The room client is a plain WebSocket wrapper with no SDK.
- **Quality targets:** WCAG 2.2 AA, keyboard-friendly, and no information conveyed by colour alone (relevant to the health check's red/amber/green). Must work on phones.
- **Browser support:** evergreen browsers only, since WebCrypto (HKDF, AES-GCM) is required.

### 6.3 Rooms service: `services/rooms` → `rooms.teamtoolbox.org`

This is the main server code in the project. The only other piece is the small ads service (§11.3). It's generic for all tools, never sees plaintext, and should stay at a few hundred lines.

**Entry Worker (`src/index.ts`).** Handles `GET wss://rooms.teamtoolbox.org/v1/<tool>/<roomId>`:

1. Checks the `Origin` header is `https://<tool>.teamtoolbox.org`, or a preview origin in staging. This stops _other websites_ from using our service from browsers. It isn't an access control, since the unguessable `roomId` is.
2. Validates the `tool` slug and `roomId` format.
3. Applies a per-IP connection rate limit with the Workers Rate Limiting binding (in memory, nothing stored).
4. Forwards to ``env.ROOM.jurisdiction("eu").idFromName(`${tool}:${roomId}`)``. Local runtimes can't do jurisdictions, so local dev and tests set `ROOM_JURISDICTION=none`. A missing value always means EU.

**`Room` Durable Object (`src/room.ts`):**

- **Storage:** a SQLite-backed DO with a `records(id TEXT PRIMARY KEY, c TEXT, v INTEGER)` table (`c` is the base64url ciphertext) and a single-row `meta` table `{ tool, createdAt, expiresAt, seq }`. Both tables are only created when a room is created.
- **Connections** use the **WebSocket Hibernation API**: idle rooms are evicted from memory while connections stay open, and each socket's peer ID is kept in its attachment.
- **Ordering:** the object processes messages one at a time and assigns an increasing version `v` per write. That gives every client the same order.
- **Expiry:** `setAlarm(expiresAt)` at creation. `alarm()` closes all sockets and calls `deleteAll()`.

**Wire protocol** (JSON, binary fields base64url, schemas shared via `packages/protocol`):

| Direction | Message                                 | Effect                                                                                  |
| --------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| C → S     | `hello { create?: { lifetimeDays } }`   | Join. With `create`, initialises a new room (ignored if it already exists)              |
| S → C     | `snapshot { meta, records[], peers[] }` | Full current state on join or reconnect                                                 |
| C → S     | `put { id, c }`                         | Store/replace an encrypted record. The server broadcasts `put { id, c, v }` to everyone |
| C → S     | `del { id }`                            | Delete a record. Broadcast to everyone                                                  |
| C → S     | `presence { c }`                        | Encrypted ephemeral state. Relayed to others as `presence { peer, c }`, never stored    |
| S → C     | `peer_left { peer }`                    | Someone disconnected                                                                    |
| C → S     | `destroy {}`                            | Wipe the room. Everyone is disconnected with a "room destroyed" close code              |
| S → C     | `error { code }`                        | `not_found`, `expired`, `room_full`, `too_large`, `rate_limited`, …                     |

**Limits (proposed):**

- 50 concurrent connections per room
- 1,000 records per room, each at most 16 KB
- 5 MB per room
- 30 messages per second per connection
- 90 days maximum lifetime

**Conflict model:** last-write-wins **per record**, in the room's strict order. Tools model their state as many small, independently-owned records (one per card, one per participant's votes, one per participant's health-check answers), so real conflicts are rare and harmless. If a future tool needs character-level co-editing, it can relay encrypted Yjs updates as records. That's not needed for v1.

**New tools need no change here.** The service accepts any well-formed slug on a `*.teamtoolbox.org` origin.

### 6.4 Room client: `packages/room-client`

A small typed browser client used by every collaborative tool:

```ts
const room = await createRoom({ tool: 'retro', lifetimeDays: 30 })   // → { link, roomId, expiresAt }
const room = await openRoom({ tool: 'retro', link: location.href })
room.subscribe((records) => …)        // decrypted, validated, live
room.onPresence((peers) => …)
await room.put(recordId, payload)     // encrypts + sends
await room.remove(recordId)
room.setPresence({ name, typing: true })
await room.destroy()
```

It also handles reconnection with backoff, re-syncing from the `snapshot` after a reconnect, and queueing writes made while offline.

### 6.5 Shared packages

| Package                | Purpose                                                                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/registry`    | The single list of tools that the grid, sitemap, and scaffolding read from: `slug, name, tagline, kind, status (live/beta/soon), category, icon`. Lets "coming soon" tools appear before they exist |
| `packages/ui`          | Design tokens, Tailwind theme, `AppShell`, buttons, dialogs, privacy badge, copy-link and QR code. Works in both React apps and Astro islands                                                       |
| `packages/crypto`      | Secret generation, link parse/format, HKDF, AES-GCM, padding. Pure, with near-complete unit test coverage                                                                                           |
| `packages/protocol`    | Wire message types and Zod schemas, shared by the browser packages and the services so they can't drift apart: the rooms protocol and the ad contract (§11.3)                                       |
| `packages/room-client` | The browser client (§6.4)                                                                                                                                                                           |
| `packages/local-store` | IndexedDB persistence (`idb-keyval`), JSON export/import, state-in-fragment share links                                                                                                             |
| `packages/tsconfig`    | Shared TypeScript configs                                                                                                                                                                           |

Tools are **self-contained at runtime** (each one is its own bundle, origin, and deploy) and **share code at build time** through these packages. Bumping a shared package rebuilds and redeploys every tool that depends on it, and CI handles that automatically.

---

## 7. Tech stack

| Area              | Choice                                                                                                     | Notes                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language          | TypeScript (strict)                                                                                        | Same language for apps, rooms service, packages, scripts, and tests                                                                               |
| Monorepo          | pnpm workspaces                                                                                            | `pnpm --filter "...[origin/main]"` builds only what changed. Add Turborepo only if builds get slow                                                |
| Directory site    | Astro (static)                                                                                             | React islands for interactive bits (e.g. grid filter)                                                                                             |
| Tool apps         | React + Vite                                                                                               | Plain React state plus a `useRoom()` hook. No global state library                                                                                |
| Styling           | Tailwind CSS v4 + shared theme                                                                             |                                                                                                                                                   |
| UI primitives     | Radix Primitives, when needed                                                                              | Accessible dialogs, popovers, and so on                                                                                                           |
| Hosting           | Cloudflare Workers static assets                                                                           | Assets-only Workers, custom domain per site                                                                                                       |
| Backend           | Cloudflare Workers + Durable Objects (SQLite backend, Hibernation API)                                     | Only `services/rooms`                                                                                                                             |
| Crypto            | WebCrypto (built-in)                                                                                       | No crypto libraries                                                                                                                               |
| Validation        | Zod (`zod/mini`, imported as `import * as z`)                                                              | Validates wire messages (server and client) and every decrypted payload. Tree-shaken to ~12 KB gzipped per Worker, where classic Zod adds ~120 KB |
| Local persistence | IndexedDB via `idb-keyval`                                                                                 |                                                                                                                                                   |
| Lint + format     | Biome                                                                                                      | One fast tool instead of ESLint + Prettier                                                                                                        |
| Tests             | Vitest, `@cloudflare/vitest-plugin` (runs Worker and Durable Object tests in the real runtime), Playwright |                                                                                                                                                   |
| Tooling           | Wrangler (local dev, deploys)                                                                              | `wrangler dev` runs Workers and DOs locally, so no cloud is needed to develop                                                                     |
| CI/CD             | GitHub Actions                                                                                             |                                                                                                                                                   |
| Node.js           | Current LTS (build and tooling only)                                                                       | Pinned via `.nvmrc` and `packageManager`                                                                                                          |

---

## 8. Repository structure

```
teamtoolbox/
├── apps/
│   ├── home/                 # teamtoolbox.org: Astro (grid, tool guide pages, legal, ads)
│   ├── retro/                # retro.teamtoolbox.org: React + Vite (collaborative)
│   └── healthcheck/          # healthcheck.teamtoolbox.org: React + Vite (collaborative)
├── services/
│   ├── rooms/                # rooms.teamtoolbox.org: encrypted rooms for collaborative tools
│   │   ├── src/
│   │   │   ├── index.ts      # origin check, rate limit, route to the room
│   │   │   └── room.ts       # Room Durable Object: storage, broadcast, presence, expiry
│   │   ├── test/
│   │   └── wrangler.jsonc
│   └── ads/                  # ads.teamtoolbox.org: picks the ad for each tool's slot
│       ├── src/
│       │   ├── index.ts      # slot and click endpoints, aggregate counters
│       │   ├── inventory.ts  # house ads and direct sponsors (dates, target tools)
│       │   └── networks/     # server-side adapters for ad network APIs
│       ├── test/
│       └── wrangler.jsonc
├── packages/
│   ├── registry/             # tool manifests: the one list everything reads
│   ├── ui/                   # theme, AppShell (incl. AdSlot), shared components
│   ├── crypto/               # link secrets, HKDF, AES-GCM, padding
│   ├── protocol/             # wire messages + Zod schemas (client ↔ rooms)
│   ├── room-client/          # browser client for rooms
│   ├── local-store/          # IndexedDB, export/import, fragment share links
│   └── tsconfig/
├── templates/
│   ├── tool-local/           # starter for a browser-only tool
│   └── tool-collab/          # starter for a collaborative tool
├── e2e/                      # Playwright: multi-user rooms, "no plaintext on the wire" test
├── scripts/
│   └── new-tool.ts           # scaffold a tool from a template and register it
├── docs/
│   ├── tech-spec.md          # this document
│   ├── runbook.md            # one-time Cloudflare account/zone settings, deploy and rollback
│   ├── ui-guidelines.md      # how the UI looks and behaves
│   └── decisions/            # short ADRs, one per significant decision
├── .github/workflows/        # ci.yml, deploy.yml
├── biome.json
├── LICENSE
├── package.json
├── pnpm-workspace.yaml
├── README.md
└── SECURITY.md               # how to report vulnerabilities (matches security.txt)
```

Each tool app has the same layout. Its `wrangler.jsonc` is the whole deployment config:

```
apps/retro/
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── model/        # record schemas (Zod) + pure state logic: the unit-tested core
│   ├── views/        # StartView, RoomView, …
│   └── components/
├── public/
│   └── _headers      # CSP and other security headers
├── vite.config.ts
├── wrangler.jsonc
└── package.json
```

```jsonc
// apps/retro/wrangler.jsonc: an assets-only Worker, no server code
{
  "name": "retro",
  "compatibility_date": "2026-11-01",
  "assets": { "directory": "./dist", "not_found_handling": "single-page-application" },
  "routes": [{ "pattern": "retro.teamtoolbox.org", "custom_domain": true }]
}
```

---

## 9. Adding a new tool

1. **Scaffold:** `pnpm new-tool <slug> --kind local|collab`. This copies the template into `apps/<slug>`, adds a registry entry with `status: "beta"`, and generates `wrangler.jsonc` with the `<slug>.teamtoolbox.org` custom domain.
2. **Build it:** open a PR, and CI posts a preview URL.
3. **Ship it:** merge, and the first deploy creates the DNS record and TLS certificate automatically. Then flip the registry status to `live` and write the tool's guide page on the directory site.

No backend change or infra step is needed. The new tool gets the ad slot from the shared app shell. The ads service picks up the tool's ad keywords from the registry on its next deploy, which CI triggers automatically.

---

## 10. Hosting and infrastructure (Cloudflare)

### 10.1 Account and plan

- **Start on Workers Free.** Static asset requests are free and unlimited, and SQLite-backed Durable Objects are included with daily limits.
  - If a limit is exceeded, those operations **fail until the daily reset at 00:00 UTC** instead of being billed. A traffic spike or abuse causes a temporary outage, never a surprise invoice.
  - Free plan storage is capped at 1 GB per object and 5 GB per account. That's far beyond what expiring text-only rooms need.
- **Move to Workers Paid (~$5/month)** before any launch push, or when the dashboard shows usage approaching the free limits. It includes much larger allowances and then bills by usage.
- Check the current limits on Cloudflare's pricing pages before launch, since they change.

### 10.2 Environments

| Environment | What runs                                                                      | Used for                                      |
| ----------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| Local       | `wrangler dev` (Workers + Durable Objects run locally) and Vite dev servers    | Development and tests. No cloud access needed |
| Preview     | Per-PR **preview URLs** of the changed static apps, talking to `rooms-staging` | Reviewing PRs                                 |
| Staging     | `rooms-staging` Worker (separate DO namespace) on a `workers.dev` URL          | Testing rooms service changes before prod     |
| Production  | All Workers on their custom domains                                            | Live site                                     |

### 10.3 Domain and DNS

- **Decided:** `teamtoolbox.org`'s **nameservers move to Cloudflare** (free plan zone). This is required for Workers custom domains. Registration can stay where it is, or move to Cloudflare Registrar (at-cost pricing).
- **Migration steps** (one-time, in the runbook):
  1. Add `teamtoolbox.org` to Cloudflare on the free plan. Review the DNS records it imports and keep any you rely on, especially email records (MX, SPF, DKIM, DMARC).
  2. If DNSSEC is on at the registrar, **turn it off first**. Otherwise the domain stops resolving once the nameservers change.
  3. Change the nameservers at the registrar to the two Cloudflare gives you, then wait for Cloudflare to mark the zone active (usually minutes, at most a day or two).
  4. Turn DNSSEC on in Cloudflare and add its DS record at the registrar.
  5. Only then deploy the Workers. Their custom domains create the subdomain records automatically.
- **Email on the domain** (**decided:** forwarding through Cloudflare Email Routing, the second option below, with DMARC `p=reject` kept):
  - **If the domain doesn't receive email:** publish a "null MX" record, SPF `-all`, and DMARC `p=reject`. Nobody can then send spoofed mail as `@teamtoolbox.org`, which matters for a privacy-branded site.
  - **If you want addresses like `security@` or `privacy@`** (for `security.txt` and the privacy policy): Cloudflare Email Routing can forward them free to your personal inbox, without hosting a mailbox.
- Each Worker declares its hostname in `wrangler.jsonc`, and Cloudflare creates the DNS record and certificate on deploy.
- **Zone settings** (one-time, in the runbook):
  - Always Use HTTPS, minimum TLS 1.2, HSTS with `includeSubDomains`, and HSTS preload once everything is on HTTPS.
  - Script-injecting features off (§5.6).
  - Security-level defaults that don't challenge WebSocket upgrades.

### 10.4 Security headers

Each app ships these in its `_headers` file. On **tool apps**:

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self';
    img-src 'self' data: blob: https://ads.teamtoolbox.org <ad network image host>;
    connect-src 'self' wss://rooms.teamtoolbox.org https://ads.teamtoolbox.org;
    frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'
  Referrer-Policy: no-referrer
  Cross-Origin-Opener-Policy: same-origin
  X-Content-Type-Options: nosniff
  Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()
```

- A tool page can only connect to our own rooms and ads services. The one third-party allowance is _images_ from the ad network's host, which can't run code or read the page.
- On the **directory site**, the CSP is relaxed only for AdSense's and the CMP's domains.
- A CI check fails the build if any tool's CSP allows a third-party origin in `script-src`, `connect-src`, or `frame-src`.

### 10.5 Rough monthly cost

| Item                                        | Workers Free                       | Workers Paid                                                   |
| ------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| Static sites (directory + all tools)        | $0                                 | $0                                                             |
| Rooms Worker + Durable Objects              | $0, within daily limits            | ~$5 base, which covers a lot of usage. Usage-based beyond that |
| Ads Worker (one request per tool page view) | $0, within the daily request limit | Included in the base                                           |
| DNS, TLS, CDN                               | $0                                 | $0                                                             |
| Domain (`.org`)                             | ~$1/month amortised                | ~$1/month amortised                                            |
| **Total**                                   | **≈ $1 / month**                   | **≈ $6 / month**                                               |

**Why it's cheap:**

- With the Hibernation API, idle rooms don't accrue duration charges even with sockets open.
- Incoming WebSocket messages are billed at a 20:1 ratio against requests, and outgoing messages are free.
- A 10-person retro is a few dozen billable requests.

---

## 11. Monetisation (ads)

### 11.1 Rules

1. **Ads everywhere, but ad-network code only where there's no team data.**
   - On the directory site (grid and guide pages), standard display ads are fine, because no team data is there.
   - Every tool app has exactly **one small ad slot**, rendered by our own code (§11.3).
2. **Ads never get in the way.** The in-app slot has a fixed reserved size and sits outside the working area. It's never over a board, never in dialogs, exports, or print, and doesn't rotate or animate.
3. **Clearly labelled.** Every ad says "Ad" or "Sponsor", and its links are marked `rel="sponsored"`.

### 11.2 Directory site

| Phase                               | Provider                                                                   | Consent banner                  | Notes                                                                                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Launch                              | **Google AdSense** + Google's own certified CMP (free, built into AdSense) | Required for EEA/UK/CH visitors | Since 2024 Google requires a certified TCF CMP to serve personalised ads in the EEA/UK/Switzerland. Approval needs real content, which the guide pages provide |
| Once the in-app network is approved | Optionally the same network as the tools (§11.4), dropping AdSense         | **None needed** with EthicalAds | Removes the last cookie banner from the whole site                                                                                                             |

### 11.3 In-app ad slot (every tool)

**How it works:**

1. The shared app shell renders `<AdSlot>` once the app is interactive. It reserves its space up front, so nothing shifts.
2. `<AdSlot>` fetches `GET https://ads.teamtoolbox.org/v1/slot?tool=<slug>` with no cookies and no referrer. The tool slug is the only context sent. Nothing about the room is.
3. The `ads` service (`services/ads`, a Worker) picks the ad in this order:
   1. an active **direct sponsor** for this tool, from `inventory.ts`
   2. a **network ad**, fetched server-side from the network's JSON ad API with a short timeout. It uses the tool's keywords from the registry (e.g. retro → `agile|scrum|retrospective`)
   3. a **house ad**: another teamtoolbox tool, "suggest a tool", or a link to the source code
4. It returns plain data: `{ id, kind, label, title, body, image, href, viewPixel? }`.
5. `<AdSlot>` renders that data as normal React text and an `<img>`. It **never injects HTML or script** from the response, so even a malicious ad payload can't run code on the page.
6. Clicks go through `ads.teamtoolbox.org/v1/c/<id>`, which counts the click and redirects. They open in a new tab.
7. If anything fails, the slot shows a bundled house ad without making another request.

**Size and placement:** one native "card" format of about 300×100 px: a small image, a title, and one line of text. On desktop it sits at the bottom of the side panel or in the footer bar. On mobile it sits after the main content and is never sticky.

**Counting:** the ads service counts impressions and clicks per ad, per tool, per day with Workers Analytics Engine. No identifiers, no IPs.

### 11.4 Filling the in-app slot

| Phase         | Source                                                                        | Notes                                                                                                                                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Launch        | House ads, plus direct sponsors if you sell any                               | No revenue from house ads, but the slot, layout, and plumbing are live from day one                                                                                                                                                                                              |
| Once approved | **EthicalAds** (developer-focused, contextual, no cookies, no consent banner) | Its stated minimum is ~50k pageviews/month, and it pays ~$2.50 CPM per its own docs. We'd use its ad API to render the ad ourselves. Confirm during the application that this is allowed, what view tracking it requires, and whether tool page views count toward the threshold |
| Alternative   | Carbon Ads (via its JSON API)                                                 | Also developer-focused and selective. Check its cookie behaviour first                                                                                                                                                                                                           |
| Any time      | Direct sponsorships ("Retro is sponsored by …")                               | Often worth more than network ads for a niche audience, but you have to sell them. Fully under our control: a plain image and link, no tracking                                                                                                                                  |

### 11.5 Why not AdSense inside the tools

AdSense is the only network that accepts brand-new, low-traffic sites, so it's tempting. But:

- **AdSense's policies don't allow its ads inside an iframe.** We can't isolate it on another origin, so it would have to run as a script directly in the tool page.
- **That script would run next to the decrypted cards**, the room key in the URL, and the recent-rooms list. We'd have to weaken the core promise from "no third-party code can see your data" to "Google's ad script runs on the page". Stripping the key from the URL after load and keeping no secrets in storage would reduce that risk, but not remove it.
- **Every tool would need Google's consent banner** for EEA/UK/CH visitors, or get only "limited ads" without one. That's the kind of clutter teams pick a tool like this to avoid.

**Decision (v0.3):** tools use the native slot only. AdSense stays on the directory site and is never loaded on tool pages.

**Expectations:** revenue will be modest, and developer audiences block ads heavily. Treat ads as covering hosting and a coffee, not as income.

**Analytics option:** Cloudflare Web Analytics (free, cookieless) on the directory site only, or no analytics at all.

---

## 12. CI/CD (GitHub Actions)

**On every pull request:**

1. Install with a cached pnpm store, then run `biome check`, `tsc --noEmit`, and `vitest`. The `services/rooms` tests run inside the Workers runtime.
2. Build affected apps with `pnpm --filter "...[origin/main]" build`.
3. Run Playwright e2e tests against `wrangler dev`.
4. Upload preview versions of affected apps, and post the preview URLs on the PR.
5. If `services/rooms` or `services/ads` changed, deploy them to their staging Workers.

**On merge to `main`:**

1. Run `wrangler deploy` for each affected app, and for `services/rooms` or `services/ads` if they changed. Durable Object schema migrations are declared in the rooms service's `wrangler.jsonc`.
2. Optionally require a manual approval step (a GitHub environment) for production.

**Secrets:** one Cloudflare API token, scoped to this account and zone with only the permissions Wrangler needs, stored as a GitHub environment secret and used only by the deploy job.

**Rollback:** `wrangler rollback`, or pick an earlier version in the dashboard.

**Public repo hygiene:**

- **No secrets in the repo.** The Cloudflare API token lives only in a protected GitHub environment that just the `main` deploy job can use. Secret scanning and push protection are on.
- **PRs from forks** run all checks but get no secrets and no preview deploy. A maintainer can trigger a preview after reviewing the code.
- **Sponsor deals stay out of the repo.** `inventory.ts` holds only what's public anyway: image, text, link, dates. Prices and contracts live elsewhere.
- **Dependency updates** via Renovate or Dependabot, so a public repo doesn't sit on known-vulnerable packages.
- **Standard files:** `LICENSE` (AGPL-3.0) and `SECURITY.md`, plus a short `CONTRIBUTING.md`, which can simply say "not accepting PRs yet".
- **AGPL in practice:**
  - Every app's footer links to the source. AGPL §13 asks anyone running a modified copy for users over a network to offer them its source. As the copyright holder you aren't bound by your own license, but linking the source fits the "verifiable" promise anyway.
  - **Outside contributions** become AGPL code owned by their authors. If you might ever want to relicense (e.g. sell a commercial licence), accept outside PRs only under a short contributor licence agreement, or don't accept them for now.
  - Dependencies under MIT, BSD, Apache-2.0, or ISC are all fine to use in an AGPL project.
- **Optional later:** build provenance (GitHub artifact attestations) and published asset hashes, so anyone can check that the JS we serve matches a commit. This makes "verifiable" (§5.1) concrete.

---

## 13. Testing, observability, abuse protection

**Testing:**

- **Unit (Vitest):** crypto round-trips, tamper detection, fixed test vectors, link parsing, protocol schemas, and each tool's `model/` logic.
- **Rooms service (`@cloudflare/vitest-plugin`):**
  - create, join, and snapshot
  - put and delete broadcast ordering
  - limits enforced
  - alarm wipes storage
  - joining after expiry is refused
  - `not_found` creates nothing
  - destroy disconnects everyone
- **Ads service and `<AdSlot>`:**
  - the sponsor → network → house fallback order, timeouts, and sponsor date ranges
  - the slot reserves its space, renders text only, and never injects HTML or script
- **E2E (Playwright):** two browser contexts in one room see each other's changes. A **privacy regression test** inspects every WebSocket frame and HTTP request. It fails if any test string appears in plaintext, or if a tool page contacts any origin other than ours and the ad image host.

**Observability:**

- No client-side error tracking in v1, because it would be a third party on tool origins.
- Rooms service logs are off by default. If enabled, they carry error codes only, never room IDs or IPs.
- Usage numbers come from aggregate counters (rooms created per tool per day) via Workers Analytics Engine, with no identifiers.

**Abuse and cost protection:**

- Per-room limits (§6.3), per-connection message rate limits, and a per-IP connection rate limit.
- No listing or enumeration of rooms.
- On the Free plan, a hard daily cap. On Paid, set usage notifications in the dashboard.

---

## 14. Legal and compliance checklist

_(Not legal advice. Details depend on where you're based.)_

- [ ] Privacy policy in plain language:
  - E2EE, and what metadata Cloudflare processes
  - EU storage and retention
  - AdSense and its cookies on the directory site; cookieless native ads in tools, and what the ad network can see
- [ ] Terms of use: acceptable use, no warranty, rooms are ephemeral.
- [ ] Cookie consent on the directory site, only if AdSense is used.
- [ ] Ads clearly labelled ("Ad" or "Sponsor"), and sponsored links marked `rel="sponsored"`.
- [ ] Legal notice / Impressum, if required in your country.
- [ ] Review Cloudflare's Data Processing Addendum (part of its self-serve terms).
- [ ] `security.txt` with a contact address.

---

## 15. First tools: v1 scope sketches

Detailed functional specs per tool will follow after this document is agreed. These sketches are here to check that the platform fits.

### 15.1 Retro: `retro.teamtoolbox.org` (collaborative)

**Creating a board:**

- Pick a template: Start/Stop/Continue, Mad/Sad/Glad, 4Ls, Went well/To improve, or custom columns.
- Pick the room lifetime.

**Flow:**

1. **Write.** Others' cards are blurred until reveal, and live "N people typing" presence is shown.
2. **Reveal.**
3. **Group** (optional).
4. **Vote.** N votes per person.
5. **Discuss.** Sorted by votes.
6. **Action items.**

**Records:**

- one board/settings record
- one record per card
- one record per participant (name and colour)
- one votes record per participant
- one record per action item

**Facilitation:** the creator's UI shows facilitator controls, which are trust-based in v1 (anyone with the link could technically change phase). Hiding cards before reveal is a UI convenience, not secrecy from teammates.

**Export:** Markdown, CSV, and copy to clipboard.

### 15.2 Health check: `healthcheck.teamtoolbox.org` (collaborative)

- A default set of dimensions based on the well-known squad health check model, editable by the facilitator.
- Each participant rates each dimension **green / amber / red** (with icons and labels, not just colour) plus a **trend** (improving / stable / worse) and an optional comment.
- **Anonymous by default:** answers aren't linked to display names. The "8 of 10 answered" count comes from presence.
- Results: an aggregate grid and a distribution per dimension. Export to Markdown, CSV, or JSON.
- **Trends over time** (health checks are often quarterly) clash with short room lifetimes. Proposed: the facilitator saves results locally (IndexedDB plus a JSON export) and can import a previous result to compare. See open questions.

---

## 16. Milestones

| Milestone               | Deliverables                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M0: Foundations**     | Monorepo and tooling, `ui` / `crypto` / `protocol` / `room-client` / `registry` packages, `services/rooms` with tests, `services/ads` with house ads, Cloudflare zone + runbook, CI with previews, directory site skeleton with grid and legal pages.<br>**Status (2026-11-03):** code done and passing locally. Cloudflare setup, GitHub setup and first deploy pending ([runbook](runbook.md)) |
| **M1: Retro**           | Retro MVP live on `retro.teamtoolbox.org`, its guide page, security page                                                                                                                                                                                                                                                                                                                         |
| **M2: Health check**    | Health check MVP live, local history and compare                                                                                                                                                                                                                                                                                                                                                 |
| **M3: Content and ads** | Guide content for SEO, AdSense application + CMP for the directory, sponsor slots open, EthicalAds application once traffic nears the threshold                                                                                                                                                                                                                                                  |
| **Later**               | More tools, network ads in the tool slots once approved, Workers Paid when usage warrants                                                                                                                                                                                                                                                                                                        |

---

## 17. Alternatives considered

### 17.1 Google Cloud (the v0.1 design)

The v0.1 design used **Firebase Hosting** (one site per subdomain) and **Cloud Firestore used directly from the browser**. Encrypted records were stored as Firestore documents, protected by security rules, and deleted by a TTL policy. There was no server code at all.

|                                      | Google Cloud (v0.1)                                            | Cloudflare (this version)                                                         |
| ------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Server code we write                 | None                                                           | One small Worker + Durable Object (a few hundred lines)                           |
| Update ordering                      | Per-document last-write-wins                                   | Strict per-room order                                                             |
| Presence ("who's here")              | Costs database reads, so approximated with heartbeats          | Free: the set of open sockets                                                     |
| Rate limiting                        | Weak (security rules can check shape and size, not rate)       | Per room, per connection, per IP                                                  |
| Expiry                               | Firestore TTL, usually within a day of expiry                  | Alarm wipes the room at the exact time                                            |
| Data location                        | Firestore region, **can't change after creation**              | EU jurisdiction per namespace. New rooms could use a different jurisdiction later |
| Network origins a tool page talks to | `firestore.googleapis.com`                                     | Only our own `rooms.teamtoolbox.org`                                              |
| Client bundle                        | Firebase SDK (lazy-loaded, large)                              | Plain WebSocket client (a few KB)                                                 |
| Infra setup                          | Terraform + Firebase CLI + IAM/Workload Identity, two projects | `wrangler.jsonc` per app + a short runbook                                        |
| Cost at launch                       | ~$1–3/month, pay-as-you-go (abuse means a bill)                | ~$1/month on Free (abuse means errors, not a bill), ~$6/month on Paid             |
| Lock-in                              | Firestore API                                                  | Durable Objects API (isolated in `services/rooms`)                                |
| DNS                                  | Cloud DNS or keep the registrar                                | Must move nameservers to Cloudflare                                               |

**Why Cloudflare wins here:**

- The product's core unit, a short-lived shared room, maps one-to-one onto a Durable Object.
- It makes the privacy story stronger: tools talk only to our own origin, deletion happens on time, and storage is EU-pinned.
- It caps cost on the free plan.
- It needs less infrastructure.

**What it costs us:**

- We own a small backend. It needs good tests, though it has no business logic.
- We learn the Durable Objects model.
- DNS has to move to Cloudflare.

### 17.2 Other options

| Option                                                                 | Why not (for now)                                                                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare Pages** instead of Workers static assets                  | Still works, but Cloudflare now points new projects to Workers with static assets, and having everything as Workers keeps one model                                                   |
| **No backend at all on Cloudflare** (e.g. D1 or KV from a generic API) | Loses the room-shaped benefits (ordering, presence, exact expiry) and still needs a Worker in front                                                                                   |
| **Next.js / SSR**                                                      | No server-rendered content is needed. Static output is cheaper and has a smaller attack surface                                                                                       |
| **Accounts / auth**                                                    | Conflicts with the privacy positioning and adds a lot of scope. The link-as-key model avoids needing them                                                                             |
| **A backend per tool**                                                 | E2EE makes the server generic, so per-tool backends would multiply ops for no gain                                                                                                    |
| **AdSense script inside tool apps**                                    | Puts Google's ad code next to decrypted team data and adds a consent banner to every tool (§11.5). Decided against in v0.3                                                            |
| **Network ads in a sandboxed cross-origin `<iframe>`**                 | Would isolate the ad code well, but AdSense's policies prohibit placing its ads in iframes, and other networks' rules vary. The native slot gets the same isolation without an iframe |
| **CRDTs (Yjs) from day one**                                           | Not needed when state is modelled as small per-person records. Can be added per tool later                                                                                            |
| **Separate repos per tool**                                            | Shared UI, crypto, and protocol code, one CI, and atomic cross-tool changes are much easier in a monorepo. Tools stay independent at deploy time                                      |

---

## 18. Open questions

### Platform (blocking M0)

1. ~~**DNS**~~ **Decided:** nameservers move to Cloudflare, with DNSSEC on (§10.3).
   - **Email, decided:** Cloudflare Email Routing forwards `security@` and `privacy@` to a personal inbox, and DMARC stays at `p=reject`.
   - **Still open:** `teamtoolbox.org` is registered at Name.com. Should the registration move to Cloudflare Registrar?
2. ~~**Data location**~~ **Decided:** EU jurisdiction for room storage (§6.3). It can still be changed later for new rooms if needed.
3. ~~**Public repo**~~ **Decided:** public (§12 covers CI and secrets).
   - **License, decided:** AGPL-3.0.
4. ~~**Frontend**~~ **Decided:** React + TypeScript (§7).
5. ~~**GitHub**~~ **Decided:** GitHub for the repo, GitHub Actions for CI/CD (§12).
6. ~~**Plan**~~ **Decided:** start on Workers Free, and move to Paid (~$5/month) before a launch push or when usage nears the limits (§10.1).

### Product

7. **Room lifetimes:** are 1 / 7 / 30 / 90 days (default 30) right?
8. **Health check history:** is local save and import enough for quarter-over-quarter trends, or do you want longer-lived rooms (e.g. up to 1 year)?
9. **No accounts:** confirmed for the foreseeable future? Anything like "my boards on all my devices" on your wish list?
10. **Order and naming:** retro first, then health check? (Your message said `heathcheck`; I've assumed `healthcheck`.)
11. **Facilitation:** are trust-based facilitator controls OK for v1?
12. **Language:** English only at launch?
13. ~~**Branding**~~ **Decided:** a grid mark (four tiles, one in the accent) with a system-font wordmark, keeping the indigo accent. See the [UI guidelines](ui-guidelines.md), §3.

### Monetisation and legal

14. ~~**In-app ads**~~ **Decided:** native slot (§11.3). House ads and sponsors until a privacy-friendly network approves us. No AdSense on tool pages.
15. **Sponsors:** would you sell direct sponsorships yourself (e.g. "Retro is sponsored by …")?
16. **Slot placement:** bottom of the side panel or footer on desktop, after the content on mobile. OK?
17. **Directory ads at launch:** start AdSense + consent banner on the directory right away, or wait until the guide content exists?
18. **Analytics:** none, or Cloudflare Web Analytics (cookieless) on the directory site only?
19. **Your country:** for Impressum/legal-notice requirements. Do you want me to draft the privacy policy and terms?

---

## Appendix A: candidate tools (to check the platform fits)

| Tool                             | Kind                   | Notes                                                           |
| -------------------------------- | ---------------------- | --------------------------------------------------------------- |
| Retro                            | Collaborative          | v1                                                              |
| Team health check                | Collaborative          | v1                                                              |
| Planning poker                   | Collaborative          | Votes revealed together. Presence matters, which DOs make cheap |
| ROAM risk board                  | Collaborative          |                                                                 |
| Standup randomiser and timer     | Local                  | Team list shareable via fragment link                           |
| Meeting cost calculator          | Local                  |                                                                 |
| Team charter / working agreement | Local + share link     |                                                                 |
| RACI / DACI matrix               | Local or collaborative |                                                                 |
| Incident post-mortem template    | Local or collaborative | Markdown export                                                 |
