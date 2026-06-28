import { NextResponse } from "next/server";
import { backfillMusicLibrarySpotifyIdentityTags } from "@/lib/music-library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST() {
  try {
    return NextResponse.json(
      {
        backfill: await backfillMusicLibrarySpotifyIdentityTags()
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "SpotifyBU could not backfill Spotify identity tags."
      },
      {
        status: 400
      }
    );
  }
}
