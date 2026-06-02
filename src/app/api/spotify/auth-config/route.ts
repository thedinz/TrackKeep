import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/app-url";
import { getSpotifyRedirectUri } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const redirectUri = getSpotifyRedirectUri(request);

  return NextResponse.json(
    {
      appBaseUrl: getAppBaseUrl(request),
      redirectUri,
      redirectUriWarning: spotifyRedirectUriWarning(redirectUri),
      spotifyClientConfigured: Boolean(process.env.SPOTIFY_CLIENT_ID)
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

function spotifyRedirectUriWarning(redirectUri: string) {
  const url = new URL(redirectUri);

  if (url.protocol === "https:") {
    return null;
  }

  if (url.protocol === "http:" && isLoopbackIpLiteral(url.hostname)) {
    return null;
  }

  return [
    "Spotify requires HTTPS redirect URIs unless you are using a loopback IP literal",
    "such as http://127.0.0.1. Use an HTTPS reverse proxy, HTTPS internal hostname,",
    "or a loopback tunnel before connecting Spotify."
  ].join(" ");
}

function isLoopbackIpLiteral(hostname: string) {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "");

  return normalizedHostname === "::1" || normalizedHostname.startsWith("127.");
}
