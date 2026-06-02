import { NextResponse } from "next/server";
import { getAppAuthStatus } from "@/lib/app-auth";

export async function GET() {
  return NextResponse.json(await getAppAuthStatus(), {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
