import { NextResponse } from "next/server";
import {
  getLatestPlaylistBackupSnapshots,
  getLatestPlaylistBackupSummaries
} from "@/lib/backup-store";
import { appendDiagnosticLog, diagnosticError } from "@/lib/diagnostics";
import {
  getNavidromeLibraryPath,
  matchNavidromeTracksWithIndex,
  readCurrentNavidromeLibraryIndex,
  type NavidromeTrackMatch
} from "@/lib/navidrome";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import { getUserPlaylists, type BackupTrack } from "@/lib/spotify";

type PlaylistBackupStatus = {
  backedUp: boolean;
  missingTrackCount: number;
  trackCount: number;
};

export const runtime = "nodejs";

export async function GET() {
  const session = await getSpotifySession();

  if (!session.ok) {
    return withSessionCookie(
      NextResponse.json({ error: session.message }, { status: session.status }),
      session
    );
  }

  try {
    const playlists = await getUserPlaylists(session.token);
    const playlistIds = playlists.map((playlist) => playlist.id);
    const metadataBackups = getLatestPlaylistBackupSummaries(playlistIds);
    const backupStatuses = await getPersistedPlaylistBackupStatuses(playlistIds);

    return withSessionCookie(
      NextResponse.json({ backupStatuses, metadataBackups, playlists }),
      session
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
              : "SpotifyBU could not load Spotify playlists."
        },
        { status: 502 }
      ),
      session
    );
  }
}

async function getPersistedPlaylistBackupStatuses(playlistIds: string[]) {
  const libraryPath = getNavidromeLibraryPath();
  const index = await readCurrentNavidromeLibraryIndex().catch(async (error) => {
    await appendDiagnosticLog("spotify.playlists.backup_status_failed", {
      error: diagnosticError(error),
      route: "/api/spotify/playlists"
    });

    return null;
  });

  if (!libraryPath || !index || index.libraryPath !== libraryPath) {
    return {};
  }

  const snapshots = getLatestPlaylistBackupSnapshots(playlistIds);

  return Object.fromEntries(
    Object.values(snapshots).map((snapshot) => [
      snapshot.playlistId,
      getPlaylistBackupStatus(
        snapshot.tracks,
        matchNavidromeTracksWithIndex(snapshot.tracks, index)
      )
    ])
  ) as Record<string, PlaylistBackupStatus>;
}

function getPlaylistBackupStatus(
  tracks: BackupTrack[],
  libraryMatches: NavidromeTrackMatch[]
): PlaylistBackupStatus {
  const matchesByPosition = new Map(
    libraryMatches.map((match) => [match.trackPosition, match] as const)
  );
  const missingTrackCount = tracks.filter(
    (track) => !matchesByPosition.get(track.position)?.exists
  ).length;

  return {
    backedUp: tracks.length > 0 && missingTrackCount === 0,
    missingTrackCount,
    trackCount: tracks.length
  };
}
