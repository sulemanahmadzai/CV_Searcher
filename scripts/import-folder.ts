// Imports every CV in a folder.
//   npm run import -- ../CV            (default concurrency 4)
//   npm run import -- ../CV --concurrency 6
// Re-running is safe: files already imported are recognized by their hash and skipped.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createLock, ingestFile, type IngestOutcome } from "@/lib/ingest";
import { ACCEPTED_EXTENSIONS, mimeFor } from "@/lib/extract/text";
import { CV_BUCKET, storagePathFor } from "@/lib/supabase/db";

process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const folder = resolve(args.find((a) => !a.startsWith("--")) ?? "../CV");
const concurrencyFlag = args.indexOf("--concurrency");
const concurrency = concurrencyFlag >= 0 ? Number(args[concurrencyFlag + 1]) : 4;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is empty in .env.local - add your key first.");
    process.exit(1);
  }

  const db = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { error: authError } = await db.auth.signInWithPassword({
    email: process.env.ADMIN_EMAIL!,
    password: process.env.ADMIN_PASSWORD!,
  });
  if (authError) {
    console.error("Login failed:", authError.message);
    process.exit(1);
  }

  const files = readdirSync(folder)
    .filter((f) => ACCEPTED_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)))
    .filter((f) => statSync(join(folder, f)).isFile())
    .sort();
  console.log(`Importing ${files.length} files from ${folder} (concurrency ${concurrency})\n`);

  const lock = createLock();
  const outcomes: (IngestOutcome & { filename: string })[] = [];
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < files.length) {
      const filename = files[next++];
      const bytes = new Uint8Array(readFileSync(join(folder, filename)));
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const storagePath = storagePathFor(sha256, filename);
      const mimeType = mimeFor(filename);

      const upload = await db.storage
        .from(CV_BUCKET)
        .upload(storagePath, bytes, { contentType: mimeType, upsert: true });

      let outcome: IngestOutcome;
      if (upload.error) {
        outcome = { status: "failed", detail: `Upload failed: ${upload.error.message}` };
      } else {
        outcome = await ingestFile(
          db,
          { bytes, filename, sha256, sizeBytes: bytes.byteLength, storagePath, mimeType },
          lock,
        );
      }
      outcomes.push({ ...outcome, filename });
      done++;
      const cost = outcome.costUsd ? ` $${outcome.costUsd.toFixed(3)}` : "";
      console.log(`[${String(done).padStart(3)}/${files.length}] ${outcome.status.padEnd(9)} ${filename} - ${outcome.detail}${cost}`);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  const count = (s: string) => outcomes.filter((o) => o.status === s).length;
  const total = outcomes.reduce((sum, o) => sum + (o.costUsd ?? 0), 0);
  console.log(`\nDone. processed=${count("processed")} duplicate=${count("duplicate")} skipped=${count("skipped")} failed=${count("failed")}`);
  console.log(`Claude cost for this run: $${total.toFixed(2)}`);
  const failed = outcomes.filter((o) => o.status === "failed");
  if (failed.length) {
    console.log("\nFailed files (re-run the command to retry them):");
    for (const f of failed) console.log(`  - ${f.filename}: ${f.detail}`);
  }
}

main();
