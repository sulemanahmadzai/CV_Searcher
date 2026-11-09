-- CV Search: initial schema
-- Access model: only users listed in public.app_users can read or write anything.
-- Signing up alone grants nothing.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Private helpers (schema is not exposed through the Data API)
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.app_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

create function private.is_app_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_users where user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_app_user() from public;
grant execute on function private.is_app_user() to authenticated;

create function private.regex_escape(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(p, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g');
$$;
revoke all on function private.regex_escape(text) from public;
grant execute on function private.regex_escape(text) to authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.cv_files (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid,
  original_filename text not null,
  storage_path text,
  mime_type text,
  size_bytes integer,
  sha256 text not null unique,
  doc_type text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'processed', 'duplicate', 'skipped', 'failed')),
  status_detail text,
  word_count integer,
  extraction_method text,
  usage jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  location text,
  headline text,
  summary text,
  total_years_experience numeric(4, 1),
  highest_education text,
  profile jsonb not null default '{}'::jsonb,
  raw_text text not null default '',
  word_count integer not null default 0,
  primary_file_id uuid references public.cv_files (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cv_files
  add constraint cv_files_candidate_id_fkey
  foreign key (candidate_id) references public.candidates (id) on delete set null;

create trigger candidates_set_updated_at
  before update on public.candidates
  for each row execute function private.set_updated_at();

-- One row per skill per candidate, with the evidence behind it.
create table public.candidate_skills (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  name text not null,
  norm_name text not null,
  aliases text[] not null default '{}',
  category text not null,
  in_skills_section boolean not null default false,
  in_headline boolean not null default false,
  experience_count integer not null default 0,
  project_count integer not null default 0,
  years_used numeric(4, 1),
  last_used_year integer,
  certification_status text not null default 'none',
  proficiency text not null default 'unknown',
  is_personal boolean not null default true,
  evidence jsonb not null default '[]'::jsonb
);

create table public.searches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  title text,
  job_description text not null,
  requirements jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb,
  ai_review jsonb,
  usage jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index cv_files_candidate_id_idx on public.cv_files (candidate_id);
create index cv_files_created_at_idx on public.cv_files (created_at desc);
create index candidates_primary_file_id_idx on public.candidates (primary_file_id);
create index candidates_email_idx on public.candidates (lower(email));
create index candidates_full_name_trgm_idx on public.candidates using gin (full_name extensions.gin_trgm_ops);
create index candidate_skills_candidate_id_idx on public.candidate_skills (candidate_id);
create index candidate_skills_norm_name_idx on public.candidate_skills (norm_name);
create index candidate_skills_norm_name_trgm_idx on public.candidate_skills using gin (norm_name extensions.gin_trgm_ops);
create index candidate_skills_aliases_idx on public.candidate_skills using gin (aliases);
create index searches_created_by_idx on public.searches (created_by);
create index searches_created_at_idx on public.searches (created_at desc);

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
revoke all on public.app_users, public.cv_files, public.candidates, public.candidate_skills, public.searches
  from anon, authenticated;
grant select on public.app_users to authenticated;
grant select, insert, update, delete
  on public.cv_files, public.candidates, public.candidate_skills, public.searches
  to authenticated;

alter table public.app_users enable row level security;
alter table public.cv_files enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_skills enable row level security;
alter table public.searches enable row level security;

create policy app_users_select_own on public.app_users
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy cv_files_app_users on public.cv_files
  for all to authenticated
  using ((select private.is_app_user()))
  with check ((select private.is_app_user()));

create policy candidates_app_users on public.candidates
  for all to authenticated
  using ((select private.is_app_user()))
  with check ((select private.is_app_user()));

create policy candidate_skills_app_users on public.candidate_skills
  for all to authenticated
  using ((select private.is_app_user()))
  with check ((select private.is_app_user()));

create policy searches_app_users on public.searches
  for all to authenticated
  using ((select private.is_app_user()))
  with check ((select private.is_app_user()));

-- ---------------------------------------------------------------------------
-- Storage: private bucket for original CV files
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('cvs', 'cvs', false, 26214400)
on conflict (id) do nothing;

create policy cvs_select_app_users on storage.objects
  for select to authenticated
  using (bucket_id = 'cvs' and (select private.is_app_user()));

create policy cvs_insert_app_users on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cvs' and (select private.is_app_user()));

create policy cvs_update_app_users on storage.objects
  for update to authenticated
  using (bucket_id = 'cvs' and (select private.is_app_user()))
  with check (bucket_id = 'cvs' and (select private.is_app_user()));

create policy cvs_delete_app_users on storage.objects
  for delete to authenticated
  using (bucket_id = 'cvs' and (select private.is_app_user()));

-- ---------------------------------------------------------------------------
-- Search functions (security invoker: RLS still applies)
-- ---------------------------------------------------------------------------

-- Skill rows that match any of the given terms: exact name/alias, whole-word
-- containment ("excel" in "advanced excel"), or trigram similarity.
create function public.match_skill_evidence(p_terms text[], p_min_similarity real default 0.55)
returns table (skill_id uuid, candidate_id uuid, term text, match_kind text, similarity real)
language sql
stable
security invoker
set search_path = ''
as $$
  with t as (
    select distinct
      lower(btrim(x)) as term,
      '(^|[^[:alnum:]])' || private.regex_escape(lower(btrim(x))) || '($|[^[:alnum:]])' as pattern
    from unnest(p_terms) as x
    where length(btrim(x)) > 1
  )
  select
    s.id,
    s.candidate_id,
    t.term,
    case
      when s.norm_name = t.term or t.term = any (s.aliases) then 'exact'
      when s.norm_name ~ t.pattern then 'contains'
      else 'fuzzy'
    end,
    extensions.similarity(s.norm_name, t.term)
  from public.candidate_skills s
  join t on (
    s.norm_name = t.term
    or t.term = any (s.aliases)
    or s.norm_name ~ t.pattern
    or extensions.similarity(s.norm_name, t.term) >= p_min_similarity
  );
$$;

-- Whole-word mentions of terms anywhere in the CV text (weak evidence only).
-- Whole-word matching means "acca" does not match "baccalaureate".
create function public.match_text_mentions(p_terms text[])
returns table (candidate_id uuid, term text, hits integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with t as (
    select distinct
      lower(btrim(x)) as term,
      '(^|[^[:alnum:]])' || private.regex_escape(lower(btrim(x))) || '($|[^[:alnum:]])' as pattern
    from unnest(p_terms) as x
    where length(btrim(x)) > 1
  )
  select
    c.id,
    t.term,
    (select count(*) from regexp_matches(c.raw_text, t.pattern, 'gi'))::integer
  from public.candidates c
  join t on c.raw_text ~* t.pattern;
$$;

-- Distinct skill names in the database, most common first. Given to Claude
-- when it reads a job description so it can map requirements onto real names.
create function public.skill_vocabulary(p_limit integer default 2500)
returns table (norm_name text, display_name text, candidate_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.norm_name,
    mode() within group (order by s.name),
    count(distinct s.candidate_id)
  from public.candidate_skills s
  where s.is_personal
  group by s.norm_name
  order by 3 desc, 1
  limit p_limit;
$$;

revoke all on function public.match_skill_evidence(text[], real) from public, anon;
revoke all on function public.match_text_mentions(text[]) from public, anon;
revoke all on function public.skill_vocabulary(integer) from public, anon;
grant execute on function public.match_skill_evidence(text[], real) to authenticated;
grant execute on function public.match_text_mentions(text[]) to authenticated;
grant execute on function public.skill_vocabulary(integer) to authenticated;
