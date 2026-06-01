import { NextResponse } from "next/server";
import { getAppInfo } from "@/lib/app-info";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getAppInfo(), {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
