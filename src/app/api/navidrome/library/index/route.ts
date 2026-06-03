import { NextResponse } from "next/server";
import {
  getNavidromeLibraryIndexSummary,
  scanNavidromeLibraryIndex
} from "@/lib/navidrome";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

export async function GET() {
  return NextResponse.json(
    {
      index: await getNavidromeLibraryIndexSummary()
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function POST() {
  try {
    return NextResponse.json(
      {
        index: await scanNavidromeLibraryIndex()
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
