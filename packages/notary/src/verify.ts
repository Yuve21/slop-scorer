/**
 * Verification, performed as if by somebody who does not trust us.
 *
 * This is the half of the product that makes the other half worth anything. A credential nobody can
 * check independently is a badge, and a badge is a marketing asset with a liability attached. So
 * this module RECOMPUTES rather than reads: the chain root is rebuilt from the event fields, each
 * timestamp token is re-parsed from its stored DER and compared against that recomputed root, and
 * the statement is rebuilt from the same facts and compared byte for byte with the stored one.
 *
 * That last check is the interesting one. It catches a credential whose text was edited after
 * issue, and it also catches the subtler thing: a credential issued by an older build whose wording
 * has since changed. Those are different situations and the report distinguishes them, because
 * "this credential says something this build would no longer say" is information, not a failure.
 *
 * NOTHING HERE TOUCHES THE NETWORK. Verification runs on the stored rows, which is what a holder
 * pasting a credential into an offline checker needs, and it is also why every timestamp token is
 * stored in full rather than as a boolean.
 */

import type {
  NotaryChainRow,
  NotaryCredentialRow,
  NotaryEventRow,
  NotaryRecordingRow,
  NotaryTimestampRow,
} from "@slop/db";
import { checkChain, type ChainCheck } from "./chain.js";
import { summariseStoredRecording } from "./recording.js";
import { parseResponse } from "./tsa.js";
import { STATEMENT_VERSION, buildStatement, type CredentialFacts } from "./credential.js";

export interface TokenVerification {
  readonly authorityId: string;
  readonly jurisdiction: string;
  readonly storedStatus: string;
  /** True only if the stored DER re-parses, is granted, and stamps the recomputed root. */
  readonly reverified: boolean;
  readonly genTime: string | null;
  readonly problem: string | null;
}

export interface VerificationReport {
  readonly credentialId: string;
  readonly revoked: boolean;
  readonly revocationReason: string | null;
  readonly chain: ChainCheck;
  /** The root recomputed from the events, next to the one the credential asserts. */
  readonly rootMatches: boolean;
  readonly tokens: readonly TokenVerification[];
  readonly authoritiesReverified: number;
  readonly jurisdictionsReverified: number;
  /** null when the credential was issued by a different statement version. */
  readonly statementReproduced: boolean | null;
  readonly problems: readonly string[];
  /**
   * The bottom line, and deliberately narrow: the chain re-derives, the root matches, and at least
   * one token independently stamps it. It is NOT a statement about the artifact or its maker.
   */
  readonly recordIntact: boolean;
}

export interface VerifyInput {
  readonly credential: NotaryCredentialRow;
  readonly chain: NotaryChainRow;
  readonly events: readonly NotaryEventRow[];
  readonly timestamps: readonly NotaryTimestampRow[];
  /**
   * The stored recording rows, from which the summary sentence in the statement is REBUILT.
   *
   * Deliberately rows rather than the sentence itself: a caller who could hand in the summary
   * could hand in the one that makes a rewritten statement reproduce.
   */
  readonly recordings?: readonly NotaryRecordingRow[];
}

/**
 * The recording sentence the statement should contain, rebuilt from the stored rows.
 *
 * The last ingested recording is the one `issue()` was given, so it is the one reconstructed. A
 * chain with no recording contributes no sentence, which is the same `null` the issue path used.
 */
function recordingSummary(input: VerifyInput): string | null {
  const rows = input.recordings ?? [];
  const last = rows[rows.length - 1];
  return last === undefined ? null : summariseStoredRecording(last, input.events);
}

