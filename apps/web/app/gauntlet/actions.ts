"use server";

import { cookies } from "next/headers";
import type { Report } from "@slop/core";
import { cardHandle } from "@slop/gauntlet";
import { gauntlet, gauntletDb, isParticipantId, poolEntry } from "@/lib/gauntlet/store";
import { PARTICIPANT_COOKIE, receiptHref } from "./links";
import type { DetectorSummary, GuessState, RevealCard } from "./types";

/**
 * The only write on this route, and the only place a label is read.
 *
 * ORDER MATTERS AND IT IS THE PACKAGE'S ORDER, not ours: the service rate-limits before it
 * validates, grades against a row the browser cannot read, and arbitrates one-guess-per-round
 * with a unique index rather than a prior read. This action adds nothing to that. What it adds
 * is the reveal, and the reveal is built AFTER a `graded` or `already_answered` outcome and
 * from nowhere else.
 *
 * The participant id arrives in a cookie, or in the form when the visitor had no cookie yet
 * (a Server Component cannot set one during render). It is checked against a uuid shape and
 * replaced if it is anything else. It is not a credential and nothing is protected by it: with
 * no persistence there is nothing to protect, and the page says so. What it does buy is that
 * "you already answered this round" survives a reload.
 */

/** One artifact's reading, from the run frozen into the pool snapshot. Real, not asserted. */
function summarise(report: Report, elapsedMs: number): DetectorSummary {
  const lines = report.receipt.lines;
  const signals = lines.filter((l) => l.polarity === "signal");
  return {
    status: report.status,
    score: report.score,
    bandLabel: report.bandLabel,
    corpusVersion: report.corpusVersion,
    findingCount: signals.length,
    counterCount: lines.length - signals.length,
    elapsedMs,
    top: [...signals]
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .map((l) => ({ ruleId: l.ruleId, title: l.title, points: l.points })),
  };
}

export async function submitGuess(_previous: GuessState, form: FormData): Promise<GuessState> {
  const roundId = String(form.get("roundId") ?? "");
  const chosenIndex = Number(form.get("chosenIndex"));
  const ticket = String(form.get("ticket") ?? "");
  const jar = await cookies();

  const fromForm = String(form.get("participantId") ?? "");
  const fromCookie = jar.get(PARTICIPANT_COOKIE)?.value;
  const participantId = isParticipantId(fromCookie)
    ? fromCookie
    : isParticipantId(fromForm)
      ? fromForm
      : null;
  if (participantId === null) {
    return { status: "refused", reason: "This round was served to a different session. Reload and play it again." };
  }
  if (fromCookie !== participantId) {
    jar.set(PARTICIPANT_COOKIE, participantId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/gauntlet",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  const service = await gauntlet();
  const outcome = await service.submitGuess({ participantId, roundId, chosenIndex, ticket });

  if (outcome.status === "rate_limited") {
    return {
      status: "refused",
      reason: `${outcome.count} submissions in ${outcome.windowMs / 1000} seconds is over the limit of ${outcome.limit}. Wait a minute.`,
    };
  }
  if (outcome.status === "unknown_round") {
    return { status: "refused", reason: "That round is no longer in this server's memory. Reload for today's." };
  }
  if (outcome.status === "out_of_range") {
    return { status: "refused", reason: `A round has ${outcome.size} cards and that was not one of them.` };
  }
  if (outcome.status === "bad_ticket") {
    return { status: "refused", reason: `The serve ticket did not check out (${outcome.reason}). Reload the round.` };
  }

  // Graded. Only now does the answer key come out, and it comes out for every card at once:
  // a reveal that showed only the answer would teach nothing about the four decoys.
  const db = await gauntletDb();
  const round = await db.getRound(roundId);
  if (round === null) {
    return { status: "refused", reason: "That round is no longer in this server's memory. Reload for today's." };
  }

  const cards: RevealCard[] = round.artifactIds.map((artifactId, position) => {
    const entry = poolEntry(artifactId);
    if (entry === null) throw new Error(`round ${roundId} names ${artifactId}, which is not in the pool snapshot`);
    return {
      cardId: cardHandle(roundId, artifactId),
      position,
      artifactId,
      label: entry.label === "human" ? "human" : "generated",
      source: entry.source,
      provenance: entry.provenance,
      captureDate: entry.captureDate,
      detector: summarise(entry.report, entry.elapsedMs),
      receiptHref: receiptHref(artifactId),
      chosen: artifactId === outcome.chosenArtifactId,
      isAnswer: artifactId === outcome.humanArtifactId,
    };
  });

  return {
    status: "revealed",
    correct: outcome.correct,
    replayed: outcome.status === "already_answered",
    currentStreak: outcome.status === "graded" ? outcome.currentStreak : null,
    longestStreak: outcome.status === "graded" ? outcome.longestStreak : null,
    cards,
  };
}
