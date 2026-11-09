import { NextResponse, type NextRequest } from "next/server";
import { reviewTopCandidates } from "@/lib/search/review";
import { createClient, getUserClaims } from "@/lib/supabase/server";

export const maxDuration = 120;

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/search/[id]/review">) {
  const { id } = await ctx.params;
  const db = await createClient();
  if (!(await getUserClaims(db))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const reviews = await reviewTopCandidates(db, id);
    return NextResponse.json({ count: reviews.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Review failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
