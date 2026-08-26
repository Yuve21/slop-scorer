/**
 * RFC 3161 timestamping, fanned out across several independent authorities.
 *
 * WHY THIS STANDARD IS THE PRODUCT'S THESIS, ALREADY STANDARDISED
 *
 * RFC 3161 says the TSA is "not to include any identification of the requesting entity in the
 * time-stamp tokens", and that "the time-stamp request does not identify the requester". An entire
 * deployed standard for attesting that something existed at a time, built specifically NOT to
 * attest who. That is exactly the claim this product is allowed to make, and it means the provenance
 * half needs no biometrics, no identity provider, no licence and no regulator - which is the
 * conclusion `human-verification-licensing.md` reaches in section 4 and the reason the whole
 * notary exists rather than a face-scan flow that would put us inside Illinois BIPA at
 * $1,000-$5,000 per scan with a private right of action.
 *
 * WHY SEVERAL AUTHORITIES
 *
 * One authority is one entity's word, one jurisdiction's subpoena, and one outage. Several in
 * different jurisdictions is a materially harder thing to have retracted or coerced, and it costs
 * nothing: every authority below is free and unauthenticated. A single authority failing is
 * therefore NOT fatal - the result records which answered, which refused and which could not be
 * reached, and the credential states the count rather than implying a set.
 *
 * WHAT WE VERIFY, STATED HONESTLY
 *
 * The status is `granted`, the token's message imprint equals the root we sent, the nonce comes
 * back unchanged, and the genTime parses. We do NOT verify the CMS signature against the
 * authority's certificate chain. That is a real gap, it is named in `TOKEN_VERIFICATION_SCOPE`, it
 * is repeated on the credential, and the mitigation is that the raw token is stored so anybody can
 * run `openssl ts -verify` against it themselves.
 */

import { randomInt } from "node:crypto";
import type { TimestampStatus } from "@slop/db";
import {
  DerError,
  TAG,
  boolean as derBoolean,
  decodeGeneralizedTime,
  decodeInteger,
  decodeOid,
  encode,
  integer,
  nullValue,
  octetString,
  oid,
  parse,
  sequence,
  walk,
  type DerNode,
} from "./der.js";

export const OID_SHA256 = "2.16.840.1.101.3.4.2.1";
export const OID_TST_INFO = "1.2.840.113549.1.9.16.1.4";
export const OID_SIGNED_DATA = "1.2.840.113549.1.7.2";

/**
 * What this package checks about a token, and what it does not.
 *
 * Written as data rather than prose so the credential can quote it and a test can pin it. An
 * unstated gap in a verification is the same defect as an unstated caveat on a score.
 */
export const TOKEN_VERIFICATION_SCOPE = {
  checked: [
    "the authority returned PKIStatus granted",
    "the token's message imprint is the exact root we submitted",
    "the nonce we generated came back unchanged",
    "the genTime is a well-formed RFC 3161 Zulu GeneralizedTime",
  ],
  notChecked: [
    "the CMS signature over the token, against the authority's certificate chain",
    "the authority's certificate status at the time of signing",
  ],
  /** So a holder can close the gap without us. */
  independentCheck: "openssl ts -verify -in token.tsr -queryfile request.tsq -CAfile <authority roots>",
} as const;

export interface Authority {
  readonly id: string;
  readonly url: string;
  /**
   * The COUNTRY, not the operator.
   *
   * A test caught this being conflated: with the operator folded in, two German authorities counted
   * as two jurisdictions and the credential would have said "four jurisdictions" over three. The
   * credential states this count, so the field has to mean exactly what the sentence says.
   */
  readonly jurisdiction: string;
  readonly operator: string;
  readonly note: string;
}

/**
 * The default fan-out.
 *
 * Four authorities, four operators, three jurisdictions. All free, none requiring an account, and
 * one of them is an EU-qualified government TSA - which matters if the eIDAS Article 41 presumption
 * is ever needed, and costs nothing in the meantime.
 */
