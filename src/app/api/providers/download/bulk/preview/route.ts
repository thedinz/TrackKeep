import { NextRequest, NextResponse } from "next/server";
import { previewProviderBulkDownloadCandidates } from "@/lib/providers/download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

type PreviewRequestBody = {
  limit?: unknown;
  providerIds?: unknown;
  stream?: unknown;
  tracks?: unknown;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as PreviewRequestBody | null;

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

  if (
    body.stream === true ||
    request.headers.get("accept")?.includes("application/x-ndjson")
  ) {
    return streamProviderBulkDownloadPreview(body);
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
            : "TrackKeep could not preview provider candidates."
      },
      {
        status: 400
      }
    );
  }
}

function streamProviderBulkDownloadPreview(body: PreviewRequestBody) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          const preview = await previewProviderBulkDownloadCandidates({
            limit: numericBodyValue(body.limit),
            onProgress: (progress) => {
              writeJsonLine(controller, encoder, {
                completedCount: progress.completedCount,
                failedCount: progress.failedCount,
                totalCount: progress.totalCount,
                trackLabel: `${progress.item.track.position}. ${progress.item.track.name}`,
                type: "progress"
              });
            },
            providerIds: Array.isArray(body.providerIds)
              ? body.providerIds.map(String)
              : undefined,
            tracks: Array.isArray(body.tracks) ? body.tracks : []
          });

          writeJsonLine(controller, encoder, {
            preview,
            type: "complete"
          });
        } catch (error) {
          writeJsonLine(controller, encoder, {
            error:
              error instanceof Error
                ? error.message
                : "TrackKeep could not preview provider candidates.",
            type: "error"
          });
        } finally {
          controller.close();
        }
      })();
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8"
    }
  });
}

function writeJsonLine(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  payload: Record<string, unknown>
) {
  controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
}

function numericBodyValue(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}
