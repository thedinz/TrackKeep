import { NextRequest, NextResponse } from "next/server";
import { organizeNavidromeMatchedTracks } from "@/lib/navidrome";
import type { BackupTrack } from "@/lib/spotify";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const tracks = Array.isArray(body?.tracks)
    ? (body.tracks as BackupTrack[])
    : null;

  if (!tracks) {
    return NextResponse.json(
      {
        error: "Send Spotify tracks before organizing matched Navidrome files."
      },
      {
        status: 400
      }
    );
  }

  try {
    const result = await organizeNavidromeMatchedTracks(tracks);

    return NextResponse.json(
      {
        index: result.summary,
        libraryMatches: result.libraryMatches,
        movedCount: result.movedCount,
        skippedCount: result.skippedCount
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
            : "SpotifyBU could not organize matched Navidrome files."
      },
      {
        status: 400
      }
    );
  }
}
