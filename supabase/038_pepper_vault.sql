-- ═══════════════════════════════════════════════════════════════════
-- REPLICA chat · move the password pepper into Supabase Vault
-- Run AFTER 037_bug_reports.sql in the Supabase SQL Editor.
--
-- WHY
--   Every earlier migration embeds the same pepper string in SQL. A
--   pepper only helps if it is secret, so it is now read from Vault and
--   new hashes are written with a version marker. Existing bcrypt hashes
--   were created with the old v1 pepper and cannot be re-hashed without
--   the plaintext password, so v1 is kept only as a legacy verification
--   fallback. On a successful login the row is transparently upgraded to
--   the v2 pepper.
--
-- BEFORE RUNNING
--   1. Generate a new pepper of at least 32 random characters, e.g.
--        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
--   2. Store it in Vault (SQL Editor):
--        select vault.create_secret(
--          '<PASTE_RANDOM_PEPPER_HERE>',
--          'ptr29_pepper_v2',
--          'ptr29 account password pepper, v2'
--        );
--      Re-running create_secret with the same name creates a new version;
--      the helper below always reads the newest value.
--   3. Only then run this file. Registration will fail closed if the
--      secret is missing rather than silently using a public pepper.
--
-- ROTATING AGAIN LATER
--   Create the secret again under the same name, bump CURRENT_VERSION,
--   and re-run. Accounts on the previous version are upgraded on login.
--   Do not delete old secret versions until you are willing to lock out
--   accounts that have not logged in since the rotation.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists supabase_vault with schema vault;

-- Which pepper version new hashes use. Bump this when rotating.
create or replace function public.ptr29_current_pepper_version()
returns smallint
language sql
immutable
as $$ select 2::smallint $$;

-- Version marker for existing/new account rows. 1 = original pepper.
alter table public.accounts
  add column if not exists pepper_version smallint not null default 1;

-- Internal helper. Never expose this through the API: it returns a secret.
create or replace function public.ptr29_pepper(p_version smallint)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v text;
begin
  if p_version >= 2 then
    select decrypted_secret into v
      from vault.decrypted_secrets
     where name = 'ptr29_pepper_v2'
     order by created_at desc
     limit 1;
    if v is null or length(v) < 32 then
      raise exception 'ptr29_pepper_v2 is missing or too short; add it with vault.create_secret() before rotating';
    end if;
    return v;
  end if;

  -- Legacy v1. Retained only so pre-rotation hashes can still be verified.
  return 'ptr29::v1::9f2c4a81d3b6e057';
end;
$$;

-- Only the SECURITY DEFINER functions below (owned by the migration role)
-- need this helper. Block direct RPC access from clients.
revoke all on function public.ptr29_pepper(smallint) from public, anon, authenticated;

-- ── Register: new accounts use the current (v2) pepper ───────────────
create or replace function public.register_account(un text, pass text, age_confirmed boolean, terms_accepted boolean)
returns jsonb
language plpgsql security definer
set search_path = public, extensions, vault
as $$
declare
  acc public.accounts%rowtype;
  pepper text := public.ptr29_pepper(public.ptr29_current_pepper_version());
begin
  if auth.uid() is null then
    return '{"ok":false,"error":"not_authenticated"}'::jsonb;
  end if;
  if age_confirmed is not true then
    return '{"ok":false,"error":"age_required"}'::jsonb;
  end if;
  if terms_accepted is not true then
    return '{"ok":false,"error":"terms_required"}'::jsonb;
  end if;
  if public.ptr29_username_reserved(un) or length(un) < 2 or length(un) > 50 or un ~ '[\r\n\t]' then
    return '{"ok":false,"error":"invalid_username"}'::jsonb;
  end if;
  if pass is null or pass !~ '^[0-9a-f]{64}$' then
    return '{"ok":false,"error":"invalid_credentials"}'::jsonb;
  end if;
  if exists (select 1 from public.accounts a where lower(a.username) = lower(un)) then
    return '{"ok":false,"error":"taken"}'::jsonb;
  end if;

  insert into public.accounts (username, pass_hash, age_confirmed, age_confirmed_at, terms_accepted, terms_accepted_at, pepper_version)
  values (un, crypt(pass || pepper, gen_salt('bf', 12)), true, now(), true, now(), public.ptr29_current_pepper_version())
  returning * into acc;

  insert into public.account_sessions (account_id, auth_uid)
  values (acc.id, auth.uid()::text)
  on conflict (account_id, auth_uid) do update
    set last_seen = now(), expires_at = now() + interval '30 days';

  return jsonb_build_object(
    'ok', true,
    'id', acc.id,
    'username', acc.username,
    'age_confirmed', true,
    'terms_accepted', true
  );
end;
$$;

grant execute on function public.register_account(text, text, boolean, boolean) to anon, authenticated;

