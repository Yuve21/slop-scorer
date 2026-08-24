/**
 * DER, RFC 3161, and the fan-out.
 *
 * The mock transport emits REAL DER and the production parser reads it, so these tests exercise the
 * three checks that decide whether a token means anything: the status, the message imprint, and the
 * nonce. A mock that returned a plain object would leave all three untested and the suite would be
 * asserting that a stub was called.
 *
 * The fan-out tests are all about PARTIAL FAILURE, because that is the normal case: four free
 * authorities, and on any given afternoon one of them is down. Three tokens is a stronger record
 * than none, so an exception from one authority must never discard the others.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTHORITIES,
  DerError,
  MockTsaTransport,
  TOKEN_VERIFICATION_SCOPE,
  buildRequest,
  decodeGeneralizedTime,
  decodeInteger,
  decodeOid,
  encode,
  integer,
  newNonce,
  oid,
  parse,
  parseResponse,
  sequence,
  stampEverywhere,
  TAG,
} from "@slop/notary";

const ROOT = "ab".repeat(32);

describe("DER encoding", () => {
  it("round-trips an object identifier, including the shared first two arcs", () => {
    for (const dotted of ["2.16.840.1.101.3.4.2.1", "1.2.840.113549.1.9.16.1.4", "1.2.3.4.1"]) {
      expect(decodeOid(parse(oid(dotted)))).toBe(dotted);
    }
  });

  it("round-trips integers across the byte boundaries", () => {
    for (const n of [0, 1, 127, 128, 255, 256, 65_535, 16_777_216]) {
      expect(decodeInteger(parse(integer(n)))).toBe(n);
    }
  });

  it("keeps a large integer unsigned", () => {
    // Without the leading zero, a value whose top bit is set decodes as negative. The nonce is
    // 64 bits of random, so this is the common case, not the edge case.
    const encoded = integer(0xff00n);
    expect(encoded[2]).toBe(0x00);
  });

  it("uses long-form lengths past 127 bytes", () => {
    const long = encode(TAG.OCTET_STRING, Buffer.alloc(300, 7));
    expect(long[1]).toBe(0x82);
    expect(parse(long).content.length).toBe(300);
  });

  it("refuses an indefinite length rather than reading past the buffer", () => {
    expect(() => parse(Buffer.from([0x30, 0x80, 0x00, 0x00]))).toThrow(DerError);
  });

  it("refuses a length that runs past the buffer", () => {
    expect(() => parse(Buffer.from([0x04, 0x10, 0x01, 0x02]))).toThrow(DerError);
  });

  it("parses only the Zulu GeneralizedTime form RFC 3161 requires", () => {
    const ok = encode(TAG.GENERALIZED_TIME, Buffer.from("20260824120000Z", "ascii"));
    expect(decodeGeneralizedTime(parse(ok))).toBe("2026-08-24T12:00:00.000Z");
    const local = encode(TAG.GENERALIZED_TIME, Buffer.from("20260824120000+0200", "ascii"));
    expect(() => decodeGeneralizedTime(parse(local))).toThrow(DerError);
  });
});

describe("the request", () => {
  it("carries version 1, a sha256 imprint, the nonce and certReq", () => {
    const nonce = 0x0123456789abcdefn;
    const request = parse(buildRequest(ROOT, nonce));
    expect(decodeInteger(request.children[0]!)).toBe(1);
    expect(decodeOid(request.children[1]!.children[0]!.children[0]!)).toBe("2.16.840.1.101.3.4.2.1");
    expect(Buffer.from(request.children[1]!.children[1]!.content).toString("hex")).toBe(ROOT);
    expect(request.children[3]!.tag).toBe(TAG.BOOLEAN);
  });

  it("refuses anything that is not a sha256 digest", () => {
    expect(() => buildRequest("not-a-digest", 1n)).toThrow(DerError);
    expect(() => buildRequest("ab".repeat(20), 1n)).toThrow(DerError);
  });

  it("generates a nonce that is not the same twice", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => newNonce().toString()));
    expect(nonces.size).toBe(50);
  });
});

describe("the response", () => {
  it("reads a granted token the mock produced", async () => {
    const transport = new MockTsaTransport({ genTime: "2026-08-24T09:30:00.000Z" });
    const der = await transport.post({
      authority: DEFAULT_AUTHORITIES[0]!,
      body: buildRequest(ROOT, 7n),
      timeoutMs: 100,
    });
    const parsed = parseResponse(der);
    expect(parsed.granted).toBe(true);
    expect(parsed.imprintHex).toBe(ROOT);
    expect(parsed.genTime).toBe("2026-08-24T09:30:00.000Z");
    expect(parsed.nonce).toBe(7n);
  });

  it("reads a refusal without inventing a token", () => {
    const refusal = sequence(sequence(integer(2)));
    const parsed = parseResponse(refusal);
    expect(parsed.granted).toBe(false);
    expect(parsed.pkiStatus).toBe(2);
    expect(parsed.genTime).toBeNull();
  });

  it("throws rather than shrugging when a granted response carries no token", () => {
    expect(() => parseResponse(sequence(sequence(integer(0))))).toThrow(DerError);
  });
});

describe("the fan-out", () => {
  const transportWith = (behaviour: Record<string, "grant" | "reject" | "unreachable" | "wrong-imprint" | "replay-nonce">) =>
    new MockTsaTransport({ behaviour });

  it("stamps at every authority and reports each one", async () => {
    const results = await stampEverywhere(ROOT, { transport: new MockTsaTransport() });
    expect(results.length).toBe(DEFAULT_AUTHORITIES.length);
    expect(results.every((r) => r.status === "granted")).toBe(true);
    // Three jurisdictions across four operators: two of the authorities are German, and the count
    // the credential prints is of jurisdictions, so they must not double-count.
    expect(new Set(results.map((r) => r.jurisdiction)).size).toBe(3);
    // Every token is stored, so a holder can verify without us.
    expect(results.every((r) => (r.token ?? "").length > 40)).toBe(true);
  });

  it("keeps the other three when one authority is unreachable", async () => {
    const results = await stampEverywhere(ROOT, { transport: transportWith({ belgium: "unreachable" }) });
    expect(results.filter((r) => r.status === "granted").length).toBe(3);
    const failed = results.find((r) => r.authorityId === "belgium");
    expect(failed?.status).toBe("unreachable");
    expect(failed?.failureReason).toContain("unreachable");
  });

  it("keeps the others when one refuses", async () => {
    const results = await stampEverywhere(ROOT, { transport: transportWith({ freetsa: "reject" }) });
    expect(results.find((r) => r.authorityId === "freetsa")?.status).toBe("rejected");
    expect(results.filter((r) => r.status === "granted").length).toBe(3);
  });

  it("rejects a token that stamps a different digest", async () => {
    // The attack this stops: an authority (or something between us and it) returns a valid-looking
    // token over a digest that is not ours, and we file it as evidence about our root.
    const results = await stampEverywhere(ROOT, { transport: transportWith({ dfn: "wrong-imprint" }) });
    const bad = results.find((r) => r.authorityId === "dfn");
    expect(bad?.status).toBe("rejected");
    expect(bad?.failureReason).toContain("imprint");
    expect(bad?.token).toBeNull();
  });

  it("rejects a replayed token whose nonce came back changed", async () => {
    const results = await stampEverywhere(ROOT, { transport: transportWith({ sigstore: "replay-nonce" }) });
    const bad = results.find((r) => r.authorityId === "sigstore");
    expect(bad?.status).toBe("rejected");
    expect(bad?.failureReason).toContain("replay");
  });

  it("returns results in the order the authorities were listed, not the order they answered", async () => {
    const results = await stampEverywhere(ROOT, { transport: new MockTsaTransport() });
    expect(results.map((r) => r.authorityId)).toEqual(DEFAULT_AUTHORITIES.map((a) => a.id));
  });

  it("returns nothing granted, and does not throw, when every authority is down", async () => {
    const transport = transportWith(
      Object.fromEntries(DEFAULT_AUTHORITIES.map((a) => [a.id, "unreachable" as const])),
    );
    const results = await stampEverywhere(ROOT, { transport });
    expect(results.every((r) => r.status === "unreachable")).toBe(true);
  });
});

describe("the stated scope of verification", () => {
  it("names the CMS signature as something this package does not check", () => {
    // The gap must be stated in data, not left to a comment, because the credential quotes it.
    expect(TOKEN_VERIFICATION_SCOPE.notChecked.join(" ")).toContain("CMS signature");
    expect(TOKEN_VERIFICATION_SCOPE.checked.length).toBeGreaterThanOrEqual(4);
    expect(TOKEN_VERIFICATION_SCOPE.independentCheck).toContain("openssl ts -verify");
  });

  it("lists only free, unauthenticated authorities, one of them EU-qualified", () => {
    // RFC 3161 has no notion of an authenticated requester, so an authority needing a key would be
    // an authority that knows who we are.
    expect(DEFAULT_AUTHORITIES.length).toBeGreaterThanOrEqual(4);
    expect(DEFAULT_AUTHORITIES.some((a) => a.note.includes("EU-qualified"))).toBe(true);
    expect(new Set(DEFAULT_AUTHORITIES.map((a) => a.operator)).size).toBe(DEFAULT_AUTHORITIES.length);
    expect(new Set(DEFAULT_AUTHORITIES.map((a) => a.url)).size).toBe(DEFAULT_AUTHORITIES.length);
  });
});
