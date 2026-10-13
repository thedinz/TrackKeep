import { NextRequest, NextResponse } from "next/server";
import {
  clearFinishedProviderBulkDownloadJobs,
  listProviderBulkDownloadJobs,
  startProviderBulkDownloadJob,
  type AuthorizedProviderBulkDownloadRequest
} from "@/lib/providers/download";
import { refreshProviderDownloadTracksFromSpotify } from "@/lib/providers/spotify-metadata";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";
import { isUnavailableSpotifyBackupTrack } from "@/lib/spotify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  try {
    const history = listProviderBulkDownloadJobs({
      limit: optionalNumericParam(searchParams.get("limit")),
      offset: optionalNumericParam(searchParams.get("offset")),
      playlistId: searchParams.get("playlistId") ?? undefined,
      status: searchParams.get("status") ?? undefined
    });

    return NextResponse.json(history, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return bulkJobHistoryError(
      error,
      "TrackKeep could not list bulk backup jobs."
    );
  }
}

export function DELETE(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  try {
    const deletedCount = clearFinishedProviderBulkDownloadJobs({
      olderThanDays: optionalNumericParam(searchParams.get("olderThanDays")),
      playlistId: searchParams.get("playlistId") ?? undefined,
      status: searchParams.get("status") ?? undefined
    });

    return NextResponse.json(
      {
        deletedCount
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return bulkJobHistoryError(
      error,
      "TrackKeep could not clear finished bulk backup jobs."
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getSpotifySession();

  if (!session.ok) {
    return withSessionCookie(
      NextResponse.json({ error: session.message }, { status: session.status }),
      session,
      request
    );
  }

  const body = (await request.json().catch(() => null)) as
    | Partial<AuthorizedProviderBulkDownloadRequest>
    | null;

  if (!body) {
    return withSessionCookie(
      NextResponse.json(
        {
          error: "Send a previewed provider bulk queue."
        },
        {
          status: 400
        }
      ),
      session,
      request
    );
  }

  try {
    const items = Array.isArray(body.items)
      ? body.items.filter(
          (item) => !isUnavailableSpotifyBackupTrack(item.track)
        )
      : [];
    const tracks = await refreshProviderDownloadTracksFromSpotify(
      session.token,
      items.map((item) => item.track)
    );
    const job = startProviderBulkDownloadJob({
      bulkRiskAccepted: Boolean(body.bulkRiskAccepted),
      chunkPauseMs: numericBodyValue(body.chunkPauseMs),
      chunkSize: numericBodyValue(body.chunkSize),
      delayMs: numericBodyValue(body.delayMs),
      fallbackFormat: String(body.fallbackFormat ?? ""),
      fallbackQuality: String(body.fallbackQuality ?? ""),
      format: String(body.format ?? ""),
      items: items.map((item, index) => ({
        ...item,
        track: tracks[index]
      })),
      playlistId:
        typeof body.playlistId === "string" ? body.playlistId : undefined,
      playlistName:
        typeof body.playlistName === "string" ? body.playlistName : undefined,
      quality: String(body.quality ?? ""),
      rightsConfirmed: Boolean(body.rightsConfirmed)
    });

    return withSessionCookie(
      NextResponse.json(
        {
          job
        },
        {
          status: 202,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      ),
      session,
      request
    );
  } catch (error) {
    return withSessionCookie(
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "TrackKeep could not start the provider bulk backup job."
        },
        {
          status: 400
        }
      ),
      session,
      request
    );
  }
}

function optionalNumericParam(value: string | null) {
  return value === null || !value.trim() ? undefined : Number(value);
}

function bulkJobHistoryError(error: unknown, fallback: string) {
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : fallback
    },
    {
      status: 400
    }
  );
}

function numericBodyValue(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}
