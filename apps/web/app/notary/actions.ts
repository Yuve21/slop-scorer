"use server";

import type { EventKind, NotaryCredentialRow } from "@slop/db";
import { formatVerification, verifyCredential } from "@slop/notary";
import type { ProcessEvent } from "@slop/notary";
import { LIVE_STAMPING, notary, notaryDb } from "@/lib/notary/store";
import type { CredentialCard, NotaryState, VerifyState } from "./types";

/**
 * Open a chain, append the declared steps, stamp it if this build can, issue over the result.
 *
 * WHAT IS OURS AND WHAT IS THEIRS, kept apart exactly as the package keeps it. The digest, the
 * byte length and the declared time are the CLIENT's claims: the digest is computed in the
 * visitor's browser and the file never reaches this server. What is ours is `recordedAt`, the
 * leaf, the link and the root, and those are the only things the credential leans on. The page
 * says this in as many words, because a reader who thinks we hashed their file believes
 * something stronger than what happened.
 *
 * The credential text is composed by `@slop/notary` and stored verbatim. This module does not
 * write a sentence about the record, and the one thing it must never do is compose a second,
 * friendlier one alongside it.
 */

const KINDS: readonly EventKind[] = ["draft", "save", "edit", "commit", "agent-receipt", "recording-frame", "export"];
const SHA256 = /^[0-9a-f]{64}$/;

interface Step {
  readonly kind: EventKind;
  readonly contentSha256: string;
  readonly byteLength: number;
  readonly declaredAt: string;
}

/** Reject rather than coerce. A chain built out of repaired inputs attests the repair. */
function parseSteps(raw: string): { readonly steps: readonly Step[] } | { readonly error: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { error: "That is not JSON. Expected an array of steps." };
  }
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "Expected a non-empty JSON array of steps." };
  }
  if (value.length > 500) return { error: `A chain of ${value.length} steps is more than this demo accepts (500).` };

  const steps: Step[] = [];
  for (const [i, entry] of value.entries()) {
    if (typeof entry !== "object" || entry === null) return { error: `Step ${i} is not an object.` };
    const e = entry as Record<string, unknown>;
    const kind = typeof e.kind === "string" ? e.kind : "save";
    if (!KINDS.includes(kind as EventKind)) {
      return { error: `Step ${i} has kind "${kind}". Allowed: ${KINDS.join(", ")}.` };
    }
    const digest = typeof e.contentSha256 === "string" ? e.contentSha256.toLowerCase() : "";
    if (!SHA256.test(digest)) return { error: `Step ${i} needs a 64-character hex contentSha256.` };
    const bytes = typeof e.byteLength === "number" ? e.byteLength : Number.NaN;
    if (!Number.isInteger(bytes) || bytes < 0) return { error: `Step ${i} needs an integer byteLength.` };
    const declared = typeof e.declaredAt === "string" ? e.declaredAt : "";
    if (Number.isNaN(Date.parse(declared))) return { error: `Step ${i} needs an ISO 8601 declaredAt.` };
    steps.push({ kind: kind as EventKind, contentSha256: digest, byteLength: bytes, declaredAt: declared });
  }
  return { steps };
}

async function card(credential: NotaryCredentialRow): Promise<CredentialCard> {
  const db = notaryDb();
  const chain = await db.getChain(credential.chainId);
  const events = await db.listEvents(credential.chainId);
  const timestamps = await db.listTimestamps(credential.chainId, credential.rootSha256);
  const recordings = await db.listRecordings(credential.chainId);
  return {
    credentialId: credential.credentialId,
    chainId: credential.chainId,
    rootSha256: credential.rootSha256,
    statement: credential.statement,
    statementVersion: credential.statementVersion,
    eventCount: credential.eventCount,
    authorityCount: credential.authorityCount,
    jurisdictionCount: credential.jurisdictionCount,
    earliestGenTime: credential.earliestGenTime,
    issuedAt: credential.issuedAt,
    events: events.map((e) => ({
      sequence: e.sequence,
      kind: e.kind,
      contentSha256: e.contentSha256,
      byteLength: e.byteLength,
      declaredAt: e.declaredAt,
      recordedAt: e.recordedAt,
      leafSha256: e.leafSha256,
    })),
    // Everything `verifyCredential` needs and nothing it does not, so the check below can be
    // run by somebody who does not trust this server — offline, and against a different build.
    bundle: JSON.stringify({ credential, chain, events, timestamps, recordings }, null, 2),
  };
}

