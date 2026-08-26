/**
 * The whole notary, end to end, and then attacked.
 *
 * The happy path is three lines. Everything else in this file is somebody trying to make the
 * credential say more than it should: a chain edited after issue, a token that stamps a different
 * root, a statement rewritten in the database, a recording with no frames, and an authority that
 * was down when the stamp went out.
 *
 * The test that matters most is the last kind - verification RECOMPUTES. If any of these attacks
 * survived, the credential would be a badge rather than a receipt, which is the thing this whole
 * package exists not to be.
 */

import { describe, expect, it } from "vitest";
import { InMemoryDatabase } from "@slop/db";
import type { NotaryEventRow } from "@slop/db";
import {
  DEFAULT_AUTHORITIES,
  GenericFrameSequenceParser,
  LIMITATION,
  MockOpenTimestamps,
  MockTsaTransport,
  NotaryService,
  checkChain,
  checkRecording,
  clipStudioParser,
  formatVerification,
  parserFor,
  procreateParser,
  recordingToEvents,
  sha256Hex,
  verifyCredential,
} from "@slop/notary";

function harness(behaviour: Record<string, "grant" | "reject" | "unreachable"> = {}) {
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
  const service = new NotaryService({
    db,
    runtime,
    transport: new MockTsaTransport({ behaviour, genTime: "2026-08-24T12:00:05.000Z" }),
  });
  return { db, service, runtime, advance: (ms: number) => (t += ms) };
}

const draft = (n: number, at: string) => ({
  kind: "draft" as const,
  contentSha256: sha256Hex(`draft ${n}`),
  byteLength: 1000 + n,
  declaredAt: at,
});

describe("the full path", () => {
  it("records, stamps, issues, and verifies", async () => {
    const h = harness();
    const chain = await h.service.openChain({ ownerId: "own_1" });
    await h.service.append(chain.chainId, [
      draft(1, "2026-08-20T09:00:00.000Z"),
      draft(2, "2026-08-21T10:00:00.000Z"),
      draft(3, "2026-08-22T11:30:00.000Z"),
    ]);
    const stamp = await h.service.stamp(chain.chainId);
    expect(stamp.granted).toBe(DEFAULT_AUTHORITIES.length);
    expect(stamp.jurisdictions).toBe(3);

    const credential = await h.service.issue(chain.chainId);
    expect(credential.eventCount).toBe(3);
    expect(credential.authorityCount).toBe(4);
    expect(credential.earliestGenTime).toBe("2026-08-24T12:00:05.000Z");

    const report = await h.service.verify(credential.credentialId);
    expect(report?.recordIntact).toBe(true);
    expect(report?.authoritiesReverified).toBe(4);
    expect(report?.statementReproduced).toBe(true);
    expect(report?.problems).toEqual([]);
  });

  it("says only what is provable, and always says the limitation", async () => {
    const h = harness();
    const chain = await h.service.openChain({ ownerId: "own_1" });
    await h.service.append(chain.chainId, [draft(1, "2026-08-20T09:00:00.000Z")]);
    await h.service.stamp(chain.chainId);
    const credential = await h.service.issue(chain.chainId);

    // The claim, in the register the licensing memo says it must be in.
    expect(credential.statement).toContain("We recorded 1 step of this file's history");
    expect(credential.statement).toContain("4 independent authorities");
    expect(credential.statement).toContain("3 jurisdictions");
    expect(credential.statement).toContain(LIMITATION);
    expect(credential.statement).toContain("did not check the signature");
    // And the claim it is not making.
    for (const phrase of ["verified human", "authentic", "proves", "certified", "original work"]) {
      expect(credential.statement.toLowerCase(), `the credential says ${phrase}`).not.toContain(phrase);
    }
  });

  it("counts the authorities that did not answer, rather than implying a full set", async () => {
    const h = harness({ belgium: "unreachable", dfn: "reject" });
    const chain = await h.service.openChain({ ownerId: "own_1" });
    await h.service.append(chain.chainId, [draft(1, "2026-08-20T09:00:00.000Z")]);
    const stamp = await h.service.stamp(chain.chainId);
    expect(stamp.granted).toBe(2);
    expect(stamp.failed).toBe(2);

    const credential = await h.service.issue(chain.chainId);
    expect(credential.authorityCount).toBe(2);
    expect(credential.statement).toContain("2 authorities we asked did not return a usable token");
    expect((await h.service.verify(credential.credentialId))?.recordIntact).toBe(true);
  });

  it("says plainly that an unstamped chain establishes nothing", async () => {
    const h = harness(Object.fromEntries(DEFAULT_AUTHORITIES.map((a) => [a.id, "unreachable" as const])));
    const chain = await h.service.openChain({ ownerId: "own_1" });
    await h.service.append(chain.chainId, [draft(1, "2026-08-20T09:00:00.000Z")]);
    await h.service.stamp(chain.chainId);
    const credential = await h.service.issue(chain.chainId);
    expect(credential.authorityCount).toBe(0);
    expect(credential.statement).toContain("nothing here establishes that the record existed before now");
    // And verification will not call that intact.
    expect((await h.service.verify(credential.credentialId))?.recordIntact).toBe(false);
  });

  it("refuses to attest an empty chain", async () => {
    const h = harness();
    const chain = await h.service.openChain({ ownerId: "own_1" });
    await expect(h.service.issue(chain.chainId)).rejects.toThrow(/nothing to attest/);
    await expect(h.service.stamp(chain.chainId)).rejects.toThrow(/nothing to timestamp/);
    await expect(h.service.append(chain.chainId, [])).rejects.toThrow(/append of nothing/);
  });

  it("is private by default", async () => {
    // The Genshin case: a streamed work-in-progress is an attack surface. Disclosure is opt-in.
    const h = harness();
    expect((await h.service.openChain({ ownerId: "own_1" })).disclosure).toBe("private");
    expect((await h.service.openChain({ ownerId: "own_1", disclosure: "hashes" })).disclosure).toBe("hashes");
  });
});

