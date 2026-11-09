// Runs a search from the terminal (same engine as the website) and prints the top results.
//   npm run search -- "Finance officer, ACCA qualified, 5 years experience"
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { runSearch } from "@/lib/search/run";

process.loadEnvFile(".env.local");

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Usage: npm run search -- "job description text"');
    process.exit(1);
  }
  const db = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await db.auth.signInWithPassword({
    email: process.env.ADMIN_EMAIL!,
    password: process.env.ADMIN_PASSWORD!,
  });
  if (error) throw new Error(error.message);

  const search = await runSearch(db, query);
  console.log(`\n${search.job.job_title} - ${search.totalMatched} candidates with evidence\n`);
  for (const r of search.job.requirements) {
    console.log(`  [${r.importance}] w${r.weight} ${r.label}  terms: ${r.match_terms.join(", ")}${r.related_terms.length ? `  related: ${r.related_terms.join(", ")}` : ""}`);
  }
  console.log("");
  search.results.slice(0, 10).forEach((c, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${String(c.score).padStart(3)}  ${c.full_name} - ${c.headline ?? ""}${c.missingMust.length ? `  (missing: ${c.missingMust.join(", ")})` : ""}`);
    for (const r of c.requirements) {
      console.log(`        ${r.status.padEnd(7)} ${r.label}${r.matchedSkill ? ` <- ${r.matchedSkill}` : ""}${r.details.length ? ` (${r.details.join(", ")})` : ""}`);
    }
  });
  console.log(`\nSaved as search ${search.id}`);
}

main();
