import { NextResponse } from "next/server";
import { getNavidromeLibraryStatus, getNavidromeUrl } from "@/lib/navidrome";

export async function GET() {
  try {
    return NextResponse.json(await getNavidromeLibraryStatus(), {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "SpotifyBU could not check the Navidrome library target.";

    return NextResponse.json(
      {
        configured: false,
        exists: false,
        message,
        navidromeUrl: getNavidromeUrl(),
        readable: false,
        server: {
          configured: false,
          message,
          navidromeUrl: getNavidromeUrl(),
          state: "error"
        },
        state: "error",
        writable: false
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
