/**
 * Configuration, named and validated in one place.
 *
 * No secret is in this repository and none ever will be: everything below is read from the
 * environment, `.env.example` documents each one, and `readSupabaseEnv` returns a MISSING LIST
 * rather than throwing a message with a value in it. A configuration error that prints the thing it
 * was reading is how a service key ends up in a log aggregator.
 *
 * The packages work with none of these set. The gauntlet and the notary run against
 * `InMemoryDatabase`, and the notary's TSA fan-out runs against `MockTsaTransport`, so the test
 * suite is green on a machine that has never seen a credential.
 */

export interface SupabaseEnv {
  /** e.g. https://<ref>.supabase.co */
  readonly url: string;
  /**
   * The SERVICE ROLE key. Server-side only, never shipped to a browser.
   *
   * Both of these packages need it for a specific reason rather than out of convenience: the
   * gauntlet's answer key (`gauntlet_artifacts.label`, `gauntlet_rounds.human_index`) is revoked
   * from every client role, and grading has to read it. If a call path here could run with an anon
   * key, the answer would have to be grantable, and the game would be over.
   */
  readonly serviceRoleKey: string;
  readonly schema: string;
}

export interface EnvResult<T> {
  readonly value: T | null;
  /** Variable names only. Never a value, never a partial value. */
  readonly missing: readonly string[];
}

export const SUPABASE_ENV_VARS = ["SLOP_SUPABASE_URL", "SLOP_SUPABASE_SERVICE_ROLE_KEY"] as const;

export function readSupabaseEnv(env: Readonly<Record<string, string | undefined>>): EnvResult<SupabaseEnv> {
  const missing = SUPABASE_ENV_VARS.filter((name) => {
    const v = env[name];
    return v === undefined || v.trim() === "";
  });
  if (missing.length > 0) return { value: null, missing };
  return {
    value: {
      url: (env.SLOP_SUPABASE_URL as string).replace(/\/+$/, ""),
      serviceRoleKey: env.SLOP_SUPABASE_SERVICE_ROLE_KEY as string,
      schema: env.SLOP_SUPABASE_SCHEMA ?? "public",
    },
    missing: [],
  };
}

/** Every variable either package reads, with the reason. Rendered into `.env.example` by hand. */
export const ENV_DOCUMENTATION: readonly { readonly name: string; readonly required: boolean; readonly why: string }[] = [
  {
    name: "SLOP_SUPABASE_URL",
    required: false,
    why: "Project URL. Unset means the in-memory database, which is the default in tests and in local development.",
  },
  {
    name: "SLOP_SUPABASE_SERVICE_ROLE_KEY",
    required: false,
    why: "Service role key, server-side only. Needed because the gauntlet's answer key is column-revoked from every client role, so grading cannot run under an anon key.",
  },
  {
    name: "SLOP_SUPABASE_SCHEMA",
    required: false,
    why: "Defaults to public. Present so a shared project can namespace these tables.",
  },
  {
    name: "SLOP_TSA_URLS",
    required: false,
    why: "Comma-separated RFC 3161 authority URLs, overriding the built-in fan-out list. No credential: every default authority is free and unauthenticated, and RFC 3161 forbids a TSA from identifying the requester.",
  },
  {
    name: "SLOP_TSA_TIMEOUT_MS",
    required: false,
    why: "Per-authority deadline. One slow authority must not hold up a stamp that three others already granted.",
  },
  {
    name: "SLOP_OPENTIMESTAMPS_CALENDARS",
    required: false,
    why: "Comma-separated OpenTimestamps calendar URLs. Optional additional anchor; a failure here is never fatal.",
  },
];
