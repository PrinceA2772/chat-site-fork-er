# Security Policy

ptr_29 Chat is a proprietary project (see [LICENSE](LICENSE)). This policy
explains how to report a security or privacy problem, what is in scope, and
what you can expect afterwards.

Deeper documentation lives alongside it:

- [Auth.md](Auth.md) — identity, registration, login, sessions, pepper rotation
- [Data%20Security.md](Data%20Security.md) — storage, transport, access control,
  uploads, logging, incident response
- [Threat%20Model.md](Threat%20Model.md) — assets, actors, threats and residual
  risk
- [Security%20Checklist.md](Security%20Checklist.md) — change/deploy/periodic
  checks for maintainers
- [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and
  [ASSETS.md](ASSETS.md) — component and asset provenance

**Please do not report security vulnerabilities in a public GitHub issue, in
the in-app bug reporter, or on any public social channel.** Use a private
channel from the list below.

---

## Reporting a vulnerability

### Preferred: GitHub private vulnerability reporting

Use the **Report a vulnerability** button on this repository's
[Security tab](https://github.com/gamer-09/chat-site/security/advisories/new).
This opens a private advisory visible only to you and the maintainer, and keeps
the whole discussion, fix and disclosure in one place.

### Alternative: direct contact

If you cannot use GitHub, reach the operator privately:

- WhatsApp: [+234 902 378 5212](https://wa.me/2349023785212)
- Instagram: [@not_udo2025](https://www.instagram.com/not_udo2025/) (direct message)

Please do **not** send passwords, room passkeys, API keys, session tokens, or
any other credential. If you believe a credential has leaked, say so without
including it — the maintainer will revoke it.

### What to include

A useful report contains:

- a short summary of the issue and why it matters,
- the steps to reproduce it, ideally with the exact URL,
- what you expected versus what actually happened,
- the impact you believe it has (who is affected, and what they could do),
- any proof-of-concept, request/response pairs or screenshots — but redact
  other people's data and your own credentials.

---

## Scope

### In scope

- Authentication, session handling and account lifecycle
- Row Level Security and any way to reach data you should not own
- Private room access control, room roles, kick/ban, invite/passkey handling
- Direct message and Client-ID disclosure consent flows
- Cross-site scripting, injection, or unsafe rendering of user content
- Upload handling, file type validation, and signed-URL leakage
- Privilege escalation, or any way to act as another user
- Leakage of the Supabase anon/publishable key beyond its intended use, or any
  place where a more privileged key could be exposed to the browser

### Out of scope

- Denial of service from volume, or the site's own rate limits being hit
- Missing security headers that have no demonstrated exploit
- Reports generated solely by automated scanners with no working proof
- Social engineering, spam, or content moderation complaints
- Vulnerabilities in third-party platforms (GitHub Pages, Supabase, browsers)
  — report those upstream
- Anything requiring a compromised device, a malicious browser extension, or
  physical access

Content moderation, abuse and privacy requests are not security issues — use
the in-app **Report a problem** button or the contact channels above.

---

## What to expect

| Stage | Target |
|---|---|
| Acknowledgement of your report | within 3 days |
| Initial assessment and severity | within 7 days |
| Fix for critical issues | as soon as practicable |
| Credit in the release notes | on request |

This is a small, independently maintained project, so these are good-faith
targets rather than a contractual SLA.

Please give the maintainer a reasonable opportunity to ship a fix before
disclosing publicly. If a report is declined as out of scope, you will be told
why.

---

## Supported versions

Only the **currently deployed site** is supported:
<https://gamer-09.github.io/chat-site/>

Older commits, forks, mirrors, and self-hosted copies are not supported — the
proprietary licence does not permit re-hosting, so any such deployment is
unsupported and out of scope.

---

## For the maintainer

Notes that are useful when acting on a report:

- The deployed build stamps its commit into
  `<meta name="ptr29-build">` and `version.json`; ask reporters for that value.
  The in-app reporter attaches it automatically.
- Supabase egress and the browser-exposed key: only the publishable/anon key is
  ever shipped to the client. The `service_role`/secret key must never appear in
  `Chatting_updated/public/**`. The one workflow that needs it
  (`.github/workflows/bug-reports-to-issues.yml`) reads it from the
  `SUPABASE_SECRET_KEY` Actions secret (with `SUPABASE_SERVICE_KEY` accepted as a
  legacy fallback) at run time.
- Password pepper: new hashes use the Vault-backed v2 pepper
  (`supabase/038_pepper_vault.sql`). The v1 pepper in older migrations is a
  legacy verification fallback only and should be treated as historical, not
  secret. Rotate by creating a new Vault secret version, bumping
  `ptr29_current_pepper_version()`, and re-running the migration; see
  [Auth.md](Auth.md#pepper-rotation). Do not delete old versions until every
  account has logged in since the rotation.
- If a credential is suspected to be exposed: rotate it in the Supabase
  dashboard and in GitHub → Settings → Secrets, in that order, then invalidate
  sessions.
