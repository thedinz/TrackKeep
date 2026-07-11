import { NextResponse } from "next/server";
import { getMusicLibraryStatus, getMusicLibraryUrl } from "@/lib/music-library";

export async function GET() {
  try {
    return NextResponse.json(await getMusicLibraryStatus(), {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "TrackKeep could not check the Navidrome music folder.";

    return NextResponse.json(
      {
        configured: false,
        exists: false,
        message,
        musicLibraryUrl: getMusicLibraryUrl(),
        readable: false,
        server: {
          configured: false,
          message,
          musicLibraryUrl: getMusicLibraryUrl(),
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
