/**
 * The service, exercised on the paths that only exist because somebody will attack them.
 *
 * Every test below is a specific way the labeling dataset gets poisoned, not a way the game breaks:
 * a resubmitted guess, a borrowed ticket, a probe that submits garbage to find the answer index by
 * elimination, a browser reporting whatever duration it likes. The game surviving these is a
 * feature; the DATASET surviving them is the product.
 */

import { describe, expect, it } from "vitest";
import { InMemoryDatabase } from "@slop/db";
import type { GauntletArtifactRow } from "@slop/db";
import {
  DEFAULT_RATE_LIMIT,
  GauntletService,
  PRESENTATION_VERSION,
  TICKET_TTL_MS,
  checkTicket,
  issueTicket,
} from "@slop/gauntlet";

const SECRET = "not-a-real-secret";

const artifact = (id: string, label: "human" | "generated"): GauntletArtifactRow => ({
  artifactId: id,
  corpus: "test",
  label,
  source: `source of ${id}`,
  provenance: `A provenance sentence long enough to satisfy the length constraint on the column for ${id}.`,
  presentation: {
    artifactId: id,
    medium: "code",
    summary: `${id} summary`,
    panels: [{ heading: "Files", lines: [`${id}.ts  40 lines`] }],
    presentationVersion: PRESENTATION_VERSION,
  },
  captureDate: "2026-08-24",
  retiredAt: null,
  addedAt: "2026-08-24T00:00:00.000Z",
});

function harness(options: { ticketSecret?: string | null } = {}) {
  let t = Date.UTC(2026, 7, 24, 12, 0, 0);
  let n = 0;
  const runtime = {
    now: () => t,
    iso: () => new Date(t).toISOString(),
    id: (prefix: string) => {
      n += 1;
      return `${prefix}_${String(n).padStart(6, "0")}`;
    },
  };
  const db = new InMemoryDatabase({ nowIso: runtime.iso });
  const service = new GauntletService({
    db,
    runtime,
    roundSize: 5,
    ticketSecret: options.ticketSecret === undefined ? SECRET : options.ticketSecret,
  });
  const seed = async (): Promise<void> => {
    await db.upsertArtifacts([
      artifact("h1", "human"),
      artifact("h2", "human"),
      ...Array.from({ length: 8 }, (_, i) => artifact(`g${i}`, "generated")),
    ]);
  };
  return { db, service, seed, advance: (ms: number) => (t += ms), now: () => t };
}

describe("serving a round", () => {
  it("builds today's round once and reads the winner on every later call", async () => {
    const h = harness();
    await h.seed();
    const first = await h.service.dailyRound({ participantId: "p1" });
    const second = await h.service.dailyRound({ participantId: "p2" });
    expect(second.round.roundId).toBe(first.round.roundId);
    expect(second.view.cards.map((c) => c.summary)).toEqual(first.view.cards.map((c) => c.summary));
    // The handles are per round, so two players on the same round see the same ones.
    expect(second.view.cards.map((c) => c.cardId)).toEqual(first.view.cards.map((c) => c.cardId));
  });

  it("issues a ticket bound to the round and the player", async () => {
    const h = harness();
    await h.seed();
    const { round, view } = await h.service.dailyRound({ participantId: "p1" });
    const check = checkTicket(view.ticket, SECRET, { roundId: round.roundId, participantId: "p1", nowMs: h.now() });
    expect(check.ok).toBe(true);
    // Not transferable: handing a fresh ticket to another player must not post them a fast time.
    expect(checkTicket(view.ticket, SECRET, { roundId: round.roundId, participantId: "p2", nowMs: h.now() })).toEqual({
      ok: false,
      reason: "wrong_participant",
    });
  });

  it("issues no ticket when no secret is configured, rather than an unsigned one", async () => {
    const h = harness({ ticketSecret: null });
    await h.seed();
    const { view } = await h.service.dailyRound({ participantId: "p1" });
    expect(view.ticket).toBe("");
  });
});

