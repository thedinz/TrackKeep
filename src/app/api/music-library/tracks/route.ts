import { NextRequest, NextResponse } from "next/server";
import {
  deleteMusicLibraryTrack,
  matchMusicLibraryTracks
} from "@/lib/music-library";
import { purgeProviderDownloadLogsForRelativePath } from "@/lib/providers/download";
import type { BackupTrack } from "@/lib/spotify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const relativePath =
    typeof body?.relativePath === "string" ? body.relativePath : "";
  const tracks = Array.isArray(body?.tracks)
    ? (body.tracks as BackupTrack[])
    : null;

  if (!relativePath.trim()) {
    return NextResponse.json(
      {
        error: "Send a backed-up track path before deleting from the library."
      },
      {
        status: 400
      }
    );
  }

  try {
    const deleteResult = await deleteMusicLibraryTrack(relativePath);
    const providerLogCleanup = deleteResult.deleted
      ? await purgeProviderDownloadLogsForRelativePath(relativePath)
      : {
          attemptsRemoved: 0,
          downloadsRemoved: 0
        };
    const libraryMatches = tracks
      ? await matchMusicLibraryTracks(tracks)
      : undefined;

    return NextResponse.json(
      {
        deleted: deleteResult.deleted,
        index: deleteResult.index,
        libraryMatches,
        providerLogCleanup,
        relativePath: deleteResult.relativePath,
        removedFromIndex: deleteResult.removedFromIndex
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
            : "SpotifyBU could not delete that library track."
      },
      {
        status: 400
      }
    );
  }
}