export const DEFAULT_AUTHORITIES: readonly Authority[] = [
  {
    id: "sigstore",
    url: "https://timestamp.sigstore.dev/api/v1/timestamp",
    jurisdiction: "US",
    operator: "Linux Foundation",
    note: "Operated by the Linux Foundation with a documented availability objective; roots distributed via TUF.",
  },
  {
    id: "belgium",
    url: "https://tsa.belgium.be/connect",
    jurisdiction: "BE",
    operator: "Belgian government",
    note: "Free, government-operated, EU-qualified. The one that carries a statutory presumption if it is ever needed.",
  },
  {
    id: "freetsa",
    url: "https://freetsa.org/tsr",
    jurisdiction: "DE",
    operator: "freetsa.org",
    note: "No account, explicitly advertises non-code use.",
  },
  {
    id: "dfn",
    url: "https://zeitstempel.dfn.de",
    jurisdiction: "DE",
    operator: "DFN-Verein",
    note: "German research network operator, long-running.",
  },
];

/** Build a TimeStampReq over a sha256 digest. */
export function buildRequest(digestHex: string, nonce: bigint, certReq = false): Buffer {
  if (!/^[0-9a-f]{64}$/.test(digestHex)) throw new DerError("the message imprint must be a sha256 hex digest");
  const messageImprint = sequence(sequence(oid(OID_SHA256), nullValue()), octetString(Buffer.from(digestHex, "hex")));
  return sequence(integer(1), messageImprint, integer(nonce), derBoolean(certReq));
}

/** 64 bits of nonce, so a replayed token from another exchange fails the comparison. */
export function newNonce(): bigint {
  return (BigInt(randomInt(0, 2 ** 31)) << 32n) | BigInt(randomInt(0, 2 ** 31));
}

export interface ParsedToken {
  readonly pkiStatus: number;
  readonly granted: boolean;
  readonly imprintHex: string | null;
  readonly genTime: string | null;
  readonly nonce: bigint | null;
  readonly serialNumber: number | null;
}

/** Locate the TSTInfo inside the CMS wrapper: the OID followed by an explicit [0] octet string. */
function findTstInfo(root: DerNode): DerNode | null {
  for (const node of walk(root)) {
    if (!node.constructed) continue;
    for (let i = 0; i < node.children.length - 1; i += 1) {
      const child = node.children[i] as DerNode;
      const next = node.children[i + 1] as DerNode;
      if (child.tag !== TAG.OID) continue;
      let dotted: string;
      try {
        dotted = decodeOid(child);
      } catch {
        continue;
      }
      if (dotted !== OID_TST_INFO) continue;
      const octet = next.tag === TAG.OCTET_STRING ? next : (next.children[0] as DerNode | undefined);
      if (octet === undefined || octet.tag !== TAG.OCTET_STRING) continue;
      return parse(Buffer.from(octet.content));
    }
  }
  return null;
}

export function parseResponse(der: Buffer): ParsedToken {
  const root = parse(der);
  const statusInfo = root.children[0];
  if (statusInfo === undefined || statusInfo.tag !== TAG.SEQUENCE) throw new DerError("no PKIStatusInfo");
  const pkiStatus = decodeInteger(statusInfo.children[0] as DerNode);
  // 0 is granted, 1 is grantedWithMods. Anything else means no usable token came back.
  const granted = pkiStatus === 0 || pkiStatus === 1;
  if (!granted) {
    return { pkiStatus, granted: false, imprintHex: null, genTime: null, nonce: null, serialNumber: null };
  }

  const tstInfo = findTstInfo(root);
  if (tstInfo === null) throw new DerError("the response says granted but carries no TSTInfo");
  const children = tstInfo.children;
  const messageImprint = children[2];
  const imprint = messageImprint?.children[1];
  const genTimeNode = children[4];
  // Optional fields follow genTime in a fixed type order: accuracy (SEQUENCE), ordering (BOOLEAN),
  // nonce (INTEGER). The first INTEGER after genTime is therefore the nonce, if one was echoed.
  const nonceNode = children.slice(5).find((c) => c.tag === TAG.INTEGER);

  return {
    pkiStatus,
    granted: true,
    imprintHex: imprint === undefined ? null : Buffer.from(imprint.content).toString("hex"),
    genTime: genTimeNode === undefined ? null : decodeGeneralizedTime(genTimeNode),
    nonce: nonceNode === undefined ? null : BigInt(`0x${Buffer.from(nonceNode.content).toString("hex")}`),
    serialNumber: children[3] === undefined ? null : decodeInteger(children[3] as DerNode),
  };
}

