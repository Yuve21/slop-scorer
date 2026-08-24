/**
 * The serve ticket: how "time to answer" becomes OUR measurement rather than the browser's.
 *
 * The published dataset includes a median time-to-answer per artifact, and a duration supplied by
 * the client is a duration the player can choose. The fix is not to distrust the browser and guess;
 * it is to have the server state the start time, sign it, and hand it over. The ticket is opaque to
 * the player, tamper-evident, and expires - so the elapsed figure on a stored guess is the
 * difference between two readings of one clock we own.
 *
 * It is an HMAC, not an encryption. There is nothing secret in the payload: it is a round id, a
 * participant id and a millisecond. The property required is integrity, and stretching for
 * confidentiality would add a key-management problem to buy nothing.
 *
 * WITH NO SECRET CONFIGURED, ticket issuing is disabled rather than faked. The service then grades
 * with `timingDisputed = true` and the row is excluded from every published timing figure. A
 * silently unsigned ticket would be the worst of the three options: it would look measured.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const TICKET_VERSION = 1 as const;
/** Ten minutes. A round is a few seconds of thinking; anything longer is a reopened tab. */
export const TICKET_TTL_MS = 10 * 60 * 1_000;

export interface TicketPayload {
  readonly roundId: string;
  readonly participantId: string;
  readonly servedAtMs: number;
}

export type TicketFailure = "malformed" | "bad_signature" | "expired" | "wrong_round" | "wrong_participant";

export type TicketCheck =
  | { readonly ok: true; readonly payload: TicketPayload }
  | { readonly ok: false; readonly reason: TicketFailure };

const b64url = (s: string): string => Buffer.from(s, "utf8").toString("base64url");
const unb64url = (s: string): string => Buffer.from(s, "base64url").toString("utf8");

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function issueTicket(payload: TicketPayload, secret: string): string {
  const body = b64url(
    JSON.stringify([TICKET_VERSION, payload.roundId, payload.participantId, payload.servedAtMs]),
  );
  return `${body}.${sign(body, secret)}`;
}

export function checkTicket(
  ticket: string,
  secret: string,
  expected: { readonly roundId: string; readonly participantId: string; readonly nowMs: number },
): TicketCheck {
  const [body, signature] = ticket.split(".");
  if (body === undefined || signature === undefined) return { ok: false, reason: "malformed" };

  const want = Buffer.from(sign(body, secret));
  const got = Buffer.from(signature);
  // Length-checked first: timingSafeEqual throws on a length mismatch, and a thrown comparison is a
  // different observable from a false one.
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "bad_signature" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(unb64url(body));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!Array.isArray(parsed) || parsed.length !== 4 || parsed[0] !== TICKET_VERSION) {
    return { ok: false, reason: "malformed" };
  }
  const [, roundId, participantId, servedAtMs] = parsed as [number, unknown, unknown, unknown];
  if (typeof roundId !== "string" || typeof participantId !== "string" || typeof servedAtMs !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (roundId !== expected.roundId) return { ok: false, reason: "wrong_round" };
  // A ticket is bound to the player it was issued to. Without this, one player could hand a fresh
  // ticket to another and both would post a fast time on a round they had been staring at.
  if (participantId !== expected.participantId) return { ok: false, reason: "wrong_participant" };
  if (expected.nowMs - servedAtMs > TICKET_TTL_MS || servedAtMs > expected.nowMs) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload: { roundId, participantId, servedAtMs } };
}
