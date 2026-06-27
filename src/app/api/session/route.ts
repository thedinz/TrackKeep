import { NextResponse } from "next/server";
import { spotifyAuthRequestDiagnostics } from "@/lib/auth-diagnostics";
import { appendDiagnosticLog, diagnosticError } from "@/lib/diagnostics";
import { clearSessionCookie } from "@/lib/session";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import { getCurrentUser } from "@/lib/spotify";

export async function GET(request: Request) {
  const spotifyClientConfigured = Boolean(process.env.SPOTIFY_CLIENT_ID);
  const session = await getSpotifySession();

  if (!session.ok) {
    const response = NextResponse.json({
      authenticated: false,
      spotifyClientConfigured
    });
    await appendDiagnosticLog("spotify.auth.session_check", {
      authenticated: false,
      clearSession: Boolean(session.clearSession),
      message: session.message,
      request: spotifyAuthRequestDiagnostics(request),
      status: session.status
    });

    return withSessionCookie(response, session, request);
  }

  try {
    const user = await getCurrentUser(session.token);
    const response = NextResponse.json({
      authenticated: true,
      spotifyClientConfigured,
      user
    });
    await appendDiagnosticLog("spotify.auth.session_check", {
      authenticated: true,
      refreshed: session.refreshed,
      request: spotifyAuthRequestDiagnostics(request),
      tokenExpiresAt: new Date(session.token.expires_at).toISOString(),
      userId: user.id
    });

    return withSessionCookie(response, session, request);
  } catch (error) {
    const response = NextResponse.json({
      authenticated: false,
      spotifyClientConfigured
    });
    clearSessionCookie(response, request);
    await appendDiagnosticLog("spotify.auth.session_user_lookup_failed", {
      error: diagnosticError(error),
      refreshed: session.refreshed,
      request: spotifyAuthRequestDiagnostics(request),
      tokenExpiresAt: new Date(session.token.expires_at).toISOString()
    });

    return response;
  }
}
