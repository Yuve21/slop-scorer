-- 0002_notary.sql — attest the MAKING. Never the person.
--
-- THE ONE CONSTRAINT THAT SHAPES EVERY TABLE HERE
--
-- `human-verification-licensing.md` section 3 is the binding analysis: Illinois BIPA carries
-- $1,000–$5,000 per scan WITH a private right of action, Texas CUBI and Washington sit behind it,
-- and directing a provider to collect a face template does not reliably move the liability. The
-- mitigation that actually works is stated there in four words: do not do biometrics. So there is
-- no table below that can hold a face, a voiceprint, a keystroke trace, a document image or a
-- name, and `packages/notary` has a test that walks the source to keep it that way.
--
-- The standard we are implementing already agrees with us. RFC 3161 says the TSA is "not to include
-- any identification of the requesting entity in the time-stamp tokens" and "the time-stamp request
-- does not identify the requester". An entire deployed standard for attesting existence without
-- attesting identity. That IS the thesis; we are not inventing it, we are wiring it up.
--
-- WHAT IS STORED: hashes, counts, times, and timestamp tokens. Not content. A chain proves that a
-- sequence of digests existed in a given order before a given instant. It does not prove who
-- produced them and the schema has nowhere to say otherwise.
--
-- Applied to: (no project yet — see packages/db/README.md)

-- ============================================================================
-- FORWARD  (additive only)
-- ============================================================================

-- One chain per thing being made. `subject_sha256` is the digest of the finished file when there
-- is one; it is null while the work is still in progress, which is the normal state.
create table if not exists public.notary_chains (
  chain_id        uuid primary key,
  owner_id        uuid        not null,
  subject_sha256  text        check (subject_sha256 ~ '^[0-9a-f]{64}$'),
  -- Literal allowed values: 'private', 'hashes', 'full'.
  --   private — only the owner reads the events. The default, and the right default: the Genshin
  --             fan-art case in `left-field-additions.md` A8 is somebody taking a STREAMED
  --             work-in-progress, running it through a generator, and publishing first. A public
  --             process log is an attack surface, so this is private commitment plus selective
  --             disclosure, never public streaming.
  --   hashes  — a stranger may read the digests and the ordering. Enough to verify, not enough to
  --             reconstruct the work.
  --   full    — the owner has chosen to expose the recorded metadata too.
  disclosure      text        not null default 'private'
                              check (disclosure in ('private', 'hashes', 'full')),
  root_sha256     text        check (root_sha256 ~ '^[0-9a-f]{64}$'),
  event_count     integer     not null default 0 check (event_count >= 0),
  created_at      timestamptz not null default now(),
  closed_at       timestamptz
);

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'auth')
     and not exists (select 1 from pg_constraint where conname = 'notary_chains_owner_fk')
  then
    alter table public.notary_chains
      add constraint notary_chains_owner_fk
      foreign key (owner_id) references auth.users (id) on delete cascade
      not valid;
  end if;
end $$;

-- One recorded step. `declared_at` is what the client said; `recorded_at` is when we saw it. They
-- are separate columns because only the second one is ours to stand behind, and a credential that
-- conflated them would be asserting a client-controlled time as a fact.
create table if not exists public.notary_events (
  event_id        uuid primary key,
  chain_id        uuid        not null references public.notary_chains (chain_id) on delete cascade,
  sequence        integer     not null check (sequence >= 0),
  -- Literal allowed values: 'draft', 'save', 'edit', 'commit', 'agent-receipt', 'recording-frame',
  -- 'export'. Any new kind is a new migration, because a kind the verifier does not know about is a
  -- gap in what the credential means.
  kind            text        not null check (kind in ('draft', 'save', 'edit', 'commit', 'agent-receipt', 'recording-frame', 'export')),
  content_sha256  text        not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_length     bigint      not null check (byte_length >= 0),
  declared_at     timestamptz not null,
  recorded_at     timestamptz not null default now(),
  -- The chain link. Domain-separated leaf hash over (sequence, kind, content, prev). Recomputable
  -- by anyone holding the row, which is the point.
  leaf_sha256     text        not null check (leaf_sha256 ~ '^[0-9a-f]{64}$'),
  prev_sha256     text        check (prev_sha256 ~ '^[0-9a-f]{64}$'),
  -- Bounded, non-identifying facts about the step: tool id, layer count, frame index. A CHECK keeps
  -- it small; the package keeps it clean.
  metadata        jsonb       not null default '{}'::jsonb check (pg_column_size(metadata) < 4096)
);

