import { NextResponse } from "next/server";
import { getAppAuthStatus } from "@/lib/app-auth";
import {
  getPublicPlexSettings,
  updatePlexSettings,
  type PlexSettingsUpdate
} from "@/lib/plex";

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
      plex: await getPublicPlexSettings()
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
    plex?: PlexSettingsUpdate;
  };

  try {
    return NextResponse.json({
      ok: true,
      plex: await updatePlexSettings(body.plex ?? {})
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update Plex settings."
      },
      {
        status: 400
      }
    );
  }
}
