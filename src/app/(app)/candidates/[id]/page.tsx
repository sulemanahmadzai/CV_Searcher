import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, Card, formatYears, Skeleton, type Tone } from "@/components/ui";
import type { Tables } from "@/lib/database.types";
import type { CvExtraction } from "@/lib/extract/schema";
import { createClient } from "@/lib/supabase/server";

type Profile = Pick<CvExtraction, "education" | "certifications" | "languages" | "experiences" | "projects"> & {
  is_partial?: boolean;
  extraction?: { model: string; method: string; extracted_at: string };
};

const CATEGORY_LABEL: Record<string, string> = {
  certification: "Qualifications",
  technical: "Technical skills",
  tool: "Tools & software",
  domain: "Domains & sectors",
  trade: "Trades & crafts",
  education: "Degrees",
  language: "Languages",
  soft: "Soft skills",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL);

const CERT_LABEL: Record<string, { label: string; tone: Tone }> = {
  fellow: { label: "Fellow", tone: "strong" },
  member: { label: "Member", tone: "strong" },
  completed: { label: "Completed", tone: "strong" },
  candidate: { label: "Candidate", tone: "weak" },
  in_progress: { label: "In progress", tone: "weak" },
};

export default function CandidatePage({ params }: PageProps<"/candidates/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      }
    >
      <CandidateView params={params} />
    </Suspense>
  );
}

function skillWeight(s: Tables<"candidate_skills">): number {
  return (
    (s.experience_count + s.project_count) * 2 +
    Math.min(Number(s.years_used ?? 0), 10) * 0.5 +
    (s.in_skills_section ? 1 : 0) +
    (["completed", "member", "fellow"].includes(s.certification_status) ? 7 : 0)
  );
}

