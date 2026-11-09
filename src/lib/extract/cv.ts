import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { assertUsable, claude, FALLBACK_PARAMS, MODEL, toUsage, type Usage } from "@/lib/claude";
import { CvExtractionWireSchema, fromWire, type CvExtraction } from "./schema";
import type { PreparedDocument } from "./text";

const SYSTEM_PROMPT = `You extract structured, evidence-backed data from documents uploaded to a recruiter's CV search engine. Recruiters rank candidates by the evidence you record, so accuracy matters more than completeness. Never invent facts. When something is unknown, use an empty string "" for text, 0 for numbers and years, and empty lists.

DOCUMENT TYPE
- "cv": a person's CV or resume (a CV with a cover letter attached still counts as "cv").
- "cover_letter", "job_description" (job postings, terms of reference), "certificate" (diplomas, transcripts, attestations), "other" (guides, budgets, anything else).
- is_partial: true when the document is only part of a CV (for example a single page with no name).
For non-CV documents, still fill the required fields minimally (empty lists, short summary).

PROFILE
- full_name: the candidate's name without titles like Dr., Eng., Mr.
- headline: current or most recent role, or the profession they present themselves as (e.g. "Finance Manager", "Tailoring Trainer").
- summary: 2-3 factual sentences in the third person about who they are professionally.
- total_years_experience: total years of professional work, counting overlapping jobs once; 0 if unclear.
- experiences: every job, newest first. Dates as "YYYY-MM" or "YYYY" ("" if unknown); for a current job set end to "" and is_current to true. summary is one sentence. skills lists the canonical skill names used in that job.
- projects: distinct named projects (from a projects section or clearly described inside jobs).
- Do not record age, date of birth, marital status, religion, gender, nationality or photos anywhere.

SKILLS (most important)
Return 8-40 skills (fewer for very short CVs). Cover professional and technical skills, software and tools, domains and sectors (e.g. "Monitoring & Evaluation (M&E)", "Livelihoods", "Public Health"), trades and crafts (e.g. "Tailoring", "Carpet Weaving", "Solar Panel Installation", "Mobile Phone Repair"), certifications and professional qualifications (ACCA, PMP, CCNA - one entry each), languages (category "language"), degrees (category "education", e.g. "Bachelor's Degree in Business Administration"), and soft skills only when clearly evidenced (e.g. "Training Delivery", "Team Leadership").

For each skill:
- name: the canonical, widely recognized form ("React", "React Native", "Microsoft Excel", "QuickBooks", "ACCA"). Keep different technologies separate (React vs React Native). Merge duplicates.
- aliases: lowercase variants - how this CV writes it, abbreviations, expansions and common synonyms (for ACCA: "acca", "fcca", "chartered certified accountant", "association of chartered certified accountants").
- listed_in_skills_section: it appears in a dedicated skills / competencies / technical skills section.
- in_headline_or_title: it appears in the CV headline or profile title, or in a job title.
- experience_count: number of distinct jobs where the person actually used or applied it, judged from titles and responsibilities (an "Accountant" job counts for "Accounting" even if the word isn't repeated). 0 if no job shows it. For qualifications, count the jobs where the qualification's discipline was practised (e.g. accounting or audit roles for ACCA, project manager roles for PMP).
- project_count: number of distinct projects that used it.
- years_used: total years of hands-on use, from the dates of the jobs that used it; 0 when there is no dated evidence.
- last_used_year: the most recent year it was used (the current year for a current job); 0 if unknown.
- certification_status: for qualifications and degrees only. "fellow"/"member" for professional body membership (e.g. FCCA = fellow), "completed" for earned degrees and certificates, "candidate"/"in_progress" when partly done (e.g. "ACCA - 3 papers cleared"). Use "none" for ordinary skills.
- proficiency: from explicit statements (language levels, "expert in", "basic knowledge of"); otherwise "unknown".
- is_personal_skill: false when the term appears but is not the person's own skill or qualification - e.g. "set up a computer lab for ACCA exams" (they don't hold ACCA), managing people who have the skill without having it themselves, a referee's title, or an organization's name. Otherwise true.
- evidence: 1-3 short verbatim quotes (25 words max each) from the document that support the skill, each labeled with the section it came from.`;

export type ExtractionResult = { data: CvExtraction; usage: Usage };

export async function extractCv(doc: PreparedDocument, filename: string): Promise<ExtractionResult> {
  if (doc.method === "none") throw new Error(doc.reason);

  const today = new Date().toISOString().slice(0, 10);
  const intro = `Today's date: ${today}. File name: ${filename}`;
  const content =
    doc.method === "text"
      ? [{ type: "text" as const, text: `${intro}\n\n<document>\n${doc.text}\n</document>` }]
      : [...doc.blocks, { type: "text" as const, text: `${intro}\n\nThe document is attached above.` }];

  const response = await claude().beta.messages.parse({
    ...FALLBACK_PARAMS,
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { effort: "medium", format: betaZodOutputFormat(CvExtractionWireSchema) },
  });

  assertUsable(response.stop_reason, response.parsed_output);
  return { data: fromWire(response.parsed_output!), usage: toUsage(response.usage) };
}
