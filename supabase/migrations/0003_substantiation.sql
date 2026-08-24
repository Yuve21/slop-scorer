-- 0003_substantiation.sql — where a published number is allowed to come from.
--
-- WHAT THIS TABLE IS, AND WHAT IT IS EMPHATICALLY NOT
--
-- `packages/core/src/calibration` refuses to let any accuracy figure be written down as a constant,
-- and `no-claims.test.ts` walks the source to enforce it: a number is computed from a named corpus
-- at test time or it does not exist. That discipline has a hole the moment a marketing page needs
-- to state a figure, because somebody will paste one. This table closes it: a published figure is a
-- ROW, it carries the corpus version and the sample size it was computed from, and it has a
-- computed_at, so "we said 71% in March" is answerable with the run that produced it.
--
-- IT IS NOT A DETECTION LOG. Nothing about a scanned artifact, a reproduction attempt, a prompt or
-- an output lands here. `packages/reproduce` is ephemeral by design and stays that way: stored
-- recreations are discoverable in somebody else's litigation, and there is already a protocol for
-- compelling production of individual users' prompts and outputs from a model vendor. Aggregates
-- only, and only aggregates somebody intends to publish.
--
-- Applied to: (no project yet — see packages/db/README.md)

-- ============================================================================
-- FORWARD  (additive only)
-- ============================================================================

create table if not exists public.substantiation_runs (
  run_id          uuid primary key,
  -- Literal allowed values: 'gauntlet-discrimination', 'detector-calibration', 'reproduction-effort'.
  kind            text        not null check (kind in ('gauntlet-discrimination', 'detector-calibration', 'reproduction-effort')),
  corpus_version  text        not null,
  -- The denominator, hoisted out of the payload and into a column so it cannot be omitted from a
  -- quote. "3 of 7" and "43%" are different claims and only the first one is checkable.
  sample_size     integer     not null check (sample_size >= 0),
  minimum_sample  integer     not null check (minimum_sample >= 0),
  payload         jsonb       not null,
  -- The code that produced it, so a figure can be recomputed by the version that stated it.
  produced_by     text        not null,
  computed_at     timestamptz not null default now(),
  -- Nothing is public until somebody sets this. A row is evidence; a published row is a claim.
  published_at    timestamptz,
  superseded_by   uuid references public.substantiation_runs (run_id),
  constraint substantiation_runs_published_meets_minimum
    check (published_at is null or sample_size >= minimum_sample)
);

create index if not exists substantiation_runs_published_idx
  on public.substantiation_runs (kind, computed_at desc)
  where published_at is not null;

alter table public.substantiation_runs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'substantiation_runs_read_published') then
    create policy substantiation_runs_read_published on public.substantiation_runs
      for select to anon, authenticated
      using (published_at is not null and superseded_by is null);
  end if;
end $$;

revoke all on public.substantiation_runs from anon, authenticated;
grant select (run_id, kind, corpus_version, sample_size, minimum_sample, payload, produced_by, computed_at, published_at)
  on public.substantiation_runs to anon, authenticated;

-- ============================================================================
-- ROLLBACK:
-- drop table if exists public.substantiation_runs;
