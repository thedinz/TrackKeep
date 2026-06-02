import { NextRequest, NextResponse } from "next/server";
import {
  searchProviderCandidates,
  type ProviderSearchRequest
} from "@/lib/providers/download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | Partial<ProviderSearchRequest>
    | null;

  if (!body?.track) {
    return NextResponse.json(
      {
        error: "Send a Spotify track before searching providers."
      },
      {
        status: 400
      }
    );
  }

  try {
    return NextResponse.json(
      {
        search: await searchProviderCandidates({
          limit: Number(body.limit ?? 5),
          providerIds: Array.isArray(body.providerIds)
            ? body.providerIds.map(String)
            : undefined,
          track: body.track as ProviderSearchRequest["track"]
        })
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "SpotifyBU could not search providers."
      },
      {
        status: 400
      }
    );
  }
}
