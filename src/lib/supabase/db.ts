import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type DB = SupabaseClient<Database>;

export const CV_BUCKET = "cvs";

/** Storage keys only allow a safe character set, so keep the original name in the database. */
export function storagePathFor(sha256: string, filename: string): string {
  const safe = filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-120);
  return `${sha256}/${safe}`;
}
