import { getLatestPlaylistBackupSnapshots } from "./backup-store";
import { appendDiagnosticLog, diagnosticError } from "./diagnostics";
import {
  getMusicLibraryPath,
  matchMusicLibraryTracksWithIndex,
  readCurrentMusicLibraryIndex,
  type MusicLibraryTrackMatch
} from "./music-library";
import {
  isUnavailableSpotifyBackupTrack,
  type BackupTrack,
  type PlaylistSummary
} from "./spotify";

export type PlaylistBackupStatus = {
  backedUp: boolean;
  missingTrackCount: number;
  snapshotId?: string;
  trackCount: number;
  unavailableTrackCount: number;
};

export function playlistBackupSnapshotNeedsRefresh(
  playlist: Pick<PlaylistSummary, "snapshotId" | "tracksTotal">,
  persistedPlaylist?: Pick<PlaylistSummary, "snapshotId" | "tracksTotal">
) {
  if (!persistedPlaylist) {
    return false;
  }

  if (playlist.snapshotId) {
    return playlist.snapshotId !== persistedPlaylist.snapshotId;
  }

  return playlist.tracksTotal !== persistedPlaylist.tracksTotal;
}

export async function getPersistedPlaylistBackupStatuses(
  playlistIds: string[],
  diagnosticRoute = "/api/spotify/playlists"
) {
  const libraryPath = getMusicLibraryPath();
  const index = await readCurrentMusicLibraryIndex().catch(async (error) => {
    await appendDiagnosticLog("spotify.playlists.backup_status_failed", {
      error: diagnosticError(error),
      route: diagnosticRoute
    });

    return null;
  });

  if (!libraryPath || !index || index.libraryPath !== libraryPath) {
    return {};
  }

  const snapshots = getLatestPlaylistBackupSnapshots(playlistIds);
  const statuses = await Promise.all(
    Object.values(snapshots).map(async (snapshot) => [
      snapshot.playlistId,
      {
        ...getPlaylistBackupStatus(
          snapshot.tracks,
          await matchMusicLibraryTracksWithIndex(
            snapshot.tracks.filter(
              (track) => !isUnavailableSpotifyBackupTrack(track)
            ),
            index
          )
        ),
        snapshotId: snapshot.playlist.snapshotId
      }
    ] as const)
  );

  return Object.fromEntries(statuses) as Record<string, PlaylistBackupStatus>;
}

export function getPlaylistBackupStatus(
  tracks: BackupTrack[],
  libraryMatches: MusicLibraryTrackMatch[]
): PlaylistBackupStatus {
  const availableTracks = tracks.filter(
    (track) => !isUnavailableSpotifyBackupTrack(track)
  );
  const unavailableTrackCount = tracks.length - availableTracks.length;
  const matchesByPosition = new Map(
    libraryMatches.map((match) => [match.trackPosition, match] as const)
  );
  const missingTrackCount = availableTracks.filter(
    (track) => !matchesByPosition.get(track.position)?.exists
  ).length;

  return {
    backedUp: tracks.length > 0 && missingTrackCount === 0,
    missingTrackCount,
    trackCount: availableTracks.length,
    unavailableTrackCount
  };
}
