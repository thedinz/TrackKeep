import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { clearOAuthCookies, clearSessionCookie } from "@/lib/session";

export async function GET(request: Request) {
  const response = NextResponse.redirect(getAppUrl(request, "/"));
  clearSessionCookie(response);
  clearOAuthCookies(response);

  return response;
}
