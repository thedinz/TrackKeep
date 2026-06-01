import { NextResponse } from "next/server";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import { getPlaylist, getPlaylistTracks } from "@/lib/spotify";

type RouteContext = {
  params: Promise<{ playlistId: string }> | { playlistId: string };
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSpotifySession();

  if (!session.ok) {
    return withSessionCookie(
      NextResponse.json({ error: session.message }, { status: session.status }),
      session
    );
  }

  const { playlistId } = await context.params;
  const [playlist, tracks] = await Promise.all([
    getPlaylist(session.token, playlistId),
    getPlaylistTracks(session.token, playlistId)
  ]);

  return withSessionCookie(NextResponse.json({ playlist, tracks }), session);
}