/* ---- the transport ----------------------------------------------------------------------------- */

export interface TsaRequest {
  readonly authority: Authority;
  readonly body: Buffer;
  readonly timeoutMs: number;
}

/** Injected, so the suite exercises the fan-out with no network and no keys. */
export interface TsaTransport {
  post(request: TsaRequest): Promise<Buffer>;
}

export interface StampResult {
  readonly authorityId: string;
  readonly authorityUrl: string;
  readonly jurisdiction: string;
  readonly status: TimestampStatus;
  readonly genTime: string | null;
  /** Base64 DER, stored so a third party can verify without asking us for anything. */
  readonly token: string | null;
  readonly failureReason: string | null;
}

export interface FanOutOptions {
  readonly authorities?: readonly Authority[];
  readonly timeoutMs?: number;
  readonly transport: TsaTransport;
}

export const DEFAULT_TSA_TIMEOUT_MS = 8_000;

/**
 * Stamp one digest at every authority, in parallel, and never let one of them fail the operation.
 *
 * The results are returned in the order the authorities were listed rather than the order they
 * answered, so a stored record does not encode which one happened to be fastest that afternoon.
 */
export async function stampEverywhere(digestHex: string, options: FanOutOptions): Promise<readonly StampResult[]> {
  const authorities = options.authorities ?? DEFAULT_AUTHORITIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TSA_TIMEOUT_MS;

  const settled = await Promise.all(
    authorities.map(async (authority): Promise<StampResult> => {
      const base = { authorityId: authority.id, authorityUrl: authority.url, jurisdiction: authority.jurisdiction };
      const nonce = newNonce();
      try {
        const body = buildRequest(digestHex, nonce);
        const der = await options.transport.post({ authority, body, timeoutMs });
        const parsed = parseResponse(der);
        if (!parsed.granted) {
          return { ...base, status: "rejected", genTime: null, token: null, failureReason: `PKIStatus ${parsed.pkiStatus}` };
        }
        if (parsed.imprintHex !== digestHex) {
          // A token for a different digest is not a timestamp of ours, whatever it says.
          return {
            ...base,
            status: "rejected",
            genTime: null,
            token: null,
            failureReason: "the token's message imprint is not the digest we submitted",
          };
        }
        if (parsed.nonce !== nonce) {
          // A MISSING nonce fails here too, and that is the point. `parsed.nonce !== null && ...`
          // let any token that simply omitted the nonce through, which is the cheapest thing for a
          // replayed token to do - and since this package deliberately does not verify the CMS
          // signature, the nonce is the only anti-replay control there is. It is also listed as
          // CHECKED in `TOKEN_VERIFICATION_SCOPE`, which every credential quotes, so a skippable
          // version of it made the published statement false.
          return {
            ...base,
            status: "rejected",
            genTime: null,
            token: null,
            failureReason:
              parsed.nonce === null
                ? "the token echoed no nonce, so nothing ties it to the request we sent"
                : "the nonce came back changed, so this token is a replay of another exchange",
          };
        }
        return { ...base, status: "granted", genTime: parsed.genTime, token: der.toString("base64"), failureReason: null };
      } catch (error) {
        // Unreachable, timed out, or unparseable. Recorded, never thrown: a stamp is stronger with
        // three authorities than with none, and an exception here would discard the three.
        return {
          ...base,
          status: "unreachable",
          genTime: null,
          token: null,
          failureReason: error instanceof Error ? error.message : "unknown transport failure",
        };
      }
    }),
  );
  return settled;
}

