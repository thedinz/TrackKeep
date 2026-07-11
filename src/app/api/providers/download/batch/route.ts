import { NextRequest, NextResponse } from "next/server";
import {
  downloadAuthorizedProviderBatch,
  type AuthorizedProviderDownloadBatchRequest
} from "@/lib/providers/download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | Partial<AuthorizedProviderDownloadBatchRequest>
    | null;

  if (!body) {
    return NextResponse.json(
      {
        error: "Send a provider download queue."
      },
      {
        status: 400
      }
    );
  }

  try {
    const result = await downloadAuthorizedProviderBatch({
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
        batch: result
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
            : "TrackKeep could not run the provider backup queue."
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
