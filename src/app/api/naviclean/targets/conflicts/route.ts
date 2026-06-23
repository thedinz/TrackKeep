import { NextRequest, NextResponse } from "next/server";
import {
  getNaviCleanTargetConflicts,
  resolveNaviCleanTargetConflict
} from "@/lib/navidrome";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

export async function GET() {
  return NextResponse.json(await getNaviCleanTargetConflicts(), {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const sourceRelativePath =
    typeof body?.sourceRelativePath === "string" ? body.sourceRelativePath : "";
  const targetRelativePath =
    typeof body?.targetRelativePath === "string" ? body.targetRelativePath : null;

  try {
    return NextResponse.json(
      await resolveNaviCleanTargetConflict({
        sourceRelativePath,
        targetRelativePath
      }),
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
            : "SpotifyBU could not save the NaviClean target resolution."
      },
      {
        status: 400
      }
    );
  }
}
