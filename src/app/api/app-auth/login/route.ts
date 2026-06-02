import { NextResponse } from "next/server";
import { setAppSessionCookie, verifyAppCredentials } from "@/lib/app-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
    username?: string;
  };
  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";

  if (!(await verifyAppCredentials(username, password))) {
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401 }
    );
  }

  const response = NextResponse.json({
    ok: true
  });
  setAppSessionCookie(response, username);

  return response;
}
