# Data Security

How ptr_29 Chat stores, transmits and protects data, and what its limits are.
This document describes the hosted build (GitHub Pages + Supabase) and, where
relevant, the self-hosted Node build. Pair it with [Auth.md](Auth.md),
[Threat%20Model.md](Threat%20Model.md), and [SECURITY.md](SECURITY.md).

> Status: independent, small project. The controls below are implemented, but
> there is no third-party certification, penetration-test report, or uptime SLA.

---

## 1. Data inventory

| Data | Where it lives | Who can read it |
|---|---|---|
| Username, avatar URL, profile flags | Supabase `public.users`, `public.accounts` | Authenticated sessions (profile/presence); account rows only via RPCs |
| Password digest (SHA-256 of password + username) | Sent to `register_account`/`login_account` over HTTPS | Never stored; used for bcrypt |
| Password hash (`crypt(digest ‖ pepper, bcrypt-12)`) | Supabase `public.accounts.pass_hash` | No client policy; RPCs only |
| Pepper | Supabase Vault (`ptr29_pepper_v2`) | `SECURITY DEFINER` helper only |
| Auth uid / session link | `public.account_sessions` | No client policy; used inside RPCs |
| Messages, reactions, receipts, presence | Supabase tables | Sessions with room access (RLS) |
| Uploaded images/files | Supabase Storage bucket `chat-uploads` (private) | Sessions with room access; signed URLs |
| Room metadata, passkeys, roles, bans | Supabase `public.rooms` and related tables | Room access / owner-admin roles |
| Bug reports | Supabase `public.bug_reports` | Operator via secret key; mirrored to GitHub issues |
| Client ID, theme, passkeys, drafts, unread state | Browser local/session storage | The app's JavaScript on this origin |
| Server logs (IP, user agent, request metadata) | GitHub Pages / Supabase / GitHub Actions | Those providers, operator where available |

There is no advertising or behavioural-analytics pipeline, and no sale of
personal data.

---

## 2. Transport

- The production site is served over HTTPS by GitHub Pages (`https://`).
- All Supabase REST, Realtime and Storage traffic uses HTTPS/WSS.
- The self-hosted Node server speaks plain HTTP unless you put it behind a TLS
  reverse proxy. **Do not run it over the public internet without TLS.**
- No HSTS header is set by the app itself on the hosted build; GitHub Pages
  controls response headers there. The self-hosted server can be fronted by a
  proxy that adds HSTS.
- The publishable/anon key is shipped to the browser by design. It authorizes
  only what RLS allows.

---

## 3. At-rest protection

- Supabase encrypts managed Postgres and Storage at rest; the exact mechanism
  and key management are Supabase's responsibility, not this project's.
- The repository contains only migrations, client code and documentation. It
  contains no production database dump, no `.env`, and no service key.
- The self-hosted build stores `data/db.json` and `uploads/` as plain files on
  the host's disk. Protect them with filesystem permissions and, ideally, full
  disk encryption. Writes now use a temp file + rename so a crash cannot leave a
  truncated `db.json`.
- Backups of a self-hosted deployment are copies of the same plaintext files;
  protect and expire them accordingly.

---

## 4. Access control

- Supabase RLS is enabled on every application table and on `storage.objects`.
  See `supabase/011_security_hardening.sql` and
  `supabase/029_upload_policy_and_message_fix.sql`.
- Room access is decided by `room_accessible(room, uid)`: public rooms are
  readable by any authenticated session; private rooms by owner, admins or
  members.
- Message writes must match the caller's `auth.uid()`; the server does not
  trust a `client_id` in the payload.
- Account-only actions (profile update, rename, delete) require an unexpired
  `account_sessions` row for the current auth uid.
- Storage paths must be inside the room folder the caller can access, and the
  bucket enforces MIME-type and size allow-lists (10 MB limit).
- The service/secret key is used only in
  `.github/workflows/bug-reports-to-issues.yml`, read from Actions secrets at
  run time. The browser never receives it.

---

## 5. Credential handling

- Plaintext passwords never leave the browser. The client sends a SHA-256 digest
  of `password + ":" + lowercased username`.
- The server applies a pepper from Vault and a bcrypt-12 hash.
- bcrypt comparison is constant-time with respect to the hash comparison; a
  dummy hash is computed for nonexistent usernames to reduce timing leaks.
- Five failed logins lock the username for 15 minutes (`login_locks`).
- The pepper is versioned so it can be rotated without invalidating existing
  hashes; rows are upgraded on successful login. Registration fails closed if
  the Vault secret is missing.
- The old v1 pepper remains in older migration files and in the legacy
  verification path. It should be treated as compromised-ish historical data:
  it only protects accounts that have not logged in since the migration.
