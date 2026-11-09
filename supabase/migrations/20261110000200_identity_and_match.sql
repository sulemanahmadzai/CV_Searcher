-- Normalized identity fields used to merge multiple files from the same person.
alter table public.candidates
  add column email_norm text,
  add column phone_norm text,
  add column name_norm text;

create index candidates_email_norm_idx on public.candidates (email_norm);
create index candidates_phone_norm_idx on public.candidates (phone_norm);
create index candidates_name_norm_idx on public.candidates (name_norm);

-- Return the full skill row with each match so the app needs one round trip.
-- (Added as a new function; match_skill_evidence from the first migration is left in place.)
create function public.match_skill_rows(p_terms text[], p_min_similarity real default 0.55)
returns table (
  term text,
  match_kind text,
  similarity real,
  skill_id uuid,
  candidate_id uuid,
  name text,
  norm_name text,
  category text,
  in_skills_section boolean,
  in_headline boolean,
  experience_count integer,
  project_count integer,
  years_used numeric,
  last_used_year integer,
  certification_status text,
  proficiency text,
  is_personal boolean,
  evidence jsonb
)
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
    t.term,
    case
      when s.norm_name = t.term or t.term = any (s.aliases) then 'exact'
      when s.norm_name ~ t.pattern then 'contains'
      else 'fuzzy'
    end,
    extensions.similarity(s.norm_name, t.term),
    s.id,
    s.candidate_id,
    s.name,
    s.norm_name,
    s.category,
    s.in_skills_section,
    s.in_headline,
    s.experience_count,
    s.project_count,
    s.years_used,
    s.last_used_year,
    s.certification_status,
    s.proficiency,
    s.is_personal,
    s.evidence
  from public.candidate_skills s
  join t on (
    s.norm_name = t.term
    or t.term = any (s.aliases)
    or s.norm_name ~ t.pattern
    or extensions.similarity(s.norm_name, t.term) >= p_min_similarity
  );
$$;

revoke all on function public.match_skill_rows(text[], real) from public, anon;
grant execute on function public.match_skill_rows(text[], real) to authenticated;