async function CandidateView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const [{ data: c }, { data: skills }, { data: files }] = await Promise.all([
    db.from("candidates").select("*").eq("id", id).maybeSingle(),
    db.from("candidate_skills").select("*").eq("candidate_id", id),
    db.from("cv_files").select("id, original_filename, status, status_detail, created_at").eq("candidate_id", id),
  ]);
  if (!c) notFound();

  const profile = (c.profile ?? {}) as unknown as Profile;
  const groups = new Map<string, Tables<"candidate_skills">[]>();
  for (const s of skills ?? []) {
    const list = groups.get(s.category) ?? [];
    list.push(s);
    groups.set(s.category, list);
  }
  for (const list of groups.values()) list.sort((a, b) => skillWeight(b) - skillWeight(a));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/candidates" className="text-sm text-muted hover:text-accent">
          ← All candidates
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{c.full_name}</h1>
            <p className="mt-1 text-muted">
              {[c.headline, c.location, formatYears(c.total_years_experience) && `${formatYears(c.total_years_experience)} experience`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-1 text-sm text-faint">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
          </div>
          {c.primary_file_id && (
            <a
              href={`/api/files/${c.primary_file_id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Open original CV
            </a>
          )}
        </div>
      </div>

      {c.summary && (
        <Card className="p-5">
          <p className="leading-relaxed">{c.summary}</p>
          {c.highest_education && <p className="mt-2 text-sm text-muted">Education: {c.highest_education}</p>}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-1 font-semibold">Skills and evidence</h2>
            <p className="mb-4 text-xs text-faint">
              Counts show how many roles and projects in the CV used each skill. This is what search ranking is based on.
            </p>
            <div className="space-y-5">
              {CATEGORY_ORDER.filter((cat) => groups.has(cat)).map((cat) => (
                <div key={cat}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{CATEGORY_LABEL[cat]}</h3>
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {groups.get(cat)!.map((s) => (
                      <details key={s.id} className="group">
                        <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-surface-muted">
                          <span className={`font-medium ${s.is_personal ? "" : "text-faint line-through"}`}>{s.name}</span>
                          {CERT_LABEL[s.certification_status] && (
                            <Badge tone={CERT_LABEL[s.certification_status].tone}>{CERT_LABEL[s.certification_status].label}</Badge>
                          )}
                          {!s.is_personal && <Badge tone="missing">mentioned only</Badge>}
                          <span className="ml-auto flex flex-wrap gap-1.5 text-xs text-muted">
                            {s.experience_count > 0 && <Badge>{s.experience_count} role{s.experience_count > 1 ? "s" : ""}</Badge>}
                            {s.project_count > 0 && <Badge>{s.project_count} project{s.project_count > 1 ? "s" : ""}</Badge>}
                            {s.years_used ? <Badge>{formatYears(s.years_used)}</Badge> : null}
                            {s.in_skills_section && <Badge tone="accent">in skills list</Badge>}
                            {s.proficiency !== "unknown" && <Badge>{s.proficiency}</Badge>}
                          </span>
                        </summary>
                        <div className="space-y-1.5 bg-surface-muted/50 px-3 py-2 text-sm">
                          {(s.evidence as { section: string; quote: string }[]).map((e, i) => (
                            <blockquote key={i} className="border-l-2 border-border-strong pl-3 text-muted italic">
                              “{e.quote}” <span className="not-italic text-xs text-faint">— {e.section}</span>
                            </blockquote>
                          ))}
                          {s.last_used_year && <p className="text-xs text-faint">Last used {s.last_used_year}</p>}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {profile.experiences?.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-4 font-semibold">Experience</h2>
              <ol className="space-y-4">
                {profile.experiences.map((e, i) => (
                  <li key={i} className="relative border-l-2 border-border pl-4">
                    <p className="font-medium">{e.title}</p>
                    <p className="text-sm text-muted">
                      {[e.organization, e.location].filter(Boolean).join(" · ")}
                      {(e.start || e.end || e.is_current) && (
                        <span className="text-faint"> · {e.start ?? "?"} – {e.is_current ? "present" : e.end ?? "?"}</span>
                      )}
                    </p>
                    <p className="mt-1 text-sm">{e.summary}</p>
                    {e.skills.length > 0 && <p className="mt-1 text-xs text-faint">{e.skills.join(" · ")}</p>}
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {profile.projects?.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Projects</h2>
              <ul className="space-y-3">
                {profile.projects.map((p, i) => (
                  <li key={i}>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-muted">{p.summary}</p>
                    {p.skills.length > 0 && <p className="mt-0.5 text-xs text-faint">{p.skills.join(" · ")}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {profile.education?.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Education</h2>
              <ul className="space-y-3 text-sm">
                {profile.education.map((e, i) => (
                  <li key={i}>
                    <p className="font-medium">
                      {e.degree}
                      {e.field ? `, ${e.field}` : ""}
                    </p>
                    <p className="text-muted">
                      {[e.institution, e.year].filter(Boolean).join(" · ")}
                      {e.status === "in_progress" && " · in progress"}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {profile.certifications?.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Certifications</h2>
              <ul className="space-y-2 text-sm">
                {profile.certifications.map((cert, i) => (
                  <li key={i}>
                    <p className="font-medium">{cert.name}</p>
                    <p className="text-muted">
                      {[cert.issuer, cert.year, cert.status !== "unknown" && cert.status.replace("_", " "), cert.detail]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {profile.languages?.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Languages</h2>
              <ul className="space-y-1 text-sm">
                {profile.languages.map((l, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{l.language}</span>
                    <span className="text-muted">{l.level !== "unknown" ? l.level : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Files</h2>
            <ul className="space-y-2 text-sm">
              {(files ?? []).map((f) => (
                <li key={f.id}>
                  <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="break-all text-accent hover:underline">
                    {f.original_filename}
                  </a>
                  <p className="text-xs text-faint">
                    {f.id === c.primary_file_id ? "Main CV used for search" : f.status_detail ?? f.status}
                  </p>
                </li>
              ))}
            </ul>
            {profile.extraction && (
              <p className="mt-3 text-xs text-faint">
                Read by {profile.extraction.model} ({profile.extraction.method === "vision" ? "from images" : "from text"})
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
