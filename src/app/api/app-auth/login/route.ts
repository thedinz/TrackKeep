import { NextResponse } from "next/server";
import {
  getAppAuthMode,
  setAppSessionCookie,
  verifyAppCredentials
} from "@/lib/app-auth";
import {
  getLoginRetryAfterSeconds,
  recordLoginFailure,
  recordLoginSuccess
} from "@/lib/login-throttle";

export async function POST(request: Request) {
  if ((await getAppAuthMode()) === "external") {
    return NextResponse.json(
      { error: "Built-in login is disabled because external auth is enabled." },
      { status: 403 }
    );
  }

  const retryAfterSeconds = getLoginRetryAfterSeconds();

  if (retryAfterSeconds > 0) {
    return NextResponse.json(
      {
        error: `Too many failed login attempts. Try again in ${retryAfterSeconds} seconds.`
      },
      {
        headers: {
          "Retry-After": String(retryAfterSeconds)
        },
        status: 429
      }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
    username?: string;
  };
  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";

  if (!(await verifyAppCredentials(username, password))) {
    recordLoginFailure();

    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401 }
    );
  }

  recordLoginSuccess();

  const response = NextResponse.json({
    ok: true
  });
  setAppSessionCookie(response, username, request);

  return response;
}
