import { NextRequest, NextResponse } from "next/server";
import {
  downloadAuthorizedProviderTrack,
  type AuthorizedProviderDownloadRequest
} from "@/lib/providers/download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | Partial<AuthorizedProviderDownloadRequest>
    | null;

  if (!body) {
    return NextResponse.json(
      {
        error: "Send a selected provider download request."
      },
      {
        status: 400
      }
    );
  }

  try {
    const result = await downloadAuthorizedProviderTrack({
      bulkRiskAccepted: Boolean(body.bulkRiskAccepted),
      format: String(body.format ?? ""),
      providerId: String(body.providerId ?? ""),
      quality: String(body.quality ?? ""),
      rightsConfirmed: Boolean(body.rightsConfirmed),
      selectedReason: body.selectedReason,
      sourceUrl: String(body.sourceUrl ?? ""),
      track: body.track as AuthorizedProviderDownloadRequest["track"]
    });

    return NextResponse.json(
      {
        download: result
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
            : "SpotifyBU could not download from that provider."
      },
      {
        status: 400
      }
    );
  }
}
