# Security

teamtoolbox's whole promise is that we can't read your team's data, so security reports are very welcome.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **private vulnerability reporting** on this repository (Security tab → "Report a vulnerability"). Don't open a public issue.

Include what you found, how to reproduce it, and what an attacker could do with it. We'll acknowledge your report as quickly as we can and keep you updated while we fix it.

## Scope

Especially interesting:

- Anything that lets the server, Cloudflare, or a third party read room contents
- Room secrets leaking through URLs, headers, logs or storage
- Third-party code running on a tool page (`*.teamtoolbox.org`)
- Ways to tamper with records without detection
- Rooms or data surviving past their expiry, or after being destroyed

Known limitations, such as metadata visible to the server and the trust placed in the JavaScript we serve, are described on [teamtoolbox.org/security](https://teamtoolbox.org/security) and in [docs/tech-spec.md](docs/tech-spec.md) §5.7.
