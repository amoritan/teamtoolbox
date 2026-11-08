# teamtoolbox

Small, free tools for R&D teams at [teamtoolbox.org](https://teamtoolbox.org). Each tool is its own app on its own subdomain. Shared tools are end-to-end encrypted, so the servers only ever see data they can't read.

The full design is in [docs/tech-spec.md](docs/tech-spec.md). How to set up and deploy is in [docs/runbook.md](docs/runbook.md). How the UI should look and behave is in [docs/ui-guidelines.md](docs/ui-guidelines.md).

## Layout

| Path                   | What it is                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `apps/home`            | `teamtoolbox.org`: the directory site (Astro, static)                                      |
| `services/rooms`       | `rooms.teamtoolbox.org`: encrypted rooms for collaborative tools (Worker + Durable Object) |
| `services/ads`         | `ads.teamtoolbox.org`: picks the small ad each tool shows (Worker)                         |
| `packages/registry`    | The list of tools that everything else reads                                               |
| `packages/crypto`      | Room secrets, key derivation, encryption (WebCrypto only)                                  |
| `packages/protocol`    | Wire formats shared by the browser and the services                                        |
| `packages/room-client` | Browser client for encrypted rooms                                                         |
| `packages/ui`          | Theme, app shell, ad slot and shared components                                            |
| `packages/tsconfig`    | Shared TypeScript configs                                                                  |

## Getting started

You need Node.js 26 and pnpm 12.

```bash
pnpm install
```

```bash
pnpm dev:home
```

The directory site runs at http://localhost:4321. To run the services locally, use `pnpm dev:rooms` (port 8787) and `pnpm dev:ads` (port 8788).

## Checks

```bash
pnpm check && pnpm check:headers && pnpm typecheck && pnpm test && pnpm build
```

- `check`: Biome lint and format
- `check:headers`: fails if any tool app's CSP allows third-party scripts, connections or frames
- `typecheck`, `test`, `build`: run in every package that has them

## License

[AGPL-3.0](LICENSE).
