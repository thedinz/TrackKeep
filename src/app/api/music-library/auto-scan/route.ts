import { NextResponse } from "next/server";
import { getAppAuthStatus } from "@/lib/app-auth";
import {
  getMusicLibraryAutoScanStatus,
  updateMusicLibraryAutoScanSettings,
  type MusicLibraryAutoScanSettingsUpdate
} from "@/lib/music-library-auto-scan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getAppAuthStatus();

  if (!session.authenticated) {
    return NextResponse.json(
      { error: "Log in before reading settings." },
      { status: 401 }
    );
  }

  return NextResponse.json(
    {
      autoScan: await getMusicLibraryAutoScanStatus()
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function POST(request: Request) {
  const session = await getAppAuthStatus();

  if (!session.authenticated) {
    return NextResponse.json(
      { error: "Log in before changing settings." },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    autoScan?: MusicLibraryAutoScanSettingsUpdate;
  };

  try {
    return NextResponse.json({
      autoScan: await updateMusicLibraryAutoScanSettings(body.autoScan ?? {}),
      ok: true
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update Navidrome auto scan settings."
      },
      {
        status: 400
      }
    );
  }
}
