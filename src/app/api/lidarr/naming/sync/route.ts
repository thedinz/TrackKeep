import { NextResponse } from "next/server";
import { getAppAuthStatus } from "@/lib/app-auth";
import {
  syncLidarrNamingSettings,
  toOrganizeNamingSettingsView
} from "@/lib/organize-settings";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getAppAuthStatus();

  if (!session.authenticated) {
    return NextResponse.json(
      { error: "Log in before loading Lidarr naming." },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    apiKey?: string;
    baseUrl?: string;
  };

  try {
    const naming = await syncLidarrNamingSettings(body);

    return NextResponse.json({
      naming: toOrganizeNamingSettingsView(naming),
      ok: true
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load Lidarr naming settings."
      },
      {
        status: 400
      }
    );
  }
}
