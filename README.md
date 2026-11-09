# CV Search

Paste a job description and get candidates from your CV library, ranked by the evidence in their CVs.

- **Next.js 16** (App Router) app: search, results, candidate profiles, upload, import log
- **Supabase**: Postgres (profiles, skill evidence, searches), private Storage bucket for original files, Auth
- **Claude Sonnet 5.5** (`claude-sonnet-5-5`): reads each CV once into structured, evidence-backed data; reads each job description into weighted requirements; optional written review of the top 10

## How ranking works

When a CV is imported, Claude records every skill with its evidence: whether it is in the skills section, how many jobs and projects used it, years of use, when it was last used, and qualification status (e.g. ACCA fellow / member / in progress). It also flags terms that are only *mentioned* (e.g. "set up a computer lab for ACCA exams") so they don't count as the person's skill.

For a search, Claude turns the job description into 3–12 requirements (must-have or nice-to-have, weight 1–5, plus synonyms mapped onto the skill names that exist in your library). Each candidate then gets points per requirement:

| Evidence | Points |
|---|---|
| Qualification held (completed / member; fellow) | +7; +8 (in progress: +3) |
| Each job or project that used the skill (up to 4) | +2 each |
| Each year of use (up to 10) | +0.5 |
| Listed in the skills section | +1 |
| Used in the last 3 years | +1 |
| Appears in a job title | +1 |

10 points = full strength. Related skills (e.g. React Native for a React requirement) get half credit; a word that only appears in the CV text gets a token 0.12. The final score is the weighted average of requirement strengths × 100, multiplied by 0.6 for each missing weight-5 must-have (smaller for lower-weight ones: 0.6^(weight/5)). All constants live in `src/lib/search/score.ts`.

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000 (or the next free port)
```

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env.local`.

### First-time setup on a new Supabase project

1. Run the SQL files in `supabase/migrations/` in order (SQL editor, or the Supabase CLI/MCP).
2. `npm run create-admin` creates the login from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. Confirm the email if your project requires it, then give the account access:

```sql
insert into public.app_users (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.org';
```

### Bulk import a folder

```bash
npm run import -- ../CV                    # 4 files at a time
npm run import -- ../CV --concurrency 6
```

Safe to re-run: files already imported are recognized by their SHA-256 hash. The same person in several files is merged (by email, phone or name) and the most detailed CV is kept. Cover letters, job postings and certificates are logged as skipped.

### Search from the terminal

```bash
npm run search -- "Finance officer, ACCA qualified, 5 years experience, QuickBooks"
```

## Access control

Only users listed in `public.app_users` can read or write anything (enforced by Row Level Security on every table and on the storage bucket). Signing up alone grants nothing. To add a team member: create their account (Supabase dashboard → Authentication → Add user), then run in the SQL editor:

```sql
insert into public.app_users (user_id, role)
select id, 'member' from auth.users where email = 'colleague@example.org';
```

Recommended dashboard settings: Authentication → Sign In / Providers → turn off **Allow new users to sign up**; Authentication → Passwords → turn on **leaked password protection** (if your plan includes it).

## Deploy to Vercel

1. Push this folder to a Git repository and import it in Vercel.
2. Add environment variables: `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. (`ADMIN_*` are only for the local scripts.)
3. Deploy. Uploads go from the browser straight to Supabase Storage, so Vercel's request size limit doesn't apply; CV processing routes allow up to 300 s.

Note: Vercel's free Hobby plan is for non-commercial personal use only.

## Project layout

```
src/lib/extract/     file reading (PDF, DOCX, DOC, images) and the Claude CV extraction prompt/schema
src/lib/ingest.ts    import pipeline: dedupe, merge same person, save profile + skill evidence
src/lib/search/      job-description parsing, scoring, search orchestration, AI review
src/app/             pages and API routes
scripts/             bulk import, terminal search, admin account creation
supabase/migrations/ database schema, RLS policies, search functions
```
