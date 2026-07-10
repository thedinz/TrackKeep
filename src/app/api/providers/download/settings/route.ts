import { NextResponse } from "next/server";
import { getAppAuthStatus } from "@/lib/app-auth";
import {
  loadProviderDownloadSettings,
  updateProviderDownloadSettings,
  type ProviderDownloadSettingsUpdate
} from "@/lib/provider-download-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getAppAuthStatus();

  if (!session.authenticated) {
    return NextResponse.json(
      { error: "Log in before reading provider download settings." },
      { status: 401 }
    );
  }

  return NextResponse.json(
    {
      providerDownload: await loadProviderDownloadSettings()
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
      { error: "Log in before changing provider download settings." },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    providerDownload?: ProviderDownloadSettingsUpdate;
  };

  try {
    return NextResponse.json({
      ok: true,
      providerDownload: await updateProviderDownloadSettings(
        body.providerDownload ?? {}
      )
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update provider download settings."
      },
      {
        status: 400
      }
    );
  }
}
