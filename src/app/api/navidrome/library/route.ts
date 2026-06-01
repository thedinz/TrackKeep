import { NextResponse } from "next/server";
import { getNavidromeLibraryStatus } from "@/lib/navidrome";

export async function GET() {
  return NextResponse.json(await getNavidromeLibraryStatus(), {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
