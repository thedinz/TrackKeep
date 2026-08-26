import { getPersistedSpotifyPlaylistCatalog } from "./playlist-catalog";
import {
  getPersistedPlaylistBackupStatuses,
  type PlaylistBackupStatus
} from "./playlist-backup-status";
import type { PlaylistSummary } from "./spotify";

export type HomepageStats = {
  fullyBackedUp: number;
  needsBackup: number;
  totalPlaylists: number;
  updatedAt: string | null;
};

export async function getHomepageStats(): Promise<HomepageStats> {
  const catalog = getPersistedSpotifyPlaylistCatalog();

  if (!catalog) {
    return {
      fullyBackedUp: 0,
      needsBackup: 0,
      totalPlaylists: 0,
      updatedAt: null
    };
  }

  const playlistIds = catalog.playlists.map((playlist) => playlist.id);
  const statuses = await getPersistedPlaylistBackupStatuses(
    playlistIds,
    "/api/homepage/stats"
  );

  return buildHomepageStats(catalog.playlists, statuses, catalog.updatedAt);
}

export function buildHomepageStats(
  playlists: Pick<PlaylistSummary, "id" | "tracksTotal">[],
  statuses: Record<string, PlaylistBackupStatus>,
  updatedAt: string | null
): HomepageStats {
  const fullyBackedUp = playlists.filter((playlist) => {
    const status = statuses[playlist.id];

    return (
      status?.backedUp &&
      status.trackCount + status.unavailableTrackCount >= playlist.tracksTotal
    );
  }).length;

  return {
    fullyBackedUp,
    needsBackup: playlists.length - fullyBackedUp,
    totalPlaylists: playlists.length,
    updatedAt
  };
}
