import { NextRequest, NextResponse } from "next/server";
import {
  startProviderBulkDownloadJob,
  type AuthorizedProviderBulkDownloadRequest
} from "@/lib/providers/download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | Partial<AuthorizedProviderBulkDownloadRequest>
    | null;

  if (!body) {
    return NextResponse.json(
      {
        error: "Send a previewed provider bulk queue."
      },
      {
        status: 400
      }
    );
  }

  try {
    const job = startProviderBulkDownloadJob({
      bulkRiskAccepted: Boolean(body.bulkRiskAccepted),
      chunkPauseMs: numericBodyValue(body.chunkPauseMs),
      chunkSize: numericBodyValue(body.chunkSize),
      delayMs: numericBodyValue(body.delayMs),
      fallbackFormat: String(body.fallbackFormat ?? ""),
      fallbackQuality: String(body.fallbackQuality ?? ""),
      format: String(body.format ?? ""),
      items: Array.isArray(body.items) ? body.items : [],
      quality: String(body.quality ?? ""),
      rightsConfirmed: Boolean(body.rightsConfirmed)
    });

    return NextResponse.json(
      {
        job
      },
      {
        status: 202,
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
            : "TrackKeep could not start the provider bulk backup job."
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
