import type { Database } from "@/lib/database.types";
import type { JobProfile, Requirement } from "./jd";

export type SkillMatch = Database["public"]["Functions"]["match_skill_rows"]["Returns"][number];
export type TextMention = Database["public"]["Functions"]["match_text_mentions"]["Returns"][number];
export type CandidateBasics = {
  id: string;
  full_name: string;
  headline: string | null;
  location: string | null;
  total_years_experience: number | null;
  highest_education: string | null;
  primary_file_id: string | null;
};

export type RequirementResult = {
  label: string;
  kind: Requirement["kind"];
  importance: "must" | "nice";
  weight: number;
  strength: number; // 0..1
  status: "strong" | "good" | "weak" | "missing";
  matchedSkill: string | null;
  matchType: "exact" | "close" | "related" | "text" | "years" | "location" | null;
  details: string[];
  evidence: { section: string; quote: string }[];
};

export type ScoredCandidate = CandidateBasics & {
  score: number; // 0..100
  missingMust: string[];
  requirements: RequirementResult[];
};

// ---------------------------------------------------------------------------
// Evidence points for one skill row. ~10 points = full strength.
//   qualification held +7 (fellow +8, in progress +3)
//   each job/project where it was used +2 (max 4 counted)
//   each year of use +0.5 (max 10 years)
//   listed in skills section +1, used in the last 3 years +1, in a title +1
// Something only mentioned (not the person's own skill) scores 0.
// ---------------------------------------------------------------------------
const FULL_POINTS = 10;
const MATCH_MULTIPLIER = { exact: 1, contains: 0.85, fuzzy: 0.6 } as const;
const RELATED_MULTIPLIER = 0.5;
const RELATED_CERT_MULTIPLIER = 0.25;
const CATEGORY_MISMATCH_MULTIPLIER = 0.5;
const TEXT_ONLY_STRENGTH = 0.12;
const MISSING_BELOW = 0.25;
const MUST_PENALTY = 0.6;

const LANGUAGE_POINTS: Record<string, number> = { expert: 9, advanced: 8, intermediate: 5, basic: 2, unknown: 5 };

function skillPoints(s: SkillMatch, nowYear: number): { points: number; details: string[] } {
  if (!s.is_personal) return { points: 0, details: ["mentioned, but not the candidate's own skill"] };

  let points = 0;
  const details: string[] = [];
  const cert = s.certification_status;

  if (s.category === "education") {
    const inProgress = cert === "in_progress" || cert === "candidate";
    points += inProgress ? 3 : 8;
    details.push(inProgress ? "degree in progress" : "degree completed");
  } else if (s.category === "language") {
    points += LANGUAGE_POINTS[s.proficiency] ?? 5;
    if (s.proficiency !== "unknown") details.push(`${s.proficiency} level`);
  } else if (cert === "fellow" || cert === "member" || cert === "completed") {
    points += cert === "fellow" ? 8 : 7;
    details.push(cert === "fellow" ? "fellow member" : cert === "member" ? "member" : "qualified");
  } else if (cert === "candidate" || cert === "in_progress") {
    points += 3;
    details.push("qualification in progress");
  }

  const uses = Math.min(s.experience_count + s.project_count, 4);
  if (uses > 0) {
    points += uses * 2;
    const roles = s.experience_count ? `${s.experience_count} role${s.experience_count > 1 ? "s" : ""}` : "";
    const projects = s.project_count ? `${s.project_count} project${s.project_count > 1 ? "s" : ""}` : "";
    details.push(`used in ${[roles, projects].filter(Boolean).join(" and ")}`);
  }
  if (s.years_used) {
    points += Math.min(Number(s.years_used), 10) * 0.5;
    details.push(`${Number(s.years_used)} yr${Number(s.years_used) === 1 ? "" : "s"}`);
  }
  if (s.in_skills_section) {
    points += 1;
    details.push("listed in skills");
  }
  if (s.last_used_year && s.last_used_year >= nowYear - 3) {
    points += 1;
    details.push(`recent (${s.last_used_year})`);
  }
  if (s.in_headline) {
    points += 1;
    details.push("in a job title");
  }
  return { points, details };
}

function statusFor(strength: number): RequirementResult["status"] {
  if (strength >= 0.7) return "strong";
  if (strength >= 0.4) return "good";
  if (strength >= MISSING_BELOW) return "weak";
  return "missing";
}

function evidenceOf(s: SkillMatch): { section: string; quote: string }[] {
  return Array.isArray(s.evidence) ? (s.evidence as { section: string; quote: string }[]).slice(0, 2) : [];
}

type CandidateData = {
  skills: SkillMatch[];
  mentions: TextMention[];
  basics: CandidateBasics;
  locationText: string;
};

