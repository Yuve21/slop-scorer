/**
 * The pool, built from the corpora that already exist, and the leak test that runs over the result.
 *
 * These are the real members: ten repositories pinned by SHA with named maintainers and pre-2022
 * history, five pages transcribed from a measured browser audit, four repositories and four pages a
 * generator wrote and signed, and the two synthetic generated repositories. Exactly two of the
 * twenty-five are fixtures invented here, they are named `synthetic-*`, and everything else came
 * from somebody else with its provenance attached. That matters because the discrimination rates
 * this produces are published NEXT TO the detector's scores on the same artifacts. Two numbers
 * about two different corpora are not comparable, and comparing them is the whole claim.
 *
 * The leak test is the important half of this file. It serialises a REAL round view built through
 * the real service from the real pool, and greps it for every way the answer or a person could get
 * out. It also mutation-tests itself: an injected leak must fail it, or the grep is decoration.
 */

import { describe, expect, it } from "vitest";
import { InMemoryDatabase } from "@slop/db";
import { NEGATIVE_CORPUS } from "@slop/detectors-web";
import {
  FORBIDDEN_VIEW_FIELDS,
  GauntletService,
  InsufficientPoolError,
  buildRound,
  formatCalibrationExport,
  poolDigest,
  poolRowsFromCorpus,
  presentRepo,
  presentWeb,
  roundSeed,
  summarize,
  toPoolArtifact,
} from "@slop/gauntlet";
import { CODE_CORPUS } from "../../detectors-code/test/corpus/index.js";
import { WEB_GENERATED_CORPUS } from "../../detectors-web/test/corpus/index.js";

const ADDED_AT = "2026-08-24T00:00:00.000Z";

const codePool = poolRowsFromCorpus({
  corpus: "code",
  cases: CODE_CORPUS,
  present: presentRepo,
  addedAt: ADDED_AT,
});

/**
 * The five human pages plus the four a generator made and declared.
 *
 * The generated web members matter to the GAME more than they matter to the detector: without
 * them every generated card in a round would be a repository, and "which of these is not a
 * repo" is a different puzzle from the one the prompt asks. A round is now drawn from six
 * generated repositories and four generated pages, so the medium is not the answer.
 */
const WEB_CASES = [...NEGATIVE_CORPUS, ...WEB_GENERATED_CORPUS];

const webPool = poolRowsFromCorpus({
  corpus: "web",
  cases: WEB_CASES,
  present: presentWeb,
  addedAt: ADDED_AT,
});

const allRows = [...codePool.rows, ...webPool.rows];