-- Append-only, positionally. A second row at the same sequence would fork the chain, and a forked
-- chain verifies against whichever branch you happen to read.
create unique index if not exists notary_events_chain_sequence_key
  on public.notary_events (chain_id, sequence);

-- One row per authority per root. Failures are rows too: "three of five authorities answered" is a
-- statement we can only make if the two that did not are recorded.
create table if not exists public.notary_timestamps (
  timestamp_id    uuid primary key,
  chain_id        uuid        not null references public.notary_chains (chain_id) on delete cascade,
  root_sha256     text        not null check (root_sha256 ~ '^[0-9a-f]{64}$'),
  authority_id    text        not null,
  authority_url   text        not null,
  jurisdiction    text        not null,
  -- Literal allowed values: 'granted', 'rejected', 'unreachable'.
  --   granted    — a token came back and its message imprint matches our root.
  --   rejected   — the authority answered and refused (an RFC 3161 PKIStatus other than granted).
  --   unreachable— no usable answer. Not fatal, and never silently dropped.
  status          text        not null check (status in ('granted', 'rejected', 'unreachable')),
  gen_time        timestamptz,
  token           bytea,
  failure_reason  text,
  requested_at    timestamptz not null default now(),
  constraint notary_timestamps_granted_has_token
    check (status <> 'granted' or (token is not null and gen_time is not null))
);

create unique index if not exists notary_timestamps_root_authority_key
  on public.notary_timestamps (chain_id, root_sha256, authority_id);

-- The issued credential. `statement` is stored verbatim because the wording IS the liability
-- boundary (`human-verification-licensing.md` section 5 and item 3 of the attorney list), and a
-- credential whose text was regenerated from later code is a credential nobody can hold us to.
create table if not exists public.notary_credentials (
  credential_id       uuid primary key,
  chain_id            uuid        not null references public.notary_chains (chain_id) on delete cascade,
  root_sha256         text        not null check (root_sha256 ~ '^[0-9a-f]{64}$'),
  statement           text        not null,
  statement_version   integer     not null,
  event_count         integer     not null check (event_count >= 0),
  authority_count     integer     not null check (authority_count >= 0),
  jurisdiction_count  integer     not null check (jurisdiction_count >= 0),
  earliest_gen_time   timestamptz,
  issued_at           timestamptz not null default now(),
  -- A credential must be revocable. Item 5 of the attorney list names a revocation right as a
  -- contract term; a schema with no revoked_at cannot honour one.
  revoked_at          timestamptz,
  revocation_reason   text
);

