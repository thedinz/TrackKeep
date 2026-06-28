import { NextRequest, NextResponse } from "next/server";
import { matchMusicLibraryTracks } from "@/lib/music-library";
import type { BackupTrack } from "@/lib/spotify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const tracks = Array.isArray(body?.tracks)
    ? (body.tracks as BackupTrack[])
    : null;

  if (!tracks) {
    return NextResponse.json(
      {
        error: "Send Spotify tracks before matching Navidrome."
      },
      {
        status: 400
      }
    );
  }

  return NextResponse.json(
    {
      libraryMatches: await matchMusicLibraryTracks(tracks)
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
