import { NextResponse } from "next/server";
import { clearAppSessionCookie } from "@/lib/app-auth";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  clearAppSessionCookie(response);

  return response;
}
