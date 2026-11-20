-- Hardening follow-up: the account vault is accessed only by the authenticated
-- lbt-account-recovery Edge Function, which uses the service role after validating
-- a Supabase JWT or a user-held recovery key. Remove unused browser-facing RLS
-- policies so security scanners do not report anonymous end-user access paths.
-- Direct table privileges for anon/authenticated were revoked in the initial migration;
-- RLS remains enabled and the service_role backend continues to access the tables.
drop policy if exists lbt_account_vaults_select_own on public.lbt_account_vaults;
drop policy if exists lbt_account_vaults_insert_own on public.lbt_account_vaults;
drop policy if exists lbt_account_vaults_update_own on public.lbt_account_vaults;
drop policy if exists lbt_account_vaults_delete_own on public.lbt_account_vaults;

drop policy if exists lbt_account_vault_versions_select_own on public.lbt_account_vault_versions;
drop policy if exists lbt_account_vault_versions_insert_own on public.lbt_account_vault_versions;
drop policy if exists lbt_account_vault_versions_delete_own on public.lbt_account_vault_versions;
