import { NextResponse } from "next/server";
import { getProviderDownloadJobSnapshot } from "@/lib/providers/download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ jobId: string }> | { jobId: string };
};

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;
  const job = getProviderDownloadJobSnapshot(jobId);

  if (!job) {
    return NextResponse.json(
      {
        error: "Provider download job not found."
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
