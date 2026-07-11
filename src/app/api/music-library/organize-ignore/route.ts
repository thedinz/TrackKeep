import { NextRequest, NextResponse } from "next/server";
import {
  clearMusicLibraryTrackOrganizationIgnore,
  ignoreMusicLibraryTrackOrganization
} from "@/lib/music-library";
import type { BackupTrack } from "@/lib/spotify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return updateOrganizeIgnore(request, "ignore");
}

export async function DELETE(request: NextRequest) {
  return updateOrganizeIgnore(request, "clear");
}

async function updateOrganizeIgnore(
  request: NextRequest,
  action: "clear" | "ignore"
) {
  const body = await request.json().catch(() => null);
  const track =
    body?.track && typeof body.track === "object"
      ? (body.track as BackupTrack)
      : null;
  const tracks = Array.isArray(body?.tracks)
    ? (body.tracks as BackupTrack[])
    : track
      ? [track]
      : [];

  if (!track) {
    return NextResponse.json(
      {
        error: "Send the Spotify track before changing organize ignores."
      },
      {
        status: 400
      }
    );
  }

  try {
    const result =
      action === "ignore"
        ? await ignoreMusicLibraryTrackOrganization(track, tracks)
        : await clearMusicLibraryTrackOrganizationIgnore(track, tracks);

    return NextResponse.json(
      {
        ignored: result.ignored,
        index: result.index,
        libraryMatches: result.libraryMatches,
        relativePath: result.relativePath
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
            : "TrackKeep could not change that organize ignore."
      },
      {
        status: 400
      }
    );
  }
}
