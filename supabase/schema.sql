-- Tyverix accounts + licensing schema (Supabase / Postgres).
--
-- Run this once in the Supabase SQL editor (or via `supabase db push`). It is
-- idempotent enough to re-run during setup.
--
-- Model: accounts are plain Supabase Auth users. A "subscription" is simply the
-- presence of a non-revoked, unexpired row in `licenses` whose email matches the
-- account's email. License keys are minted server-side by the `issue-license`
-- edge function (which holds the Ed25519 private key) and stored here so the
-- owner can fetch them after signing in. The desktop app still verifies each key
-- fully offline against its embedded public key.

create table if not exists public.licenses (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  tier         text not null default 'pro',
  license_key  text not null,
  issued       date not null,
  expires      date not null,
  days         integer not null,
  revoked      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists licenses_email_idx on public.licenses (lower(email));

alter table public.licenses enable row level security;

-- Owners may read their own licenses (matched by the email on their JWT).
-- Writes are intentionally NOT granted to anon/authenticated: only the
-- edge function (service-role key) inserts/updates rows, so keys can never be
-- forged or back-dated from the client.
drop policy if exists "owners can read their licenses" on public.licenses;
create policy "owners can read their licenses"
  on public.licenses
  for select
  to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));
