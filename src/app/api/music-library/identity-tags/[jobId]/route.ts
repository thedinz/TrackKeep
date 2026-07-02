import { NextResponse } from "next/server";
import { getMusicLibrarySpotifyIdentityTagBackfillJobSnapshot } from "@/lib/music-library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ jobId: string }> | { jobId: string };
};

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;
  const job = getMusicLibrarySpotifyIdentityTagBackfillJobSnapshot(jobId);

  if (!job) {
    return NextResponse.json(
      {
        error: "Spotify identity tag job not found."
      },
      {
        status: 404
      }
    );
  }

  return NextResponse.json(
    {
      job
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
