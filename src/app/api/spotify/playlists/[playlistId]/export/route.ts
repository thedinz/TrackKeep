import { NextRequest, NextResponse } from "next/server";
import { appendDiagnosticLog, diagnosticError } from "@/lib/diagnostics";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import {
  backupFilename,
  backupTracksToCsv,
  buildBackupPayload,
  getPlaylist,
  getPlaylistTracks
} from "@/lib/spotify";

type RouteContext = {
  params: Promise<{ playlistId: string }> | { playlistId: string };
};

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await getSpotifySession();

  if (!session.ok) {
    return withSessionCookie(
      NextResponse.json({ error: session.message }, { status: session.status }),
      session
    );
  }

  try {
    const { playlistId } = await context.params;
    const format = request.nextUrl.searchParams.get("format") ?? "json";
    const [playlist, tracks] = await Promise.all([
      getPlaylist(session.token, playlistId),
      getPlaylistTracks(session.token, playlistId)
    ]);
    const playlistWithTrackTotal =
      playlist.tracksTotal || !tracks.length
        ? playlist
        : {
            ...playlist,
            tracksTotal: tracks.length
          };

    if (format === "csv") {
      const response = new NextResponse(
        backupTracksToCsv(playlistWithTrackTotal, tracks),
        {
          headers: {
            "Content-Disposition": `attachment; filename="${backupFilename(
              playlistWithTrackTotal,
              "csv"
            )}"`,
            "Content-Type": "text/csv; charset=utf-8"
          }
        }
      );

      return withSessionCookie(response, session);
    }

    const response = NextResponse.json(
      buildBackupPayload(playlistWithTrackTotal, tracks),
      {
        headers: {
          "Content-Disposition": `attachment; filename="${backupFilename(
            playlistWithTrackTotal,
            "json"
          )}"`
        }
      }
    );

    return withSessionCookie(response, session);
  } catch (error) {
    const params = await context.params;

    await appendDiagnosticLog("spotify.playlist_export.route_failed", {
      error: diagnosticError(error),
      playlistId: params.playlistId,
      route: "/api/spotify/playlists/[playlistId]/export"
    });

    return withSessionCookie(
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "SpotifyBU could not export this Spotify playlist."
        },
        { status: 502 }
      ),
      session
    );
  }
}
