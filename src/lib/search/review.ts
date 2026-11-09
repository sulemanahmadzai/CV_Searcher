import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { addUsage, assertUsable, claude, FALLBACK_PARAMS, MODEL, toUsage } from "@/lib/claude";
import type { Json } from "@/lib/database.types";
import type { DB } from "@/lib/supabase/db";
import type { JobProfile } from "./jd";
import type { ScoredCandidate } from "./score";

const REVIEW_COUNT = 10;

const ReviewSchema = z.object({
  reviews: z.array(
    z.object({
      candidate_id: z.string(),
      verdict: z.enum(["strong_match", "possible_match", "weak_match"]),
      summary: z.string(),
      strengths: z.array(z.string()),
      gaps: z.array(z.string()),
    }),
  ),
});

export type AiReview = z.infer<typeof ReviewSchema>["reviews"][number];

const SYSTEM_PROMPT = `You are a careful recruiter reviewing a shortlist produced by a CV search engine. For each candidate, judge fit against the job using only the profile given. Be specific and honest; do not invent experience.
- verdict: strong_match, possible_match, or weak_match.
- summary: 2 sentences on overall fit.
- strengths: up to 3 short points, each tied to concrete evidence.
- gaps: up to 3 short points on missing or unproven requirements.
Return one review per candidate, using the candidate_id exactly as given.`;

/** Asks Claude for a short written review of the top candidates and saves it. */
export async function reviewTopCandidates(db: DB, searchId: string): Promise<AiReview[]> {
  const { data: search, error } = await db
    .from("searches")
    .select("requirements, results, usage, ai_review")
    .eq("id", searchId)
    .single();
  if (error) throw new Error(error.message);
  if (search.ai_review) return search.ai_review as unknown as AiReview[];

  const job = search.requirements as unknown as JobProfile;
  const top = (search.results as unknown as ScoredCandidate[]).slice(0, REVIEW_COUNT);
  if (!top.length) return [];

  const ids = top.map((c) => c.id);
  const { data: profiles, error: profileError } = await db
    .from("candidates")
    .select("id, full_name, headline, summary, location, total_years_experience, highest_education, profile")
    .in("id", ids);
  if (profileError) throw new Error(profileError.message);

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const blocks = top.map((c, i) => {
    const p = byId.get(c.id);
    const prof = (p?.profile ?? {}) as { experiences?: { title: string; organization: string | null; start: string | null; end: string | null }[] };
    const jobs = (prof.experiences ?? [])
      .slice(0, 6)
      .map((e) => `  - ${e.title}${e.organization ? `, ${e.organization}` : ""} (${e.start ?? "?"} - ${e.end ?? "present"})`)
      .join("\n");
    const evidence = c.requirements
      .map((r) => `  - ${r.label} [${r.importance}]: ${r.status}${r.details.length ? ` - ${r.details.join(", ")}` : ""}`)
      .join("\n");
    return `<candidate rank="${i + 1}" candidate_id="${c.id}">
Name: ${c.full_name}
Headline: ${p?.headline ?? "-"}
Location: ${p?.location ?? "-"}
Total experience: ${p?.total_years_experience ?? "?"} years
Education: ${p?.highest_education ?? "-"}
Summary: ${p?.summary ?? "-"}
Recent roles:
${jobs || "  - none listed"}
Requirement evidence:
${evidence}
</candidate>`;
  });

  const jobText = `${job.job_title}\n${job.summary}\nRequirements:\n${job.requirements
    .map((r) => `- ${r.label} (${r.importance})`)
    .join("\n")}`;

  const response = await claude().beta.messages.parse({
    ...FALLBACK_PARAMS,
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `<job>\n${jobText}\n</job>\n\n${blocks.join("\n\n")}` }],
    output_config: { effort: "low", format: betaZodOutputFormat(ReviewSchema) },
  });
  assertUsable(response.stop_reason, response.parsed_output);

  const reviews = response.parsed_output!.reviews.filter((r) => ids.includes(r.candidate_id));
  const usage = addUsage(search.usage as never, toUsage(response.usage));
  await db
    .from("searches")
    .update({ ai_review: reviews as unknown as Json, usage: usage as unknown as Json })
    .eq("id", searchId);
  return reviews;
}
