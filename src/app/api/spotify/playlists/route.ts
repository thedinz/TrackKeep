import { NextResponse } from "next/server";
import { getLatestPlaylistBackupSummaries } from "@/lib/backup-store";
import { appendDiagnosticLog, diagnosticError } from "@/lib/diagnostics";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import { getUserPlaylists } from "@/lib/spotify";

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
    const metadataBackups = getLatestPlaylistBackupSummaries(
      playlists.map((playlist) => playlist.id)
    );

    return withSessionCookie(
      NextResponse.json({ metadataBackups, playlists }),
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
