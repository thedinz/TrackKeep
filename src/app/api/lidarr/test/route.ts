import { NextResponse } from "next/server";
import { getAppAuthStatus } from "@/lib/app-auth";
import { testLidarrNamingConnection } from "@/lib/organize-settings";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getAppAuthStatus();

  if (!session.authenticated) {
    return NextResponse.json(
      { error: "Log in before testing Lidarr." },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    apiKey?: string;
    baseUrl?: string;
  };
  const result = await testLidarrNamingConnection(body);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 400
  });
}
