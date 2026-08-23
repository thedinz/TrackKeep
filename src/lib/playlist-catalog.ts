import { getSpotifyBuDatabase } from "./database";
import type { PlaylistSummary } from "./spotify";

export type PersistedSpotifyPlaylistCatalog = {
  playlists: PlaylistSummary[];
  updatedAt: string;
};

type SpotifyPlaylistCatalogRow = {
  playlists_json: string;
  updated_at: string;
};

export function persistSpotifyPlaylistCatalog(playlists: PlaylistSummary[]) {
  const updatedAt = new Date().toISOString();

  getSpotifyBuDatabase()
    .prepare(
      `
        INSERT INTO spotify_playlist_catalog (id, playlists_json, updated_at)
        VALUES (1, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          playlists_json = excluded.playlists_json,
          updated_at = excluded.updated_at
      `
    )
    .run(JSON.stringify(playlists), updatedAt);

  return {
    playlists,
    updatedAt
  } satisfies PersistedSpotifyPlaylistCatalog;
}

export function getPersistedSpotifyPlaylistCatalog() {
  const row = getSpotifyBuDatabase()
    .prepare(
      `
        SELECT playlists_json, updated_at
        FROM spotify_playlist_catalog
        WHERE id = 1
      `
    )
    .get() as SpotifyPlaylistCatalogRow | undefined;

  if (!row) {
    return null;
  }

  try {
    const playlists = JSON.parse(row.playlists_json) as unknown;

    if (!Array.isArray(playlists)) {
      return null;
    }

    return {
      playlists: playlists.filter(isPlaylistSummary),
      updatedAt: row.updated_at
    } satisfies PersistedSpotifyPlaylistCatalog;
  } catch {
    return null;
  }
}

function isPlaylistSummary(value: unknown): value is PlaylistSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const playlist = value as Partial<PlaylistSummary>;

  return (
    typeof playlist.id === "string" &&
    typeof playlist.name === "string" &&
    typeof playlist.owner === "string" &&
    typeof playlist.tracksTotal === "number"
  );
}
