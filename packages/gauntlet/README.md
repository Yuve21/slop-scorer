# @slop/gauntlet

Five artifacts, one made by a person, spot it. Daily rounds, streaks, a leaderboard.

**The game is the surface. The labels are the product.** Every competitor in this category returns a
confident number and publishes no error rate. What the gauntlet produces is the other half of a
sentence nobody else can say: *we scored this artifact X, and of the M people who saw it in a round,
N found it.* That is measured on the same provenanced corpus the detector is calibrated against, so
the two numbers are about the same artifacts and can honestly sit next to each other.

## The data model, which came first

```
gauntlet_artifacts   one row per pool member: label, source, provenance, and a redacted card
gauntlet_rounds      a deterministic draw: seed, artifact_ids, human_index
gauntlet_guesses     THE DATASET. artifact, choice, correctness, server-measured time-to-answer
gauntlet_artifact_discrimination   counts per artifact, never rates
```

`summarize()` turns those counts into `CalibrationExport`: per artifact, how often people found it
when it was the answer (human members) and how often it was mistaken for the answer (generated
members), each with a Wilson 95% interval, and a pooled figure. `formatCalibrationExport()` prints
the table that goes on the accuracy page. `toSubstantiationRun()` packages it as a row for
`substantiation_runs`, unpublished, because a row is evidence and a published row is a claim.

Three rules are enforced rather than remembered:

- **No rate under `MINIMUM_SAMPLE` (30).** Counts are still published; the rate is `null` and the
  formatter prints "not computed". A rate over eleven guesses is the shape of claim the FTC's
  *In re Workado* order was about.
- **Every rate ships with an interval.** Wilson, because the normal approximation is worst exactly
  where this data lives.
- **Timing figures come only from server-measured rows.** A guess whose client-reported duration
  disagreed with ours counts for correctness and is excluded from any timing figure.

## Anti-gaming

| Attack | Control |
|---|---|
| Read the answer off the wire | `RoundView` is built by naming fields. `label` and `human_index` are column-revoked in SQL. A test serialises a real view and greps it. |
| Recognise the artifact id | Cards carry a per-round hash, not the corpus id. The leak test caught this: `code:synthetic-scaffold` next to `code:sinatra` is a solved round. |
| Recognise the project or its author | Every card line goes through `redactAndTrim`. The presenters never touch commit history, which carries author emails. |
| Resubmit until correct | Unique `(round_id, participant_id)`. A retry returns the FIRST answer and is not an error. |
| Write your own `correct = true` | No INSERT policy on `gauntlet_guesses`. Grading is server-side only. |
| Probe by submitting garbage | The rate-limit bump happens before the round is even looked up, so a malformed submission still spends quota. |
| Fake a fast time | The serve time comes back in an HMAC ticket bound to the round AND the player. |
| Claim a round was rigged | `roundSeed` + a pool snapshot rebuilds the exact draw and the exact answer. |

## Wiring it into `apps/web`

Not done here: `apps/web` belongs to another agent this session. The routes below are what it needs,
and the service is complete behind them.

```ts
// app/(gauntlet)/gauntlet/page.tsx — server component
const service = new GauntletService({
  db,                                  // SupabaseDatabase, service-role, server only
  runtime: { now: Date.now, iso: () => new Date().toISOString(), id: (p) => `${p}_${randomUUID()}` },
  ticketSecret: process.env.SLOP_GAUNTLET_TICKET_SECRET ?? null,
});
const { view } = await service.dailyRound({ participantId });   // NEVER pass `round` to the client
```

```ts
// app/(gauntlet)/api/guess/route.ts — POST { roundId, chosenIndex, ticket, clientReportedMs }
const outcome = await service.submitGuess({ participantId, ...body });
return Response.json(outcome);   // a six-arm union; the client switches on `status`
```

Three rules for whoever builds the UI:

1. **Pass `view`, never `round`.** The `GauntletRoundRow` carries `humanIndex`. A server component
   that spreads it into props has shipped the answer, and no amount of CSS hides it.
2. **Guesses are submitted by INDEX**, not by `cardId`. The handle is for React keys.
3. **Cards are panels of short lines** (`summary` plus `panels[].heading` and `.lines`). Per
   `design/SURFACES.md`, one motion moment per view: the reveal, and nothing else.

Seeding the pool is a script, not a route:

```ts
const { rows } = poolRowsFromCorpus({ corpus: "code", cases: CODE_CORPUS, present: presentRepo, addedAt });
await db.upsertArtifacts(rows);   // idempotent by artifactId
```

## The blocker before launch, pinned as a test

The corpus has **fifteen human artifacts and two generated ones**. A five-card round needs four
decoys, so today the pool can only fill a three-card round, and `buildRound` throws
`InsufficientPoolError` rather than quietly shortening one (a short round changes the odds, and
rates pooled across different odds are not comparable). `test/corpus.test.ts` asserts the shortfall
so the day it stops being true, the test fails and the round size goes up deliberately.

**What has to move: at least two more provenanced GENERATED artifacts.** They are the scarce side.
