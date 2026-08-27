import { NextResponse } from "next/server";
import {
  hasHomepageApiKey,
  isHomepageApiRequestAuthorized
} from "@/lib/homepage-api-auth";
import { getHomepageStats } from "@/lib/homepage-stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!hasHomepageApiKey()) {
    return NextResponse.json(
      {
        error:
          "Set TRACKKEEP_HOMEPAGE_API_KEY before using the Homepage stats endpoint."
      },
      { status: 503 }
    );
  }

  if (!isHomepageApiRequestAuthorized(request)) {
    return NextResponse.json(
      { error: "A valid X-API-Key header is required." },
      { status: 401 }
    );
  }

  return NextResponse.json(await getHomepageStats(), {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