export async function issueCredential(_previous: NotaryState, form: FormData): Promise<NotaryState> {
  const parsed = parseSteps(String(form.get("steps") ?? ""));
  if ("error" in parsed) return { status: "refused", reason: parsed.error };

  const service = notary();
  const chain = await service.openChain({ ownerId: `web_${crypto.randomUUID()}`, disclosure: "private" });
  await service.append(
    chain.chainId,
    parsed.steps.map((s): ProcessEvent => ({
      kind: s.kind,
      contentSha256: s.contentSha256,
      byteLength: s.byteLength,
      declaredAt: s.declaredAt,
    })),
  );

  // Only when a real authority is configured. A mock stamp would make the credential assert
  // four independent authorities that never saw the root; see lib/notary/store.ts.
  if (LIVE_STAMPING) {
    try {
      await service.stamp(chain.chainId);
    } catch {
      // A fan-out that throws outright is still not fatal: the credential then states that no
      // authority stamped the chain, which is what happened.
    }
  }

  return { status: "issued", credential: await card(await service.issue(chain.chainId)) };
}

/**
 * Re-check a credential, either from a pasted bundle or from one this process issued.
 *
 * The bundle path is the one that matters: `verifyCredential` recomputes the root from the
 * event fields, re-parses every stored token against it, and rebuilds the statement from the
 * same facts to compare with the stored text. It touches no network and, on this path, no
 * database — so the check is genuinely independent of whatever issued the credential.
 */
export async function checkCredential(_previous: VerifyState, form: FormData): Promise<VerifyState> {
  const raw = String(form.get("bundle") ?? "").trim();
  if (raw.length === 0) return { status: "refused", reason: "Paste a verification bundle, or a credential id from this session." };

  if (!raw.startsWith("{")) {
    const credential = await notaryDb().getCredential(raw);
    if (credential === null) {
      return {
        status: "refused",
        reason:
          "No credential with that id is in this server's memory. Nothing is persisted here, so an " +
          "id from an earlier session will not resolve. Paste the bundle instead.",
      };
    }
    const db = notaryDb();
    const chain = await db.getChain(credential.chainId);
    if (chain === null) return { status: "refused", reason: "That credential's chain is not in memory." };
    const report = verifyCredential({
      credential,
      chain,
      events: await db.listEvents(credential.chainId),
      timestamps: await db.listTimestamps(credential.chainId, credential.rootSha256),
      recordings: await db.listRecordings(credential.chainId),
    });
    return {
      status: "checked",
      report: formatVerification(report),
      recordIntact: report.recordIntact,
      statementReproduced: report.statementReproduced,
      statement: credential.statement,
    };
  }

  let bundle: {
    credential?: unknown;
    chain?: unknown;
    events?: unknown;
    timestamps?: unknown;
    recordings?: unknown;
  };
  try {
    bundle = JSON.parse(raw) as typeof bundle;
  } catch {
    return { status: "refused", reason: "That is not JSON. Paste the bundle exactly as it was given to you." };
  }
  if (
    typeof bundle.credential !== "object" ||
    bundle.credential === null ||
    typeof bundle.chain !== "object" ||
    bundle.chain === null ||
    !Array.isArray(bundle.events) ||
    !Array.isArray(bundle.timestamps) ||
    (bundle.recordings !== undefined && !Array.isArray(bundle.recordings))
  ) {
    return { status: "refused", reason: "A bundle needs a credential, a chain, an events array and a timestamps array." };
  }

  try {
    const report = verifyCredential(bundle as Parameters<typeof verifyCredential>[0]);
    return {
      status: "checked",
      report: formatVerification(report),
      recordIntact: report.recordIntact,
      statementReproduced: report.statementReproduced,
      statement: (bundle.credential as { statement?: string }).statement ?? "",
    };
  } catch (error) {
    // A bundle that cannot be read is a refusal, not a verdict. The one thing this route must
    // never do is answer "not verified" to a question it did not manage to ask.
    return {
      status: "refused",
      reason: `That bundle could not be read: ${error instanceof Error ? error.message : "unknown error"}.`,
    };
  }
}