/** A fixed clock and counter, so a failure is reproducible on any machine. */
function runtime(startMs = Date.UTC(2026, 7, 24, 12, 0, 0)) {
  let t = startMs;
  let n = 0;
  return {
    now: () => t,
    iso: () => new Date(t).toISOString(),
    id: (prefix: string) => {
      n += 1;
      return `${prefix}_${String(n).padStart(6, "0")}`;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("the pool loads from the real corpora", () => {
  it("takes every labelled member and names anything it skips", () => {
    // The denominator. If the corpus loader silently returned nothing, every assertion below would
    // pass over an empty list.
    expect(codePool.rows.length).toBe(CODE_CORPUS.length);
    expect(webPool.rows.length).toBe(WEB_CASES.length);
    expect(codePool.skipped).toEqual([]);
    expect(webPool.skipped).toEqual([]);
    expect(allRows.length).toBeGreaterThanOrEqual(15);
  });

  it("carries a label and a checkable provenance on every member", () => {
    for (const row of allRows) {
      expect(["human", "generated"]).toContain(row.label);
      expect(row.provenance.length, `${row.artifactId} has no stated basis for its label`).toBeGreaterThan(40);
    }
  });

  it("produces a card with something on it for every member", () => {
    for (const row of allRows) {
      const card = toPoolArtifact(row).card;
      expect(card.panels.length, `${row.artifactId} presents as an empty card`).toBeGreaterThan(0);
      expect(card.panels.flatMap((p) => p.lines).join("").length).toBeGreaterThan(20);
    }
  });

  it("fills a full five-card round, with headroom, from both media", () => {
    // This assertion used to be its own inverse. The pool held fifteen human artifacts and two
    // generated ones, `buildRound(_, _, 5)` threw `InsufficientPoolError`, and the test pinned
    // the throw so the limitation could not be forgotten or papered over with a short round.
    // What moved is the generated count: four public repositories and four public pages that
    // each name their own generator, plus the two synthetic specimens.
    const pool = allRows.map(toPoolArtifact);
    const generated = pool.filter((p) => p.label === "generated");
    const humans = pool.filter((p) => p.label === "human");

    // Four decoys per round, and headroom on top so consecutive rounds are not the same four.
    expect(generated.length).toBeGreaterThanOrEqual(6);
    expect(humans.length).toBeGreaterThanOrEqual(5);

    // Balanced across media, which is a GAME property rather than a detector one: if every
    // generated card were a repository, a player could win by noticing the medium and never
    // read a card. Both media appear on both sides of the label.
    for (const label of ["human", "generated"] as const) {
      const media = new Set(pool.filter((p) => p.label === label).map((p) => p.card.medium));
      expect([...media].sort(), `every ${label} card is the same medium`).toEqual(["code", "web"]);
    }

    const seed = roundSeed({ dayKey: "2026-08-24", slot: 0, poolDigest: poolDigest(pool) });
    const round = buildRound(seed, pool, 5);
    expect(round.artifactIds.length).toBe(5);
    expect(new Set(round.artifactIds).size).toBe(5);

    // Exactly one human, and it is where the answer key says it is. A round of five whose
    // composition drifted would make every published rate a pooled average over different odds.
    const byId = new Map(pool.map((p) => [p.artifactId, p]));
    const labels = round.artifactIds.map((id) => byId.get(id)!.label);
    expect(labels.filter((l) => l === "human")).toHaveLength(1);
    expect(labels[round.humanIndex]).toBe("human");

    // Deterministic: same seed, same pool, same five and same answer.
    expect(buildRound(seed, pool, 5)).toEqual(round);
    // And still refuses rather than shortening, when the pool genuinely cannot fill one.
    expect(() => buildRound(seed, generated.slice(0, 4), 5)).toThrow(InsufficientPoolError);
  });

  it("does not draw the same five every day", () => {
    // Headroom, checked rather than asserted in a comment. Six generated members choose-four is
    // fifteen combinations; if a week of rounds were all identical the pool would be at its
    // floor again without the error that used to say so.
    const pool = allRows.map(toPoolArtifact);
    const digest = poolDigest(pool);
    const rounds = Array.from({ length: 7 }, (_, day) =>
      buildRound(roundSeed({ dayKey: `2026-09-0${day + 1}`, slot: 0, poolDigest: digest }), pool, 5),
    );
    expect(new Set(rounds.map((r) => [...r.artifactIds].sort().join("|"))).size).toBeGreaterThan(1);
  });
});

describe("no card carries an identity", () => {
  const cards = allRows.map((row) => ({ row, card: toPoolArtifact(row).card }));
  const text = (c: (typeof cards)[number]): string =>
    `${c.card.summary} ${c.card.panels.map((p) => `${p.heading} ${p.lines.join(" ")}`).join(" ")}`;

  it("contains no email address anywhere", () => {
    // Not hypothetical: `CommitRecord.authorEmail` is a real field on these exact artifacts.
    for (const c of cards) expect(text(c), `${c.row.artifactId}`).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });

  it("contains no maintainer named in its own provenance", () => {
    const names = ["Holowaychuk", "Dalton", "Sorhus", "Reitz", "Ronacher", "McLeod"];
    for (const c of cards) {
      for (const name of names) {
        expect(text(c).toLowerCase(), `${c.row.artifactId} names ${name}`).not.toContain(name.toLowerCase());
      }
    }
  });

  it("contains no url, which would identify the artifact outright", () => {
    for (const c of cards) expect(text(c), `${c.row.artifactId}`).not.toMatch(/https?:\/\//);
  });

  it("names no builder, which would be the label written on the card", () => {
    // The tell the generated members bring with them. Every one of them is labelled BECAUSE a
    // vendor signed it - a meta tag, a README heading, a runtime script host - and any of those
    // strings reaching a card would hand the player the answer key. `redactLine` does not catch
    // these for free: it strips capitalised words out of the provenance sentence, and "v0" is
    // not capitalised. So the check is explicit, and it runs over the human cards too, because
    // a human page that happened to mention a builder would be a tell pointing the other way.
    const builders = ["v0.app", "v0[bot]", "lovable", "gpteng", "gpt-engineer", "bolt.new", "vercel.app", "generator"];
    for (const c of cards) {
      for (const builder of builders) {
        expect(text(c).toLowerCase(), `${c.row.artifactId} mentions ${builder}`).not.toContain(builder);
      }
    }
  });

  it("does not separate the labels by card shape alone", () => {
    // The leak that survives redaction. If every generated card had, say, two panels and every
    // human card five, a player would never need to read one. Checked as an overlap rather than
    // as equality: the ranges must genuinely intersect, on the two dimensions a player sees
    // before reading anything.
    const shape = (label: "human" | "generated") =>
      cards.filter((c) => c.row.label === label).map((c) => c.card.panels.length);
    const human = shape("human");
    const generated = shape("generated");
    expect(human.length).toBeGreaterThan(4);
    expect(generated.length).toBeGreaterThan(4);
    expect(
      Math.min(...human) <= Math.max(...generated) && Math.min(...generated) <= Math.max(...human),
      `panel counts do not overlap: human ${human.join(",")} vs generated ${generated.join(",")}`,
    ).toBe(true);
    // And both media appear under both labels, so "it is a repo" is not "it is generated".
    for (const label of ["human", "generated"] as const) {
      const media = new Set(cards.filter((c) => c.row.label === label).map((c) => c.card.medium));
      expect([...media].sort(), `every ${label} card is one medium`).toEqual(["code", "web"]);
    }
  });

  it("would catch a name if the redactor stopped working", () => {
    // Mutation of the check itself. Without this, the three assertions above could be passing on
    // cards whose text extraction returns an empty string.
    const notRedacted = "Written by TJ Holowaychuk, tj@vision-media.ca, see https://github.com/expressjs";
    expect(notRedacted).toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    expect(notRedacted.toLowerCase()).toContain("holowaychuk");
    // And the text extractor sees real content, so the assertions above are not vacuous.
    expect(cards.every((c) => text(c).length > 40)).toBe(true);
  });
});

describe("the round view leaks nothing", () => {
  it("serialises a real view with no answer, no label and no provenance in it", async () => {
    const db = new InMemoryDatabase();
    await db.upsertArtifacts(allRows);
    const clock = runtime();
    const service = new GauntletService({
      db,
      runtime: clock,
      // The real, shipping round size. It was 3 here only because the pool could not fill 5.
      roundSize: 5,
      ticketSecret: "test-secret",
    });

    const { view } = await service.dailyRound({ participantId: "p1", dayKey: "2026-08-24" });
    const json = JSON.stringify(view);

    // 1. The answer, in every form it exists in.
    expect(json).not.toContain("humanIndex");
    expect(json).not.toContain("human_index");
    // No corpus id at all, not just the answer's: the ids read "synthetic-scaffold" and "sinatra",
    // so shipping ANY of them is shipping the round.
    for (const id of allRows.map((r) => r.artifactId)) {
      expect(json, `the view carries the corpus id ${id}`).not.toContain(id);
    }
    expect(json).not.toContain('"label"');
    for (const value of ["human", "generated"]) {
      expect(json.toLowerCase(), `the view mentions "${value}"`).not.toContain(`"${value}"`);
    }

    // 2. The provenance of every member, which is how the label is checked and therefore also how
    // it is guessed.
    for (const row of allRows) {
      expect(json).not.toContain(row.provenance);
      expect(json).not.toContain(row.source);
    }

    // 3. Every field name that could hold an identity, plus the corpus id field itself.
    for (const field of FORBIDDEN_VIEW_FIELDS) {
      expect(json, `the view has a "${field}" field`).not.toContain(`"${field}":`);
    }

    // The corpus ids are still descriptive, and one of them still says the answer out loud:
    // "synthetic-scaffold" next to "sinatra" is a solved round. The four ids added since are
    // ordinary project names on purpose, which is a weaker guarantee than the one above, not a
    // replacement for it. The loop over EVERY id is what holds, and it holds by construction:
    // the view carries hashes, so no id can be tell-shaped enough to matter.
    expect(allRows.map((r) => r.artifactId)).toContain("code:synthetic-scaffold");

    // The denominator, again: a view with no cards would satisfy all of the above.
    expect(view.cards.length).toBe(5);
    expect(view.cards.every((c) => c.panels.length > 0)).toBe(true);
    // The handles are per round, distinct, and opaque.
    expect(new Set(view.cards.map((c) => c.cardId)).size).toBe(5);
    expect(view.cards.every((c) => /^[0-9a-f]{16}$/.test(c.cardId))).toBe(true);
    expect(view.ticket.length).toBeGreaterThan(20);
  });

  it("would catch a leak if one were added", () => {
    // The scanner, pointed at a view that DOES leak. Without this the assertions above could be
    // passing on an empty string.
    const leaky = JSON.stringify({ cards: [{ artifactId: "code:express", label: "human" }], humanIndex: 2 });
    expect(leaky).toContain("humanIndex");
    expect(leaky).toContain('"label"');
    expect(FORBIDDEN_VIEW_FIELDS.some((f) => leaky.includes(`"${f}":`))).toBe(true);
    expect(FORBIDDEN_VIEW_FIELDS).toContain("artifactId");
  });
});

/**
 * The whole thing, once, against the real pool: build, serve, answer, count.
 *
 * The unit tests above each hold one seam. This walks the seam the product actually walks - a
 * five-card round drawn from twenty-five provenanced artifacts, served without its answer,
 * answered by index, graded on the server's clock, and counted into the discrimination rows the
 * published table is computed from. If the pieces fit individually and not together, this is
 * where that shows.
 */
describe("end to end, on the real pool", () => {
  it("builds a five-card round, serves it, records a guess and counts it", async () => {
    const db = new InMemoryDatabase();
    await db.upsertArtifacts(allRows);
    const clock = runtime();
    const service = new GauntletService({ db, runtime: clock, roundSize: 5, ticketSecret: "e2e-secret" });

    const { view, round } = await service.dailyRound({ participantId: "p-e2e", dayKey: "2026-08-24" });
    expect(view.cards).toHaveLength(5);
    expect(round.artifactIds).toHaveLength(5);
    expect(view.prompt.length).toBeGreaterThan(20);

    // The answer is on the server object and nowhere in the served view.
    expect(round.humanIndex).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(view)).not.toContain(String(round.artifactIds[round.humanIndex]));

    // A correct guess, submitted the only way the client can submit one: by index.
    clock.advance(4_200);
    const right = await service.submitGuess({
      participantId: "p-e2e",
      roundId: view.roundId,
      chosenIndex: round.humanIndex,
      ticket: view.ticket,
      clientReportedMs: 4_100,
    });
    expect(right.status).toBe("graded");
    if (right.status !== "graded") throw new Error("unreachable");
    expect(right.correct).toBe(true);
    expect(right.elapsedMs).toBe(4_200);
    expect(right.timingDisputed).toBe(false);
    expect(right.currentStreak).toBe(1);

    // A second player, on the same round, choosing a generated card.
    const wrongIndex = [0, 1, 2, 3, 4].find((i) => i !== round.humanIndex)!;
    const { view: view2, round: round2 } = await service.dailyRound({ participantId: "p-e2e-2", dayKey: "2026-08-24" });
    expect(round2.artifactIds).toEqual(round.artifactIds);
    clock.advance(9_000);
    const wrong = await service.submitGuess({
      participantId: "p-e2e-2",
      roundId: view2.roundId,
      chosenIndex: wrongIndex,
      ticket: view2.ticket,
    });
    expect(wrong.status).toBe("graded");
    if (wrong.status !== "graded") throw new Error("unreachable");
    expect(wrong.correct).toBe(false);

    // The counts. Five artifacts were shown twice each; the human one was the answer twice and
    // was found once. This is the raw material of the published table, and it is counts rather
    // than a rate on purpose: two trials cannot produce one.
    const rows = await db.discrimination();
    const shown = rows.filter((r) => round.artifactIds.includes(r.artifactId));
    expect(shown).toHaveLength(5);
    for (const r of shown) expect(r.timesShown, `${r.artifactId} timesShown`).toBe(2);

    const answer = rows.find((r) => r.artifactId === round.artifactIds[round.humanIndex])!;
    expect(answer.label).toBe("human");
    expect(answer.timesWasTheAnswer).toBe(2);
    expect(answer.timesAnswerFound).toBe(1);
    expect(answer.timesChosenAsHuman).toBe(1);

    const decoy = rows.find((r) => r.artifactId === round.artifactIds[wrongIndex])!;
    expect(decoy.label).toBe("generated");
    expect(decoy.timesWasTheAnswer).toBe(0);
    expect(decoy.timesChosenAsHuman).toBe(1);

    // And the summary refuses to divide, because two trials is not a measurement. The counts
    // are still published; withholding the rate is not withholding the evidence.
    const table = summarize(rows, { corpusVersion: "gauntlet-e2e", computedAt: "2026-08-24T00:00:00.000Z" });
    expect(table.overallHumanDiscrimination.rate).toBeNull();
    expect(table.overallHumanDiscrimination.interval).toBeNull();
    expect(table.artifacts.find((a) => a.artifactId === answer.artifactId)?.timesAnswerFound).toBe(1);
    // eslint-disable-next-line no-console -- the table is the point of the run
    console.log(`\n${formatCalibrationExport(table)}\n`);
  });
});
