import { NextRequest, NextResponse } from "next/server";
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

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await getSpotifySession();

  if (!session.ok) {
    return withSessionCookie(
      NextResponse.json({ error: session.message }, { status: session.status }),
      session
    );
  }

  const { playlistId } = await context.params;
  const format = request.nextUrl.searchParams.get("format") ?? "json";
  const [playlist, tracks] = await Promise.all([
    getPlaylist(session.token, playlistId),
    getPlaylistTracks(session.token, playlistId)
  ]);

  if (format === "csv") {
    const response = new NextResponse(backupTracksToCsv(playlist, tracks), {
      headers: {
        "Content-Disposition": `attachment; filename="${backupFilename(
          playlist,
          "csv"
        )}"`,
        "Content-Type": "text/csv; charset=utf-8"
      }
    });

    return withSessionCookie(response, session);
  }

  const response = NextResponse.json(buildBackupPayload(playlist, tracks), {
    headers: {
      "Content-Disposition": `attachment; filename="${backupFilename(
        playlist,
        "json"
      )}"`
    }
  });

  return withSessionCookie(response, session);
}
