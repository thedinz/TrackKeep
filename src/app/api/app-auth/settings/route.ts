import { NextResponse } from "next/server";
import {
  getAppAuthStatus,
  setAppSessionCookie,
  updateAppAuthMode,
  updateAppCredentials
} from "@/lib/app-auth";

export async function POST(request: Request) {
  const session = await getAppAuthStatus();

  if (!session.authenticated) {
    return NextResponse.json(
      { error: "Log in before changing settings." },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    authMode?: string;
    currentPassword?: string;
    newPassword?: string;
    username?: string;
  };

  try {
    const shouldUpdateCredentials = Boolean(
      body.username || body.currentPassword || body.newPassword
    );
    const credentials = shouldUpdateCredentials
      ? await updateAppCredentials({
          currentPassword: body.currentPassword ?? "",
          newPassword: body.newPassword ?? "",
          username: body.username ?? ""
        })
      : null;
    const authMode = body.authMode
      ? await updateAppAuthMode(body.authMode)
      : null;
    const nextAuthMode =
      authMode?.authMode ?? credentials?.authMode ?? session.authMode;
    const username = credentials?.username ?? authMode?.username ?? session.username;
    const response = NextResponse.json({
      authMode: nextAuthMode,
      defaultCredentials:
        credentials?.defaultCredentials ??
        authMode?.defaultCredentials ??
        session.defaultCredentials,
      ok: true,
      username
    });

    if (nextAuthMode === "internal" && username) {
      setAppSessionCookie(response, username);
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update settings."
      },
      { status: 400 }
    );
  }
}
