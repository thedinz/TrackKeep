import { NextRequest, NextResponse } from "next/server";
import {
  getPlaylistBackupExport,
  getPlaylistBackupSnapshotDetail
} from "@/lib/backup-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ backupId: string }> | { backupId: string };
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { backupId } = await context.params;

  if (request.nextUrl.searchParams.get("download") === "1") {
    const backupExport = getPlaylistBackupExport(backupId);

    if (!backupExport) {
      return backupNotFound();
    }

    return new NextResponse(backupExport.payloadJson, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${backupExportFileName(
          backupExport.playlistName,
          backupExport.firstSeenAt
        )}"`,
        "Content-Type": "application/json; charset=utf-8"
      }
    });
  }

  const detail = getPlaylistBackupSnapshotDetail(backupId);

  if (!detail) {
    return backupNotFound();
  }

  return NextResponse.json(detail, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function backupNotFound() {
  return NextResponse.json(
    {
      error: "Playlist backup snapshot not found."
    },
    {
      status: 404
    }
  );
}

function backupExportFileName(playlistName: string, firstSeenAt: string) {
  const slug =
    playlistName
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .toLowerCase() || "playlist";

  return `trackkeep-${slug}-${firstSeenAt.slice(0, 10)}.json`;
}
