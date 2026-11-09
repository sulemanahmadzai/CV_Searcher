import { z } from "zod";

// Structured outputs don't enforce numeric ranges or string lengths, so the
// prompt states those limits and the app clamps values where it matters.
//
// The API also caps how many nullable fields a schema may have, so the schema
// sent to Claude ("wire" schema) uses "" and 0 for unknown values. fromWire()
// turns those back into null for the rest of the app.

export const EvidenceSchema = z.object({
  section: z.enum([
    "skills",
    "experience",
    "project",
    "education",
    "certification",
    "summary",
    "training",
    "other",
  ]),
  quote: z.string(),
});

const WireSkillSchema = z.object({
  name: z.string(),
  aliases: z.array(z.string()),
  category: z.enum([
    "technical",
    "tool",
    "domain",
    "certification",
    "language",
    "education",
    "trade",
    "soft",
  ]),
  listed_in_skills_section: z.boolean(),
  in_headline_or_title: z.boolean(),
  experience_count: z.number().int(),
  project_count: z.number().int(),
  years_used: z.number(),
  last_used_year: z.number().int(),
  certification_status: z.enum(["none", "in_progress", "candidate", "completed", "member", "fellow"]),
  proficiency: z.enum(["unknown", "basic", "intermediate", "advanced", "expert"]),
  is_personal_skill: z.boolean(),
  evidence: z.array(EvidenceSchema),
});

export const CvExtractionWireSchema = z.object({
  document_type: z.enum(["cv", "cover_letter", "job_description", "certificate", "other"]),
  is_partial: z.boolean(),
  full_name: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  headline: z.string(),
  summary: z.string(),
  total_years_experience: z.number(),
  highest_education: z.string(),
  education: z.array(
    z.object({
      degree: z.string(),
      field: z.string(),
      institution: z.string(),
      year: z.number().int(),
      status: z.enum(["completed", "in_progress", "unknown"]),
    }),
  ),
  certifications: z.array(
    z.object({
      name: z.string(),
      issuer: z.string(),
      status: z.enum(["completed", "in_progress", "candidate", "member", "fellow", "unknown"]),
      year: z.number().int(),
      detail: z.string(),
    }),
  ),
  languages: z.array(
    z.object({
      language: z.string(),
      level: z.enum(["native", "fluent", "advanced", "intermediate", "basic", "unknown"]),
    }),
  ),
  experiences: z.array(
    z.object({
      title: z.string(),
      organization: z.string(),
      location: z.string(),
      start: z.string(),
      end: z.string(),
      is_current: z.boolean(),
      summary: z.string(),
      skills: z.array(z.string()),
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      summary: z.string(),
      skills: z.array(z.string()),
    }),
  ),
  skills: z.array(WireSkillSchema),
});

type Wire = z.infer<typeof CvExtractionWireSchema>;
type WireSkill = z.infer<typeof WireSkillSchema>;

// Null-instead-of-sentinel versions used everywhere else.
type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

export type ExtractedSkill = Nullable<WireSkill, "years_used" | "last_used_year">;
export type CvExtraction = Nullable<
  Omit<Wire, "education" | "certifications" | "experiences" | "skills">,
  "full_name" | "email" | "phone" | "location" | "headline" | "total_years_experience" | "highest_education"
> & {
  education: Nullable<Wire["education"][number], "field" | "institution" | "year">[];
  certifications: Nullable<Wire["certifications"][number], "issuer" | "year" | "detail">[];
  experiences: Nullable<Wire["experiences"][number], "organization" | "location" | "start" | "end">[];
  skills: ExtractedSkill[];
};

const str = (s: string): string | null => (s.trim() ? s.trim() : null);
const num = (n: number): number | null => (n > 0 ? n : null);

export function fromWire(w: Wire): CvExtraction {
  return {
    ...w,
    full_name: str(w.full_name),
    email: str(w.email),
    phone: str(w.phone),
    location: str(w.location),
    headline: str(w.headline),
    total_years_experience: num(w.total_years_experience),
    highest_education: str(w.highest_education),
    education: w.education.map((e) => ({ ...e, field: str(e.field), institution: str(e.institution), year: num(e.year) })),
    certifications: w.certifications.map((c) => ({ ...c, issuer: str(c.issuer), year: num(c.year), detail: str(c.detail) })),
    experiences: w.experiences.map((e) => ({
      ...e,
      organization: str(e.organization),
      location: str(e.location),
      start: str(e.start),
      end: str(e.end),
    })),
    skills: w.skills.map((s) => ({ ...s, years_used: num(s.years_used), last_used_year: num(s.last_used_year) })),
  };
}
