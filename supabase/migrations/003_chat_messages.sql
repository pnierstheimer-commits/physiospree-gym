-- ---------------------------------------------------------------------------
-- 003: Coach-Chat (Block 3)
-- Persistenter Dialog mit dem Coach. Append-only: Nachrichten werden nie
-- gelöscht, nur `status` ändert sich (confirmed/rejected). proposed_markers
-- als JSONB (camelCase ParsedMarker[], analog gym_plan_weeks.sessions).
-- RLS: auth.uid() = user_id für SELECT/INSERT/UPDATE/DELETE.
-- Idempotent (if not exists / drop policy if exists).
-- ---------------------------------------------------------------------------

create table if not exists public.gym_chat_messages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             text not null check (role in ('user', 'coach')),
  content          text not null,
  proposed_markers jsonb,
  status           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_gym_chat_messages_user
  on public.gym_chat_messages (user_id, created_at);

-- updated_at automatisch pflegen (Funktion stammt aus 001).
drop trigger if exists set_updated_at on public.gym_chat_messages;
create trigger set_updated_at
  before update on public.gym_chat_messages
  for each row execute function public.gym_set_updated_at();

-- Row Level Security
alter table public.gym_chat_messages enable row level security;

drop policy if exists owner_select on public.gym_chat_messages;
create policy owner_select on public.gym_chat_messages
  for select using (auth.uid() = user_id);

drop policy if exists owner_insert on public.gym_chat_messages;
create policy owner_insert on public.gym_chat_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists owner_update on public.gym_chat_messages;
create policy owner_update on public.gym_chat_messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists owner_delete on public.gym_chat_messages;
create policy owner_delete on public.gym_chat_messages
  for delete using (auth.uid() = user_id);
