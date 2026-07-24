import { NextRequest, NextResponse } from "next/server";
import {
  startProviderDownloadJob,
  type AuthorizedProviderDownloadRequest
} from "@/lib/providers/download";
import { refreshProviderDownloadTrackFromSpotify } from "@/lib/providers/spotify-metadata";
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
    | Partial<AuthorizedProviderDownloadRequest>
    | null;
  const diagnosticId = providerDownloadDiagnosticId();

  if (!body) {
    return withSessionCookie(
      NextResponse.json(
        {
          diagnosticId,
          error: "Send a selected provider download request."
        },
        {
          status: 400
        }
      ),
      session,
      request
    );
  }

  const summary = downloadRequestSummary(body);
  console.info("[spotifybu.provider-download] request started", {
    diagnosticId,
    ...summary
  });

  try {
    const track = await refreshProviderDownloadTrackFromSpotify(
      session.token,
      body.track as AuthorizedProviderDownloadRequest["track"]
    );
    const job = startProviderDownloadJob({
      bulkRiskAccepted: Boolean(body.bulkRiskAccepted),
      diagnosticId,
      fallbackSources: Array.isArray(body.fallbackSources)
        ? body.fallbackSources
        : [],
      fallbackFormat: String(body.fallbackFormat ?? ""),
      fallbackQuality: String(body.fallbackQuality ?? ""),
      format: String(body.format ?? ""),
      providerId: String(body.providerId ?? ""),
      quality: String(body.quality ?? ""),
      rightsConfirmed: Boolean(body.rightsConfirmed),
      selectedReason: body.selectedReason,
      sourceUrl: String(body.sourceUrl ?? ""),
      track
    });

    console.info("[spotifybu.provider-download] request queued", {
      diagnosticId,
      jobId: job.id,
      ...summary
    });

    return withSessionCookie(
      NextResponse.json(
        {
          diagnosticId,
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
    const message =
      error instanceof Error
        ? error.message
        : "TrackKeep could not download from that provider.";
    console.error("[spotifybu.provider-download] request failed", {
      diagnosticId,
      error: serializeProviderDownloadError(error),
      ...summary
    });

    return withSessionCookie(
      NextResponse.json(
        {
          diagnosticId,
          error: message
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

function providerDownloadDiagnosticId() {
  return `pd-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function downloadRequestSummary(
  body: Partial<AuthorizedProviderDownloadRequest>
) {
  const sourceUrl = String(body.sourceUrl ?? "");
  const track = body.track as
    | {
        name?: unknown;
        position?: unknown;
      }
    | undefined;

  return {
    providerId: String(body.providerId ?? ""),
    sourceHost: safeHostname(sourceUrl),
    sourceUrl,
    trackName: typeof track?.name === "string" ? track.name : "",
    trackPosition:
      typeof track?.position === "number" ? track.position : undefined
  };
}

function serializeProviderDownloadError(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      message: "Unknown provider download error.",
      value: String(error)
    };
  }

  return {
    message: error.message,
    name: error.name,
    stack: error.stack
  };
}

function safeHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}
