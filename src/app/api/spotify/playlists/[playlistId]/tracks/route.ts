import { NextResponse } from "next/server";
import { matchNavidromeTracks, planNavidromeAlbumFolders } from "@/lib/navidrome";
import { appendDiagnosticLog, diagnosticError } from "@/lib/diagnostics";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import { getPlaylist, getPlaylistTracks } from "@/lib/spotify";

type RouteContext = {
  params: Promise<{ playlistId: string }> | { playlistId: string };
};

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSpotifySession();

  if (!session.ok) {
    return withSessionCookie(
      NextResponse.json({ error: session.message }, { status: session.status }),
      session
    );
  }

  try {
    const { playlistId } = await context.params;
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
    const [folderPlans, libraryMatches] = await Promise.all([
      planNavidromeAlbumFolders(tracks),
      matchNavidromeTracks(tracks)
    ]);

    return withSessionCookie(
      NextResponse.json({
        folderPlans,
        libraryMatches,
        playlist: playlistWithTrackTotal,
        tracks
      }),
      session
    );
  } catch (error) {
    const params = await context.params;

    await appendDiagnosticLog("spotify.playlist_tracks.route_failed", {
      error: diagnosticError(error),
      playlistId: params.playlistId,
      route: "/api/spotify/playlists/[playlistId]/tracks"
    });

    return withSessionCookie(
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "SpotifyBU could not load this Spotify playlist."
        },
        { status: 502 }
      ),
      session
    );
  }
}