describe("verification catches what a stored badge would not", () => {
  const setup = async () => {
    const h = harness();
    const chain = await h.service.openChain({ ownerId: "own_1" });
    await h.service.append(chain.chainId, [
      draft(1, "2026-08-20T09:00:00.000Z"),
      draft(2, "2026-08-21T09:00:00.000Z"),
    ]);
    await h.service.stamp(chain.chainId);
    const credential = await h.service.issue(chain.chainId);
    return { h, chain, credential };
  };

  it("catches an event edited after the credential was issued", async () => {
    const { h, chain, credential } = await setup();
    const events = await h.db.listEvents(chain.chainId);
    const tampered: NotaryEventRow[] = events.map((e, i) =>
      i === 0 ? { ...e, contentSha256: sha256Hex("a different draft") } : e,
    );
    const report = verifyCredential({
      credential,
      chain: (await h.db.getChain(chain.chainId))!,
      events: tampered,
      timestamps: await h.db.listTimestamps(chain.chainId, credential.rootSha256),
    });
    expect(report.recordIntact).toBe(false);
    expect(report.rootMatches).toBe(false);
    expect(report.problems.join(" ")).toContain("leaf_mismatch");
    // And every token now fails too, because they stamp a root these events do not produce.
    expect(report.authoritiesReverified).toBe(0);
    expect(report.tokens.every((t) => !t.reverified)).toBe(true);
    expect(report.problems.join(" ")).toContain("different digest than the root these events re-derive to");
    expect(formatVerification(report)).toContain("timestamps that re-verify: 0 of 4");
    expect(report.chain.intact).toBe(false);
  });

  it("still fails when the asserted root is moved to match the tampered chain", async () => {
    // The full attack, not half of it. Editing an event alone is caught by `rootMatches`, so the
    // interesting attacker also rewrites the root the credential asserts, which is a column in the
    // same table they just edited. Now the credential is internally consistent: the events derive
    // to the root it claims. What they cannot forge is the TOKENS - four authorities stamped the
    // old root, and no rewriting of our rows changes what those tokens say.
    const { h, chain, credential } = await setup();
    const events = await h.db.listEvents(chain.chainId);
    const tampered: NotaryEventRow[] = events.map((e, i) =>
      i === 1 ? { ...e, contentSha256: sha256Hex("a draft that was never made") } : e,
    );
    const forgedRoot = checkChain(tampered).root as string;
    expect(forgedRoot).not.toBe(credential.rootSha256);

    const report = verifyCredential({
      credential: { ...credential, rootSha256: forgedRoot },
      chain: { ...(await h.db.getChain(chain.chainId))!, rootSha256: forgedRoot },
      events: tampered,
      timestamps: await h.db.listTimestamps(chain.chainId, credential.rootSha256),
    });
    // The self-consistent part of the forgery succeeds, which is exactly why it must not be what
    // the tokens are checked against.
    expect(report.rootMatches).toBe(true);
    expect(report.authoritiesReverified).toBe(0);
    expect(report.recordIntact).toBe(false);
    expect(report.problems.join(" ")).toContain("different digest than the root these events re-derive to");
    // The leaf hashes still give the edit away on their own.
    expect(report.chain.intact).toBe(false);
  });

  it("does not call a credential intact when its statement no longer follows from the facts", async () => {
    // `recordIntact` is the one boolean a caller will read. Every tamper signal this function
    // computes has to reach it, or it prints a green light next to a red one.
    const { h, chain, credential } = await setup();
    const report = verifyCredential({
      credential: { ...credential, statement: `${credential.statement} The artist drew this unaided.` },
      chain: (await h.db.getChain(chain.chainId))!,
      events: await h.db.listEvents(chain.chainId),
      timestamps: await h.db.listTimestamps(chain.chainId, credential.rootSha256),
    });
    expect(report.statementReproduced).toBe(false);
    expect(report.recordIntact).toBe(false);
  });

  it("does not call a credential intact when it claims more authorities than re-verify", async () => {
    const { h, chain, credential } = await setup();
    const timestamps = await h.db.listTimestamps(chain.chainId, credential.rootSha256);
    const report = verifyCredential({
      credential,
      chain: (await h.db.getChain(chain.chainId))!,
      events: await h.db.listEvents(chain.chainId),
      timestamps: timestamps.map((t, i) => (i === 0 ? { ...t, token: null, status: "unreachable" as const } : t)),
    });
    expect(report.authoritiesReverified).toBe(3);
    expect(report.recordIntact).toBe(false);
  });

  it("rebuilds the statement's root from the events, not from the credential's copy of it", async () => {
    // The subtler version of the same class: the statement QUOTES the root, so rebuilding it from
    // the credential's own `rootSha256` would reproduce a rewritten root verbatim and call the
    // statement untouched.
    const { h, chain, credential } = await setup();
    const forged = "ab".repeat(32);
    const report = verifyCredential({
      credential: {
        ...credential,
        rootSha256: forged,
        statement: credential.statement.replace(credential.rootSha256, forged),
      },
      chain: (await h.db.getChain(chain.chainId))!,
      events: await h.db.listEvents(chain.chainId),
      timestamps: await h.db.listTimestamps(chain.chainId, credential.rootSha256),
    });
    expect(report.statementReproduced).toBe(false);
    expect(report.recordIntact).toBe(false);
  });

  it("catches a statement rewritten in the database", async () => {
    const { h, chain, credential } = await setup();
    const report = verifyCredential({
      credential: { ...credential, statement: `${credential.statement} This work is the artist's own.` },
      chain: (await h.db.getChain(chain.chainId))!,
      events: await h.db.listEvents(chain.chainId),
      timestamps: await h.db.listTimestamps(chain.chainId, credential.rootSha256),
    });
    expect(report.statementReproduced).toBe(false);
    expect(report.problems.join(" ")).toContain("text was changed after issue");
  });

  it("catches a token swapped for one over a different root", async () => {
    const { h, chain, credential } = await setup();
    const timestamps = await h.db.listTimestamps(chain.chainId, credential.rootSha256);
    // A token from another chain entirely: valid DER, granted, wrong digest.
    const other = await harness().service.openChain({ ownerId: "own_2" });
    void other;
    const foreign = new MockTsaTransport();
    const foreignToken = (
      await foreign.post({
        authority: DEFAULT_AUTHORITIES[0]!,
        body: Buffer.from(
          (await import("@slop/notary")).buildRequest("cd".repeat(32), 1n),
        ),
        timeoutMs: 10,
      })
    ).toString("base64");

    const report = verifyCredential({
      credential,
      chain: (await h.db.getChain(chain.chainId))!,
      events: await h.db.listEvents(chain.chainId),
      timestamps: timestamps.map((t, i) => (i === 0 ? { ...t, token: foreignToken } : t)),
    });
    expect(report.tokens[0]?.reverified).toBe(false);
    expect(report.tokens[0]?.problem).toContain("different digest");
    expect(report.authoritiesReverified).toBe(3);
    expect(report.problems.join(" ")).toContain("claims 4 authorities and 3 re-verify");
  });

  it("catches a genTime edited in the row while the token says otherwise", async () => {
    const { h, chain, credential } = await setup();
    const timestamps = await h.db.listTimestamps(chain.chainId, credential.rootSha256);
    const report = verifyCredential({
      credential,
      chain: (await h.db.getChain(chain.chainId))!,
      events: await h.db.listEvents(chain.chainId),
      timestamps: timestamps.map((t, i) => (i === 0 ? { ...t, genTime: "2020-01-01T00:00:00.000Z" } : t)),
    });
    // The token wins, and the disagreement is named.
    expect(report.tokens[0]?.reverified).toBe(false);
    expect(report.tokens[0]?.genTime).toBe("2026-08-24T12:00:05.000Z");
  });

  it("reports a revoked credential as not intact, and says why", async () => {
    const { h, credential } = await setup();
    await h.db.revokeCredential(credential.credentialId, "2026-09-01T00:00:00.000Z", "the holder asked us to");
    const report = await h.service.verify(credential.credentialId);
    expect(report?.revoked).toBe(true);
    expect(report?.recordIntact).toBe(false);
    expect(formatVerification(report!)).toContain("REVOKED");
  });

  it("prints a report that names counts and problems, not adjectives", async () => {
    const { h, credential } = await setup();
    const text = formatVerification((await h.service.verify(credential.credentialId))!);
    expect(text).toContain("timestamps that re-verify: 4 of 4");
    expect(text).toContain("This checks the RECORD only");
  });

  it("does not cover events appended after issue, and does not pretend to", async () => {
    const { h, chain, credential } = await setup();
    await h.service.append(chain.chainId, [draft(3, "2026-08-25T09:00:00.000Z")]);
    const report = await h.service.verify(credential.credentialId);
    // The new root is not the credential's root, so the old credential no longer describes the
    // chain. That is the honest outcome for a record that grew: re-stamp and re-issue.
    expect(report?.rootMatches).toBe(false);
    expect(report?.recordIntact).toBe(false);
  });
});

