import { NextRequest, NextResponse } from "next/server";
import {
  cancelProviderBulkDownloadJob,
  deleteProviderBulkDownloadJob,
  getProviderBulkDownloadJobSnapshot,
  retryProviderBulkDownloadJob
} from "@/lib/providers/download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ jobId: string }> | { jobId: string };
};

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;
  const job = getProviderBulkDownloadJobSnapshot(jobId);

  if (!job) {
    return NextResponse.json(
      {
        error: "Provider bulk download job not found."
      },
      {
        status: 404
      }
    );
  }

  return NextResponse.json(
    {
      diagnosticId: job.diagnosticId,
      job
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { jobId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        action?: unknown;
      }
    | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const job =
    action === "cancel"
      ? cancelProviderBulkDownloadJob(jobId)
      : action === "retry"
        ? retryProviderBulkDownloadJob(jobId)
        : null;

  if (!job) {
    return NextResponse.json(
      {
        error:
          action === "cancel" || action === "retry"
            ? "Provider bulk download job not found."
            : "Choose cancel or retry."
      },
      {
        status: action === "cancel" || action === "retry" ? 404 : 400
      }
    );
  }

  return NextResponse.json(
    {
      diagnosticId: job.diagnosticId,
      job
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;
  const result = deleteProviderBulkDownloadJob(jobId);

  if (result !== "deleted") {
    return NextResponse.json(
      {
        error:
          result === "active"
            ? "Cancel this bulk job and wait for it to stop before deleting it."
            : "Provider bulk download job not found."
      },
      {
        status: result === "active" ? 409 : 404
      }
    );
  }

  return NextResponse.json(
    {
      deleted: true,
      jobId
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
