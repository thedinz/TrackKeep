import { NextRequest, NextResponse } from "next/server";
import { verifyAppCredentials } from "@/lib/app-auth";
import {
  buildNaviCleanCanonicalTargets,
  type NaviCleanCanonicalTargetRequestTrack
} from "@/lib/navidrome";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST(request: NextRequest) {
  if (!(await requestIsAuthorized(request))) {
    return NextResponse.json(
      {
        error: "NaviClean is not authorized to read SpotifyBU targets."
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": "Basic realm=\"SpotifyBU NaviClean\""
        }
      }
    );
  }

  const body = await request.json().catch(() => null);
  const tracks = Array.isArray(body?.tracks)
    ? normalizeRequestTracks(body.tracks)
    : null;

  if (!tracks) {
    return NextResponse.json(
      {
        error: "Send NaviClean tracks before requesting SpotifyBU targets."
      },
      {
        status: 400
      }
    );
  }

  return NextResponse.json(await buildNaviCleanCanonicalTargets(tracks), {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

async function requestIsAuthorized(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = process.env.SPOTIFYBU_NAVICLEAN_TOKEN?.trim();

  if (token && authorization === `Bearer ${token}`) {
    return true;
  }

  const credentials = basicCredentials(authorization);

  return credentials
    ? verifyAppCredentials(credentials.username, credentials.password)
    : false;
}

function basicCredentials(authorization: string) {
  const match = authorization.match(/^Basic\s+(.+)$/i);

  if (!match) {
    return null;
  }

  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const separator = decoded.indexOf(":");

    if (separator < 0) {
      return null;
    }

    return {
      password: decoded.slice(separator + 1),
      username: decoded.slice(0, separator)
    };
  } catch {
    return null;
  }
}

function normalizeRequestTracks(values: unknown[]): NaviCleanCanonicalTargetRequestTrack[] {
  const tracks: NaviCleanCanonicalTargetRequestTrack[] = [];

  for (const value of values) {
    const track = value as Partial<NaviCleanCanonicalTargetRequestTrack> | null;
    const relativePath = typeof track?.relativePath === "string"
      ? track.relativePath
      : "";

    if (!relativePath) {
      continue;
    }

    tracks.push({
      duration: typeof track?.duration === "number" ? track.duration : null,
      relativePath,
      size: typeof track?.size === "number" ? track.size : null
    });
  }

  return tracks;
}
