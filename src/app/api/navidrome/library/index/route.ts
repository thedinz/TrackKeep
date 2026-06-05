import { NextResponse } from "next/server";
import {
  getCachedNavidromeLibraryIndexSummary,
  getNavidromeLibraryIndexSummary,
  getNavidromeLibraryIndexScanStatus,
  startNavidromeLibraryIndexScan
} from "@/lib/navidrome";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

export async function GET() {
  try {
    return NextResponse.json(
      {
        index: await getNavidromeLibraryIndexSummary(),
        scan: getNavidromeLibraryIndexScanStatus()
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    const scan = getNavidromeLibraryIndexScanStatus();

    return NextResponse.json(
      {
        index: getCachedNavidromeLibraryIndexSummary() ?? {
          stale: true,
          trackCount: 0
        },
        scan: {
          ...scan,
          completedAt: scan.completedAt ?? new Date().toISOString(),
          error:
            error instanceof Error
              ? error.message
              : "SpotifyBU could not read the Navidrome library index.",
          state: "failed"
        }
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}

export async function POST() {
  try {
    const scan = startNavidromeLibraryIndexScan();
    const index =
      scan.index ??
      getCachedNavidromeLibraryIndexSummary() ?? {
        stale: true,
        trackCount: 0
      };

    return NextResponse.json(
      {
        index,
        scan
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
            : "SpotifyBU could not scan the Navidrome library."
      },
      {
        status: 400
      }
    );
  }
}