function scoreRequirement(req: Requirement, data: CandidateData, nowYear: number): RequirementResult {
  const base = { label: req.label, kind: req.kind, importance: req.importance, weight: req.weight };
  const exactTerms = new Set(req.match_terms);
  const relatedTerms = new Set(req.related_terms);

  if (req.kind === "location") {
    const terms = [...exactTerms];
    const inLocation = terms.some((t) => data.locationText.includes(t));
    const inText = data.mentions.some((m) => exactTerms.has(m.term));
    const strength = inLocation ? 1 : inText ? 0.4 : 0;
    return {
      ...base,
      strength,
      status: statusFor(strength),
      matchedSkill: inLocation ? data.basics.location : null,
      matchType: inLocation || inText ? "location" : null,
      details: inLocation ? ["based there"] : inText ? ["place mentioned in CV"] : [],
      evidence: [],
    };
  }

  let best: { strength: number; skill: SkillMatch; details: string[]; type: RequirementResult["matchType"] } | null = null;
  for (const s of data.skills) {
    const isExactTerm = exactTerms.has(s.term);
    const isRelatedTerm = relatedTerms.has(s.term);
    if (!isExactTerm && !isRelatedTerm) continue;

    const kind = s.match_kind as keyof typeof MATCH_MULTIPLIER;
    let multiplier = MATCH_MULTIPLIER[kind] ?? 0.6;
    // A different qualification (e.g. CFA for an ACCA requirement) is weak evidence.
    if (!isExactTerm) multiplier *= req.kind === "certification" ? RELATED_CERT_MULTIPLIER : RELATED_MULTIPLIER;

    // A degree or a language is weaker evidence for a skill/experience requirement.
    if (s.category === "education" && req.kind !== "education") multiplier *= CATEGORY_MISMATCH_MULTIPLIER;
    if (s.category === "language" && req.kind !== "language") multiplier *= CATEGORY_MISMATCH_MULTIPLIER;

    const { points, details } = skillPoints(s, nowYear);
    let strength = Math.min(points / FULL_POINTS, 1) * multiplier;

    if (req.min_years && strength > 0) {
      const years = s.years_used == null ? null : Number(s.years_used);
      if (years == null) strength *= 0.75;
      else if (years < req.min_years) strength *= 0.5 + 0.5 * (years / req.min_years);
    }

    const type: RequirementResult["matchType"] = !isExactTerm ? "related" : kind === "exact" ? "exact" : "close";
    // On a tie, show the candidate's own matching skill rather than a related one.
    const better =
      !best ||
      strength > best.strength ||
      (strength === best.strength && best.type === "related" && type !== "related");
    if (better) best = { strength, skill: s, details, type };
  }

  // Experience requirements without a usable skill match fall back to total years.
  if (req.kind === "experience" && req.min_years && (!best || best.strength === 0)) {
    const total = data.basics.total_years_experience;
    if (total != null && req.match_terms.length <= 1) {
      const strength = Math.min(total / req.min_years, 1) * 0.8;
      return {
        ...base,
        strength,
        status: statusFor(strength),
        matchedSkill: null,
        matchType: "years",
        details: [`${total} years of total experience`],
        evidence: [],
      };
    }
  }

  if (best && best.strength > 0) {
    return {
      ...base,
      strength: best.strength,
      status: statusFor(best.strength),
      matchedSkill: best.skill.name,
      matchType: best.type,
      details: best.details,
      evidence: evidenceOf(best.skill),
    };
  }

  // Weak fallback: the term appears somewhere in the CV text.
  const mention = data.mentions.find((m) => exactTerms.has(m.term));
  if (mention) {
    return {
      ...base,
      strength: TEXT_ONLY_STRENGTH,
      status: "missing",
      matchedSkill: null,
      matchType: "text",
      details: [`"${mention.term}" appears in the CV text but not as a demonstrated skill`],
      evidence: [],
    };
  }

  return {
    ...base,
    strength: 0,
    status: "missing",
    matchedSkill: best?.skill.name ?? null,
    matchType: null,
    details: best ? best.details : [],
    evidence: [],
  };
}

/** Scores every candidate that has at least some evidence for the job. */
export function scoreCandidates(
  job: JobProfile,
  skills: SkillMatch[],
  mentions: TextMention[],
  candidates: Map<string, CandidateBasics>,
): ScoredCandidate[] {
  const nowYear = new Date().getFullYear();
  const requirements: Requirement[] = [...job.requirements];
  if (job.min_total_years) {
    requirements.push({
      label: `${job.min_total_years}+ years of experience`,
      kind: "experience",
      importance: "must",
      weight: 3,
      min_years: job.min_total_years,
      match_terms: [],
      related_terms: [],
    });
  }

  const skillsBy = groupBy(skills, (s) => s.candidate_id);
  const mentionsBy = groupBy(mentions, (m) => m.candidate_id);
  const totalWeight = requirements.reduce((sum, r) => sum + r.weight, 0) || 1;
  const results: ScoredCandidate[] = [];

  for (const [id, basics] of candidates) {
    const data: CandidateData = {
      skills: skillsBy.get(id) ?? [],
      mentions: mentionsBy.get(id) ?? [],
      basics,
      locationText: (basics.location ?? "").toLowerCase(),
    };
    const reqResults = requirements.map((r) => scoreRequirement(r, data, nowYear));
    // Sharing a language or a city with the job is not enough to be listed.
    const evidenceFound = reqResults.some(
      (r) => r.strength > 0 && r.matchType !== "years" && r.kind !== "language" && r.kind !== "location",
    );
    if (!evidenceFound) continue;

    const weighted = reqResults.reduce((sum, r) => sum + r.weight * r.strength, 0) / totalWeight;
    // A must-have needs the skill itself; a related skill earns partial points but
    // still leaves the requirement unmet.
    const missing = reqResults.filter(
      (r) => r.importance === "must" && (r.strength < MISSING_BELOW || r.matchType === "related"),
    );
    // Each missing must-have lowers the score in proportion to its weight
    // (a weight-5 requirement multiplies by 0.6, a weight-2 one by about 0.82).
    const missingWeight = missing.reduce((sum, r) => sum + r.weight, 0);
    const score = Math.round(weighted * Math.pow(MUST_PENALTY, missingWeight / 5) * 100);
    const missingMust = missing.map((r) => r.label);

    results.push({ ...basics, score, missingMust, requirements: reqResults });
  }

  return results.sort((a, b) => b.score - a.score || a.full_name.localeCompare(b.full_name));
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
