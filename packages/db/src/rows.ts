/**
 * The rows, in TypeScript, mirroring `supabase/migrations` column for column.
 *
 * There are two descriptions of this database and they must not disagree. The SQL is the one the
 * server obeys; this file is the one the compiler obeys. `test/migrations.test.ts` parses the SQL
 * and checks the two against each other, because a mirror nobody checks is just a second place to
 * be wrong — which is precisely the failure the Lark database contract was written after (a schema
 * record that drifted six migrations behind the thing it described, including two security fixes).
 *
 * Naming: SQL is snake_case, TypeScript is camelCase, and the mapping is mechanical and lives in
 * one place (`postgrest.ts`). Nothing hand-maps a column name at a call site.
 */

/* ---- gauntlet ---------------------------------------------------------------------------- */

/** Literal allowed values of `gauntlet_artifacts.label`. There is no 'unknown': see the migration. */
export type ArtifactLabel = "human" | "generated";

export interface GauntletArtifactRow {
  readonly artifactId: string;
  readonly corpus: string;
  /** THE ANSWER. Never granted to a client role; never present in a round view. */
  readonly label: ArtifactLabel;
  /** How a stranger checks the label. Names projects and maintainers, so it is never presented. */
  readonly source: string;
  readonly provenance: string;
  /** The redacted card a player sees. Shape owned by `@slop/gauntlet`. */
  readonly presentation: unknown;
  readonly captureDate: string;
  readonly retiredAt: string | null;
  readonly addedAt: string;
}

export interface GauntletRoundRow {
  readonly roundId: string;
  readonly dayKey: string;
  readonly slot: number;
  readonly seed: string;
  readonly builderVersion: number;
  readonly artifactIds: readonly string[];
  /** THE ANSWER, again. Column-revoked in SQL, and stripped by `toRoundView` in the package. */
  readonly humanIndex: number;
  readonly builtAt: string;
}

export interface GauntletParticipantRow {
  readonly participantId: string;
  readonly alias: string | null;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly roundsPlayed: number;
  readonly roundsCorrect: number;
  readonly lastPlayedDay: string | null;
  readonly createdAt: string;
}

export interface GauntletGuessRow {
  readonly guessId: string;
  readonly roundId: string;
  readonly participantId: string;
  readonly chosenIndex: number;
  readonly chosenArtifactId: string;
  readonly correct: boolean;
  readonly servedAt: string;
  readonly answeredAt: string;
  /** Measured from `servedAt` on OUR clock. The published figure is computed from this one. */
  readonly elapsedMs: number;
  /** What the browser said. Stored beside, never instead. */
  readonly clientReportedMs: number | null;
  readonly timingDisputed: boolean;
  readonly createdAt: string;
}

/**
 * A row of `gauntlet_artifact_discrimination`.
 *
 * Counts, never rates. The rate is computed in `@slop/gauntlet/discrimination`, behind a
 * minimum-sample gate, next to the test that proves the gate refuses to divide by eleven.
 */
export interface DiscriminationRow {
  readonly artifactId: string;
  readonly corpus: string;
  readonly label: ArtifactLabel;
  readonly source: string;
  readonly provenance: string;
  /** Guesses cast on a round this artifact appeared in. */
  readonly timesShown: number;
  /** Guesses that picked THIS artifact as the human-made one. */
  readonly timesChosenAsHuman: number;
  /** Guesses cast on a round where this artifact WAS the human-made one. */
  readonly timesWasTheAnswer: number;
  /** ...of which, guesses that found it. */
  readonly timesAnswerFound: number;
  readonly medianElapsedMs: number | null;
}

/* ---- notary ------------------------------------------------------------------------------ */

export type Disclosure = "private" | "hashes" | "full";

export interface NotaryChainRow {
  readonly chainId: string;
  readonly ownerId: string;
  readonly subjectSha256: string | null;
  readonly disclosure: Disclosure;
  readonly rootSha256: string | null;
  readonly eventCount: number;
  readonly createdAt: string;
  readonly closedAt: string | null;
}

export type EventKind =
  | "draft"
  | "save"
  | "edit"
  | "commit"
  | "agent-receipt"
  | "recording-frame"
  | "export";

export interface NotaryEventRow {
  readonly eventId: string;
  readonly chainId: string;
  readonly sequence: number;
  readonly kind: EventKind;
  readonly contentSha256: string;
  readonly byteLength: number;
  /** What the client said. */
  readonly declaredAt: string;
  /** When we saw it. The only one of the two we can stand behind. */
  readonly recordedAt: string;
  readonly leafSha256: string;
  readonly prevSha256: string | null;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export type TimestampStatus = "granted" | "rejected" | "unreachable";

export interface NotaryTimestampRow {
  readonly timestampId: string;
  readonly chainId: string;
  readonly rootSha256: string;
  readonly authorityId: string;
  readonly authorityUrl: string;
  readonly jurisdiction: string;
  readonly status: TimestampStatus;
  readonly genTime: string | null;
  /** The DER token, base64. Stored so a stranger can re-verify without asking us for anything. */
  readonly token: string | null;
  readonly failureReason: string | null;
  readonly requestedAt: string;
}

export interface NotaryCredentialRow {
  readonly credentialId: string;
  readonly chainId: string;
  readonly rootSha256: string;
  /** Stored verbatim: the wording is the liability boundary, so it must not be regenerable. */
  readonly statement: string;
  readonly statementVersion: number;
  readonly eventCount: number;
  readonly authorityCount: number;
  readonly jurisdictionCount: number;
  readonly earliestGenTime: string | null;
  readonly issuedAt: string;
  readonly revokedAt: string | null;
  readonly revocationReason: string | null;
}

export type RecordingTool = "procreate" | "clip-studio" | "krita" | "generic-frames";

export interface NotaryRecordingRow {
  readonly recordingId: string;
  readonly chainId: string;
  readonly sourceTool: RecordingTool;
  readonly parserId: string;
  readonly frameCount: number;
  readonly durationMs: number;
  readonly finalFileSha256: string | null;
  /** What the parser could not establish, named rather than defaulted. */
  readonly unparsedFields: readonly string[];
  readonly ingestedAt: string;
}

/* ---- substantiation ------------------------------------------------------------------------ */

export type SubstantiationKind =
  | "gauntlet-discrimination"
  | "detector-calibration"
  | "reproduction-effort";

export interface SubstantiationRunRow {
  readonly runId: string;
  readonly kind: SubstantiationKind;
  readonly corpusVersion: string;
  readonly sampleSize: number;
  readonly minimumSample: number;
  readonly payload: unknown;
  readonly producedBy: string;
  readonly computedAt: string;
  readonly publishedAt: string | null;
  readonly supersededBy: string | null;
}