-- A process recording: the Procreate / Clip Studio Paint case. Both record a timelapse by DEFAULT
-- and neither hashes, signs or timestamps anything, and no product verifies one. We store what the
-- parser could establish, and nothing about the pixels.
create table if not exists public.notary_recordings (
  recording_id        uuid primary key,
  chain_id            uuid        not null references public.notary_chains (chain_id) on delete cascade,
  -- Literal allowed values: 'procreate', 'clip-studio', 'krita', 'generic-frames'.
  source_tool         text        not null check (source_tool in ('procreate', 'clip-studio', 'krita', 'generic-frames')),
  parser_id           text        not null,
  frame_count         integer     not null check (frame_count >= 0),
  duration_ms         bigint      not null check (duration_ms >= 0),
  final_file_sha256   text        check (final_file_sha256 ~ '^[0-9a-f]{64}$'),
  -- What the parser could NOT establish, named. A recording ingested by a minimal parser and one
  -- ingested by a complete one must not be indistinguishable in the record.
  unparsed_fields     text[]      not null default '{}',
  ingested_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- RLS: on, deny first.
-- ----------------------------------------------------------------------------
alter table public.notary_chains      enable row level security;
alter table public.notary_events      enable row level security;
alter table public.notary_timestamps  enable row level security;
alter table public.notary_credentials enable row level security;
alter table public.notary_recordings  enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'notary_chains_read_own_or_disclosed') then
    create policy notary_chains_read_own_or_disclosed on public.notary_chains
      for select to anon, authenticated
      using (disclosure in ('hashes', 'full') or owner_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'notary_events_read_own_or_disclosed') then
    create policy notary_events_read_own_or_disclosed on public.notary_events
      for select to anon, authenticated
      using (exists (
        select 1 from public.notary_chains c
         where c.chain_id = notary_events.chain_id
           and (c.disclosure in ('hashes', 'full') or c.owner_id = auth.uid())
      ));
  end if;

  -- A timestamp token is meant to be checkable by a stranger holding the credential, and it carries
  -- no identification of the requester by construction (RFC 3161). Readable.
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'notary_timestamps_read_all') then
    create policy notary_timestamps_read_all on public.notary_timestamps
      for select to anon, authenticated using (true);
  end if;

  -- Including revoked ones. A revocation nobody can see is not a revocation.
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'notary_credentials_read_all') then
    create policy notary_credentials_read_all on public.notary_credentials
      for select to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'notary_recordings_read_own') then
    create policy notary_recordings_read_own on public.notary_recordings
      for select to authenticated
      using (exists (
        select 1 from public.notary_chains c
         where c.chain_id = notary_recordings.chain_id and c.owner_id = auth.uid()
      ));
  end if;
end $$;

-- No insert, update or delete policy anywhere in this migration. Every write goes through the
-- service role, because a chain a client can append to out of band is a chain that proves nothing,
-- and a credential a client can mint is a credential.

-- ----------------------------------------------------------------------------
-- Per-column grants.
-- ----------------------------------------------------------------------------
revoke all on public.notary_chains      from anon, authenticated;
revoke all on public.notary_events      from anon, authenticated;
revoke all on public.notary_timestamps  from anon, authenticated;
revoke all on public.notary_credentials from anon, authenticated;
revoke all on public.notary_recordings  from anon, authenticated;

-- `owner_id` is withheld from the public read path: the disclosure setting exposes the PROCESS, and
-- a chain that also hands out the account behind it turns a verification page into a directory.
grant select (chain_id, subject_sha256, disclosure, root_sha256, event_count, created_at, closed_at)
  on public.notary_chains to anon, authenticated;

grant select (event_id, chain_id, sequence, kind, content_sha256, byte_length, declared_at, recorded_at, leaf_sha256, prev_sha256)
  on public.notary_events to anon, authenticated;
-- `metadata` is granted only to signed-in readers, and only because `disclosure = 'full'` is an
-- explicit act by the owner. The grant is the second lock, the policy is the first.
grant select (metadata) on public.notary_events to authenticated;

grant select (timestamp_id, chain_id, root_sha256, authority_id, authority_url, jurisdiction, status, gen_time, token, failure_reason, requested_at)
  on public.notary_timestamps to anon, authenticated;

grant select (credential_id, chain_id, root_sha256, statement, statement_version, event_count, authority_count, jurisdiction_count, earliest_gen_time, issued_at, revoked_at, revocation_reason)
  on public.notary_credentials to anon, authenticated;

grant select (recording_id, chain_id, source_tool, parser_id, frame_count, duration_ms, final_file_sha256, unparsed_fields, ingested_at)
  on public.notary_recordings to authenticated;

-- ============================================================================
-- ROLLBACK:
-- drop table if exists public.notary_recordings;
-- drop table if exists public.notary_credentials;
-- drop table if exists public.notary_timestamps;
-- drop table if exists public.notary_events;
-- drop table if exists public.notary_chains;
