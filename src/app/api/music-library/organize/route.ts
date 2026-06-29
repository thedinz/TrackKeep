import { NextRequest, NextResponse } from "next/server";
import { organizeMusicLibraryMatchedTracks } from "@/lib/music-library";
import type { BackupTrack } from "@/lib/spotify";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const tracks = Array.isArray(body?.tracks)
    ? (body.tracks as BackupTrack[])
    : null;
  const trackPositions = Array.isArray(body?.trackPositions)
    ? body.trackPositions
        .map((trackPosition: unknown) => Number(trackPosition))
        .filter(
          (trackPosition: number) =>
            Number.isInteger(trackPosition) && trackPosition > 0
        )
    : undefined;
  const maxMoves = Number(body?.maxMoves);

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
    const result = await organizeMusicLibraryMatchedTracks(tracks, {
      maxMoves: Number.isFinite(maxMoves) ? maxMoves : undefined,
      trackPositions
    });

    return NextResponse.json(
      {
        attemptedCount: result.attemptedCount,
        index: result.summary,
        libraryMatches: result.libraryMatches,
        moveFailures: result.moveFailures,
        movedCount: result.movedCount,
        remainingMoveCount: result.remainingMoveCount,
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
