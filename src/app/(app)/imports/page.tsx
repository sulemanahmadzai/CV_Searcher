import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, EmptyState, formatDate, ListSkeleton, PageHeader, type Tone } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

const STATUS_TONE: Record<string, Tone> = {
  processed: "strong",
  duplicate: "weak",
  skipped: "neutral",
  failed: "missing",
  processing: "good",
  pending: "neutral",
};

export default function ImportsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={10} />}>
      <ImportLog />
    </Suspense>
  );
}

async function ImportLog() {
  const db = await createClient();
  const { data: files } = await db
    .from("cv_files")
    .select("id, original_filename, status, status_detail, candidate_id, extraction_method, usage, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  const counts: Record<string, number> = {};
  let cost = 0;
  for (const f of files ?? []) {
    counts[f.status] = (counts[f.status] ?? 0) + 1;
    cost += (f.usage as { cost_usd?: number } | null)?.cost_usd ?? 0;
  }

  return (
    <div>
      <PageHeader
        title="Import log"
        subtitle={`${files?.length ?? 0} files · Claude cost so far $${cost.toFixed(2)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {Object.entries(counts).map(([status, n]) => (
              <Badge key={status} tone={STATUS_TONE[status] ?? "neutral"}>
                {n} {status}
              </Badge>
            ))}
          </div>
        }
      />
      {!files?.length ? (
        <EmptyState title="Nothing imported yet">
          <Link href="/upload" className="text-accent hover:underline">
            Upload CVs
          </Link>
        </EmptyState>
      ) : (
        <Card className="divide-y divide-border">
          {files.map((f) => (
            <div key={f.id} className="flex items-start gap-4 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="break-all font-medium hover:text-accent">
                  {f.original_filename}
                </a>
                {f.status_detail && <p className="text-muted">{f.status_detail}</p>}
              </div>
              <div className="shrink-0 space-y-1 text-right">
                <Badge tone={STATUS_TONE[f.status] ?? "neutral"}>{f.status}</Badge>
                <p className="text-xs text-faint">
                  {f.extraction_method === "vision" ? "read from images · " : ""}
                  {formatDate(f.created_at)}
                </p>
                {f.candidate_id && (
                  <Link href={`/candidates/${f.candidate_id}`} className="block text-xs text-accent hover:underline">
                    View candidate
                  </Link>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
