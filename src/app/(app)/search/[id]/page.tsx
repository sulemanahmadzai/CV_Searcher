import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ResultCard } from "@/components/result-card";
import { ReviewButton } from "@/components/review-button";
import { Badge, Card, EmptyState, formatDate, ListSkeleton, Skeleton } from "@/components/ui";
import type { Usage } from "@/lib/claude";
import type { JobProfile } from "@/lib/search/jd";
import type { AiReview } from "@/lib/search/review";
import type { ScoredCandidate } from "@/lib/search/score";
import { createClient } from "@/lib/supabase/server";

export default function SearchResultsPage({ params }: PageProps<"/search/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-80" />
          <Skeleton className="h-24" />
          <ListSkeleton rows={5} />
        </div>
      }
    >
      <SearchResults params={params} />
    </Suspense>
  );
}

async function SearchResults({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: search } = await db.from("searches").select("*").eq("id", id).maybeSingle();
  if (!search) notFound();

  const job = search.requirements as unknown as JobProfile & { total_matched?: number };
  const results = search.results as unknown as ScoredCandidate[];
  const reviews = (search.ai_review as unknown as AiReview[] | null) ?? [];
  const reviewById = new Map(reviews.map((r) => [r.candidate_id, r]));
  const usage = search.usage as unknown as Usage | null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/" className="text-sm text-muted hover:text-accent">
            ← New search
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{job.job_title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">{job.summary}</p>
          <p className="mt-2 text-xs text-faint">
            {job.total_matched ?? results.length} candidates with evidence · showing top {results.length} ·{" "}
            {formatDate(search.created_at)}
            {usage && ` · AI cost $${usage.cost_usd.toFixed(3)}`}
          </p>
        </div>
        {results.length > 0 && reviews.length === 0 && <ReviewButton searchId={search.id} />}
      </div>

      <Card className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">What we looked for</p>
        <div className="flex flex-wrap gap-2">
          {job.requirements.map((r) => (
            <span
              key={r.label}
              title={`Matches: ${r.match_terms.join(", ")}${r.related_terms.length ? `\nPartial credit: ${r.related_terms.join(", ")}` : ""}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm"
            >
              {r.label}
              <Badge tone={r.importance === "must" ? "accent" : "neutral"}>{r.importance === "must" ? "must" : "nice"}</Badge>
            </span>
          ))}
          {job.min_total_years ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm">
              {job.min_total_years}+ years experience <Badge tone="accent">must</Badge>
            </span>
          ) : null}
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted hover:text-foreground">Show the job description</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-muted p-3 font-sans text-sm text-muted">
            {search.job_description}
          </pre>
        </details>
      </Card>

      {results.length === 0 ? (
        <EmptyState title="No candidates with matching evidence">
          Try broader wording, or upload more CVs.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {results.map((c, i) => (
            <ResultCard key={c.id} rank={i + 1} candidate={c} review={reviewById.get(c.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
