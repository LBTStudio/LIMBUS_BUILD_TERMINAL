-- Add stable content fingerprints for safe Supabase/Cloudflare replica comparison.
-- Empty legacy hashes are populated by the recovery endpoint on read when needed.
ALTER TABLE public.lbt_account_vaults
  ADD COLUMN IF NOT EXISTS payload_hash text NOT NULL DEFAULT '';

ALTER TABLE public.lbt_account_vault_versions
  ADD COLUMN IF NOT EXISTS payload_hash text NOT NULL DEFAULT '';
