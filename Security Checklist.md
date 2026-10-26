# Security Checklist

Operational checklist for maintaining ptr_29 Chat. Copy the relevant section
into a pull request or release note and tick what was actually verified. A box
that cannot be ticked is a known gap, not a formality.

Related: [SECURITY.md](SECURITY.md), [Auth.md](Auth.md),
[Data%20Security.md](Data%20Security.md), [Threat%20Model.md](Threat%20Model.md).

---

## Every change

- [ ] No secret, service key, pepper, token or `.env` file is added to
      `Chatting_updated/public/**` or committed anywhere.
- [ ] The only Supabase key shipped to the browser is the publishable/anon key.
- [ ] New user-controlled text is rendered escaped; new attribute interpolations
      use `escapeAttr`, not `escapeHtml`.
- [ ] New links pass through the URL filter and use `rel="noopener noreferrer"`
      with `target="_blank"`.
- [ ] New UI controls that show only an icon have an `aria-label`.
- [ ] New dialogs are reachable, focusable, and close with **Esc**.
- [ ] No new third-party script, font, or CDN dependency without review and a
      notice update.
- [ ] Errors shown to users do not include stack traces, SQL, tokens or other
      people's data.

---

## Before merging

- [ ] `cd Chatting_updated && npm test` passes (hermetic; uses `DATA_DIR`).
- [ ] `node --check server.js`, `data/store.js`, `public/client.js`,
      `public/supabase-client.js` pass.
- [ ] `npm audit --omit=dev --audit-level=high` reports no high/critical issues,
      or the exception is documented in the PR.
- [ ] The change works on a narrow (360 px) viewport and with keyboard only.
- [ ] Light and dark themes both meet readable contrast for changed text.
- [ ] No `console.log` of message content, credentials or tokens remains.
- [ ] If a migration was added, it is idempotent and ordered after its
      dependencies.

---

## Database / RLS changes

- [ ] RLS is enabled on any new table.
- [ ] The table has explicit `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies, or
      deliberately has none (write-only tables need a comment explaining why).
- [ ] Policies check `auth.uid()` and room access, not a body-supplied
      `client_id`/`userId`.
- [ ] `SECURITY DEFINER` functions set `search_path` and re-check the caller.
- [ ] Functions that return secrets are not executable by `anon`/`authenticated`.
- [ ] Storage policies check bucket, room folder, extension/MIME and size.
- [ ] The migration was tested on a staging/branch project before production.
- [ ] Existing sessions and data still work after the change (no accidental
      lockout or orphaned identity).

---

## Authentication / credential changes

- [ ] Password digests remain SHA-256 hex (`^[0-9a-f]{64}$`); no plaintext
      password is sent or logged.
- [ ] bcrypt cost is at least 12, and the pepper comes from Vault (not SQL text).
- [ ] `ptr29_current_pepper_version()` and `accounts.pepper_version` stay in
      sync.
- [ ] Legacy pepper verification still works for accounts that have not logged
      in since rotation.
- [ ] Login lockout (5 failures / 15 minutes) still applies and is cleared on
      success.
- [ ] Reserved-username checks still run before hash verification.
- [ ] `account_sessions` expiry is enforced for privileged account actions.
- [ ] Session/pepper rotation steps in [Auth.md](Auth.md#pepper-rotation) were
      followed if a secret changed.

---

## Secrets and CI

- [ ] GitHub Actions secrets are set: `SUPABASE_SECRET_KEY` (bug-report mirror
      only). Rotate immediately if exposed.
- [ ] Workflow logs do not echo secrets; no `set -x` around secret use.
- [ ] `ci.yml` still runs on PRs and gates `deploy-pages.yml`.
- [ ] Third-party Actions are reviewed; prefer pinning to a commit SHA for
      high-risk workflows.
- [ ] `UPLOAD_SECRET` and any admin token are environment-provided, strong, and
      unset by default.
- [ ] No local `.env`, `data/db.json` backup, or upload is staged.

---

## Deploy

- [ ] `main` is protected; deploys only from `main`.
- [ ] CI is green on the commit being deployed.
- [ ] The build stamps a fresh `<meta name="ptr29-build">` and `version.json`.
- [ ] The deployed page loads with the service worker and no console errors.
- [ ] Login, register, a message send, an upload, and a private-room join were
      smoke-tested on the deployed origin.
- [ ] For self-hosted: `GET /health` returns `{"status":"ok"}`; TLS terminates
      at the proxy; the server is not exposed to untrusted networks.

---

## Periodic (monthly / quarterly)

- [ ] `npm audit --omit=dev` reviewed; dependencies updated and re-tested.
- [ ] Supabase Auth users and `account_sessions` reviewed for anomalies.
- [ ] `login_locks` reviewed for targeted lockout abuse.
- [ ] Storage bucket size, object count and MIME allow-list reviewed.
- [ ] Expired signed URLs and orphaned storage objects considered for cleanup.
- [ ] `bug_reports` triaged; any report containing personal data handled and
      then removed on request.
- [ ] Legal pages still match reality (operator, processors, retention, dates).
- [ ] Backups exist and a restore has been tested (or the gap is recorded).
- [ ] Security advisories/issues reviewed and closed.
- [ ] Threat model reviewed against any new feature.

---

## Accessibility spot-check

- [ ] Tab order follows visual order; focus is visible.
- [ ] Icon-only buttons announce a name.
- [ ] Modals and the lightbox trap focus and restore it on close.
- [ ] Images have text alternatives; decorative images are marked.
- [ ] Form inputs have labels or `aria-label`s.
- [ ] No text relies on colour alone; contrast is checked in both themes.
- [ ] The page works at 200% zoom and with reduced motion enabled.

---

## Incident quick actions

1. Rotate the exposed credential (Supabase key/JWT, Vault pepper, Actions
   secret, `UPLOAD_SECRET`).
2. Preserve relevant logs before they age out.
3. Patch, test, deploy; do not discuss exploit details publicly before the fix
   is live.
4. Notify affected users/authority if required.
5. Write a short post-incident note and add a regression test/checklist item.

**Never** ask a reporter to send a password, passkey, session token, or service
key. Ask for the build ID and reproduction steps instead.
