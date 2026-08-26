/**
 * The notary service: open a chain, append steps, stamp the root, issue the credential.
 *
 * The ordering is a contract, not a convenience. A credential is issued over a root that has
 * already been stamped, so there is no window in which a credential asserts a timestamp that does
 * not exist yet. Appending after issue produces a NEW root, which the old credential does not cover
 * and does not claim to - which is the honest behaviour for a record that grows.
 *
 * Everything runs against `InMemoryDatabase` and `MockTsaTransport`: no keys, no network, and the
 * fan-out's partial-failure path is exercised on every test run rather than on the day an authority
 * is down.
 */

import type {
  NotaryChainRow,
  NotaryCredentialRow,
  NotaryEventRow,
  NotaryStore,
  NotaryTimestampRow,
  Disclosure,
} from "@slop/db";
import { checkChain, leafOf, merkleRoot, type ProcessEvent } from "./chain.js";
import { issueCredentialRow } from "./credential.js";
import { stampEverywhere, type Authority, type TsaTransport } from "./tsa.js";
import { verifyCredential, type VerificationReport } from "./verify.js";
import {
  checkRecording,
  recordingToEvents,
  summariseRecording,
  type ProcessRecording,
} from "./recording.js";

export interface NotaryRuntime {
  now(): number;
  iso(): string;
  id(prefix: string): string;
}

export interface NotaryServiceOptions {
  readonly db: NotaryStore;
  readonly runtime: NotaryRuntime;
  readonly transport: TsaTransport;
  readonly authorities?: readonly Authority[];
  readonly timeoutMs?: number;
}

export interface StampSummary {
  readonly rootSha256: string;
  readonly granted: number;
  readonly failed: number;
  readonly jurisdictions: number;
  readonly rows: readonly NotaryTimestampRow[];
}

export class NotaryService {
  constructor(private readonly options: NotaryServiceOptions) {}

  async openChain(params: { readonly ownerId: string; readonly disclosure?: Disclosure; readonly subjectSha256?: string }): Promise<NotaryChainRow> {
    const { runtime } = this.options;
    return this.options.db.createChain({
      chainId: runtime.id("chn"),
      ownerId: params.ownerId,
      subjectSha256: params.subjectSha256 ?? null,
      // Private by default. A public process log is an attack surface, per the Genshin case.
      disclosure: params.disclosure ?? "private",
      rootSha256: null,
      eventCount: 0,
      createdAt: runtime.iso(),
      closedAt: null,
    });
  }

  /**
   * Append steps and return the new root.
   *
   * The leaf is computed here, from the fields as stored, including OUR `recordedAt`. A caller
   * cannot supply a leaf: if they could, the chain would attest whatever they hashed.
   */
  async append(chainId: string, events: readonly ProcessEvent[]): Promise<{ readonly root: string; readonly rows: readonly NotaryEventRow[] }> {
    if (events.length === 0) throw new RangeError("an append of nothing is not an append");
    const { db, runtime } = this.options;
    const existing = await db.listEvents(chainId);
    const recordedAt = runtime.iso();

    let prev = existing.length === 0 ? null : (existing[existing.length - 1] as NotaryEventRow).leafSha256;
    const rows: NotaryEventRow[] = [];
    events.forEach((event, i) => {
      const sequence = existing.length + i;
      const leafSha256 = leafOf({
        sequence,
        kind: event.kind,
        contentSha256: event.contentSha256,
        byteLength: event.byteLength,
        declaredAt: event.declaredAt,
        recordedAt,
        prevSha256: prev,
      });
      rows.push({
        eventId: runtime.id("evt"),
        chainId,
        sequence,
        kind: event.kind,
        contentSha256: event.contentSha256,
        byteLength: event.byteLength,
        declaredAt: event.declaredAt,
        recordedAt,
        leafSha256,
        prevSha256: prev,
        metadata: event.metadata ?? {},
      });
      prev = leafSha256;
    });

    const all = [...existing, ...rows];
    const root = merkleRoot(all.map((e) => e.leafSha256));
    if (root === null) throw new Error("a non-empty chain produced no root");
    // Throws SequenceConflictError if another writer took one of these positions. A fork is the one
    // duplicate in this system that is genuinely an error.
    await db.appendEvents(chainId, rows, root);
    return { root, rows };
  }

