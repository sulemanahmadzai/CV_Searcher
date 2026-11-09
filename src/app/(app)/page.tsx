import Link from "next/link";
import { Suspense } from "react";
import { SearchForm } from "@/components/search-form";
import { Card, formatDate, ListSkeleton, Skeleton } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default function SearchPage() {
  return (
    <div className="space-y-10">
      <section>
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Who are you looking for?</h1>
          <p className="mt-1 text-sm text-muted">
            Paste a job description. Candidates are ranked by evidence in their CVs: qualifications held, how many
            roles and projects used each skill, for how many years, and how recently.
          </p>
        </div>
        <SearchForm />
        <Suspense fallback={<Skeleton className="mt-3 h-5 w-64" />}>
          <LibraryStats />
        </Suspense>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">Recent searches</h2>
        <Suspense fallback={<ListSkeleton rows={3} />}>
          <RecentSearches />
        </Suspense>
      </section>
    </div>
  );
}

async function LibraryStats() {
  const db = await createClient();
  const { count } = await db.from("candidates").select("id", { count: "exact", head: true });
  return (
    <p className="mt-3 text-sm text-muted">
      Searching <span className="font-medium text-foreground">{count ?? 0}</span> candidates.{" "}
      {!count && (
        <Link href="/upload" className="text-accent hover:underline">
          Upload CVs to get started.
        </Link>
      )}
    </p>
  );
}

async function RecentSearches() {
  const db = await createClient();
  const { data } = await db
    .from("searches")
    .select("id, title, job_description, created_at, requirements")
    .order("created_at", { ascending: false })
    .limit(8);

  if (!data?.length) return <p className="text-sm text-muted">No searches yet.</p>;

  return (
    <Card className="divide-y divide-border">
      {data.map((s) => {
        const matched = (s.requirements as { total_matched?: number } | null)?.total_matched;
        return (
          <Link key={s.id} href={`/search/${s.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-muted">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{s.title ?? "Search"}</p>
              <p className="truncate text-sm text-muted">{s.job_description.replace(/\s+/g, " ").slice(0, 140)}</p>
            </div>
            <div className="shrink-0 text-right text-xs text-faint">
              {matched != null && <p className="text-sm text-muted">{matched} matches</p>}
              <p>{formatDate(s.created_at)}</p>
            </div>
          </Link>
        );
      })}
    </Card>
  );
}
