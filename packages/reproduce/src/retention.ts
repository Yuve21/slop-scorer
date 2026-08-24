/**
 * Ephemeral by default, with a delete path that follows derivation.
 *
 * Two separate reasons this is architecture and not housekeeping:
 *
 *  1. STORAGE IS LIABILITY THAT ACCRUES DAILY. The recreation is plausibly our own reproduction
 *     rather than material stored at a user's direction, which is the reading that puts it outside
 *     the safe harbour everyone assumes covers it. So the design is to never need the harbour:
 *     hold nothing, briefly. Anything we do hold is also discoverable in somebody else's
 *     litigation - there is already a protocol for compelling production of individual users'
 *     prompts and outputs from a model vendor.
 *
 *  2. PARTIAL TAKEDOWN COMPLIANCE IS WORSE THAN NONE. Removing an upload and leaving the
 *     recreation, the composed figure and the export behind produces a record showing we were
 *     told, acted, and the material stayed up. So every record carries `derivedFrom`, and
 *     `deleteOnNotice` walks that edge transitively. The derivation link is the whole point of the
 *     store; the TTL is the easy part.
 *
 * Retention beyond the default is possible, but it is explicit, time-boxed, and recorded with a
 * reason and an actor. There is no "keep forever" and no silent extension.
 */

export type RecordKind = "upload" | "prompt" | "recreation" | "figure" | "export";

export interface StoredRecord<T = unknown> {
  readonly id: string;
  readonly kind: RecordKind;
  /** The record this one was derived from. The takedown edge. */
  readonly derivedFrom: string | null;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly value: T;
}

export interface RetentionGrant {
  readonly recordId: string;
  readonly untilMs: number;
  readonly reason: string;
  /** Who asked. A retention with no requester is not an explicit retention. */
  readonly actor: string;
  readonly grantedAtMs: number;
}

export interface DeletionEvent {
  readonly atMs: number;
  readonly rootId: string;
  readonly deletedIds: readonly string[];
  readonly reason: string;
}

/** Fifteen minutes. Long enough to render and export, short enough to be worth nothing to a subpoena. */
export const DEFAULT_TTL_MS = 15 * 60 * 1_000;
/** A retention grant may not exceed this. Time-boxed means bounded, not "a date somebody typed". */
export const MAX_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export class EphemeralStore {
  private readonly records = new Map<string, StoredRecord>();
  private readonly grants: RetentionGrant[] = [];
  private readonly deletions: DeletionEvent[] = [];

  constructor(private readonly defaultTtlMs: number = DEFAULT_TTL_MS) {}

  put<T>(params: {
    readonly id: string;
    readonly kind: RecordKind;
    readonly value: T;
    readonly nowMs: number;
    readonly derivedFrom?: string | null;
    readonly ttlMs?: number;
  }): StoredRecord<T> {
    const derivedFrom = params.derivedFrom ?? null;
    if (derivedFrom !== null && !this.records.has(derivedFrom)) {
      // A dangling derivation link is a takedown that will miss something later.
      throw new Error(
        `cannot store "${params.id}": it declares derivedFrom "${derivedFrom}", which is not in the store, so a deletion of the parent would never reach it`,
      );
    }
    const record: StoredRecord<T> = {
      id: params.id,
      kind: params.kind,
      derivedFrom,
      createdAtMs: params.nowMs,
      expiresAtMs: params.nowMs + (params.ttlMs ?? this.defaultTtlMs),
      value: params.value,
    };
    this.records.set(record.id, record);
    return record;
  }

  get<T>(id: string, nowMs: number): StoredRecord<T> | undefined {
    const record = this.records.get(id);
    if (record === undefined) return undefined;
    if (record.expiresAtMs <= nowMs) {
      this.records.delete(id);
      return undefined;
    }
    return record as StoredRecord<T>;
  }

  /** Drop everything past its expiry. Returns the ids, so a caller can log the sweep. */
  sweep(nowMs: number): readonly string[] {
    const dropped: string[] = [];
    for (const [id, record] of this.records) {
      if (record.expiresAtMs <= nowMs) {
        this.records.delete(id);
        dropped.push(id);
      }
    }
    return dropped.sort();
  }

  /**
   * Extend one record's life, on the record.
   *
   * Explicit, time-boxed, recorded. Note that it does NOT cascade to derived records: keeping an
   * upload does not keep the recreation. Opting into retention has to be per artifact or it is
   * not really opting in.
   */
  retain(params: {
    readonly recordId: string;
    readonly untilMs: number;
    readonly reason: string;
    readonly actor: string;
    readonly nowMs: number;
  }): RetentionGrant {
    const record = this.records.get(params.recordId);
    if (record === undefined) throw new Error(`cannot retain unknown record "${params.recordId}"`);
    if (params.untilMs <= params.nowMs) throw new Error("a retention grant must end in the future");
    if (params.untilMs - params.nowMs > MAX_RETENTION_MS) {
      throw new Error(`a retention grant may not exceed ${MAX_RETENTION_MS} ms`);
    }
    if (params.reason.trim().length === 0 || params.actor.trim().length === 0) {
      throw new Error("a retention grant needs both a reason and an actor");
    }
    this.records.set(params.recordId, { ...record, expiresAtMs: params.untilMs });
    const grant: RetentionGrant = {
      recordId: params.recordId,
      untilMs: params.untilMs,
      reason: params.reason,
      actor: params.actor,
      grantedAtMs: params.nowMs,
    };
    this.grants.push(grant);
    return grant;
  }

  /**
   * Hard delete on notice: the record and everything derived from it, transitively.
   *
   * Returns the full list of what went, because the deletion event is the compliance artifact.
   */
  deleteOnNotice(rootId: string, nowMs: number, reason = "notice"): DeletionEvent {
    const doomed = new Set<string>();
    const queue = [rootId];
    while (queue.length > 0) {
      const id = queue.pop() as string;
      if (doomed.has(id)) continue;
      doomed.add(id);
      for (const record of this.records.values()) {
        if (record.derivedFrom === id && !doomed.has(record.id)) queue.push(record.id);
      }
    }
    const deletedIds: string[] = [];
    for (const id of doomed) {
      if (this.records.delete(id)) deletedIds.push(id);
    }
    const event: DeletionEvent = { atMs: nowMs, rootId, deletedIds: deletedIds.sort(), reason };
    this.deletions.push(event);
    return event;
  }

  /** Everything still held. Used by tests and by an operator answering "what do you have on me". */
  ids(): readonly string[] {
    return [...this.records.keys()].sort();
  }

  retentionGrants(): readonly RetentionGrant[] {
    return this.grants;
  }

  deletionLog(): readonly DeletionEvent[] {
    return this.deletions;
  }
}
