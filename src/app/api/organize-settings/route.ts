import { NextResponse } from "next/server";
import { getAppAuthStatus } from "@/lib/app-auth";
import {
  loadOrganizeNamingSettings,
  toOrganizeNamingSettingsView,
  updateOrganizeNamingSettings,
  type OrganizeNamingSettingsUpdate
} from "@/lib/organize-settings";

export const runtime = "nodejs";

export async function GET() {
  const session = await getAppAuthStatus();

  if (!session.authenticated) {
    return NextResponse.json(
      { error: "Log in before reading settings." },
      { status: 401 }
    );
  }

  const naming = await loadOrganizeNamingSettings();

  return NextResponse.json(
    {
      naming: toOrganizeNamingSettingsView(naming)
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
    naming?: OrganizeNamingSettingsUpdate;
  };

  try {
    const naming = await updateOrganizeNamingSettings(body.naming ?? {});

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
            : "Could not update organize settings."
      },
      {
        status: 400
      }
    );
  }
}
