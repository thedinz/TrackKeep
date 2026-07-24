import { NextRequest, NextResponse } from "next/server";
import {
  searchProviderCandidates,
  type ProviderSearchRequest
} from "@/lib/providers/download";
import { refreshProviderDownloadTrackFromSpotify } from "@/lib/providers/spotify-metadata";
import { getSpotifySession, withSessionCookie } from "@/lib/server-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

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
    | Partial<ProviderSearchRequest>
    | null;
  const diagnosticId = providerSearchDiagnosticId();

  if (!body?.track) {
    return withSessionCookie(
      NextResponse.json(
        {
          diagnosticId,
          error: "Send a Spotify track before searching providers."
        },
        {
          status: 400
        }
      ),
      session,
      request
    );
  }

  const summary = searchRequestSummary(body);
  console.info("[spotifybu.provider-search] request started", {
    diagnosticId,
    ...summary
  });

  try {
    const track = await refreshProviderDownloadTrackFromSpotify(
      session.token,
      body.track as ProviderSearchRequest["track"]
    );
    const search = await searchProviderCandidates({
      limit: Number(body.limit ?? 5),
      providerIds: Array.isArray(body.providerIds)
        ? body.providerIds.map(String)
        : undefined,
      track
    });

    console.info("[spotifybu.provider-search] request completed", {
      candidateCount: search.candidates.length,
      diagnosticId,
      errorCount: search.errors.length,
      providerOrder: search.providerOrder,
      ...summary
    });

    return withSessionCookie(
      NextResponse.json(
        {
          diagnosticId,
          search
        },
        {
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
        : "TrackKeep could not search providers.";
    console.error("[spotifybu.provider-search] request failed", {
      diagnosticId,
      error: serializeProviderSearchError(error),
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

function providerSearchDiagnosticId() {
  return `ps-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function searchRequestSummary(body: Partial<ProviderSearchRequest>) {
  const track = body.track as
    | {
        name?: unknown;
        position?: unknown;
      }
    | undefined;

  return {
    limit: Number(body.limit ?? 5),
    providerIds: Array.isArray(body.providerIds)
      ? body.providerIds.map(String)
      : undefined,
    trackName: typeof track?.name === "string" ? track.name : "",
    trackPosition:
      typeof track?.position === "number" ? track.position : undefined
  };
}

function serializeProviderSearchError(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      message: "Unknown provider search error.",
      value: String(error)
    };
  }

  return {
    message: error.message,
    name: error.name,
    stack: error.stack
  };
}
