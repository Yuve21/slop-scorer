-- 0001_gauntlet.sql — the labeling pipeline, and the game that feeds it.
--
-- WHAT THIS SCHEMA IS ACTUALLY FOR
--
-- The gauntlet looks like a daily puzzle. Its job is to produce the only asset in this category
-- nobody has: a corpus of HUMAN judgments on provenanced artifacts, so that every accuracy figure
-- this product publishes can be printed next to "and people got this one right N of M times".
-- `packages/core/src/calibration` refuses to let any number be written down as a constant; this is
-- where the other half of the denominator comes from.
--
-- Two consequences shape every table below.
--
--   1. THE ANSWER IS NEVER A CLIENT-VISIBLE COLUMN. `gauntlet_artifacts.label` and
--      `gauntlet_rounds.human_index` are the answer key. RLS filters rows and cannot hide a column,
--      so the control is a per-column grant: `revoke all`, then `grant select (the safe columns)`.
--      This is the Lark `profiles` pattern, used here for the opposite reason: there, a column
--      missing from the grant silently permission-denied a whole query; here, a column PRESENT in
--      the grant would silently hand out the answers.
--
--   2. NOTHING HERE IDENTIFIES WHOEVER MADE AN ARTIFACT. `source` and `provenance` are how a
--      stranger checks the label, and they name projects and maintainers. They are kept for the
--      published calibration table and are NOT grantable to a player: the surface shows artifacts,
--      never people. `publicity-defamation-risk.md` Tier 1 #1 is that defamation needs an
--      identified plaintiff, and the cheapest way to satisfy that is to have nowhere to put a name.
--
-- Applied to: (no project yet — see packages/db/README.md for the link + apply path)

-- ============================================================================
-- FORWARD  (additive only)
-- ============================================================================

-- The pool. One row per artifact a round may show. Written by an operator from a provenanced
-- corpus (`packages/detectors-code/test/corpus`, `packages/detectors-web/src/fixtures`), never by
-- a player, and never from an unlabeled upload: a label with no stated basis is an assertion, and
-- an assertion is what *In re Workado* was about.
create table if not exists public.gauntlet_artifacts (
  artifact_id      text primary key,
  corpus           text        not null,
  -- Literal allowed values: 'human', 'generated'. There is deliberately no 'unknown': an artifact
  -- whose label we cannot state has no correct answer and therefore cannot be in a round.
  label            text        not null check (label in ('human', 'generated')),
  -- How a stranger checks the label. Never granted to a player.
  source           text        not null,
  provenance       text        not null check (length(provenance) >= 40),
  -- The redacted, presentable card. Built by @slop/gauntlet's presenter, which strips identity.
  presentation     jsonb       not null,
  capture_date     date        not null,
  retired_at       timestamptz,
  added_at         timestamptz not null default now()
);

create index if not exists gauntlet_artifacts_live_idx
  on public.gauntlet_artifacts (corpus, label)
  where retired_at is null;

-- A round: a deterministic selection from the pool. `seed` plus the pool state reproduces
-- `artifact_ids` and `human_index` exactly, which is what makes a disputed round auditable.
create table if not exists public.gauntlet_rounds (
  round_id      uuid primary key,
  day_key       date        not null,
  slot          integer     not null check (slot >= 0),
  seed          text        not null,
  builder_version integer   not null,
  artifact_ids  text[]      not null check (array_length(artifact_ids, 1) between 2 and 12),
  -- THE ANSWER. Revoked from every client role below.
  human_index   integer     not null check (human_index >= 0),
  built_at      timestamptz not null default now()
);

-- One round per (day, slot). The uniqueness is the idempotency: two servers building today's round
-- concurrently is a 23505 on the loser, which is a WIN (read the winner's row), not an error.
create unique index if not exists gauntlet_rounds_day_slot_key
  on public.gauntlet_rounds (day_key, slot);

-- The player. An account id and a chosen alias, and nothing else. No email, no name, no locale:
-- the leaderboard needs a label, not an identity.
create table if not exists public.gauntlet_participants (
  participant_id  uuid primary key,
  alias           text check (alias is null or length(alias) between 2 and 24),
  current_streak  integer     not null default 0 check (current_streak >= 0),
  longest_streak  integer     not null default 0 check (longest_streak >= 0),
  rounds_played   integer     not null default 0 check (rounds_played >= 0),
  rounds_correct  integer     not null default 0 check (rounds_correct >= 0),
  last_played_day date,
  created_at      timestamptz not null default now(),
  constraint gauntlet_participants_correct_le_played check (rounds_correct <= rounds_played)
);

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'auth')
     and not exists (
       select 1 from pg_constraint where conname = 'gauntlet_participants_user_fk'
     )
  then
    alter table public.gauntlet_participants
      add constraint gauntlet_participants_user_fk
      foreign key (participant_id) references auth.users (id) on delete cascade
      not valid;
  end if;
end $$;

