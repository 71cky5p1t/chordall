import { NextRequest, NextResponse } from "next/server";
import { searchAll } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "missing query" }, { status: 400 });
  }
  try {
    const { results, errors } = await searchAll(q, req.signal);
    return NextResponse.json({ query: q, results, errors });
  } catch (e) {
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 502 },
    );
  }
}
