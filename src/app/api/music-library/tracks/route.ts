import { NextRequest, NextResponse } from "next/server";
import {
  deleteMusicLibraryTrack,
  getMusicLibraryIndexSummary,
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
  const deleteSpotifyBuTagged = Boolean(body?.deleteSpotifyBuTagged);

  if (deleteSpotifyBuTagged) {
    if (!tracks?.length) {
      return NextResponse.json(
        {
          error: "Send Spotify tracks before deleting TrackKeep-tagged files."
        },
        {
          status: 400
        }
      );
    }

    try {
      const initialMatches = await matchMusicLibraryTracks(tracks);
      const relativePaths = uniqueRelativePaths(
        initialMatches.flatMap((match) =>
          match.matchedTrack?.relativePath &&
          match.matchedTrack.spotifybuIdentityVersion
            ? [match.matchedTrack.relativePath]
            : []
        )
      );
      const deletedTracks: Array<{
        deleted: boolean;
        providerLogCleanup: {
          attemptsRemoved: number;
          downloadsRemoved: number;
        };
        relativePath: string;
        removedFromIndex: boolean;
      }> = [];
      let index = await getMusicLibraryIndexSummary();

      for (const path of relativePaths) {
        const deleteResult = await deleteMusicLibraryTrack(path);
        const providerLogCleanup = deleteResult.deleted
          ? await purgeProviderDownloadLogsForRelativePath(path)
          : {
              attemptsRemoved: 0,
              downloadsRemoved: 0
            };

        index = deleteResult.index;
        deletedTracks.push({
          deleted: deleteResult.deleted,
          providerLogCleanup,
          relativePath: deleteResult.relativePath,
          removedFromIndex: deleteResult.removedFromIndex
        });
      }

      return NextResponse.json(
        {
          deletedCount: deletedTracks.filter((track) => track.deleted).length,
          deletedTracks,
          index,
          libraryMatches: await matchMusicLibraryTracks(tracks),
          removedFromIndexCount: deletedTracks.filter(
            (track) => track.removedFromIndex
          ).length
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
              : "TrackKeep could not delete TrackKeep-tagged library tracks."
        },
        {
          status: 400
        }
      );
    }
  }

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
            : "TrackKeep could not delete that library track."
      },
      {
        status: 400
      }
    );
  }
}

function uniqueRelativePaths(relativePaths: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const relativePath of relativePaths) {
    const normalizedRelativePath = relativePath.trim();
    const key = normalizedRelativePath.toLowerCase();

    if (!normalizedRelativePath || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalizedRelativePath);
  }

  return unique;
}
