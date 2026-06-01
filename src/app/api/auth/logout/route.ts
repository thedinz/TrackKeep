import { NextResponse } from "next/server";
import { clearOAuthCookies, clearSessionCookie } from "@/lib/session";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url));
  clearSessionCookie(response);
  clearOAuthCookies(response);

  return response;
}
