/**
 * The Supabase adapter, over PostgREST, with `fetch` injected.
 *
 * WHY NOT `@supabase/supabase-js`
 *
 * The client library is a dependency, a bundle, and a moving API surface, and everything this port
 * needs is six HTTP verbs against PostgREST plus two RPCs. Injecting `fetch` also makes the adapter
 * testable the way the rest of this repository is testable: a fake fetch asserts the exact request
 * shape, so the tests prove what goes on the wire rather than that a mock was called. There is no
 * network and no key in the suite.
 *
 * THE ONE BEHAVIOUR WORTH READING CAREFULLY
 *
 * A duplicate insert is not an error here. `insertRoundIfAbsent` and `insertGuessIfAbsent` send
 * `Prefer: resolution=ignore-duplicates,return=representation`, which returns an EMPTY body when
 * the row was already there, and the adapter then reads the winner. That is the whole
 * atomic-transitions pattern in one exchange: the unique index arbitrates, 23505 is a win, and no
 * caller ever performs a check-then-act. The alternative - select, then insert if absent - loses a
 * race every single day at the moment a daily puzzle rolls over.
 */

import type {
  DiscriminationRow,
  GauntletArtifactRow,
  GauntletGuessRow,
  GauntletParticipantRow,
  GauntletRoundRow,
  NotaryChainRow,
  NotaryCredentialRow,
  NotaryEventRow,
  NotaryRecordingRow,
  NotaryTimestampRow,
  SubstantiationKind,
  SubstantiationRunRow,
} from "./rows.js";
import { SequenceConflictError, type SlopDatabase } from "./port.js";
import type { SupabaseEnv } from "./env.js";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const snake = (s: string): string => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (s: string): string => s.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

const toRow = <T>(o: Record<string, unknown>): T =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [camel(k), v])) as T;
const toColumns = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [snake(k), v]));

/** PostgREST surfaces the Postgres SQLSTATE. 23505 is unique_violation; 23P01 is exclusion. */
const UNIQUE_VIOLATION = "23505";

export class PostgrestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly detail: string,
    readonly table: string,
  ) {
    // The message carries the table and the SQLSTATE and NOTHING from the request body: a failed
    // insert whose error text quotes the row is a log line that leaks the row.
    super(`postgrest ${status} on ${table}${code === null ? "" : ` (${code})`}: ${detail}`);
    this.name = "PostgrestError";
  }
}

interface RequestOptions {
  readonly method: "GET" | "POST" | "PATCH";
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly prefer?: readonly string[];
}

export interface PostgrestOptions {
  readonly env: SupabaseEnv;
  readonly fetch: FetchLike;
}

export class SupabaseDatabase implements SlopDatabase {
  constructor(private readonly options: PostgrestOptions) {}

  private async request<T>(table: string, o: RequestOptions): Promise<T[]> {
    const { env, fetch } = this.options;
    const qs = new URLSearchParams(o.query ?? {}).toString();
    const url = `${env.url}/rest/v1/${o.path}${qs === "" ? "" : `?${qs}`}`;
    const headers: Record<string, string> = {
      apikey: env.serviceRoleKey,
      authorization: `Bearer ${env.serviceRoleKey}`,
      "content-type": "application/json",
      "accept-profile": env.schema,
      "content-profile": env.schema,
    };
    if (o.prefer !== undefined && o.prefer.length > 0) headers.prefer = o.prefer.join(",");
    const init: RequestInit = { method: o.method, headers };
    if (o.body !== undefined) init.body = JSON.stringify(o.body);
    const res = await fetch(url, init);
    const text = await res.text();
    if (!res.ok) {
      let code: string | null = null;
      let detail = `${res.status}`;
      try {
        const parsed = JSON.parse(text) as { code?: string; message?: string };
        code = parsed.code ?? null;
        detail = parsed.message ?? detail;
      } catch {
        detail = "response body was not JSON";
      }
      throw new PostgrestError(res.status, code, detail, table);
    }
    if (text.trim() === "") return [];
    const parsed = JSON.parse(text) as unknown;
    return (Array.isArray(parsed) ? parsed : [parsed]) as T[];
  }

