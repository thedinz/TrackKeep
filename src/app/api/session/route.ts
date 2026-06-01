import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import { getCurrentUser } from "@/lib/spotify";

export async function GET() {
  const spotifyClientConfigured = Boolean(process.env.SPOTIFY_CLIENT_ID);
  const session = await getSpotifySession();

  if (!session.ok) {
    const response = NextResponse.json({
      authenticated: false,
      spotifyClientConfigured
    });

    return withSessionCookie(response, session);
  }

  try {
    const user = await getCurrentUser(session.token);
    const response = NextResponse.json({
      authenticated: true,
      spotifyClientConfigured,
      user
    });

    return withSessionCookie(response, session);
  } catch {
    const response = NextResponse.json({
      authenticated: false,
      spotifyClientConfigured
    });
    clearSessionCookie(response);

    return response;
  }
}
