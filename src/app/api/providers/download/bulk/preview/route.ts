import { NextRequest, NextResponse } from "next/server";
import { previewProviderBulkDownloadCandidates } from "@/lib/providers/download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        limit?: unknown;
        providerIds?: unknown;
        tracks?: unknown;
      }
    | null;

  if (!body) {
    return NextResponse.json(
      {
        error: "Send Spotify tracks before previewing provider candidates."
      },
      {
        status: 400
      }
    );
  }

  try {
    const preview = await previewProviderBulkDownloadCandidates({
      limit: numericBodyValue(body.limit),
      providerIds: Array.isArray(body.providerIds)
        ? body.providerIds.map(String)
        : undefined,
      tracks: Array.isArray(body.tracks) ? body.tracks : []
    });

    return NextResponse.json(
      {
        preview
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
            : "SpotifyBU could not preview provider candidates."
      },
      {
        status: 400
      }
    );
  }
}

function numericBodyValue(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}
