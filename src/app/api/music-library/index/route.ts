import { NextResponse } from "next/server";
import {
  emptyMusicLibraryIndexSummary,
  getCachedMusicLibraryIndexSummary,
  getMusicLibraryIndexSummary,
  getMusicLibraryIndexScanStatus,
  startMusicLibraryIndexScan
} from "@/lib/music-library";
import { ensureMusicLibraryAutoScanScheduler } from "@/lib/music-library-auto-scan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

export async function GET() {
  ensureMusicLibraryAutoScanScheduler();

  const scan = getMusicLibraryIndexScanStatus();

  if (scan.state !== "idle") {
    return libraryIndexResponse({
      index: scan.index ?? getCachedIndexSummary(),
      scan
    });
  }

  try {
    return libraryIndexResponse({
      index: await getMusicLibraryIndexSummary(),
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
  ensureMusicLibraryAutoScanScheduler();

  try {
    const scan = startMusicLibraryIndexScan();
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
            : "SpotifyBU could not scan the Navidrome folder."
      },
      {
        status: 400
      }
    );
  }
}

function libraryIndexResponse(body: {
  index: ReturnType<typeof getCachedIndexSummary>;
  scan: ReturnType<typeof getMusicLibraryIndexScanStatus>;
}) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function getCachedIndexSummary() {
  return (
    getCachedMusicLibraryIndexSummary() ??
    emptyMusicLibraryIndexSummary
  );
}