/* ---- transports -------------------------------------------------------------------------------- */

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** The real one. No credential of any kind: RFC 3161 has no notion of an authenticated requester. */
export function httpTransport(fetchImpl: FetchLike): TsaTransport {
  return {
    async post({ authority, body, timeoutMs }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error(`${authority.id} did not answer in ${timeoutMs} ms`)), timeoutMs);
      try {
        const response = await fetchImpl(authority.url, {
          method: "POST",
          headers: { "content-type": "application/timestamp-query", accept: "application/timestamp-reply" },
          body: new Uint8Array(body),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`${authority.id} answered ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export interface MockTsaOptions {
  /** Per-authority behaviour, keyed by id. Anything unlisted grants. */
  readonly behaviour?: Readonly<
    Record<string, "grant" | "reject" | "unreachable" | "wrong-imprint" | "replay-nonce" | "drop-nonce">
  >;
  readonly genTime?: string;
}

/**
 * The reference implementation of the transport, and it emits REAL DER.
 *
 * A mock that returned a hand-built object would leave the parser, the imprint comparison and the
 * nonce check untested, which are the three things that decide whether a token means anything. So
 * it assembles an actual CMS wrapper around an actual TSTInfo and the production parser reads it.
 */
export class MockTsaTransport implements TsaTransport {
  constructor(private readonly options: MockTsaOptions = {}) {}

  async post({ authority, body }: TsaRequest): Promise<Buffer> {
    const behaviour = this.options.behaviour?.[authority.id] ?? "grant";
    if (behaviour === "unreachable") throw new Error(`${authority.id} is unreachable in this test`);
    if (behaviour === "reject") return sequence(sequence(integer(2)));

    const request = parse(body);
    const imprint = request.children[1]?.children[1];
    if (imprint === undefined) throw new DerError("the mock could not read the request imprint");
    const requestNonce = request.children[2];
    // `drop-nonce` is a token that echoes nothing back, which is what a replayed token from another
    // exchange looks like when the replayer strips the field.
    const echoedNonce =
      behaviour === "replay-nonce" ? integer(1n) : encode(TAG.INTEGER, Buffer.from((requestNonce as DerNode).content));
    // The wrong imprint is the REAL one with its first byte flipped, rather than a fixed filler:
    // a filler collides with a test digest sooner or later, and a mock that accidentally returns
    // the right answer makes the check that catches it look broken.
    const wrong = Buffer.from(imprint.content);
    wrong[0] = (wrong[0] as number) ^ 0xff;
    const returnedImprint = octetString(behaviour === "wrong-imprint" ? wrong : Buffer.from(imprint.content));

    // ISO to GeneralizedTime: drop the separators, the T and the fractional part.
    const genTime = (this.options.genTime ?? "2026-08-24T12:00:00.000Z")
      .replace(/[-:T]/g, "")
      .replace(/\.\d+Z$/, "Z");

    const tstInfo =
      behaviour === "drop-nonce"
        ? sequence(
            integer(1),
            oid("1.2.3.4.1"),
            sequence(sequence(oid(OID_SHA256), nullValue()), returnedImprint),
            integer(42),
            encode(TAG.GENERALIZED_TIME, Buffer.from(genTime, "ascii")),
          )
        : sequence(
            integer(1),
            oid("1.2.3.4.1"),
            sequence(sequence(oid(OID_SHA256), nullValue()), returnedImprint),
            integer(42),
            encode(TAG.GENERALIZED_TIME, Buffer.from(genTime, "ascii")),
            echoedNonce,
          );

    const contentInfo = sequence(
      oid(OID_SIGNED_DATA),
      encode(
        0xa0,
        sequence(
          integer(3),
          encode(TAG.SET, Buffer.concat([sequence(oid(OID_SHA256), nullValue())])),
          sequence(oid(OID_TST_INFO), encode(0xa0, octetString(tstInfo))),
        ),
      ),
    );

    return sequence(sequence(integer(0)), contentInfo);
  }
}