export function verifyCredential(input: VerifyInput): VerificationReport {
  const problems: string[] = [];
  const chain = checkChain(input.events, input.chain.rootSha256);
  const rootMatches = chain.root === input.credential.rootSha256;
  if (!rootMatches) {
    problems.push(
      `the events re-derive to ${chain.root ?? "no root"}, and the credential is about ${input.credential.rootSha256}`,
    );
  }
  for (const defect of chain.defects) problems.push(`${defect.kind} at ${defect.at}: ${defect.detail}`);

  const tokens: TokenVerification[] = input.timestamps.map((t) => {
    const base = { authorityId: t.authorityId, jurisdiction: t.jurisdiction, storedStatus: t.status };
    if (t.status !== "granted" || t.token === null) {
      return { ...base, reverified: false, genTime: null, problem: t.failureReason ?? "no token was stored" };
    }
    try {
      const parsed = parseResponse(Buffer.from(t.token, "base64"));
      if (!parsed.granted) return { ...base, reverified: false, genTime: null, problem: `PKIStatus ${parsed.pkiStatus}` };
      // Against the RECOMPUTED root, never against the credential's own assertion of it.
      //
      // This is the line the whole package rests on. Comparing the imprint to
      // `credential.rootSha256` compares a hash against the value it is meant to verify: an
      // attacker who edits an event and writes the new root onto the credential gets four tokens
      // that all still "re-verify", and the report prints "4 of 4" over a broken record. The only
      // input a verifier may trust here is one it derived itself from the event fields.
      if (chain.root === null) {
        return { ...base, reverified: false, genTime: parsed.genTime, problem: "the events re-derive to no root at all" };
      }
      if (parsed.imprintHex !== chain.root) {
        return {
          ...base,
          reverified: false,
          genTime: parsed.genTime,
          problem: "the token stamps a different digest than the root these events re-derive to",
        };
      }
      if (parsed.genTime !== t.genTime) {
        // The stored column and the token disagree. The TOKEN wins, and the disagreement is a
        // problem worth naming: it means a row was edited after the exchange.
        return {
          ...base,
          reverified: false,
          genTime: parsed.genTime,
          problem: `the stored genTime ${t.genTime ?? "null"} is not the token's ${parsed.genTime ?? "null"}`,
        };
      }
      return { ...base, reverified: true, genTime: parsed.genTime, problem: null };
    } catch (error) {
      return {
        ...base,
        reverified: false,
        genTime: null,
        problem: error instanceof Error ? error.message : "the stored token did not parse",
      };
    }
  });

  for (const token of tokens) {
    if (token.problem !== null) problems.push(`${token.authorityId}: ${token.problem}`);
  }

  const good = tokens.filter((t) => t.reverified);
  const jurisdictions = new Set(good.map((t) => t.jurisdiction));

  if (good.length !== input.credential.authorityCount) {
    problems.push(
      `the credential claims ${input.credential.authorityCount} authorities and ${good.length} re-verify`,
    );
  }

  let statementReproduced: boolean | null = null;
  if (input.credential.statementVersion === STATEMENT_VERSION) {
    const declared = input.events.map((e) => e.declaredAt).sort();
    const facts: CredentialFacts = {
      eventCount: input.events.length,
      firstDeclaredAt: declared[0] ?? null,
      lastDeclaredAt: declared[declared.length - 1] ?? null,
      // Recomputed, for the same reason the token imprint is: the statement QUOTES the root, so
      // rebuilding it from the credential's own copy would reproduce a rewritten root verbatim.
      rootSha256: chain.root ?? "",
      grantedTimestamps: input.timestamps.filter((t) => t.status === "granted"),
      failedAuthorities: input.timestamps.filter((t) => t.status !== "granted").length,
      chainDefects: chain.defects.map((d) => `${d.kind} at ${d.at}`),
      recordingSummary: recordingSummary(input),
    };
    statementReproduced = buildStatement(facts) === input.credential.statement;
    if (!statementReproduced) {
      problems.push("the stored statement is not what these facts produce, so its text was changed after issue");
    }
  }

  return {
    credentialId: input.credential.credentialId,
    revoked: input.credential.revokedAt !== null,
    revocationReason: input.credential.revocationReason,
    chain,
    rootMatches,
    tokens,
    authoritiesReverified: good.length,
    jurisdictionsReverified: jurisdictions.size,
    statementReproduced,
    problems,
    /**
     * Every tamper signal this function computed is a conjunct here.
     *
     * A bottom line that ignores two of the checks above is worse than no bottom line: it is a
     * green light printed next to a red one. `statementReproduced === false` means the text was
     * edited after issue, and a token count below the credential's own claim means a stamp it
     * asserts does not re-verify. Both were computed and both were dropped on the floor.
     */
    recordIntact:
      chain.intact &&
      rootMatches &&
      good.length > 0 &&
      good.length === input.credential.authorityCount &&
      statementReproduced !== false &&
      input.credential.revokedAt === null,
  };
}

/** Render a report. Counts and named problems, no adjectives. */
export function formatVerification(report: VerificationReport): string {
  const lines: string[] = [];
  lines.push(`VERIFICATION  credential ${report.credentialId}`);
  lines.push(`  events re-derived: ${report.chain.eventCount}`);
  lines.push(`  chain re-derives to the credential's root: ${report.rootMatches ? "yes" : "no"}`);
  lines.push(`  timestamps that re-verify: ${report.authoritiesReverified} of ${report.tokens.length}, in ${report.jurisdictionsReverified} jurisdiction(s)`);
  for (const token of report.tokens) {
    lines.push(
      `    ${token.authorityId.padEnd(12)}${token.reverified ? "ok" : "not verified"}` +
        `${token.genTime === null ? "" : `  ${token.genTime}`}${token.problem === null ? "" : `  (${token.problem})`}`,
    );
  }
  lines.push(
    `  statement reproduces from the facts: ${
      report.statementReproduced === null ? "not checked, issued under an older wording" : report.statementReproduced ? "yes" : "no"
    }`,
  );
  if (report.revoked) lines.push(`  REVOKED: ${report.revocationReason ?? "no reason recorded"}`);
  for (const problem of report.problems) lines.push(`  problem: ${problem}`);
  lines.push(
    `  This checks the RECORD only: that these steps were recorded in this order and stamped at these times.`,
  );
  return lines.join("\n");
}
