import { mkdirSync } from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { getTrackKeepEnvironmentValue } from "./trackkeep-env";

// The connection lives on globalThis so every copy of this module shares it.
// Test loaders on Node 22 and Next dev reloads can load the module twice, and
// a second copy would otherwise keep its own connection after the first one
// is closed or pointed at another file.
const databaseState = ((globalThis as {
  trackKeepDatabaseState?: { database: DatabaseSync | null };
}).trackKeepDatabaseState ??= { database: null });

export function getSpotifyBuDatabase() {
  if (databaseState.database) {
    return databaseState.database;
  }

  const databasePath = getSpotifyBuDatabasePath();

  mkdirSync(path.dirname(databasePath), {
    recursive: true
  });

  const database = new DatabaseSync(databasePath);

  databaseState.database = database;
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS playlist_backups (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL,
      playlist_name TEXT NOT NULL,
      owner_name TEXT,
      owner_id TEXT,
      track_count INTEGER NOT NULL,
      exported_at TEXT NOT NULL,
      snapshot_hash TEXT NOT NULL,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (playlist_id, snapshot_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_playlist_backups_playlist_created
      ON playlist_backups (playlist_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS spotify_playlist_catalog (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      playlists_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_bulk_jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      diagnostic_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      snapshot_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_provider_bulk_jobs_updated
      ON provider_bulk_jobs (updated_at DESC);
  `);

  return database;
}

export function closeSpotifyBuDatabase() {
  databaseState.database?.close();
  databaseState.database = null;
}

export function getSpotifyBuDatabasePath() {
  return (
    getTrackKeepEnvironmentValue("DATABASE_PATH")?.trim() ||
    path.join(getConfigDirectory(), "spotifybu.sqlite")
  );
}

function getConfigDirectory() {
  const configuredDirectory = getTrackKeepEnvironmentValue("CONFIG_DIR")?.trim();

  if (configuredDirectory) {
    return path.resolve(/* turbopackIgnore: true */ configuredDirectory);
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), ".spotifybu");
}