  private async select<T>(table: string, query: Readonly<Record<string, string>>): Promise<T[]> {
    const raw = await this.request<Record<string, unknown>>(table, { method: "GET", path: table, query });
    return raw.map((r) => toRow<T>(r));
  }

  private async insert<T>(
    table: string,
    rows: readonly Record<string, unknown>[],
    prefer: readonly string[],
  ): Promise<T[]> {
    const raw = await this.request<Record<string, unknown>>(table, {
      method: "POST",
      path: table,
      body: rows.map(toColumns),
      prefer,
    });
    return raw.map((r) => toRow<T>(r));
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
    const raw = await this.request<unknown>(fn, { method: "POST", path: `rpc/${fn}`, body: args });
    return raw.map((r) => (typeof r === "object" && r !== null ? toRow<T>(r as Record<string, unknown>) : (r as T)));
  }

  /* ---- gauntlet -------------------------------------------------------------------------- */

  async listPoolArtifacts(
    options: { readonly corpus?: string; readonly includeRetired?: boolean } = {},
  ): Promise<readonly GauntletArtifactRow[]> {
    const query: Record<string, string> = { select: "*", order: "artifact_id.asc" };
    if (options.corpus !== undefined) query.corpus = `eq.${options.corpus}`;
    if (options.includeRetired !== true) query.retired_at = "is.null";
    return this.select<GauntletArtifactRow>("gauntlet_artifacts", query);
  }

  async upsertArtifacts(rows: readonly GauntletArtifactRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const out = await this.insert<GauntletArtifactRow>(
      "gauntlet_artifacts",
      rows as unknown as readonly Record<string, unknown>[],
      ["resolution=merge-duplicates", "return=representation"],
    );
    return out.length;
  }

  async findRound(dayKey: string, slot: number): Promise<GauntletRoundRow | null> {
    const rows = await this.select<GauntletRoundRow>("gauntlet_rounds", {
      select: "*",
      day_key: `eq.${dayKey}`,
      slot: `eq.${slot}`,
      limit: "1",
    });
    return rows[0] ?? null;
  }

  async getRound(roundId: string): Promise<GauntletRoundRow | null> {
    const rows = await this.select<GauntletRoundRow>("gauntlet_rounds", {
      select: "*",
      round_id: `eq.${roundId}`,
      limit: "1",
    });
    return rows[0] ?? null;
  }

  async insertRoundIfAbsent(row: GauntletRoundRow): Promise<GauntletRoundRow> {
    const inserted = await this.insert<GauntletRoundRow>(
      "gauntlet_rounds",
      [row as unknown as Record<string, unknown>],
      ["resolution=ignore-duplicates", "return=representation"],
    );
    if (inserted[0] !== undefined) return inserted[0];
    // Empty body means the unique index rejected it, which means somebody else built today's round
    // first. Their row is the round; ours never existed.
    const winner = await this.findRound(row.dayKey, row.slot);
    if (winner === null) {
      throw new PostgrestError(409, UNIQUE_VIOLATION, "round insert was ignored but no row exists", "gauntlet_rounds");
    }
    return winner;
  }

  async getParticipant(participantId: string): Promise<GauntletParticipantRow | null> {
    const rows = await this.select<GauntletParticipantRow>("gauntlet_participants", {
      select: "*",
      participant_id: `eq.${participantId}`,
      limit: "1",
    });
    return rows[0] ?? null;
  }

  async ensureParticipant(participantId: string, alias: string | null = null): Promise<GauntletParticipantRow> {
    const inserted = await this.insert<GauntletParticipantRow>(
      "gauntlet_participants",
      [{ participantId, alias }],
      ["resolution=ignore-duplicates", "return=representation"],
    );
    if (inserted[0] !== undefined) return inserted[0];
    const existing = await this.getParticipant(participantId);
    if (existing === null) {
      throw new PostgrestError(409, UNIQUE_VIOLATION, "participant insert was ignored but no row exists", "gauntlet_participants");
    }
    return existing;
  }

