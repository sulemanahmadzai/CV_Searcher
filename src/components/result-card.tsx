import Link from "next/link";
import type { AiReview } from "@/lib/search/review";
import type { RequirementResult, ScoredCandidate } from "@/lib/search/score";
import { Badge, Card, formatYears, type Tone } from "./ui";

const STATUS_TONE: Record<RequirementResult["status"], Tone> = {
  strong: "strong",
  good: "good",
  weak: "weak",
  missing: "missing",
};

const STATUS_LABEL: Record<RequirementResult["status"], string> = {
  strong: "Strong evidence",
  good: "Good evidence",
  weak: "Weak evidence",
  missing: "Not found",
};

const MATCH_NOTE: Record<NonNullable<RequirementResult["matchType"]>, string> = {
  exact: "",
  close: "close match",
  related: "related skill, partial credit",
  text: "text mention only",
  years: "based on total experience",
  location: "",
};

const VERDICT: Record<AiReview["verdict"], { tone: Tone; label: string }> = {
  strong_match: { tone: "strong", label: "AI: strong match" },
  possible_match: { tone: "good", label: "AI: possible match" },
  weak_match: { tone: "weak", label: "AI: weak match" },
};

function scoreTone(score: number): string {
  if (score >= 70) return "text-strong border-strong/30 bg-strong-soft";
  if (score >= 45) return "text-good border-good/30 bg-good-soft";
  if (score >= 25) return "text-weak border-weak/30 bg-weak-soft";
  return "text-muted border-border bg-surface-muted";
}

function Dot({ status }: { status: RequirementResult["status"] }) {
  const color = {
    strong: "bg-strong",
    good: "bg-good",
    weak: "bg-weak",
    missing: "bg-transparent border border-missing",
  }[status];
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

export function ResultCard({ rank, candidate, review }: { rank: number; candidate: ScoredCandidate; review?: AiReview }) {
  const c = candidate;
  const meta = [c.headline, c.location, formatYears(c.total_years_experience) && `${formatYears(c.total_years_experience)} experience`]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-4 p-4 sm:p-5">
        <div className="hidden w-8 shrink-0 pt-1 text-sm font-medium text-faint sm:block">#{rank}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/candidates/${c.id}`} className="text-base font-semibold hover:text-accent">
              {c.full_name}
            </Link>
            {c.missingMust.length === 0 ? (
              <Badge tone="strong">Meets all must-haves</Badge>
            ) : (
              <Badge tone="missing" title="Each missing must-have lowers the score">
                Missing: {c.missingMust.join(", ")}
              </Badge>
            )}
            {review && <Badge tone={VERDICT[review.verdict].tone}>{VERDICT[review.verdict].label}</Badge>}
          </div>
          {meta && <p className="mt-0.5 truncate text-sm text-muted">{meta}</p>}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {c.requirements.map((r) => (
              <span key={r.label} className="inline-flex items-center gap-1.5 text-sm" title={STATUS_LABEL[r.status]}>
                <Dot status={r.status} />
                <span className={r.status === "missing" ? "text-faint line-through decoration-faint/50" : ""}>{r.label}</span>
              </span>
            ))}
          </div>

          {review && (
            <div className="mt-4 rounded-lg bg-surface-muted p-3 text-sm">
              <p>{review.summary}</p>
              {(review.strengths.length > 0 || review.gaps.length > 0) && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {review.strengths.length > 0 && (
                    <ul className="space-y-0.5">
                      {review.strengths.map((s) => (
                        <li key={s} className="text-strong">+ <span className="text-foreground">{s}</span></li>
                      ))}
                    </ul>
                  )}
                  {review.gaps.length > 0 && (
                    <ul className="space-y-0.5">
                      {review.gaps.map((g) => (
                        <li key={g} className="text-missing">− <span className="text-foreground">{g}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="shrink-0 text-center">
          <div className={`grid h-14 w-14 place-items-center rounded-xl border text-xl font-semibold ${scoreTone(c.score)}`}>
            {c.score}
          </div>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-faint">score</p>
        </div>
      </div>

      <details className="group border-t border-border">
        <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm text-muted hover:bg-surface-muted sm:px-5">
          <span>Why this rank</span>
          <span className="flex items-center gap-4">
            {c.primary_file_id && (
              <a href={`/api/files/${c.primary_file_id}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                Open CV
              </a>
            )}
            <span className="transition-transform group-open:rotate-180">▾</span>
          </span>
        </summary>
        <div className="divide-y divide-border border-t border-border bg-surface-muted/40">
          {c.requirements.map((r) => (
            <div key={r.label} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[220px_1fr] sm:px-5">
              <div className="flex items-start gap-2">
                <Dot status={r.status} />
                <div className="-mt-1">
                  <p className="font-medium">{r.label}</p>
                  <p className="text-xs text-faint">
                    {r.importance === "must" ? "Must-have" : "Nice to have"} · weight {r.weight}
                  </p>
                </div>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  {r.matchedSkill && <span className="font-medium">{r.matchedSkill}</span>}
                  {r.matchType && MATCH_NOTE[r.matchType] && <span className="text-xs text-faint">({MATCH_NOTE[r.matchType]})</span>}
                </div>
                {r.details.length > 0 && <p className="mt-1 text-muted">{r.details.join(" · ")}</p>}
                {r.evidence.map((e, i) => (
                  <blockquote key={i} className="mt-1.5 border-l-2 border-border-strong pl-3 text-muted italic">
                    “{e.quote}” <span className="not-italic text-xs text-faint">— {e.section}</span>
                  </blockquote>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}
