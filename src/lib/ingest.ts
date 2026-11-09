import type { Json, Database } from "@/lib/database.types";
import { MODEL, type Usage } from "@/lib/claude";
import { extractCv } from "@/lib/extract/cv";
import type { CvExtraction, ExtractedSkill } from "@/lib/extract/schema";
import { countWords, prepareDocument } from "@/lib/extract/text";
import type { DB } from "@/lib/supabase/db";

type SkillInsert = Database["public"]["Tables"]["candidate_skills"]["Insert"];
type CandidateInsert = Database["public"]["Tables"]["candidates"]["Insert"];

export type IngestFile = {
  bytes: Uint8Array;
  filename: string;
  sha256: string;
  sizeBytes: number;
  storagePath: string;
  mimeType: string;
};

export type IngestOutcome = {
  status: "processed" | "duplicate" | "skipped" | "failed";
  detail: string;
  fileId?: string;
  candidateId?: string;
  candidateName?: string;
  costUsd?: number;
};

/** Serializes the "find or create candidate" step when files are processed in parallel. */
export type Lock = <T>(fn: () => Promise<T>) => Promise<T>;
const noLock: Lock = (fn) => fn();

export function createLock(): Lock {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>) => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
}

const DOC_LABEL: Record<CvExtraction["document_type"], string> = {
  cv: "CV",
  cover_letter: "cover letter",
  job_description: "job description",
  certificate: "certificate or diploma",
  other: "document that isn't a CV",
};

