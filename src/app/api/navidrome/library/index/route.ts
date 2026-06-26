import { NextResponse } from "next/server";
import {
  emptyNavidromeLibraryIndexSummary,
  getCachedNavidromeLibraryIndexSummary,
  getNavidromeLibraryIndexSummary,
  getNavidromeLibraryIndexScanStatus,
  startNavidromeLibraryIndexScan
} from "@/lib/navidrome";
import { ensureNavidromeAutoScanScheduler } from "@/lib/navidrome-auto-scan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

export async function GET() {
  ensureNavidromeAutoScanScheduler();

  const scan = getNavidromeLibraryIndexScanStatus();

  if (scan.state !== "idle") {
    return libraryIndexResponse({
      index: scan.index ?? getCachedIndexSummary(),
      scan
    });
  }

  try {
    return libraryIndexResponse({
      index: await getNavidromeLibraryIndexSummary(),
      scan
    });
  } catch (error) {
    return libraryIndexResponse({
      index: getCachedIndexSummary(),
      scan: {
        ...scan,
        completedAt: scan.completedAt ?? new Date().toISOString(),
        error:
          error instanceof Error
            ? error.message
            : "SpotifyBU could not read the Navidrome library index.",
        state: "failed"
      }
    });
  }
}

export async function POST() {
  ensureNavidromeAutoScanScheduler();

  try {
    const scan = startNavidromeLibraryIndexScan();
    const index =
      scan.index ??
      getCachedIndexSummary();

    return libraryIndexResponse({
      index,
      scan
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "SpotifyBU could not scan the Navidrome library."
      },
      {
        status: 400
      }
    );
  }
}

function libraryIndexResponse(body: {
  index: ReturnType<typeof getCachedIndexSummary>;
  scan: ReturnType<typeof getNavidromeLibraryIndexScanStatus>;
}) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function getCachedIndexSummary() {
  return (
    getCachedNavidromeLibraryIndexSummary() ??
    emptyNavidromeLibraryIndexSummary
  );
}
