import Link from "next/link";
import { Suspense } from "react";
import { Card, EmptyState, formatYears, ListSkeleton, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default function CandidatesPage({ searchParams }: PageProps<"/candidates">) {
  return (
    <div>
      <Suspense fallback={<ListSkeleton rows={8} />}>
        <CandidateList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CandidateList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const db = await createClient();

  let query = db
    .from("candidates")
    .select("id, full_name, headline, location, total_years_experience, highest_education, updated_at")
    .order("full_name")
    .limit(1000);
  if (q) {
    const safe = q.replace(/[%,()*]/g, " ");
    query = query.or(`full_name.ilike.%${safe}%,headline.ilike.%${safe}%,location.ilike.%${safe}%`);
  }
  const { data, count } = await query;
  const { count: total } = await db.from("candidates").select("id", { count: "exact", head: true });

  return (
    <>
      <PageHeader
        title="Candidates"
        subtitle={`${total ?? 0} people in your library${q ? ` · ${data?.length ?? count ?? 0} matching "${q}"` : ""}`}
        actions={
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Filter by name, title or location"
              className="w-64 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <button className="rounded-lg border border-border-strong px-3 py-2 text-sm hover:bg-surface-muted">Filter</button>
          </form>
        }
      />
      {!data?.length ? (
        <EmptyState title={q ? "No candidates match that filter" : "No candidates yet"}>
          {!q && (
            <Link href="/upload" className="text-accent hover:underline">
              Upload CVs
            </Link>
          )}
        </EmptyState>
      ) : (
        <Card className="divide-y divide-border">
          {data.map((c) => (
            <Link key={c.id} href={`/candidates/${c.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-muted">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                {c.full_name
                  .split(" ")
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join("")
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.full_name}</p>
                <p className="truncate text-sm text-muted">{[c.headline, c.location].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="hidden shrink-0 text-right text-sm text-muted sm:block">
                <p>{formatYears(c.total_years_experience) ?? ""}</p>
                <p className="max-w-56 truncate text-xs text-faint">{c.highest_education}</p>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