const CERT_RANK = ["none", "in_progress", "candidate", "completed", "member", "fellow"];

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalizeSkill(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeEmail(email: string | null): string | null {
  const e = email?.trim().toLowerCase() ?? "";
  return e.includes("@") ? e : null;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  for (const part of phone.split(/[,/;|]| or /)) {
    const digits = part.replace(/\D/g, "");
    if (digits.length >= 9) return digits.slice(-9);
  }
  return null;
}

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(dr|eng|engr|mr|mrs|ms|miss|prof)\b\.?/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampInt(n: number | null | undefined, min: number, max: number): number {
  if (n == null || Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampYears(n: number | null | undefined): number | null {
  if (n == null || Number.isNaN(n) || n < 0) return null;
  return Math.round(Math.min(n, 60) * 10) / 10;
}

function validYear(y: number | null | undefined): number | null {
  const now = new Date().getFullYear();
  return y != null && y >= 1950 && y <= now + 1 ? y : null;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function toSkillRows(candidateId: string, skills: ExtractedSkill[]): SkillInsert[] {
  const rows = new Map<string, SkillInsert & { aliases: string[]; evidence: Json[] }>();

  for (const s of skills) {
    const norm = normalizeSkill(s.name);
    if (!norm) continue;
    const aliases = [...new Set(s.aliases.map(normalizeSkill))].filter((a) => a && a !== norm);
    const evidence = s.evidence.slice(0, 3).map((e) => ({ section: e.section, quote: e.quote.slice(0, 300) }));
    const row = {
      candidate_id: candidateId,
      name: s.name.trim(),
      norm_name: norm,
      aliases,
      category: s.category,
      in_skills_section: s.listed_in_skills_section,
      in_headline: s.in_headline_or_title,
      experience_count: clampInt(s.experience_count, 0, 50),
      project_count: clampInt(s.project_count, 0, 50),
      years_used: clampYears(s.years_used),
      last_used_year: validYear(s.last_used_year),
      certification_status: s.certification_status,
      proficiency: s.proficiency,
      is_personal: s.is_personal_skill,
      evidence,
    };

    const prev = rows.get(norm);
    if (!prev) {
      rows.set(norm, row);
      continue;
    }
    // Same skill listed twice: keep the strongest evidence from both.
    prev.aliases = [...new Set([...prev.aliases, ...aliases])];
    prev.in_skills_section ||= row.in_skills_section;
    prev.in_headline ||= row.in_headline;
    prev.is_personal ||= row.is_personal;
    prev.experience_count = Math.max(prev.experience_count ?? 0, row.experience_count);
    prev.project_count = Math.max(prev.project_count ?? 0, row.project_count);
    prev.years_used = Math.max(prev.years_used ?? 0, row.years_used ?? 0) || null;
    prev.last_used_year = Math.max(prev.last_used_year ?? 0, row.last_used_year ?? 0) || null;
    if (CERT_RANK.indexOf(row.certification_status) > CERT_RANK.indexOf(prev.certification_status ?? "none")) {
      prev.certification_status = row.certification_status;
    }
    prev.evidence = [...prev.evidence, ...evidence].slice(0, 3);
  }
  return [...rows.values()];
}

/** Searchable text for files Claude read as images (no text layer). */
function synthesizeText(cv: CvExtraction): string {
  const parts = [
    cv.full_name,
    cv.headline,
    cv.summary,
    cv.location,
    ...cv.experiences.map((e) => `${e.title} at ${e.organization ?? ""}. ${e.summary} ${e.skills.join(", ")}`),
    ...cv.projects.map((p) => `${p.name}. ${p.summary} ${p.skills.join(", ")}`),
    ...cv.education.map((e) => `${e.degree} ${e.field ?? ""} ${e.institution ?? ""}`),
    ...cv.certifications.map((c) => `${c.name} ${c.issuer ?? ""} ${c.detail ?? ""}`),
    ...cv.languages.map((l) => `${l.language} ${l.level}`),
    ...cv.skills.map((s) => `${s.name}. ${s.evidence.map((e) => e.quote).join(" ")}`),
  ];
  return parts.filter(Boolean).join("\n");
}

function candidateRow(
  cv: CvExtraction,
  rawText: string,
  wordCount: number,
  fileId: string,
  filename: string,
  method: string,
): CandidateInsert {
  return {
    full_name: cv.full_name!.trim(),
    email: cv.email,
    phone: cv.phone,
    location: cv.location,
    headline: cv.headline,
    summary: cv.summary,
    total_years_experience: clampYears(cv.total_years_experience),
    highest_education: cv.highest_education,
    profile: {
      education: cv.education,
      certifications: cv.certifications,
      languages: cv.languages,
      experiences: cv.experiences,
      projects: cv.projects,
      is_partial: cv.is_partial,
      source_file: filename,
      extraction: { model: MODEL, method, extracted_at: new Date().toISOString() },
    } as unknown as Json,
    raw_text: rawText,
    word_count: wordCount,
    primary_file_id: fileId,
    email_norm: normalizeEmail(cv.email),
    phone_norm: normalizePhone(cv.phone),
    name_norm: normalizeName(cv.full_name!),
  };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function updateFile(db: DB, fileId: string, patch: Database["public"]["Tables"]["cv_files"]["Update"]) {
  const { error } = await db.from("cv_files").update(patch).eq("id", fileId);
  if (error) throw new Error(`Could not update file record: ${error.message}`);
}

async function findExistingCandidate(db: DB, row: CandidateInsert) {
  const columns = "id, full_name, word_count, primary_file_id";
  for (const [col, value] of [
    ["email_norm", row.email_norm],
    ["phone_norm", row.phone_norm],
    ["name_norm", row.name_norm],
  ] as const) {
    if (!value) continue;
    const { data, error } = await db.from("candidates").select(columns).eq(col, value).limit(1);
    if (error) throw new Error(error.message);
    if (data?.length) return data[0];
  }
  return null;
}

async function insertSkills(db: DB, candidateId: string, skills: ExtractedSkill[]) {
  const rows = toSkillRows(candidateId, skills);
  if (!rows.length) return;
  const { error } = await db.from("candidate_skills").insert(rows);
  if (error) throw new Error(`Could not save skills: ${error.message}`);
}

/**
 * Reads one uploaded file with Claude and stores the candidate profile and
 * skill evidence. The file must already be in storage at `storagePath`.
 */
export async function ingestFile(db: DB, file: IngestFile, lock: Lock = noLock): Promise<IngestOutcome> {
  const { data: existing, error: lookupError } = await db
    .from("cv_files")
    .select("id, status, candidate_id, original_filename, created_at")
    .eq("sha256", file.sha256)
    .maybeSingle();
  if (lookupError) return { status: "failed", detail: lookupError.message };

  // An identical copy is being read right now (e.g. two copies in one upload).
  const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;
  if (existing?.status === "processing" && Date.now() - Date.parse(existing.created_at) < PROCESSING_TIMEOUT_MS) {
    return {
      status: "duplicate",
      detail: `Identical file is already being processed (${existing.original_filename}).`,
      fileId: existing.id,
    };
  }

  if (existing && ["processed", "duplicate", "skipped"].includes(existing.status)) {
    return {
      status: "duplicate",
      detail: `Identical file was already imported (${existing.original_filename}).`,
      fileId: existing.id,
      candidateId: existing.candidate_id ?? undefined,
    };
  }

  let fileId = existing?.id;
  const fileFields = {
    original_filename: file.filename,
    storage_path: file.storagePath,
    mime_type: file.mimeType,
    size_bytes: file.sizeBytes,
    status: "processing",
    status_detail: null,
  };
  if (fileId) {
    await updateFile(db, fileId, fileFields);
  } else {
    const { data, error } = await db
      .from("cv_files")
      .insert({ ...fileFields, sha256: file.sha256 })
      .select("id")
      .single();
    if (error) return { status: "failed", detail: `Could not create file record: ${error.message}` };
    fileId = data.id;
  }

  let usage: Usage | null = null;
  try {
    const doc = await prepareDocument(file.bytes, file.filename);
    if (doc.method === "none") {
      await updateFile(db, fileId, { status: "failed", status_detail: doc.reason, processed_at: new Date().toISOString() });
      return { status: "failed", detail: doc.reason, fileId };
    }

    const extraction = await extractCv(doc, file.filename);
    const cv = extraction.data;
    usage = extraction.usage;
    const rawText = doc.method === "text" ? doc.text : synthesizeText(cv);
    const wordCount = doc.method === "text" ? doc.wordCount : countWords(rawText);
    const common = {
      doc_type: cv.document_type,
      word_count: wordCount,
      extraction_method: doc.method,
      usage: usage as unknown as Json,
      processed_at: new Date().toISOString(),
    };

    if (cv.document_type !== "cv") {
      const detail =
        cv.document_type === "other"
          ? "Skipped: this document isn't a CV."
          : `Skipped: this is a ${DOC_LABEL[cv.document_type]}, not a CV.`;
      await updateFile(db, fileId, { ...common, status: "skipped", status_detail: detail });
      return { status: "skipped", detail, fileId, costUsd: usage.cost_usd };
    }
    if (!cv.full_name?.trim()) {
      const detail = "Skipped: no candidate name found (possibly a single page of a CV).";
      await updateFile(db, fileId, { ...common, status: "skipped", status_detail: detail });
      return { status: "skipped", detail, fileId, costUsd: usage.cost_usd };
    }

    const row = candidateRow(cv, rawText, wordCount, fileId, file.filename, doc.method);
    const cost = usage.cost_usd;

    return await lock(async () => {
      const match = await findExistingCandidate(db, row);

      if (!match) {
        const { data, error } = await db.from("candidates").insert(row).select("id").single();
        if (error) throw new Error(`Could not save candidate: ${error.message}`);
        await insertSkills(db, data.id, cv.skills);
        const detail = `Added ${row.full_name} with ${cv.skills.length} skills.`;
        await updateFile(db, fileId!, { ...common, candidate_id: data.id, status: "processed", status_detail: detail });
        return { status: "processed", detail, fileId, candidateId: data.id, candidateName: row.full_name, costUsd: cost };
      }

      if (wordCount > match.word_count) {
        // This file is more detailed than the one on record: it becomes the main CV.
        const { error } = await db.from("candidates").update(row).eq("id", match.id);
        if (error) throw new Error(`Could not update candidate: ${error.message}`);
        const { error: delError } = await db.from("candidate_skills").delete().eq("candidate_id", match.id);
        if (delError) throw new Error(`Could not replace skills: ${delError.message}`);
        await insertSkills(db, match.id, cv.skills);
        if (match.primary_file_id && match.primary_file_id !== fileId) {
          await updateFile(db, match.primary_file_id, {
            status: "duplicate",
            status_detail: `Same person as ${row.full_name}; replaced by a more detailed CV (${file.filename}).`,
          });
        }
        const detail = `Updated ${row.full_name} with a more detailed CV.`;
        await updateFile(db, fileId!, { ...common, candidate_id: match.id, status: "processed", status_detail: detail });
        return { status: "processed", detail, fileId, candidateId: match.id, candidateName: row.full_name, costUsd: cost };
      }

      const detail = `Same person as ${match.full_name}; kept the more detailed CV already on record.`;
      await updateFile(db, fileId!, { ...common, candidate_id: match.id, status: "duplicate", status_detail: detail });
      return { status: "duplicate", detail, fileId, candidateId: match.id, candidateName: match.full_name, costUsd: cost };
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await updateFile(db, fileId, {
      status: "failed",
      status_detail: detail.slice(0, 500),
      usage: usage as unknown as Json,
      processed_at: new Date().toISOString(),
    }).catch(() => undefined);
    return { status: "failed", detail, fileId, costUsd: usage?.cost_usd };
  }
}
