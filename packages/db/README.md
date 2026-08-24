# @slop/db

Persistence for the gauntlet's labels and the notary's attestations. Nothing else.

## What is deliberately not in here

No table holds a scan, a reproduction attempt, a prompt, an uploaded artifact or a generated output.
`packages/reproduce` is ephemeral by design (fifteen-minute TTL, takedown edge, no "keep forever"),
and the reason is in its `retention.ts`: a stored recreation is discoverable in somebody else's
litigation. Adding a `scans` table would quietly undo that, so there is no table to add a row to.

The DB exists for three things:

| Area | Tables | Why it must persist |
|---|---|---|
| Gauntlet | `gauntlet_artifacts`, `gauntlet_rounds`, `gauntlet_participants`, `gauntlet_guesses`, `gauntlet_rate_limits` | The labels are the published calibration corpus. They are the asset. |
| Notary | `notary_chains`, `notary_events`, `notary_timestamps`, `notary_credentials`, `notary_recordings` | A credential nobody can re-verify later is a badge. |
| Substantiation | `substantiation_runs` | Where a published figure is allowed to come from, with its corpus version and sample size. |

## Standing up a Supabase project

There is no project yet. Nothing in this repository has been applied anywhere. The whole path:

```bash
# 1. Create the project (dashboard or CLI). Note the project ref.
npx supabase projects create slop-scorer --org-id <org> --region us-east-1

# 2. Link this repo to it. The CLI stays linked to wherever it was last left, so state the ref
#    in the commit message of anything you apply.
npx supabase link --project-ref <ref>

# 3. Apply, in order, one file at a time. Every file is idempotent, so re-running is safe.
npx supabase db query --linked -f supabase/migrations/0001_gauntlet.sql
npx supabase db query --linked -f supabase/migrations/0002_notary.sql
npx supabase db query --linked -f supabase/migrations/0003_substantiation.sql

# 4. Verify RLS is actually on, rather than believing the file.
npx supabase db query --linked --query \
  "select relname, relrowsecurity from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname;"

# 5. Verify the answer key is granted to nobody.
npx supabase db query --linked --query \
  "select table_name, column_name, grantee from information_schema.column_privileges
    where table_schema = 'public' and grantee in ('anon','authenticated')
      and column_name in ('label','human_index','provenance','source');"
#    Expected: zero rows. Any row here is the gauntlet's answer key handed to a client.

# 6. Put the URL and the SERVICE ROLE key in the environment. See .env.example.
```

Two things the founder has to decide before step 1, because they are awkward to change after:

- **Region.** Every gauntlet round is a read of the whole pool, so put the project near where the web
  app runs.
- **Whether this shares a project with anything else.** It should not. `SLOP_SUPABASE_SCHEMA` exists
  so it can, but a service-role key that also reaches another product's tables is a bigger blast
  radius than a second free project.

## The migration contract

Carried over from the Lark Dating database contract, which was written by paying for the failures.
`test/migrations.test.ts` executes it: additive-only forward sections, idempotent statements, a
`-- ROLLBACK:` block naming every table the file creates, RLS enabled on every new table, an
explicit `revoke all ... from anon, authenticated` on every new table, and a comment stating the
literal allowed values of every enum-shaped CHECK.

Copy `supabase/migrations/_TEMPLATE.sql`, which is born compliant. Take MAX + 1 of the existing
numbers, never count + 1.

## RLS filters rows. Grants hide columns.

The distinction is load-bearing here, and it is the one thing to understand before editing a
migration. `gauntlet_rounds` is readable by everyone, because a player needs their round - and
`human_index` is a column of that row. No policy can hide it. What hides it is:

```sql
revoke all on public.gauntlet_rounds from anon, authenticated;
grant select (round_id, day_key, slot, seed, builder_version, artifact_ids, built_at)
  on public.gauntlet_rounds to anon, authenticated;
```

A column added to that table later and granted by reflex is a leak. The test asserts the negative:
`label`, `source`, `provenance` and `human_index` appear in no grant anywhere.

## Adapters

`InMemoryDatabase` is the reference implementation and every test above this layer runs on it.
`SupabaseDatabase` talks PostgREST over an injected `fetch`, so there is no client-library dependency
and the adapter's tests assert what goes on the wire.

Three port behaviours are load-bearing rather than stylistic, and all three are the same pattern: a
unique index arbitrates and a 23505 is a win, never a check-then-act.

- `insertRoundIfAbsent` - every player arrives in the same second when a daily puzzle rolls over.
- `insertGuessIfAbsent` - one guess per round, and the retry returns the FIRST answer.
- `appendEvents` - the one place a duplicate IS an error, because it means a forked chain.
