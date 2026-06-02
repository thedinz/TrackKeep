import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/app-url";
import { getSpotifyRedirectUri } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.json(
    {
      appBaseUrl: getAppBaseUrl(request),
      redirectUri: getSpotifyRedirectUri(request),
      spotifyClientConfigured: Boolean(process.env.SPOTIFY_CLIENT_ID)
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
