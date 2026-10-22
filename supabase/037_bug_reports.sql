-- ═══════════════════════════════════════════════════════════════════
-- REPLICA chat · bug reports (in-site "Report a bug" feature)
-- Run AFTER 036_transfer_half_made_owner.sql in Supabase SQL Editor.
-- (idempotent — safe to re-run)
-- ═══════════════════════════════════════════════════════════════════
--
-- Reports are written through submit_bug_report() rather than a raw table
-- insert, so validation, length clamps and per-device rate limiting all run
-- server-side and cannot be bypassed by the client.
--
-- The table is WRITE-ONLY to the app: there is no select policy, so a
-- reporter can never read back other people's reports. The operator reads
-- them with the service role (see .github/workflows/bug-reports-to-issues.yml,
-- which mirrors new rows into GitHub issues).

create table if not exists public.bug_reports (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'bug'
               check (kind in ('bug','display','security','content','other')),
  title        text not null,
  details      text not null,
  steps        text not null default '',
  severity     text not null default 'normal'
               check (severity in ('low','normal','high','critical')),
  page_url     text not null default '',
  user_agent   text not null default '',
  viewport     text not null default '',
  theme        text not null default '',
  build        text not null default '',
  reporter_uid uuid,                              -- auth uid at submit time
  reporter_name text not null default '',
  contact      text not null default '',          -- optional, reporter-supplied
  status       text not null default 'new'
               check (status in ('new','triaged','fixed','wontfix','duplicate')),
  issue_number integer,                           -- GitHub issue, once mirrored
  created_at   timestamptz not null default now()
);

alter table public.bug_reports enable row level security;

-- No select/update/delete policies on purpose: the table is append-only from
-- the app's point of view. Everything a reporter is allowed to do happens
-- inside the SECURITY DEFINER function below.
drop policy if exists "bug_reports_insert" on public.bug_reports;

create index if not exists bug_reports_created_idx on public.bug_reports (created_at desc);
create index if not exists bug_reports_status_idx  on public.bug_reports (status);
create index if not exists bug_reports_uid_idx     on public.bug_reports (reporter_uid, created_at desc);

-- ── submit a report ──────────────────────────────────────────────────
create or replace function public.submit_bug_report(
  p_kind      text,
  p_title     text,
  p_details   text,
  p_steps     text default '',
  p_severity  text default 'normal',
  p_page_url  text default '',
  p_user_agent text default '',
  p_viewport  text default '',
  p_theme     text default '',
  p_build     text default '',
  p_contact   text default ''
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_kind     text := lower(coalesce(nullif(trim(p_kind), ''), 'bug'));
  v_severity text := lower(coalesce(nullif(trim(p_severity), ''), 'normal'));
  v_title    text := trim(coalesce(p_title, ''));
  v_details  text := trim(coalesce(p_details, ''));
  v_name     text := '';
  v_recent   integer;
begin
  -- Anyone may report (a raw anon visitor included): a report is the one
  -- action that should never be blocked behind an account.
  if v_kind not in ('bug','display','security','content','other') then
    v_kind := 'bug';
  end if;
  if v_severity not in ('low','normal','high','critical') then
    v_severity := 'normal';
  end if;

  if char_length(v_title) < 3 then
    return '{"ok":false,"error":"title_too_short"}'::jsonb;
  end if;
  if char_length(v_details) < 10 then
    return '{"ok":false,"error":"details_too_short"}'::jsonb;
  end if;

  -- Clamp everything: the client is untrusted, these columns are rendered
  -- into a GitHub issue by the mirror workflow.
  v_title   := left(v_title, 160);
  v_details := left(v_details, 6000);
  p_steps   := left(trim(coalesce(p_steps, '')), 3000);
  p_contact := left(trim(coalesce(p_contact, '')), 200);
  p_page_url := left(trim(coalesce(p_page_url, '')), 400);
  p_user_agent := left(trim(coalesce(p_user_agent, '')), 400);
  p_viewport := left(trim(coalesce(p_viewport, '')), 40);
  p_theme    := left(trim(coalesce(p_theme, '')), 40);
  p_build    := left(trim(coalesce(p_build, '')), 60);

  -- Rate limit: 5 reports per hour per auth uid. Anon sign-in gives every
  -- browser a uid, so this still throttles a logged-out visitor.
  if v_uid is not null then
    select count(*) into v_recent
      from public.bug_reports
     where reporter_uid = v_uid
       and created_at > now() - interval '1 hour';
    if v_recent >= 5 then
      return '{"ok":false,"error":"rate_limited"}'::jsonb;
    end if;

    select username into v_name
      from public.presence
     where uid = v_uid::text
     limit 1;
  end if;

  insert into public.bug_reports (
    kind, title, details, steps, severity,
    page_url, user_agent, viewport, theme, build,
    reporter_uid, reporter_name, contact
  ) values (
    v_kind, v_title, v_details, p_steps, v_severity,
    p_page_url, p_user_agent, p_viewport, p_theme, p_build,
    v_uid, coalesce(v_name, ''), p_contact
  )
  returning id into v_uid;   -- reuse as the returned id

  return jsonb_build_object('ok', true, 'id', v_uid);
end;
$$;

grant execute on function public.submit_bug_report(
  text, text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

-- ── operator helpers (service role / SQL editor only) ────────────────
-- Mark a report as mirrored so the workflow never opens a duplicate issue.
create or replace function public.mark_bug_report_mirrored(p_id uuid, p_issue integer)
returns void
language sql security definer
set search_path = public
as $$
  update public.bug_reports
     set issue_number = p_issue
   where id = p_id;
$$;

-- Not granted to anon/authenticated on purpose: only the service role or
-- the SQL editor may mark/review reports.
revoke all on function public.mark_bug_report_mirrored(uuid, integer) from public, anon, authenticated;

-- Verify after running:
--   select kind, severity, status, left(title, 40), created_at
--     from public.bug_reports order by created_at desc limit 10;
--   select public.submit_bug_report('bug','Test','This is a test report body');
