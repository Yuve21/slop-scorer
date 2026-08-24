/**
 * The pool, built from the corpora that already exist, and the leak test that runs over the result.
 *
 * These are the real members: ten repositories pinned by SHA with named maintainers and pre-2022
 * history, five pages transcribed from a measured browser audit, and the two synthetic generated
 * repositories. Nothing here is a fixture invented for the game, which matters because the
 * discrimination rates this produces are published NEXT TO the detector's scores on the same
 * artifacts. Two numbers about two different corpora are not comparable, and comparing them is the
 * whole claim.
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
  poolDigest,
  poolRowsFromCorpus,
  presentRepo,
  presentWeb,
  roundSeed,
  toPoolArtifact,
} from "@slop/gauntlet";
import { CODE_CORPUS } from "../../detectors-code/test/corpus/index.js";

const ADDED_AT = "2026-08-24T00:00:00.000Z";

const codePool = poolRowsFromCorpus({
  corpus: "code",
  cases: CODE_CORPUS,
  present: presentRepo,
  addedAt: ADDED_AT,
});

const webPool = poolRowsFromCorpus({
  corpus: "web",
  cases: NEGATIVE_CORPUS,
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
    expect(webPool.rows.length).toBe(NEGATIVE_CORPUS.length);
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

  it("cannot fill a five-card round yet, and says so instead of quietly shortening one", () => {
    // A real, current limitation, pinned as a test rather than written in a README: the corpus has
    // fifteen human artifacts and two generated ones, and a five-card round needs four decoys. The
    // number that has to move before launch is the generated count, and this fails when it does -
    // at which point the round size here goes up and this assertion is deleted deliberately.
    const pool = allRows.map(toPoolArtifact);
    const generated = pool.filter((p) => p.label === "generated");
    expect(generated.length).toBeLessThan(4);
    const seed = roundSeed({ dayKey: "2026-08-24", slot: 0, poolDigest: poolDigest(pool) });
    expect(() => buildRound(seed, pool, 5)).toThrow(InsufficientPoolError);
    // Three cards it can do today.
    expect(buildRound(seed, pool, 3).artifactIds.length).toBe(3);
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
      roundSize: 3,
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

    // The denominator, again: a view with no cards would satisfy all of the above.
    expect(view.cards.length).toBe(3);
    expect(view.cards.every((c) => c.panels.length > 0)).toBe(true);
    // The handles are per round, distinct, and opaque.
    expect(new Set(view.cards.map((c) => c.cardId)).size).toBe(3);
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
