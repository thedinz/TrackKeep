import { NextResponse } from "next/server";
import {
  getMusicServerScanStatus,
  startMusicServerScan,
  type MusicServerScanStatus
} from "@/lib/music-library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return scanResponse(await getMusicServerScanStatus());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    fullScan?: unknown;
  };

  try {
    return scanResponse(
      await startMusicServerScan({
        fullScan: body.fullScan === true
      }),
      202
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "SpotifyBU could not request a Navidrome scan."
      },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }
}

function scanResponse(scan: MusicServerScanStatus, status = 200) {
  return NextResponse.json(scan, {
    headers: {
      "Cache-Control": "no-store"
    },
    status
  });
}
