# Threat Model

A lightweight, honest threat model for ptr_29 Chat. It is intentionally scoped
to a small project with no dedicated security team. Assets, actors, trust
boundaries, concrete threats and mitigations are listed so contributors can
reason about changes rather than guess.

Related: [Auth.md](Auth.md), [Data%20Security.md](Data%20Security.md),
[Security%20Checklist.md](Security%20Checklist.md), [SECURITY.md](SECURITY.md).

---

## 1. System overview

```
Visitor browser
  │  HTTPS
  ├──────────────► GitHub Pages (static HTML/CSS/JS, service worker)
  │
  ├──────────────► Supabase Auth        (anonymous + account RPCs)
  ├──────────────► Supabase Postgres    (RLS tables + SECURITY DEFINER RPCs)
  ├──────────────► Supabase Realtime    (postgres_changes / broadcast)
  ├──────────────► Supabase Storage     (private chat-uploads bucket)
  └──────────────► api.dicebear.com     (generated avatar images)

GitHub Actions
  ├── deploy-pages.yml  → builds/stamps the static artifact
  ├── ci.yml            → tests + syntax + npm audit
  └── bug-reports-to-issues.yml → reads bug_reports with a secret key,
                                  opens GitHub issues

Optional self-hosted: visitor browser ──HTTP/WS──► server.js (Express/Socket.IO,
                      JSON file store, signed upload links)
```

### Trust boundaries

| Boundary | Trusted side | Untrusted side |
|---|---|---|
| Browser ↔ Supabase | RLS + `SECURITY DEFINER` RPCs | All request bodies, query params, JWT claims supplied by the client |
| Browser ↔ GitHub Pages | Served static files | Anything in local storage or the DOM, including user content |
| GitHub Actions ↔ Supabase | Runner-held secret key | Report content written by the public |
| Self-hosted server | Host filesystem/env | Every connected socket and HTTP client |
| User ↔ user | — | Messages, uploads, profiles, avatars, display names |

The core security invariant: **the database, not the browser, decides who may
read or write a row.** A UI-only check is not a control.

---

## 2. Assets

- Account credentials (password digests, bcrypt hashes, pepper).
- Supabase auth sessions and `account_sessions` links.
- Private room existence, passkeys, membership and bans.
- Message content, uploads, reactions and read receipts.
- Usernames, avatars and presence.
- Bug reports (may contain personal data or vuln details).
- Service availability and the operator's reputation.
- Build/deploy integrity (the artifact served by Pages).

---

## 3. Actors

| Actor | Capability | Motivation |
|---|---|---|
| Anonymous visitor | Can use the app, sign in anonymously, read public rooms | Curiosity, scraping |
| Registered user | Account, rooms, messages, uploads | Chat, sometimes abuse |
| Malicious user | Same as above plus scripts/devtools | Harassment, data access, vandalism |
| Room owner/admin | Manage one room, kick/ban/members | Control their room |
| Operator | Supabase dashboard, GitHub repo, Actions secrets | Run and secure the service |
| Infrastructure insider | GitHub/Supabase staff | Out of the app's control |
| Automated scanner | Broad probing | Opportunistic |

The operator is trusted but is still a single point of failure. The app should
not require the operator to read message plaintext to keep it secure.

---

## 4. Threats and mitigations

### T1 — Horizontal privilege escalation (read another room's data)

*Vector:* craft REST/Realtime requests with someone else's room or client ID.

*Mitigation:* RLS `room_accessible(room, auth.uid())`; messages check both
`payload.room` and `payload.userId`; storage checks the room folder. Client-side
checks are cosmetic on top of these. **Residual risk:** bugs in
`current_identity_ids()` or role helpers could widen access; these functions are
security-critical and need review.

### T2 — Vertical privilege escalation (become owner/admin)

*Vector:* write `owner_id`/`admins`/`members` directly, or call a role RPC with
a forged identifier.

*Mitigation:* RLS update policy requires existing ownership/admin rights;
`room_*` RPCs are `SECURITY DEFINER` and re-check the caller before mutating.
**Residual risk:** identifier resolution (`resolve_identities`) accepts
username or Client ID and may match more identities than intended; bans and
roles follow the account's identities.

### T3 — Account takeover

*Vector:* credential stuffing, password guessing, leaked digest, session theft,
XSS, malicious browser extension.

*Mitigation:* SHA-256 client digest + bcrypt-12 with a Vault pepper; dummy hash
for unknown users; 5-failure/15-minute lockout; 30-day session links; no
third-party scripts. **Residual risk:** no MFA, no password reset, weak
passwords allowed, lockout can be used to deny login to a known username
(availability, not takeover), and a compromised browser defeats all of it.

### T4 — Session theft / fixation

*Vector:* steal local storage or a refresh token; reuse an old signed URL.

*Mitigation:* Supabase handles session tokens; HTTPS only on the hosted build;
`account_sessions` links expire; signed upload URLs expire (7 days).
**Residual risk:** local storage is readable by any script on the origin and by
extensions; there is no per-session revocation UI; a leaked signed URL is a
bearer token until expiry.

### T5 — Cross-site scripting and content injection

*Vector:* message text, username, avatar URL, room name, bug-report fields,
link previews.

