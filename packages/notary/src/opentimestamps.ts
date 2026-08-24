/**
 * OpenTimestamps, as an ADDITIONAL anchor and never as the load-bearing one.
 *
 * Why include it: it is free, it needs no account and no key, the hashing happens locally so the
 * file never leaves the client, and once a calendar aggregates the commitment into Bitcoin the
 * proof is verifiable by anybody, forever, without trusting us or the calendar. That last property
 * is the one RFC 3161 does not have - a TSA can go away, and its roots with it.
 *
 * Why it is not the primary: the attestation is PENDING for hours until it is aggregated, and a
 * credential must be issuable now. So the RFC 3161 fan-out is the anchor a credential speaks about,
 * and this runs alongside; a failure here is recorded and never fatal.
 *
 * The submission is deliberately thin: a calendar's `/digest` endpoint takes a 32-byte digest and
 * returns a partial proof. The full `.ots` serialisation and Bitcoin-header verification are NOT
 * implemented here, and the return value says so rather than implying an anchor that does not exist
 * yet. Overstating this would be the same defect the rest of the package exists to avoid.
 */

export const DEFAULT_CALENDARS: readonly string[] = [
  "https://a.pool.opentimestamps.org",
  "https://b.pool.opentimestamps.org",
  "https://finney.calendar.eternitywall.com",
];

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface CalendarSubmission {
  readonly calendar: string;
  readonly accepted: boolean;
  /** Base64 of whatever partial proof the calendar returned. Stored, not interpreted. */
  readonly partialProof: string | null;
  readonly failureReason: string | null;
  /**
   * Always true today. The commitment is pending until a calendar aggregates it into a block, which
   * takes hours, so nothing issued now may describe this as an anchor.
   */
  readonly pending: boolean;
}

export interface OpenTimestampsClient {
  submit(digestHex: string): Promise<readonly CalendarSubmission[]>;
}

export function httpOpenTimestamps(
  fetchImpl: FetchLike,
  calendars: readonly string[] = DEFAULT_CALENDARS,
  timeoutMs = 5_000,
): OpenTimestampsClient {
  return {
    async submit(digestHex) {
      const digest = Buffer.from(digestHex, "hex");
      return Promise.all(
        calendars.map(async (calendar): Promise<CalendarSubmission> => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(new Error(`${calendar} did not answer`)), timeoutMs);
          try {
            const response = await fetchImpl(`${calendar}/digest`, {
              method: "POST",
              headers: { "content-type": "application/octet-stream" },
              body: new Uint8Array(digest),
              signal: controller.signal,
            });
            if (!response.ok) throw new Error(`${calendar} answered ${response.status}`);
            const body = Buffer.from(await response.arrayBuffer());
            return { calendar, accepted: true, partialProof: body.toString("base64"), failureReason: null, pending: true };
          } catch (error) {
            return {
              calendar,
              accepted: false,
              partialProof: null,
              failureReason: error instanceof Error ? error.message : "unknown failure",
              pending: true,
            };
          } finally {
            clearTimeout(timer);
          }
        }),
      );
    },
  };
}

/** The offline stand-in, so the non-fatal path is exercised without a network. */
export class MockOpenTimestamps implements OpenTimestampsClient {
  constructor(private readonly behaviour: "accept" | "fail" = "accept") {}

  async submit(digestHex: string): Promise<readonly CalendarSubmission[]> {
    return DEFAULT_CALENDARS.map((calendar) =>
      this.behaviour === "accept"
        ? {
            calendar,
            accepted: true,
            partialProof: Buffer.from(`ots:${digestHex}`).toString("base64"),
            failureReason: null,
            pending: true,
          }
        : { calendar, accepted: false, partialProof: null, failureReason: "calendar unreachable", pending: true },
    );
  }
}
