-- LBT recovery failover and public page-view totals.
-- D1 500 MB Free tier; chunk payloads so every row remains below the 2 MB limit.
CREATE TABLE IF NOT EXISTS vaults (
  recovery_hash TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  write_token TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vault_chunks (
  recovery_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  PRIMARY KEY (recovery_hash, revision, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_vault_chunks_lookup ON vault_chunks (recovery_hash, revision, chunk_index);

CREATE TABLE IF NOT EXISTS vault_versions (
  recovery_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  saved_at TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  payload_hash TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (recovery_hash, revision)
);
CREATE INDEX IF NOT EXISTS idx_vault_versions_lookup ON vault_versions (recovery_hash, revision DESC);
CREATE TABLE IF NOT EXISTS vault_version_chunks (
  recovery_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  PRIMARY KEY (recovery_hash, revision, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_vault_version_chunks_lookup ON vault_version_chunks (recovery_hash, revision, chunk_index);