*Mitigation:* escaped text rendering, `escapeAttr` for attribute contexts, URL
scheme/extension filtering, CSP on the self-hosted server, no `eval`, no
third-party script tags. **Residual risk:** any future `innerHTML` concatenation
with unescaped input reintroduces XSS; CSP coverage on Pages is limited to what
GitHub sets.

### T6 — Malicious uploads

*Vector:* HTML/SVG/JS disguised as an image, oversized files, path traversal,
malware.

*Mitigation:* private bucket, MIME/extension/size allow-lists, forced
`Content-Type` from the bucket, images rendered in `<img>`, files downloaded,
signed URLs. **Residual risk:** no antivirus; a user can still download and run
a malicious PDF/DOCX; storage objects may outlive their message.

### T7 — Abuse and harassment

*Vector:* spam, hate speech, doxxing, unwanted contact, ban evasion via new
accounts/identities.

*Mitigation:* room roles, kick/ban/unban, report form, operator moderation,
13+ gate, link caps, rate limits. **Residual risk:** banning is per identity;
a determined user can create a new account. There is no automated content
classification.

### T8 — Denial of service

*Vector:* message/upload floods, Realtime subscription spam, huge payloads,
login-lockout abuse.

*Mitigation:* request/event rate limits, payload size caps, database length
checks, per-device bug-report cap, provider-level protections. **Residual risk:**
no WAF or global quota; the hosted build depends on Supabase/GitHub limits; the
self-hosted server is single-process and file-backed.

### T9 — Data exposure via the client

*Vector:* a secret key committed to `public/`, verbose errors, debug logs, a
misconfigured Supabase policy.

*Mitigation:* only the publishable key is client-side; the secret key lives in
Actions secrets; code review and CI check for syntax/tests; docs repeat the rule.
**Residual risk:** the publishable key is public by design — its safety depends
entirely on RLS being correct.

### T10 — Supply chain

*Vector:* malicious/compromised npm package, Supabase client build, GitHub
Action, or CDN asset.

*Mitigation:* small dependency set, vendored Supabase browser library, pinned
lockfile, `npm audit --omit=dev` in CI, no runtime CDN script. **Residual risk:**
no SBOM/signing/provenance verification; GitHub Actions use major-version tags
rather than commit SHAs; transitive dependencies can still be compromised.

### T11 — Deploy integrity

*Vector:* tampered build, stale cached HTML, unauthorized push.

*Mitigation:* Pages deploys only from `main` via Actions; CI gates the deploy;
build ID stamped into the page and `version.json`; branch protection is a repo
setting. **Residual risk:** repository/account compromise; no signed commits or
artifact attestations; the service worker caches assets (network-first, but a
poisoned cache could persist until update).

### T12 — Privacy and legal exposure

*Vector:* over-collection, indefinite retention, undisclosed third parties,
failure to honour access/deletion requests.

*Mitigation:* data minimisation, published Privacy Policy and Cookies & Storage
Notice, retention and deletion paths, contact channels, documented subprocessors.
**Residual risk:** account deletion cannot reach provider backups/logs; no
formal DPO or records-of-processing; the operator is an individual, not a
registered entity.

### T13 — Self-hosted misconfiguration

*Vector:* expose `server.js` to the internet with no auth, lose `db.json`, leak
`UPLOAD_SECRET`/`ADMIN_TOKEN`, run over HTTP.

*Mitigation:* documented as trusted-network-only; destructive admin API removed;
signed upload URLs; atomic JSON writes; env-based secrets.
**Residual risk:** there is no authentication layer at all. Treat any public
deployment as fully open.

### T14 — Bug-report pipeline exposure

*Vector:* read other users' reports through the anon key, or leak the service
key in Actions logs.

*Mitigation:* `bug_reports` is write-only via a rate-limited RPC (no client
`SELECT`); the workflow reads with a repository secret and does not echo it;
GitHub issues are created in the operator's repo. **Residual risk:** a report
that contains secrets becomes a GitHub issue; issue visibility follows repo
settings.

---

## 5. Security assumptions

1. GitHub, Supabase and the user's browser are not compromised.
2. TLS is not intercepted; the user checks the origin.
3. RLS migrations have actually been applied to the production project.
4. The service key and pepper are not in the repository or client bundle.
5. The operator reviews changes to `supabase/*.sql` and
   `public/supabase-client.js` with extra care.
6. Users do not reuse a valuable password and do not paste secrets into chat or
   bug reports.

If any assumption fails, the corresponding mitigation may not hold.

---

## 6. Out of scope

- Nation-state adversaries, physical access, compromised devices, malicious
  browser extensions.
- Volumetric DDoS and provider outages.
- Vulnerabilities in GitHub, Supabase, DiceBear or browsers (report upstream).
- Content moderation decisions and interpersonal disputes.
- Legal compliance certification. The legal pages are a good-faith baseline, not
  a legal audit.

---

## 7. Review triggers

Revisit this model when:

- a new table, RPC, bucket or third-party service is added,
- authentication, sessions, roles or bans change,
- upload types/limits change,
- the bug-report pipeline or any secret handling changes,
- a security report exposes a new class of issue,
- the app moves off GitHub Pages/Supabase.

Keep changes small, test the database policies, and update this file with the
code.