-- ── Login: verify with the row's pepper version, then upgrade ────────
create or replace function public.login_account(un text, pass text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions, vault
as $$
declare
  acc public.accounts%rowtype;
  lock public.login_locks%rowtype;
  out_avatar text := '';
  current_version smallint := public.ptr29_current_pepper_version();
  row_version smallint;
begin
  if auth.uid() is null then
    return '{"ok":false,"error":"not_authenticated"}'::jsonb;
  end if;
  if pass is null or pass !~ '^[0-9a-f]{64}$' then
    return '{"ok":false,"error":"invalid_credentials"}'::jsonb;
  end if;

  -- Do not even attempt login with newly reserved names.
  if public.ptr29_username_reserved(un) then
    return '{"ok":false,"error":"invalid_username"}'::jsonb;
  end if;

  select * into lock from public.login_locks l where l.uname = lower(un);
  if found and lock.locked_until is not null and lock.locked_until > now() then
    return '{"ok":false,"error":"locked"}'::jsonb;
  end if;

  select * into acc from public.accounts a where lower(a.username) = lower(un);
  if not found then
    -- dummy work so timing doesn't reveal account existence. If Vault is not
    -- configured yet, fall back to the legacy pepper so unknown usernames do
    -- not produce a hard error when the table lookup itself is cheap.
    begin
      perform crypt(pass || public.ptr29_pepper(current_version), gen_salt('bf', 12));
    exception when others then
      perform crypt(pass || public.ptr29_pepper(1::smallint), gen_salt('bf', 12));
    end;
    return '{"ok":false,"error":"invalid_credentials"}'::jsonb;
  end if;

  -- Also block legacy accounts that already exist with anonymous variants.
  if public.ptr29_username_reserved(acc.username) then
    return '{"ok":false,"error":"invalid_username"}'::jsonb;
  end if;

  row_version := coalesce(acc.pepper_version, 1);

  if acc.pass_hash <> crypt(pass || public.ptr29_pepper(row_version), acc.pass_hash) then
    -- A v1 row that fails v1 might already have been upgraded by a race.
    if row_version < current_version
       and acc.pass_hash = crypt(pass || public.ptr29_pepper(current_version), acc.pass_hash) then
      -- fall through: accepted with the current pepper
      null;
    else
      insert into public.login_locks (uname, fails) values (lower(un), 1)
      on conflict (uname) do update
        set fails = public.login_locks.fails + 1,
            locked_until = case
              when public.login_locks.fails + 1 >= 5 then now() + interval '15 minutes'
              else public.login_locks.locked_until end;
      return '{"ok":false,"error":"invalid_credentials"}'::jsonb;
    end if;
  end if;

  -- Transparent upgrade to the current pepper. If Vault is temporarily
  -- unavailable, the password has already been verified: log the user in on
  -- the old hash rather than failing the request. The next successful login
  -- retries the upgrade.
  if row_version < current_version then
    begin
      update public.accounts
         set pass_hash = crypt(pass || public.ptr29_pepper(current_version), gen_salt('bf', 12)),
             pepper_version = current_version
       where id = acc.id;
    exception when others then
      null;
    end;
  end if;

  delete from public.login_locks l where l.uname = lower(un);

  insert into public.account_sessions (account_id, auth_uid)
  values (acc.id, auth.uid()::text)
  on conflict (account_id, auth_uid) do update
    set last_seen = now(), expires_at = now() + interval '30 days';

  out_avatar := coalesce(acc.avatar, '');
  if out_avatar = '' then
    select coalesce(u.avatar, '') into out_avatar
      from public.users u
     where u.client_id = acc.id::text
        or lower(u.username) = lower(acc.username)
     order by case when u.client_id = acc.id::text then 0 else 1 end,
              u.last_seen desc
     limit 1;
    out_avatar := coalesce(out_avatar, '');
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', acc.id,
    'username', acc.username,
    'avatar', out_avatar,
    'age_confirmed', coalesce(acc.age_confirmed, false),
    'terms_accepted', coalesce(acc.terms_accepted, false)
  );
end;
$$;

grant execute on function public.login_account(text, text) to anon, authenticated;

-- ── Delete account: accept either pepper version ─────────────────────
create or replace function public.delete_account(acct uuid, pass text)
returns jsonb language plpgsql security definer
set search_path = public, extensions, vault
as $$
declare
  acc        public.accounts%rowtype;
  auth_uids  text[];
  row_version smallint;
begin
  select * into acc from public.accounts where id = acct;
  if not found or pass is null or pass !~ '^[0-9a-f]{64}$' then
    return '{"ok":false,"error":"invalid_credentials"}'::jsonb;
  end if;

  row_version := coalesce(acc.pepper_version, 1);
  if acc.pass_hash <> crypt(pass || public.ptr29_pepper(row_version), acc.pass_hash) then
    return '{"ok":false,"error":"invalid_credentials"}'::jsonb;
  end if;

  -- Every auth uid this account ever signed in from (any browser/device).
  select array_agg(auth_uid) into auth_uids
    from public.account_sessions where account_id = acct;
  auth_uids := array_remove(array_append(coalesce(auth_uids, '{}'::text[]), auth.uid()::text), null);
  auth_uids := array_remove(auth_uids, '');

  delete from public.messages
   where lower(payload->>'username') = lower(acc.username)
      or lower(payload->>'clientId') = acct::text
      or lower(coalesce(payload->>'clientId','')) = any(auth_uids);
  delete from public.reactions
   where lower(username) = lower(acc.username) or uid = acct::text
      or lower(uid) = any(auth_uids);
  delete from public.receipts
   where lower(username) = lower(acc.username) or uid = acct::text
      or lower(uid) = any(auth_uids);
  delete from public.users
   where lower(username) = lower(acc.username) or client_id = acct::text
      or lower(client_id) = any(auth_uids);
  delete from public.presence
   where lower(username) = lower(acc.username) or uid = acct::text
      or lower(uid) = any(auth_uids);
  delete from public.rooms
   where owner_id = acct::text
      or lower(owner_id) = any(auth_uids);
  delete from public.account_sessions where account_id = acct;
  delete from public.login_locks where uname = lower(acc.username);
  delete from public.accounts where id = acct;

  return jsonb_build_object('ok', true, 'username', acc.username);
end;
$$;

grant execute on function public.delete_account(uuid, text) to anon, authenticated;
