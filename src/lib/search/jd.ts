import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { assertUsable, claude, FALLBACK_PARAMS, MODEL, toUsage, type Usage } from "@/lib/claude";

export const RequirementSchema = z.object({
  label: z.string(),
  kind: z.enum([
    "skill",
    "tool",
    "certification",
    "education",
    "language",
    "experience",
    "domain",
    "soft_skill",
    "location",
  ]),
  importance: z.enum(["must", "nice"]),
  weight: z.number().int(),
  min_years: z.number().nullable(),
  match_terms: z.array(z.string()),
  related_terms: z.array(z.string()),
});

export const JobProfileSchema = z.object({
  job_title: z.string(),
  summary: z.string(),
  min_total_years: z.number().nullable(),
  requirements: z.array(RequirementSchema),
});

export type Requirement = z.infer<typeof RequirementSchema>;
export type JobProfile = z.infer<typeof JobProfileSchema>;

const SYSTEM_PROMPT = `You turn a job description into weighted, machine-matchable requirements for a CV search engine. The engine matches your terms against skill names extracted from CVs, so the terms you choose decide who is found.

Return 3-12 requirements, ordered by importance:
- label: short and human-readable ("ACCA qualification", "React", "5+ years in M&E").
- kind: skill, tool, certification, education, language, experience (a domain plus years, e.g. "5 years of project management"), domain (sector knowledge), soft_skill, or location.
- importance: "must" only for the 1-4 truly essential requirements - the ones a recruiter would reject a candidate for lacking. Tools, software and supporting skills listed alongside are "nice" unless the description explicitly says they are mandatory. Preferred or advantageous items are always "nice".
- weight: integer 1-5. 5 = central to the role, 1 = minor. Soft skills get at most 2.
- min_years: years asked for this specific requirement, else null.
- match_terms: lowercase terms that mean the SAME thing. Always include every matching entry from the provided skill vocabulary (copy them exactly), plus common abbreviations, expansions and spellings. Example for ACCA: ["acca", "fcca", "chartered certified accountant", "association of chartered certified accountants"].
- related_terms: lowercase terms for clearly adjacent skills that deserve partial credit (from the vocabulary where possible), including broader skills that usually contain the requested one (e.g. "microsoft office" for Excel). Example for React: ["react native", "next.js"]. Keep this short; leave empty when nothing is genuinely close.
- Education requirements: also include the generic degree words in match_terms - "bachelor", "bachelors", "master", "masters", "phd", "ph.d.", "doctor", "md" for a bachelor's requirement (a higher degree satisfies a lower one), "master", "masters", "phd", "ph.d.", "doctor" for a master's requirement.

Rules:
- Put the overall minimum years of experience in min_total_years only, not as a separate requirement.
- Skip generic filler ("hard-working", "team player") unless the description stresses it.
- Ignore requirements about age, gender, marital status, religion or nationality.
- For a very short query (e.g. "someone good at ACCA"), return 1-3 requirements.`;

export type ParsedJob = { profile: JobProfile; usage: Usage };

export async function parseJobDescription(jobDescription: string, vocabulary: string[]): Promise<ParsedJob> {
  const vocab = vocabulary.length ? vocabulary.join(" | ") : "(empty - no CVs imported yet)";

  const response = await claude().beta.messages.parse({
    ...FALLBACK_PARAMS,
    model: MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: SYSTEM_PROMPT }],
    messages: [
      {
        role: "user",
        content: [
          // The vocabulary changes only when CVs are added, so cache it between searches.
          {
            type: "text",
            text: `<skill_vocabulary>\n${vocab}\n</skill_vocabulary>`,
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: `<job_description>\n${jobDescription}\n</job_description>` },
        ],
      },
    ],
    output_config: { effort: "low", format: betaZodOutputFormat(JobProfileSchema) },
  });

  assertUsable(response.stop_reason, response.parsed_output);
  const profile = response.parsed_output!;
  profile.requirements = profile.requirements.map((r) => ({
    ...r,
    weight: Math.max(1, Math.min(5, Math.round(r.weight))),
    match_terms: unique([r.label, ...r.match_terms]),
    related_terms: unique(r.related_terms),
  }));
  return { profile, usage: toUsage(response.usage) };
}

function unique(terms: string[]): string[] {
  return [...new Set(terms.map((t) => t.toLowerCase().replace(/\s+/g, " ").trim()).filter((t) => t.length > 1))];
}
