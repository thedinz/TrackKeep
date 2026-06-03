import { NextRequest, NextResponse } from "next/server";
import {
  downloadAuthorizedProviderTrack,
  type AuthorizedProviderDownloadRequest
} from "@/lib/providers/download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | Partial<AuthorizedProviderDownloadRequest>
    | null;
  const diagnosticId = providerDownloadDiagnosticId();

  if (!body) {
    return NextResponse.json(
      {
        diagnosticId,
        error: "Send a selected provider download request."
      },
      {
        status: 400
      }
    );
  }

  const summary = downloadRequestSummary(body);
  console.info("[spotifybu.provider-download] request started", {
    diagnosticId,
    ...summary
  });

  try {
    const result = await downloadAuthorizedProviderTrack({
      bulkRiskAccepted: Boolean(body.bulkRiskAccepted),
      diagnosticId,
      format: String(body.format ?? ""),
      providerId: String(body.providerId ?? ""),
      quality: String(body.quality ?? ""),
      rightsConfirmed: Boolean(body.rightsConfirmed),
      selectedReason: body.selectedReason,
      sourceUrl: String(body.sourceUrl ?? ""),
      track: body.track as AuthorizedProviderDownloadRequest["track"]
    });

    console.info("[spotifybu.provider-download] request completed", {
      bytesWritten: result.bytesWritten,
      destinationPath: result.relativePath ?? result.destinationPath,
      diagnosticId,
      providerId: result.providerId,
      sourceUrl: result.sourceUrl
    });

    return NextResponse.json(
      {
        diagnosticId,
        download: result
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "SpotifyBU could not download from that provider.";
    console.error("[spotifybu.provider-download] request failed", {
      diagnosticId,
      error: serializeProviderDownloadError(error),
      ...summary
    });

    return NextResponse.json(
      {
        diagnosticId,
        error: message
      },
      {
        status: 400
      }
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
