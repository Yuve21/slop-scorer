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

import type { NotaryChainRow, NotaryCredentialRow, NotaryEventRow, NotaryTimestampRow } from "@slop/db";
import { checkChain, type ChainCheck } from "./chain.js";
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
  readonly recordingSummary?: string | null;
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
      if (parsed.imprintHex !== input.credential.rootSha256) {
        return {
          ...base,
          reverified: false,
          genTime: parsed.genTime,
          problem: "the token stamps a different digest than the credential's root",
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
      rootSha256: input.credential.rootSha256,
      grantedTimestamps: input.timestamps.filter((t) => t.status === "granted"),
      failedAuthorities: input.timestamps.filter((t) => t.status !== "granted").length,
      chainDefects: chain.defects.map((d) => `${d.kind} at ${d.at}`),
      recordingSummary: input.recordingSummary ?? null,
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
    recordIntact: chain.intact && rootMatches && good.length > 0 && input.credential.revokedAt === null,
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