-- THE DATASET. One row per guess, and the row carries everything needed to compute a per-artifact
-- human discrimination rate later, without re-deriving anything from a log.
--
-- `elapsed_ms` is measured SERVER SIDE, from `served_at` to the moment the insert is graded.
-- `client_reported_ms` is what the browser said. They are stored separately and compared rather
-- than reconciled, because a client-supplied duration is an input a player controls, and a
-- published "median time to answer" computed from a controllable input is not substantiation.
create table if not exists public.gauntlet_guesses (
  guess_id            uuid primary key,
  round_id            uuid        not null references public.gauntlet_rounds (round_id) on delete cascade,
  participant_id      uuid        not null references public.gauntlet_participants (participant_id) on delete cascade,
  chosen_index        integer     not null check (chosen_index >= 0),
  chosen_artifact_id  text        not null,
  -- Denormalised on purpose: the answer key can be re-derived from the round, but a guess row that
  -- carries its own correctness survives a pool edit, and the published table must not move when
  -- somebody retires an artifact.
  correct             boolean     not null,
  served_at           timestamptz not null,
  answered_at         timestamptz not null,
  elapsed_ms          integer     not null check (elapsed_ms >= 0),
  client_reported_ms  integer     check (client_reported_ms >= 0),
  timing_disputed     boolean     not null default false,
  created_at          timestamptz not null default now()
);

-- One guess per player per round. The whole labeling dataset depends on this: a player who can
-- resubmit can grind a round until correct, and every discrimination rate computed from it would
-- be an artifact of the retry loop rather than of the artifact.
create unique index if not exists gauntlet_guesses_one_per_round
  on public.gauntlet_guesses (round_id, participant_id);

create index if not exists gauntlet_guesses_round_idx on public.gauntlet_guesses (round_id);

-- Fixed-window rate limit. Service role only; there is no policy on this table at all.
create table if not exists public.gauntlet_rate_limits (
  participant_id uuid        not null,
  window_start   timestamptz not null,
  count          integer     not null default 0,
  primary key (participant_id, window_start)
);

-- ----------------------------------------------------------------------------
-- The two atomic writes. Both are single statements on purpose: a read-modify-write here is a
-- lost update under exactly the load a daily puzzle produces (everybody plays at the same time).
-- ----------------------------------------------------------------------------

-- Returns the count AFTER this attempt. The caller compares it with the limit; overage is counted
-- rather than clamped, so a limiter that is being hammered is visible instead of silently flat.
create or replace function public.slop_gauntlet_bump_rate_limit(
  p_participant uuid,
  p_window      timestamptz,
  p_limit       integer
) returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.gauntlet_rate_limits (participant_id, window_start, count)
  values (p_participant, p_window, 1)
  on conflict (participant_id, window_start)
    do update set count = public.gauntlet_rate_limits.count + 1
  returning count;
$$;

-- Streak accounting, idempotent per day: replaying it for a day already counted is a no-op on the
-- streak, which is what makes a retried request safe.
create or replace function public.slop_gauntlet_record_play(
  p_participant uuid,
  p_day         date,
  p_correct     boolean
) returns public.gauntlet_participants
language sql
security definer
set search_path = public
as $$
  update public.gauntlet_participants p
     set rounds_played   = p.rounds_played + 1,
         rounds_correct  = p.rounds_correct + (case when p_correct then 1 else 0 end),
         current_streak  = case
                             when not p_correct then 0
                             when p.last_played_day = p_day - 1 then p.current_streak + 1
                             when p.last_played_day = p_day then p.current_streak
                             else 1
                           end,
         longest_streak  = greatest(
                             p.longest_streak,
                             case
                               when not p_correct then 0
                               when p.last_played_day = p_day - 1 then p.current_streak + 1
                               when p.last_played_day = p_day then p.current_streak
                               else 1
                             end
                           ),
         last_played_day = p_day
   where p.participant_id = p_participant
  returning p.*;
$$;

-- ----------------------------------------------------------------------------
-- The published view. Per artifact: how often it appeared, how often a person picked it as the
-- human-made one, and — when it WAS the human-made one — how often people found it.
--
-- No rate is computed here. Counts are facts; a rate over eleven guesses is a claim, and the
-- minimum-sample gate that turns one into the other lives in `@slop/gauntlet`, next to its test.
-- ----------------------------------------------------------------------------
create or replace view public.gauntlet_artifact_discrimination as
  select
    a.artifact_id,
    a.corpus,
    a.label,
    a.source,
    a.provenance,
    count(g.guess_id)                                             as times_shown,
    count(g.guess_id) filter (where g.chosen_artifact_id = a.artifact_id) as times_chosen_as_human,
    count(g.guess_id) filter (where r.artifact_ids[r.human_index + 1] = a.artifact_id) as times_was_the_answer,
    count(g.guess_id) filter (
      where r.artifact_ids[r.human_index + 1] = a.artifact_id
        and g.chosen_artifact_id = a.artifact_id
    )                                                             as times_answer_found,
    percentile_cont(0.5) within group (order by g.elapsed_ms)     as median_elapsed_ms
  from public.gauntlet_artifacts a
  left join public.gauntlet_rounds  r on a.artifact_id = any (r.artifact_ids)
  left join public.gauntlet_guesses g on g.round_id = r.round_id
  group by a.artifact_id, a.corpus, a.label, a.source, a.provenance;

