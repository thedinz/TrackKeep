import { NextResponse } from "next/server";
import { getAppInfo } from "@/lib/app-info";
import { ensureNavidromeAutoScanScheduler } from "@/lib/navidrome-auto-scan";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureNavidromeAutoScanScheduler();

  return NextResponse.json(getAppInfo(), {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
