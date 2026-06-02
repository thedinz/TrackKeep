import { NextResponse } from "next/server";
import { clearAppSessionCookie } from "@/lib/app-auth";
import { getAppUrl } from "@/lib/app-url";

export async function GET(request: Request) {
  const response = NextResponse.redirect(getAppUrl(request, "/login"));
  clearAppSessionCookie(response);

  return response;
}