-- ----------------------------------------------------------------------------
-- RLS: on everywhere, deny first, then the narrowest policy that makes the game work.
-- ----------------------------------------------------------------------------
alter table public.gauntlet_artifacts    enable row level security;
alter table public.gauntlet_rounds       enable row level security;
alter table public.gauntlet_participants enable row level security;
alter table public.gauntlet_guesses      enable row level security;
alter table public.gauntlet_rate_limits  enable row level security;

-- No policy on gauntlet_rate_limits. Deliberate: only the service role touches it.

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'gauntlet_artifacts_read_live') then
    create policy gauntlet_artifacts_read_live on public.gauntlet_artifacts
      for select to anon, authenticated
      using (retired_at is null);
  end if;

  -- A round is readable once its day has arrived. Without the date predicate, tomorrow's round is
  -- readable today and the daily puzzle has no daily.
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'gauntlet_rounds_read_open') then
    create policy gauntlet_rounds_read_open on public.gauntlet_rounds
      for select to anon, authenticated
      using (day_key <= (now() at time zone 'utc')::date);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'gauntlet_participants_read_own') then
    create policy gauntlet_participants_read_own on public.gauntlet_participants
      for select to authenticated
      using (participant_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'gauntlet_participants_insert_own') then
    create policy gauntlet_participants_insert_own on public.gauntlet_participants
      for insert to authenticated
      with check (participant_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'gauntlet_participants_update_own_alias') then
    create policy gauntlet_participants_update_own_alias on public.gauntlet_participants
      for update to authenticated
      using (participant_id = auth.uid())
      with check (participant_id = auth.uid());
  end if;

  -- A player may read their own guesses. Reading anyone else's would leak the answer to a round
  -- they have not played, which is the same leak as shipping the label.
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'gauntlet_guesses_read_own') then
    create policy gauntlet_guesses_read_own on public.gauntlet_guesses
      for select to authenticated
      using (participant_id = auth.uid());
  end if;
end $$;

-- Deliberately NO insert policy on gauntlet_guesses. Grading happens server side against the
-- answer key, so a guess arrives through the service role after `correct` has been computed. A
-- client that could insert its own row could insert `correct = true`.

-- ----------------------------------------------------------------------------
-- Per-column grants. This is the part RLS cannot do.
-- ----------------------------------------------------------------------------
revoke all on public.gauntlet_artifacts    from anon, authenticated;
revoke all on public.gauntlet_rounds       from anon, authenticated;
revoke all on public.gauntlet_participants from anon, authenticated;
revoke all on public.gauntlet_guesses      from anon, authenticated;
revoke all on public.gauntlet_rate_limits  from anon, authenticated;
revoke all on public.gauntlet_artifact_discrimination from anon, authenticated;

-- label, source and provenance are all absent, and each for its own reason: `label` is the answer,
-- `source` and `provenance` name the people and projects behind the artifact.
grant select (artifact_id, corpus, presentation, capture_date, retired_at)
  on public.gauntlet_artifacts to anon, authenticated;

-- `human_index` is absent. `seed` is present: the seed without the pool ordering does not yield the
-- answer, and publishing it is what lets a player verify their round was not rigged after the fact.
grant select (round_id, day_key, slot, seed, builder_version, artifact_ids, built_at)
  on public.gauntlet_rounds to anon, authenticated;

grant select (participant_id, alias, current_streak, longest_streak, rounds_played, rounds_correct, last_played_day)
  on public.gauntlet_participants to authenticated;
grant insert (participant_id, alias) on public.gauntlet_participants to authenticated;
grant update (alias) on public.gauntlet_participants to authenticated;

grant select (guess_id, round_id, participant_id, chosen_index, chosen_artifact_id, correct, elapsed_ms, created_at)
  on public.gauntlet_guesses to authenticated;

-- The rate limiter is not a player-facing object and neither is the discrimination view: the view
-- carries `label` for every artifact in the pool, so granting it to a player hands over the answer
-- key for every future round. Publication goes through a computed, sample-gated export.
revoke all on function public.slop_gauntlet_bump_rate_limit(uuid, timestamptz, integer) from anon, authenticated;
revoke all on function public.slop_gauntlet_record_play(uuid, date, boolean) from anon, authenticated;

-- ============================================================================
-- ROLLBACK:
-- drop view if exists public.gauntlet_artifact_discrimination;
-- drop function if exists public.slop_gauntlet_record_play(uuid, date, boolean);
-- drop function if exists public.slop_gauntlet_bump_rate_limit(uuid, timestamptz, integer);
-- drop table if exists public.gauntlet_rate_limits;
-- drop table if exists public.gauntlet_guesses;
-- drop table if exists public.gauntlet_participants;
-- drop table if exists public.gauntlet_rounds;
-- drop table if exists public.gauntlet_artifacts;
