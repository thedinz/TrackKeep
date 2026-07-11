import { NextResponse } from "next/server";
import { startMusicLibrarySpotifyIdentityTagBackfillJob } from "@/lib/music-library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST() {
  try {
    return NextResponse.json(
      {
        job: startMusicLibrarySpotifyIdentityTagBackfillJob()
      },
      {
        status: 202,
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
            : "TrackKeep could not backfill Spotify metadata tags."
      },
      {
        status: 400
      }
    );
  }
}