  /** Fan out the current root to every authority. Partial failure is recorded, never thrown. */
  async stamp(chainId: string): Promise<StampSummary> {
    const { db, runtime } = this.options;
    const events = await db.listEvents(chainId);
    const root = merkleRoot(events.map((e) => e.leafSha256));
    if (root === null) throw new Error(`chain ${chainId} has no events, so there is nothing to timestamp`);

    const results = await stampEverywhere(root, {
      transport: this.options.transport,
      ...(this.options.authorities === undefined ? {} : { authorities: this.options.authorities }),
      ...(this.options.timeoutMs === undefined ? {} : { timeoutMs: this.options.timeoutMs }),
    });

    const rows: NotaryTimestampRow[] = [];
    for (const result of results) {
      rows.push(
        await db.recordTimestamp({
          timestampId: runtime.id("tsr"),
          chainId,
          rootSha256: root,
          authorityId: result.authorityId,
          authorityUrl: result.authorityUrl,
          jurisdiction: result.jurisdiction,
          status: result.status,
          genTime: result.genTime,
          token: result.token,
          failureReason: result.failureReason,
          requestedAt: runtime.iso(),
        }),
      );
    }

    const granted = rows.filter((r) => r.status === "granted");
    return {
      rootSha256: root,
      granted: granted.length,
      failed: rows.length - granted.length,
      jurisdictions: new Set(granted.map((r) => r.jurisdiction)).size,
      rows,
    };
  }

  /**
   * Ingest a process recording: hash its frames into the chain and record what the parser could not
   * read. Returns the defects rather than swallowing them - a recording with no frames still gets
   * stored, and the credential says it attests nothing.
   */
  async ingestRecording(
    chainId: string,
    recording: ProcessRecording,
    startedAt: string,
  ): Promise<{ readonly root: string | null; readonly summary: string; readonly defects: ReturnType<typeof checkRecording> }> {
    const { db, runtime } = this.options;
    const chain = await db.getChain(chainId);
    if (chain === null) throw new Error(`chain ${chainId} does not exist`);
    const defects = checkRecording(recording, chain.subjectSha256 ?? undefined);
    const events = recordingToEvents(recording, startedAt);
    const root = events.length === 0 ? null : (await this.append(chainId, events)).root;

    await db.recordRecording({
      recordingId: runtime.id("rec"),
      chainId,
      sourceTool: recording.sourceTool,
      parserId: recording.parserId,
      frameCount: recording.frames.length,
      durationMs: recording.durationMs,
      finalFileSha256: recording.finalFileSha256,
      unparsedFields: recording.unparsedFields,
      ingestedAt: runtime.iso(),
    });

    return { root, summary: summariseRecording(recording, defects), defects };
  }

  /** Issue over the CURRENT root, with the facts as they are, including the unflattering ones. */
  async issue(chainId: string, options: { readonly recordingSummary?: string | null } = {}): Promise<NotaryCredentialRow> {
    const { db, runtime } = this.options;
    const events = await db.listEvents(chainId);
    const check = checkChain(events);
    if (check.root === null) throw new Error(`chain ${chainId} has no events, so there is nothing to attest`);
    const timestamps = await db.listTimestamps(chainId, check.root);
    const declared = events.map((e) => e.declaredAt).sort();

    let recordingSummary = options.recordingSummary ?? null;
    if (recordingSummary === undefined) recordingSummary = null;

    return db.issueCredential(
      issueCredentialRow({
        credentialId: runtime.id("crd"),
        chainId,
        issuedAt: runtime.iso(),
        eventCount: events.length,
        firstDeclaredAt: declared[0] ?? null,
        lastDeclaredAt: declared[declared.length - 1] ?? null,
        rootSha256: check.root,
        grantedTimestamps: timestamps.filter((t) => t.status === "granted"),
        failedAuthorities: timestamps.filter((t) => t.status !== "granted").length,
        chainDefects: check.defects.map((d) => `${d.kind} at ${d.at}`),
        recordingSummary,
      }),
    );
  }

  /**
   * Re-verify from the stored rows. No network, so a holder can run the same check offline.
   *
   * Every input is READ HERE, from storage. There is deliberately no parameter: a verification
   * that accepts part of the thing it is verifying is a verification the holder can pass by
   * choosing the right argument, and the recording summary used to arrive that way.
   */
  async verify(credentialId: string): Promise<VerificationReport | null> {
    const { db } = this.options;
    const credential = await db.getCredential(credentialId);
    if (credential === null) return null;
    const chain = await db.getChain(credential.chainId);
    if (chain === null) return null;
    return verifyCredential({
      credential,
      chain,
      events: await db.listEvents(credential.chainId),
      timestamps: await db.listTimestamps(credential.chainId, credential.rootSha256),
      recordings: await db.listRecordings(credential.chainId),
    });
  }
}
