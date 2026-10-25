-- Optional LBT account cloud backup. Existing browser-only accounts continue to work unchanged.
-- Online backup is opt-in; no data is uploaded until a user explicitly enables it.
create table if not exists public.lbt_account_vaults (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  recovery_hash text unique,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lbt_account_vaults_identity_required check (user_id is not null or recovery_hash is not null),
  constraint lbt_account_vaults_payload_object check (jsonb_typeof(payload) = 'object')
);

create unique index if not exists lbt_account_vaults_user_id_uidx
  on public.lbt_account_vaults(user_id)
  where user_id is not null;

create table if not exists public.lbt_account_vault_versions (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.lbt_account_vaults(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  revision bigint not null check (revision > 0),
  payload jsonb not null,
  saved_at timestamptz not null default now(),
  constraint lbt_account_vault_versions_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint lbt_account_vault_versions_revision_uidx unique (vault_id, revision)
);

create index if not exists lbt_account_vault_versions_owner_saved_idx
  on public.lbt_account_vault_versions(user_id, saved_at desc);

alter table public.lbt_account_vaults enable row level security;
alter table public.lbt_account_vault_versions enable row level security;

-- Client data access is owner-only. Recovery-key requests go through the Edge Function,
-- which verifies a high-entropy key and never exposes the service key to the browser.
revoke all on table public.lbt_account_vaults from anon, authenticated;
grant select, insert, update, delete on table public.lbt_account_vaults to authenticated;
revoke all on table public.lbt_account_vault_versions from anon, authenticated;
grant select, insert, delete on table public.lbt_account_vault_versions to authenticated;

drop policy if exists lbt_account_vaults_select_own on public.lbt_account_vaults;
create policy lbt_account_vaults_select_own
  on public.lbt_account_vaults for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists lbt_account_vaults_insert_own on public.lbt_account_vaults;
create policy lbt_account_vaults_insert_own
  on public.lbt_account_vaults for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists lbt_account_vaults_update_own on public.lbt_account_vaults;
create policy lbt_account_vaults_update_own
  on public.lbt_account_vaults for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists lbt_account_vaults_delete_own on public.lbt_account_vaults;
create policy lbt_account_vaults_delete_own
  on public.lbt_account_vaults for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists lbt_account_vault_versions_select_own on public.lbt_account_vault_versions;
create policy lbt_account_vault_versions_select_own
  on public.lbt_account_vault_versions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists lbt_account_vault_versions_insert_own on public.lbt_account_vault_versions;
create policy lbt_account_vault_versions_insert_own
  on public.lbt_account_vault_versions for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists lbt_account_vault_versions_delete_own on public.lbt_account_vault_versions;
create policy lbt_account_vault_versions_delete_own
  on public.lbt_account_vault_versions for delete to authenticated
  using ((select auth.uid()) = user_id);


-- Keep recovery-key-backed snapshots if the linked Supabase Auth identity is deleted.
-- Accounts without a recovery key are removed with the identity, because no supported
-- recovery route would remain. History follows the vault's lifetime, not the identity.
create or replace function public.lbt_prepare_vaults_for_auth_user_deletion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $
begin
  delete from public.lbt_account_vaults
    where user_id = old.id and recovery_hash is null;
  update public.lbt_account_vaults
    set user_id = null
    where user_id = old.id and recovery_hash is not null;
  return old;
end;
$;

revoke all on function public.lbt_prepare_vaults_for_auth_user_deletion() from public, anon, authenticated;
drop trigger if exists lbt_prepare_vaults_before_auth_user_delete on auth.users;
create trigger lbt_prepare_vaults_before_auth_user_delete
  before delete on auth.users
  for each row execute function public.lbt_prepare_vaults_for_auth_user_deletion();

-- Anonymous recovery-key vault creation is public by design, so cap new vaults per
-- source IP to avoid unbounded unauthenticated database growth. Store only an IP digest.
create table if not exists public.lbt_account_recovery_rate_limits (
  ip_digest text primary key check (ip_digest ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);
create index if not exists lbt_account_recovery_rate_limits_window_idx
  on public.lbt_account_recovery_rate_limits(window_started_at);

alter table public.lbt_account_recovery_rate_limits enable row level security;
revoke all on table public.lbt_account_recovery_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.lbt_account_recovery_rate_limits to service_role;

create or replace function public.lbt_consume_recovery_rate_limit(
  p_ip_digest text,
  p_limit integer default 10,
  p_window_seconds integer default 3600
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
  v_reset boolean;
  v_now timestamptz := clock_timestamp();
begin
  if p_ip_digest !~ '^[a-f0-9]{64} (ip_digest, window_started_at, request_count)
  values (p_ip_digest, v_now, 1)
  on conflict (ip_digest) do update
  set
    window_started_at = case
      when public.lbt_account_recovery_rate_limits.window_started_at
        + make_interval(secs => p_window_seconds) <= v_now
      then v_now
      else public.lbt_account_recovery_rate_limits.window_started_at
    end,
    request_count = case
      when public.lbt_account_recovery_rate_limits.window_started_at
        + make_interval(secs => p_window_seconds) <= v_now
      then 1
      else public.lbt_account_recovery_rate_limits.request_count + 1
    end
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.lbt_consume_recovery_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.lbt_consume_recovery_rate_limit(text, integer, integer) to service_role;
 or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  delete from public.lbt_account_recovery_rate_limits
    where window_started_at < v_now - interval '1 day';

  insert into public.lbt_account_recovery_rate_limits (ip_digest, window_started_at, request_count)
  values (p_ip_digest, v_now, 1)
  on conflict (ip_digest) do update
  set
    window_started_at = case
      when public.lbt_account_recovery_rate_limits.window_started_at
        + make_interval(secs => p_window_seconds) <= v_now
      then v_now
      else public.lbt_account_recovery_rate_limits.window_started_at
    end,
    request_count = case
      when public.lbt_account_recovery_rate_limits.window_started_at
        + make_interval(secs => p_window_seconds) <= v_now
      then 1
      else public.lbt_account_recovery_rate_limits.request_count + 1
    end
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.lbt_consume_recovery_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.lbt_consume_recovery_rate_limit(text, integer, integer) to service_role;
