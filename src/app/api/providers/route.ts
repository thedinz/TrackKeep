import { NextResponse } from "next/server";
import { SOURCE_PROVIDER_CATALOG } from "@/lib/providers/types";

export async function GET() {
  return NextResponse.json(
    {
      providers: SOURCE_PROVIDER_CATALOG
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
