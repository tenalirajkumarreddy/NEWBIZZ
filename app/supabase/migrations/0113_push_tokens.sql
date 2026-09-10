-- =====================================================================
-- 0113_push_tokens
-- Device push tokens (FCM) for mobile push notifications.
-- =====================================================================
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android','ios','web')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;

create policy "push_tokens_own"
  on public.push_tokens
  for all
  to authenticated
  using (user_id = current_app_user())
  with check (user_id = current_app_user());

grant select, insert, update, delete on public.push_tokens to authenticated;
