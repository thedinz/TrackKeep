import { NextResponse } from "next/server";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import { getUserPlaylists } from "@/lib/spotify";

export async function GET() {
  const session = await getSpotifySession();

  if (!session.ok) {
    return withSessionCookie(
      NextResponse.json({ error: session.message }, { status: session.status }),
      session
    );
  }

  const playlists = await getUserPlaylists(session.token);
  return withSessionCookie(NextResponse.json({ playlists }), session);
}
