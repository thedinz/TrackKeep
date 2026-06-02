import { NextResponse } from "next/server";
import {
  readAppSession,
  setAppSessionCookie,
  updateAppCredentials
} from "@/lib/app-auth";

export async function POST(request: Request) {
  const session = await readAppSession();

  if (!session) {
    return NextResponse.json(
      { error: "Log in before changing settings." },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    currentPassword?: string;
    newPassword?: string;
    username?: string;
  };

  try {
    const credentials = await updateAppCredentials({
      currentPassword: body.currentPassword ?? "",
      newPassword: body.newPassword ?? "",
      username: body.username ?? ""
    });
    const response = NextResponse.json({
      defaultCredentials: credentials.defaultCredentials,
      ok: true,
      username: credentials.username
    });
    setAppSessionCookie(response, credentials.username);

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
