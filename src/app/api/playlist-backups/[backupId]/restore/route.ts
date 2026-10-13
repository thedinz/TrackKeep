import { NextResponse } from "next/server";
import { getPlaylistBackupSnapshotDetail } from "@/lib/backup-store";
import { appendDiagnosticLog, diagnosticError } from "@/lib/diagnostics";
import { createOrUpdateMusicLibraryPlaylistFromSpotify } from "@/lib/music-library";
import { createOrUpdatePlexPlaylistFromSpotify } from "@/lib/plex";

type RouteContext = {
  params: Promise<{ backupId: string }> | { backupId: string };
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Restoring works from the stored snapshot alone, so it needs no Spotify
// session and still works after Spotify has changed or removed the playlist.
export async function POST(request: Request, context: RouteContext) {
  const { backupId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        target?: unknown;
      }
    | null;
  const target =
    body?.target === "navidrome" || body?.target === "plex" ? body.target : null;

  if (!target) {
    return NextResponse.json(
      {
        error: "Choose Navidrome or Plex as the restore target."
      },
      {
        status: 400
      }
    );
  }

  const detail = getPlaylistBackupSnapshotDetail(backupId);

  if (!detail) {
    return NextResponse.json(
      {
        error: "Playlist backup snapshot not found."
      },
      {
        status: 404
      }
    );
  }

  if (!detail.snapshot.tracks.length) {
    return NextResponse.json(
      {
        error: "This snapshot has no tracks to restore."
      },
      {
        status: 400
      }
    );
  }

  try {
    const { playlist, tracks } = detail.snapshot;
    const musicLibraryPlaylist =
      target === "plex"
        ? await createOrUpdatePlexPlaylistFromSpotify(playlist, tracks, {
            mode: "replace"
          })
        : await createOrUpdateMusicLibraryPlaylistFromSpotify(playlist, tracks, {
            mode: "replace"
          });

    return NextResponse.json(
      {
        musicLibraryPlaylist: {
          ...musicLibraryPlaylist,
          target,
          targetName: target === "plex" ? "Plex" : "Navidrome"
        }
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    await appendDiagnosticLog("playlist_backups.restore.route_failed", {
      backupId,
      error: diagnosticError(error),
      route: "/api/playlist-backups/[backupId]/restore",
      target
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "TrackKeep could not restore the playlist."
      },
      {
        status: 400
      }
    );
  }
}
