import { NextRequest, NextResponse } from "next/server";
import { matchNavidromeTracks } from "@/lib/navidrome";
import type { BackupTrack } from "@/lib/spotify";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const tracks = Array.isArray(body?.tracks)
    ? (body.tracks as BackupTrack[])
    : null;

  if (!tracks) {
    return NextResponse.json(
      {
        error: "Send Spotify tracks before matching the Navidrome library."
      },
      {
        status: 400
      }
    );
  }

  return NextResponse.json(
    {
      libraryMatches: await matchNavidromeTracks(tracks)
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