describe("process recordings", () => {
  const frames = (n: number): Uint8Array[] => Array.from({ length: n }, (_, i) => Buffer.from(`frame ${i}`));

  it("recognises a Procreate container by its zip magic and a .clip by its SQLite header", () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]);
    const sqlite = Buffer.concat([Buffer.from("SQLite format 3\0", "binary"), Buffer.alloc(20)]);
    expect(parserFor(zip).id).toBe(procreateParser.id);
    expect(parserFor(sqlite).id).toBe(clipStudioParser.id);
    expect(parserFor(Buffer.from("something else")).id).toBe(new GenericFrameSequenceParser().id);
    expect(parserFor(undefined).id).toBe(new GenericFrameSequenceParser().id);
  });

  it("names what the minimal parser could not read", () => {
    // A recording ingested by a minimal parser must not look like one ingested by a complete parser.
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]);
    const recording = procreateParser.parse({ container: zip, frames: frames(3) });
    expect(recording.unparsedFields.length).toBeGreaterThan(0);
    expect(recording.unparsedFields.join(" ")).toContain("not extracted by this parser");
    expect(recording.finalFileSha256).toBe(sha256Hex(zip));
  });

  it("hashes frames into events and folds them into the chain", async () => {
    const h = harness();
    const chain = await h.service.openChain({ ownerId: "own_1" });
    const recording = new GenericFrameSequenceParser().parse({ frames: frames(5), frameIntervalMs: 2_000 });
    const { root, summary, defects } = await h.service.ingestRecording(
      chain.chainId,
      recording,
      "2026-08-22T08:00:00.000Z",
    );
    expect(root).not.toBeNull();
    expect(defects).toEqual([]);
    expect(summary).toContain("5 frames over 8 seconds");
    const events = await h.db.listEvents(chain.chainId);
    expect(events.length).toBe(5);
    expect(events.every((e) => e.kind === "recording-frame")).toBe(true);
    // Frame times are the client's claim and land in declaredAt, never in recordedAt.
    expect(events[1]?.declaredAt).toBe("2026-08-22T08:00:02.000Z");
    expect(events[1]?.recordedAt).toBe("2026-08-24T12:00:00.000Z");
    const stored = await h.db.listRecordings(chain.chainId);
    expect(stored[0]?.frameCount).toBe(5);
  });

  it("counts an identical repeated frame without calling it fraud", () => {
    // A pause and a cut produce the same observation, and this package cannot tell them apart. It
    // reports the count and stops there.
    const repeated = [...frames(2), Buffer.from("frame 0")];
    const recording = new GenericFrameSequenceParser().parse({ frames: repeated, frameIntervalMs: 1_000 });
    const defects = checkRecording(recording);
    expect(defects.filter((d) => d.kind === "repeated_frame").length).toBe(1);
    expect(defects.map((d) => d.detail).join(" ")).toContain("both a pause and a cut");
  });

  it("says a frameless recording attests nothing", () => {
    const empty = new GenericFrameSequenceParser().parse({ frames: [] });
    expect(checkRecording(empty).some((d) => d.kind === "no_frames")).toBe(true);
    expect(recordingToEvents(empty, "2026-08-22T08:00:00.000Z")).toEqual([]);
  });

  it("notices a container that is not the file the chain is about", () => {
    const recording = new GenericFrameSequenceParser().parse({
      container: Buffer.from("the wrong file"),
      frames: frames(2),
    });
    expect(checkRecording(recording, sha256Hex("the right file")).some((d) => d.kind === "final_file_mismatch")).toBe(
      true,
    );
  });

  it("carries the recording summary onto the credential", async () => {
    const h = harness();
    const chain = await h.service.openChain({ ownerId: "own_1" });
    const recording = new GenericFrameSequenceParser().parse({ frames: frames(4), frameIntervalMs: 1_000 });
    const { summary } = await h.service.ingestRecording(chain.chainId, recording, "2026-08-22T08:00:00.000Z");
    await h.service.stamp(chain.chainId);
    const credential = await h.service.issue(chain.chainId, { recordingSummary: summary });
    expect(credential.statement).toContain("process recording from generic-frames");
    const report = await h.service.verify(credential.credentialId);
    expect(report?.statementReproduced).toBe(true);
  });
});

describe("the OpenTimestamps anchor", () => {
  it("is additional, pending, and never fatal", async () => {
    const accepted = await new MockOpenTimestamps().submit("ab".repeat(32));
    expect(accepted.every((s) => s.pending)).toBe(true);
    expect(accepted.every((s) => s.accepted)).toBe(true);
    const failed = await new MockOpenTimestamps("fail").submit("ab".repeat(32));
    // A failure is a recorded submission with a reason, not an exception, because a credential's
    // claim rests on the RFC 3161 fan-out and never on this.
    expect(failed.every((s) => !s.accepted && s.failureReason !== null)).toBe(true);
  });
});
