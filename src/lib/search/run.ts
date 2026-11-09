import type { Json } from "@/lib/database.types";
import type { DB } from "@/lib/supabase/db";
import { parseJobDescription, type JobProfile } from "./jd";
import { scoreCandidates, type CandidateBasics, type ScoredCandidate } from "./score";

const MAX_RESULTS = 50;
const VOCABULARY_SIZE = 3000;
const ID_CHUNK = 150;
// Trigram similarity needed for a fuzzy name match (catches typos like
// "quickbook" vs "quickbooks" but not "msme development" vs "software development").
const FUZZY_MIN_SIMILARITY = 0.7;

export type SearchRecord = {
  id: string;
  job: JobProfile;
  results: ScoredCandidate[];
  totalMatched: number;
};

async function fetchBasics(db: DB, ids: string[]): Promise<Map<string, CandidateBasics>> {
  const map = new Map<string, CandidateBasics>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await db
      .from("candidates")
      .select("id, full_name, headline, location, total_years_experience, highest_education, primary_file_id")
      .in("id", ids.slice(i, i + ID_CHUNK));
    if (error) throw new Error(error.message);
    for (const c of data ?? []) {
      map.set(c.id, { ...c, total_years_experience: c.total_years_experience == null ? null : Number(c.total_years_experience) });
    }
  }
  return map;
}

/** Runs a job-description search end to end and saves it. */
export async function runSearch(db: DB, jobDescription: string): Promise<SearchRecord> {
  const { data: vocab, error: vocabError } = await db.rpc("skill_vocabulary", { p_limit: VOCABULARY_SIZE });
  if (vocabError) throw new Error(vocabError.message);

  const { profile: job, usage } = await parseJobDescription(
    jobDescription,
    (vocab ?? []).map((v) => v.norm_name),
  );

  const terms = [...new Set(job.requirements.flatMap((r) => [...r.match_terms, ...r.related_terms]))];
  const [skillsRes, mentionsRes] = await Promise.all([
    db.rpc("match_skill_rows", { p_terms: terms, p_min_similarity: FUZZY_MIN_SIMILARITY }),
    db.rpc("match_text_mentions", { p_terms: job.requirements.flatMap((r) => r.match_terms) }),
  ]);
  if (skillsRes.error) throw new Error(skillsRes.error.message);
  if (mentionsRes.error) throw new Error(mentionsRes.error.message);

  const skills = skillsRes.data ?? [];
  const mentions = mentionsRes.data ?? [];
  const ids = [...new Set([...skills.map((s) => s.candidate_id), ...mentions.map((m) => m.candidate_id)])];
  const basics = await fetchBasics(db, ids);

  const scored = scoreCandidates(job, skills, mentions, basics);
  const results = scored.slice(0, MAX_RESULTS);

  const { data: saved, error } = await db
    .from("searches")
    .insert({
      title: job.job_title,
      job_description: jobDescription,
      requirements: { ...job, total_matched: scored.length } as unknown as Json,
      results: results as unknown as Json,
      usage: usage as unknown as Json,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not save search: ${error.message}`);

  return { id: saved.id, job, results, totalMatched: scored.length };
}
