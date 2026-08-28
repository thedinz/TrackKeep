import { NextResponse } from "next/server";
import {
  getLatestPlaylistBackupSnapshots,
  getLatestPlaylistBackupSummaries,
  persistPlaylistBackup
} from "@/lib/backup-store";
import { appendDiagnosticLog, diagnosticError } from "@/lib/diagnostics";
import { persistSpotifyPlaylistCatalog } from "@/lib/playlist-catalog";
import {
  getPersistedPlaylistBackupStatuses,
  playlistBackupSnapshotNeedsRefresh
} from "@/lib/playlist-backup-status";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import {
  getCurrentUser,
  getPlaylistTracks,
  getUserPlaylists,
  type PlaylistSummary,
  type SpotifyTokenSet
} from "@/lib/spotify";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSpotifySession();

  if (!session.ok) {
    return withSessionCookie(
      NextResponse.json({ error: session.message }, { status: session.status }),
      session,
      request
    );
  }

  try {
    const [playlists, user] = await Promise.all([
      getUserPlaylists(session.token),
      getCurrentUser(session.token)
    ]);
    await refreshChangedPlaylistSnapshots(
      session.token,
      playlists.filter(
        (playlist) =>
          playlist.ownerId === user.id || playlist.collaborative
      )
    );
    persistSpotifyPlaylistCatalog(playlists);
    const playlistIds = playlists.map((playlist) => playlist.id);
    const metadataBackups = getLatestPlaylistBackupSummaries(playlistIds);
    const backupStatuses = await getPersistedPlaylistBackupStatuses(playlistIds);

    return withSessionCookie(
      NextResponse.json({ backupStatuses, metadataBackups, playlists }),
      session,
      request
    );
  } catch (error) {
    await appendDiagnosticLog("spotify.playlists.route_failed", {
      error: diagnosticError(error),
      route: "/api/spotify/playlists"
    });

    return withSessionCookie(
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "TrackKeep could not load Spotify playlists."
        },
        { status: 502 }
      ),
      session,
      request
    );
  }
}

async function refreshChangedPlaylistSnapshots(
  token: SpotifyTokenSet,
  playlists: PlaylistSummary[]
) {
  const persistedSnapshots = getLatestPlaylistBackupSnapshots(
    playlists.map((playlist) => playlist.id)
  );
  const refreshQueue = playlists
    .filter((playlist) => {
      const persistedSnapshot = persistedSnapshots[playlist.id];

      return (
        persistedSnapshot &&
        playlistBackupSnapshotNeedsRefresh(
          playlist,
          persistedSnapshot.playlist
        )
      );
    })
    .slice(0, 12);
  const workerCount = Math.min(3, refreshQueue.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (refreshQueue.length) {
        const playlist = refreshQueue.shift();

        if (!playlist) {
          return;
        }

        try {
          const tracks = await getPlaylistTracks(token, playlist.id);

          persistPlaylistBackup({
            playlist:
              playlist.tracksTotal || !tracks.length
                ? playlist
                : { ...playlist, tracksTotal: tracks.length },
            source: "playlist-load",
            tracks
          });
        } catch (error) {
          await appendDiagnosticLog(
            "spotify.playlists.snapshot_refresh_failed",
            {
              error: diagnosticError(error),
              playlistId: playlist.id,
              route: "/api/spotify/playlists"
            }
          );
        }
      }
    })
  );
}
