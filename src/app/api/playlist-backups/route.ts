import { NextRequest, NextResponse } from "next/server";
import {
  listPlaylistBackupHistory,
  listPlaylistBackupPlaylists
} from "@/lib/backup-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const playlistId = searchParams.get("playlistId")?.trim() ?? "";

  try {
    return NextResponse.json(
      playlistId
        ? listPlaylistBackupHistory(playlistId, {
            limit: Number(searchParams.get("limit")),
            offset: Number(searchParams.get("offset"))
          })
        : {
            playlists: listPlaylistBackupPlaylists()
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
            : "TrackKeep could not load the playlist backup history."
      },
      {
        status: 500
      }
    );
  }
}
