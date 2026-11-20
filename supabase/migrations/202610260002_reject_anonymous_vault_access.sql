-- Defense in depth: anonymous Auth users share the PostgreSQL authenticated role.
-- Account vault policies must require a non-anonymous JWT even though browser roles have
-- no table grants and normal reads/writes are mediated by the Edge Function.
begin;

drop policy if exists lbt_account_vaults_select_own on public.lbt_account_vaults;
create policy lbt_account_vaults_select_own
  on public.lbt_account_vaults for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

drop policy if exists lbt_account_vaults_insert_own on public.lbt_account_vaults;
create policy lbt_account_vaults_insert_own
  on public.lbt_account_vaults for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

drop policy if exists lbt_account_vaults_update_own on public.lbt_account_vaults;
create policy lbt_account_vaults_update_own
  on public.lbt_account_vaults for update to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  )
  with check (
    (select auth.uid()) = user_id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

drop policy if exists lbt_account_vaults_delete_own on public.lbt_account_vaults;
create policy lbt_account_vaults_delete_own
  on public.lbt_account_vaults for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

drop policy if exists lbt_account_vault_versions_select_own on public.lbt_account_vault_versions;
create policy lbt_account_vault_versions_select_own
  on public.lbt_account_vault_versions for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

drop policy if exists lbt_account_vault_versions_insert_own on public.lbt_account_vault_versions;
create policy lbt_account_vault_versions_insert_own
  on public.lbt_account_vault_versions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

drop policy if exists lbt_account_vault_versions_delete_own on public.lbt_account_vault_versions;
create policy lbt_account_vault_versions_delete_own
  on public.lbt_account_vault_versions for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

-- Service-role only rate-limit table. This explicit policy keeps the intended
-- machine-only access model clear to the security advisor; browser roles have no grants.
drop policy if exists lbt_account_recovery_rate_limits_service_role
  on public.lbt_account_recovery_rate_limits;
create policy lbt_account_recovery_rate_limits_service_role
  on public.lbt_account_recovery_rate_limits for all to service_role
  using (true)
  with check (true);

commit;