  async insertGuessIfAbsent(
    row: GauntletGuessRow,
  ): Promise<{ readonly stored: GauntletGuessRow; readonly alreadyAnswered: boolean }> {
    const inserted = await this.insert<GauntletGuessRow>(
      "gauntlet_guesses",
      [row as unknown as Record<string, unknown>],
      ["resolution=ignore-duplicates", "return=representation"],
    );
    if (inserted[0] !== undefined) return { stored: inserted[0], alreadyAnswered: false };
    const existing = await this.select<GauntletGuessRow>("gauntlet_guesses", {
      select: "*",
      round_id: `eq.${row.roundId}`,
      participant_id: `eq.${row.participantId}`,
      limit: "1",
    });
    const first = existing[0];
    if (first === undefined) {
      throw new PostgrestError(409, UNIQUE_VIOLATION, "guess insert was ignored but no row exists", "gauntlet_guesses");
    }
    return { stored: first, alreadyAnswered: true };
  }

  async guessesForRound(roundId: string): Promise<readonly GauntletGuessRow[]> {
    return this.select<GauntletGuessRow>("gauntlet_guesses", { select: "*", round_id: `eq.${roundId}` });
  }

  async guessesForParticipant(participantId: string): Promise<readonly GauntletGuessRow[]> {
    return this.select<GauntletGuessRow>("gauntlet_guesses", {
      select: "*",
      participant_id: `eq.${participantId}`,
    });
  }

  async recordPlay(participantId: string, dayKey: string, correct: boolean): Promise<GauntletParticipantRow> {
    const rows = await this.rpc<GauntletParticipantRow>("slop_gauntlet_record_play", {
      p_participant: participantId,
      p_day: dayKey,
      p_correct: correct,
    });
    const row = rows[0];
    if (row === undefined) {
      throw new PostgrestError(404, null, "record_play returned no row", "gauntlet_participants");
    }
    return row;
  }

  async bumpRateLimit(participantId: string, windowStartIso: string, limit: number): Promise<number> {
    const rows = await this.rpc<number>("slop_gauntlet_bump_rate_limit", {
      p_participant: participantId,
      p_window: windowStartIso,
      p_limit: limit,
    });
    const count = rows[0];
    if (typeof count !== "number") {
      throw new PostgrestError(500, null, "bump_rate_limit did not return a count", "gauntlet_rate_limits");
    }
    return count;
  }

  async leaderboard(limit: number): Promise<readonly GauntletParticipantRow[]> {
    return this.select<GauntletParticipantRow>("gauntlet_participants", {
      select: "*",
      order: "current_streak.desc,longest_streak.desc,rounds_correct.desc",
      limit: String(limit),
    });
  }

  async discrimination(): Promise<readonly DiscriminationRow[]> {
    return this.select<DiscriminationRow>("gauntlet_artifact_discrimination", {
      select: "*",
      order: "artifact_id.asc",
    });
  }

  /* ---- notary ----------------------------------------------------------------------------- */

  async createChain(row: NotaryChainRow): Promise<NotaryChainRow> {
    const out = await this.insert<NotaryChainRow>("notary_chains", [row as unknown as Record<string, unknown>], [
      "return=representation",
    ]);
    const created = out[0];
    if (created === undefined) throw new PostgrestError(500, null, "chain insert returned no row", "notary_chains");
    return created;
  }

  async getChain(chainId: string): Promise<NotaryChainRow | null> {
    const rows = await this.select<NotaryChainRow>("notary_chains", {
      select: "*",
      chain_id: `eq.${chainId}`,
      limit: "1",
    });
    return rows[0] ?? null;
  }

  async appendEvents(
    chainId: string,
    events: readonly NotaryEventRow[],
    rootSha256: string,
  ): Promise<NotaryChainRow> {
    try {
      await this.insert<NotaryEventRow>(
        "notary_events",
        events as unknown as readonly Record<string, unknown>[],
        ["return=minimal"],
      );
    } catch (error) {
      // A unique violation here is a FORK, not a retry, so it is the one duplicate in this adapter
      // that is genuinely an error. The distinction is the whole reason the two are handled
      // differently rather than uniformly swallowed.
      if (error instanceof PostgrestError && error.code === UNIQUE_VIOLATION) {
        throw new SequenceConflictError(chainId, events[0]?.sequence ?? -1);
      }
      throw error;
    }
    const updated = await this.request<Record<string, unknown>>("notary_chains", {
      method: "PATCH",
      path: "notary_chains",
      query: { chain_id: `eq.${chainId}` },
      body: { root_sha256: rootSha256, event_count: events[events.length - 1]!.sequence + 1 },
      prefer: ["return=representation"],
    });
    const row = updated[0];
    if (row === undefined) throw new PostgrestError(404, null, "chain not found on append", "notary_chains");
    return toRow<NotaryChainRow>(row);
  }

