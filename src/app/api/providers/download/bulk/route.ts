import { NextRequest, NextResponse } from "next/server";
import {
  startProviderBulkDownloadJob,
  type AuthorizedProviderBulkDownloadRequest
} from "@/lib/providers/download";
import { refreshProviderDownloadTracksFromSpotify } from "@/lib/providers/spotify-metadata";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

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
    const items = Array.isArray(body.items) ? body.items : [];
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

function numericBodyValue(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}
