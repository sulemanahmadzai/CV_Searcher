import { NextResponse, type NextRequest } from "next/server";
import { runSearch } from "@/lib/search/run";
import { createClient, getUserClaims } from "@/lib/supabase/server";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const db = await createClient();
  if (!(await getUserClaims(db))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { jobDescription?: string } | null;
  const jobDescription = body?.jobDescription?.trim() ?? "";
  if (jobDescription.length < 3) {
    return NextResponse.json({ error: "Paste a job description or describe who you need." }, { status: 400 });
  }
  if (jobDescription.length > 30_000) {
    return NextResponse.json({ error: "That job description is too long (30,000 characters max)." }, { status: 400 });
  }

  try {
    const search = await runSearch(db, jobDescription);
    return NextResponse.json({ id: search.id, totalMatched: search.totalMatched });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
