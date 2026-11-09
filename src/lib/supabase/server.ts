import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "@/lib/database.types";
import type { DB } from "@/lib/supabase/db";

export type { DB };

export async function createClient(): Promise<DB> {
  const cookieStore = await cookies();
  // Candidate data is private and per-request: keep it out of prerendered
  // and prefetched shells.
  await connection();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; the proxy refreshes sessions.
          }
        },
      },
    },
  );
}

/** Returns the signed-in user's claims, or null. Safe to trust (verifies the JWT). */
export async function getUserClaims(supabase: DB) {
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
}
