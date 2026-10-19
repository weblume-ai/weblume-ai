-- Weblume AI: account sync table. Run once in Supabase → SQL Editor → New query → Run.
-- Stores only an encrypted blob per user; each user can read/write only their own row.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  data text not null check (length(data) < 200000),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.user_settings from anon;
grant select, insert, update, delete on public.user_settings to authenticated;