- Session links expire after 30 days and are refreshed on login. The pepper
  migration does not revoke existing Supabase sessions.
- No MFA is available. Account takeover protection depends on password strength
  and the lockout.

---

## 6. Uploads and media

- Allowed images: JPEG, PNG, GIF, WebP (≤ 5 MB in the message policy).
- Allowed files: PDF, plain text, CSV, JSON, DOCX, XLSX, PPTX (≤ 10 MB).
- HTML, SVG, JavaScript and executables are blocked by extension and MIME.
- The `chat-uploads` bucket is private; objects are read through signed URLs
  (currently 7 days in the client) and therefore a shared URL remains usable
  until it expires. Treat signed URLs as bearer tokens.
- The browser renders shared images in an `<img>` tag. It does not execute
  uploaded files. File attachments are downloaded, not previewed.
- Uploaded content is not scanned for malware. Do not open untrusted
  attachments outside the browser's protections.
- The self-hosted server validates data-URL type and size, stores files under
  `uploads/`, and serves them only with a valid HMAC signature.

---

## 7. Rendering and injection defence

- User text is inserted with `textContent`/escaped HTML rather than raw
  `innerHTML`; attribute values use a quote-escaping helper (`escapeAttr`).
- URLs are normalised and filtered before rendering as links (blocked schemes,
  embedded credentials, executable extensions, per-message link caps).
- The self-hosted server sends a restrictive Content-Security-Policy
  (`default-src 'self'`, no `object-src`, no framing), `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` disabling camera/microphone/geolocation/payment/USB, and
  `Cross-Origin-Resource-Policy: same-origin`.
- The hosted build relies on GitHub Pages for most headers; the HTML does not
  pull third-party scripts. The Supabase client is vendored under
  `public/vendor/`, not loaded from a CDN.
- Realtime payloads and REST rows are validated by database policies before
  they are written; the client still treats them as untrusted input.

---

## 8. Rate limiting and abuse controls

- Self-hosted HTTP API: 180 requests/minute per client; uploads 20/minute.
- Self-hosted Socket.IO events: per-socket counters for messages, reactions and
  similar events.
- Hosted build: Supabase-side limits plus database RPC checks. Bug reports are
  capped at 5 per hour per auth uid.
- Login attempts: 5 failures then a 15-minute lock per username.
- There is no global WAF, bot-management or IP reputation layer. A determined
  volumetric attacker is out of scope for the app itself (see
  [SECURITY.md](SECURITY.md#out-of-scope)).

---

## 9. Logging and monitoring

- GitHub Pages, Supabase and GitHub Actions keep provider-level request and
  error logs. Retention and access are governed by those providers.
- The app does not run its own analytics or session recording.
- Bug reports capture the page URL, user agent, viewport, theme and build ID to
  make reports actionable. Reporters should avoid pasting secrets.
- Self-hosted deployments log to stdout/stderr; configure log rotation and
  avoid logging credentials or message bodies.
- Security reports and fixes are tracked privately via GitHub security
  advisories where possible.

---

## 10. Backups and retention

- Supabase backups are a plan/provider feature; verify what your project's plan
  actually retains before relying on it.
- There is no application-level export/backup UI for chat content.
- Deleted messages and rooms are removed from their tables, but may persist in
  provider backups, point-in-time recovery, logs, or signed URLs until those
  expire. Storage objects are not reliably garbage-collected when a message is
  deleted.
- Bug reports are retained while the issue is investigated and mirrored into
  GitHub issues; GitHub issue retention then applies.
- Account deletion is described in [Auth.md](Auth.md#6-account-deletion-and-rename).

---

## 11. Incident response

1. **Contain** — if a credential is exposed, rotate it in Supabase (publishable
   key, secret key, JWT secret, Vault pepper) and in GitHub Actions secrets.
2. **Assess** — use Supabase logs/Auth users and provider logs to determine
   scope. Ask reporters for the build ID from `<meta name="ptr29-build">` or
   `version.json`.
3. **Eradicate** — patch the code, add a regression test, and re-run
   `npm test` and `npm audit --omit=dev`.
4. **Recover** — deploy, verify `/health` for self-hosted, and confirm the
   hosted build loads.
5. **Notify** — where a breach is likely to result in a risk to rights and
   freedoms, notify affected users and any required authority without undue
   delay, using the published contact channels.
6. **Review** — record what happened, what was changed, and any residual risk.

Do not publish exploit details before a fix is deployed. Report privately per
[SECURITY.md](SECURITY.md).

---

## 12. Third parties

GitHub (Pages, issues, Actions), Supabase (Auth/Postgres/Realtime/Storage) and
DiceBear (default avatars) are the only runtime processors. WhatsApp,
Instagram and YouTube are contact links opened only by user action. Component
and licence details are in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
