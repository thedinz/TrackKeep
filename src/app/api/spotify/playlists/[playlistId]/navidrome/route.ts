import { NextResponse } from "next/server";
import { appendDiagnosticLog, diagnosticError } from "@/lib/diagnostics";
import { createOrUpdateNavidromePlaylistFromSpotify } from "@/lib/navidrome";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import { getPlaylist, getPlaylistTracks } from "@/lib/spotify";
import type { NavidromePlaylistSyncMode } from "@/lib/navidrome";

type RouteContext = {
  params: Promise<{ playlistId: string }> | { playlistId: string };
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext) {
  const session = await getSpotifySession();

  if (!session.ok) {
    return withSessionCookie(
      NextResponse.json({ error: session.message }, { status: session.status }),
      session
    );
  }

  try {
    const { playlistId } = await context.params;
    const body = (await request.json().catch(() => null)) as
      | {
          mode?: unknown;
        }
      | null;
    const mode: NavidromePlaylistSyncMode = parsePlaylistSyncMode(body?.mode);
    const [playlist, tracks] = await Promise.all([
      getPlaylist(session.token, playlistId),
      getPlaylistTracks(session.token, playlistId)
    ]);
    const navidromePlaylist =
      await createOrUpdateNavidromePlaylistFromSpotify(playlist, tracks, {
        mode
      });

    return withSessionCookie(
      NextResponse.json(
        {
          navidromePlaylist
        },
        {
          headers: {
            "Cache-Control": "no-store"
          }
        }
      ),
      session
    );
  } catch (error) {
    const params = await context.params;

    await appendDiagnosticLog("spotify.playlist_navidrome.route_failed", {
      error: diagnosticError(error),
      playlistId: params.playlistId,
      route: "/api/spotify/playlists/[playlistId]/navidrome"
    });

    return withSessionCookie(
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "SpotifyBU could not create the Navidrome playlist."
        },
        {
          status: 400
        }
      ),
      session
    );
  }
}

function parsePlaylistSyncMode(mode: unknown): NavidromePlaylistSyncMode {
  if (mode === "append" || mode === "fullsync") {
    return mode;
  }

  return "replace";
}
