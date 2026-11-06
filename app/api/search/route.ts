import { NextRequest, NextResponse } from "next/server";
import { searchAll } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Popular songs fill whole pages with their own transcriptions, so one page of
// results can be just two or three songs once they're grouped.
const SEARCH_PAGES = 3;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "missing query" }, { status: 400 });
  }
  try {
    const { results, errors } = await searchAll(q, req.signal, { pages: SEARCH_PAGES });
    return NextResponse.json({ query: q, results, errors });
  } catch (e) {
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 502 },
    );
  }
}