describe("submitting a guess", () => {
  const play = async (h: ReturnType<typeof harness>, chosen: (humanIndex: number) => number) => {
    const { round, view } = await h.service.dailyRound({ participantId: "p1" });
    h.advance(4_000);
    return {
      round,
      outcome: await h.service.submitGuess({
        participantId: "p1",
        roundId: round.roundId,
        chosenIndex: chosen(round.humanIndex),
        ticket: view.ticket,
        clientReportedMs: 4_000,
      }),
    };
  };

  it("grades against the stored answer and measures elapsed on our clock", async () => {
    const h = harness();
    await h.seed();
    const { outcome } = await play(h, (i) => i);
    expect(outcome.status).toBe("graded");
    if (outcome.status !== "graded") return;
    expect(outcome.correct).toBe(true);
    expect(outcome.elapsedMs).toBe(4_000);
    expect(outcome.timingDisputed).toBe(false);
    expect(outcome.currentStreak).toBe(1);
  });

  it("keeps the first answer when the same player submits again", async () => {
    const h = harness();
    await h.seed();
    const { round, outcome } = await play(h, (i) => (i + 1) % 5);
    expect(outcome.status).toBe("graded");
    const second = await h.service.submitGuess({
      participantId: "p1",
      roundId: round.roundId,
      chosenIndex: round.humanIndex,
      ticket: issueTicket({ roundId: round.roundId, participantId: "p1", servedAtMs: h.now() }, SECRET),
    });
    expect(second.status).toBe("already_answered");
    if (second.status !== "already_answered") return;
    expect(second.correct, "the retry rewrote the stored answer").toBe(false);
    expect((await h.db.guessesForRound(round.roundId)).length).toBe(1);
    // And the streak was counted once.
    expect((await h.db.getParticipant("p1"))?.roundsPlayed).toBe(1);
  });

  it("refuses a forged, borrowed, expired or missing ticket", async () => {
    const h = harness();
    await h.seed();
    const { round, view } = await h.service.dailyRound({ participantId: "p1" });
    const submit = (ticket: string, participantId = "p1") =>
      h.service.submitGuess({ participantId, roundId: round.roundId, chosenIndex: 0, ticket });

    expect(await submit("")).toEqual({ status: "bad_ticket", reason: "malformed" });
    expect(await submit(`${view.ticket}x`)).toEqual({ status: "bad_ticket", reason: "bad_signature" });
    expect((await submit(view.ticket, "p2")).status).toBe("bad_ticket");
    h.advance(TICKET_TTL_MS + 1_000);
    expect(await submit(view.ticket)).toEqual({ status: "bad_ticket", reason: "expired" });
    // Nothing was stored by any of them.
    expect((await h.db.guessesForRound(round.roundId)).length).toBe(0);
  });

  it("marks the row disputed and stores it anyway when timing is not measurable", async () => {
    const h = harness({ ticketSecret: null });
    await h.seed();
    const { round } = await h.service.dailyRound({ participantId: "p1" });
    const outcome = await h.service.submitGuess({
      participantId: "p1",
      roundId: round.roundId,
      chosenIndex: round.humanIndex,
      clientReportedMs: 900,
    });
    expect(outcome.status).toBe("graded");
    if (outcome.status !== "graded") return;
    // The correctness is still good data. Only the duration is untrustworthy, and it says so.
    expect(outcome.correct).toBe(true);
    expect(outcome.timingDisputed).toBe(true);
  });

  it("marks a row disputed when the browser's stopwatch disagrees with ours", async () => {
    const h = harness();
    await h.seed();
    const { round, view } = await h.service.dailyRound({ participantId: "p1" });
    h.advance(30_000);
    const outcome = await h.service.submitGuess({
      participantId: "p1",
      roundId: round.roundId,
      chosenIndex: round.humanIndex,
      ticket: view.ticket,
      clientReportedMs: 800,
    });
    if (outcome.status !== "graded") throw new Error(outcome.status);
    expect(outcome.elapsedMs).toBe(30_000);
    expect(outcome.timingDisputed).toBe(true);
  });

  it("rejects an index outside the round without revealing anything", async () => {
    const h = harness();
    await h.seed();
    const { round, view } = await h.service.dailyRound({ participantId: "p1" });
    for (const bad of [-1, 5, 1.5, Number.NaN]) {
      expect(
        await h.service.submitGuess({ participantId: "p1", roundId: round.roundId, chosenIndex: bad, ticket: view.ticket }),
      ).toEqual({ status: "out_of_range", size: 5 });
    }
  });

  it("does not say whether an unknown round exists", async () => {
    const h = harness();
    await h.seed();
    expect(await h.service.submitGuess({ participantId: "p1", roundId: "rnd_nope", chosenIndex: 0 })).toEqual({
      status: "unknown_round",
    });
  });

  it("spends rate-limit quota on malformed submissions too", async () => {
    // The probe this stops: fire submissions at every index with a junk ticket and watch which one
    // behaves differently. It costs quota whether or not the request was well formed, because the
    // bump happens before the round is even loaded.
    const h = harness();
    await h.seed();
    const { round } = await h.service.dailyRound({ participantId: "p1" });
    let limited = 0;
    for (let i = 0; i < DEFAULT_RATE_LIMIT.limit + 5; i += 1) {
      const outcome = await h.service.submitGuess({
        participantId: "p1",
        roundId: round.roundId,
        chosenIndex: 99,
        ticket: "garbage",
      });
      if (outcome.status === "rate_limited") limited += 1;
    }
    expect(limited).toBe(5);
  });

  it("gives a fresh window a fresh quota", async () => {
    const h = harness();
    await h.seed();
    const { round } = await h.service.dailyRound({ participantId: "p1" });
    for (let i = 0; i < DEFAULT_RATE_LIMIT.limit; i += 1) {
      await h.service.submitGuess({ participantId: "p1", roundId: round.roundId, chosenIndex: 99 });
    }
    expect((await h.service.submitGuess({ participantId: "p1", roundId: round.roundId, chosenIndex: 99 })).status).toBe(
      "rate_limited",
    );
    h.advance(DEFAULT_RATE_LIMIT.windowMs);
    expect((await h.service.submitGuess({ participantId: "p1", roundId: round.roundId, chosenIndex: 99 })).status).toBe(
      "out_of_range",
    );
  });
});

describe("the leaderboard", () => {
  it("shows an alias or nothing, never an account", async () => {
    const h = harness();
    await h.seed();
    await h.db.ensureParticipant("p1", "corvid");
    await h.db.ensureParticipant("p2");
    await h.db.recordPlay("p1", "2026-08-24", true);
    const board = await h.service.leaderboard();
    expect(board[0]?.alias).toBe("corvid");
    expect(board.map((r) => r.alias)).toContain("anonymous");
    const json = JSON.stringify(board);
    expect(json).not.toContain("p1");
    expect(json).not.toContain("participantId");
  });
});
