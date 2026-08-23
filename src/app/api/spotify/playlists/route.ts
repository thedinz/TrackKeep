import { NextResponse } from "next/server";
import { getLatestPlaylistBackupSummaries } from "@/lib/backup-store";
import { appendDiagnosticLog, diagnosticError } from "@/lib/diagnostics";
import { persistSpotifyPlaylistCatalog } from "@/lib/playlist-catalog";
import { getPersistedPlaylistBackupStatuses } from "@/lib/playlist-backup-status";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import { getUserPlaylists } from "@/lib/spotify";

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
    const playlists = await getUserPlaylists(session.token);
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