  async listEvents(chainId: string): Promise<readonly NotaryEventRow[]> {
    return this.select<NotaryEventRow>("notary_events", {
      select: "*",
      chain_id: `eq.${chainId}`,
      order: "sequence.asc",
    });
  }

  async recordTimestamp(row: NotaryTimestampRow): Promise<NotaryTimestampRow> {
    const out = await this.insert<NotaryTimestampRow>(
      "notary_timestamps",
      [row as unknown as Record<string, unknown>],
      ["resolution=merge-duplicates", "return=representation"],
    );
    return out[0] ?? row;
  }

  async listTimestamps(chainId: string, rootSha256?: string): Promise<readonly NotaryTimestampRow[]> {
    const query: Record<string, string> = { select: "*", chain_id: `eq.${chainId}` };
    if (rootSha256 !== undefined) query.root_sha256 = `eq.${rootSha256}`;
    return this.select<NotaryTimestampRow>("notary_timestamps", query);
  }

  async issueCredential(row: NotaryCredentialRow): Promise<NotaryCredentialRow> {
    const out = await this.insert<NotaryCredentialRow>(
      "notary_credentials",
      [row as unknown as Record<string, unknown>],
      ["return=representation"],
    );
    return out[0] ?? row;
  }

  async getCredential(credentialId: string): Promise<NotaryCredentialRow | null> {
    const rows = await this.select<NotaryCredentialRow>("notary_credentials", {
      select: "*",
      credential_id: `eq.${credentialId}`,
      limit: "1",
    });
    return rows[0] ?? null;
  }

  async revokeCredential(credentialId: string, atIso: string, reason: string): Promise<NotaryCredentialRow> {
    const updated = await this.request<Record<string, unknown>>("notary_credentials", {
      method: "PATCH",
      path: "notary_credentials",
      query: { credential_id: `eq.${credentialId}` },
      body: { revoked_at: atIso, revocation_reason: reason },
      prefer: ["return=representation"],
    });
    const row = updated[0];
    if (row === undefined) throw new PostgrestError(404, null, "credential not found", "notary_credentials");
    return toRow<NotaryCredentialRow>(row);
  }

  async recordRecording(row: NotaryRecordingRow): Promise<NotaryRecordingRow> {
    const out = await this.insert<NotaryRecordingRow>(
      "notary_recordings",
      [row as unknown as Record<string, unknown>],
      ["return=representation"],
    );
    return out[0] ?? row;
  }

  async listRecordings(chainId: string): Promise<readonly NotaryRecordingRow[]> {
    return this.select<NotaryRecordingRow>("notary_recordings", { select: "*", chain_id: `eq.${chainId}` });
  }

  /* ---- substantiation ---------------------------------------------------------------------- */

  async recordRun(row: SubstantiationRunRow): Promise<SubstantiationRunRow> {
    const out = await this.insert<SubstantiationRunRow>(
      "substantiation_runs",
      [row as unknown as Record<string, unknown>],
      ["return=representation"],
    );
    return out[0] ?? row;
  }

  async publishedRuns(kind: SubstantiationKind): Promise<readonly SubstantiationRunRow[]> {
    return this.select<SubstantiationRunRow>("substantiation_runs", {
      select: "*",
      kind: `eq.${kind}`,
      published_at: "not.is.null",
      superseded_by: "is.null",
      order: "computed_at.desc",
    });
  }
}

/** Exported for the adapter's own tests, and because a mapping nobody can see is a mapping nobody checks. */
export const columnCase = { snake, camel } as const;
