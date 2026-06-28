import { NextResponse } from "next/server";
import { getAppInfo } from "@/lib/app-info";
import { ensureMusicLibraryAutoScanScheduler } from "@/lib/music-library-auto-scan";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureMusicLibraryAutoScanScheduler();

  return NextResponse.json(getAppInfo(), {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
