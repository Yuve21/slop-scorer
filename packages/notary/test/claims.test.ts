/**
 * "Verified human" must be unspeakable.
 *
 * `human-verification-licensing.md` section 7 names the phrase and says do not ship it: it is an
 * unbounded claim, it invites the FTC Endorsement Guides and Lanham Act analysis, and it is not
 * what this system proves. Section 5 is the general form - the wording of a credential is its
 * liability boundary. The control is that the package cannot form the sentence.
 *
 * Three layers, the same construction `packages/reproduce/test/claims.test.ts` uses:
 *
 *  1. THE GUARD ITSELF, mutation-tested from both sides.
 *  2. EVERY SENTENCE THE PACKAGE EMITS AT RUNTIME, driven through the real builders on the real
 *     shapes, including the empty and the broken cases.
 *  3. EVERY STRING LITERAL IN THE SOURCE, so a sentence added tomorrow is covered whether or not a
 *     test reaches it.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_VERDICT_PHRASES } from "@slop/core";
import type { NotaryTimestampRow } from "@slop/db";
import {
  FORBIDDEN_ATTESTATION_PHRASES,
  ForbiddenAttestationError,
  HUMANITY_NOUNS,
  LIMITATION,
  VERIFICATION_CAVEAT,
  assertAttestable,
  buildStatement,
  neutralizeAuthorityNoun,
  findAttestationViolations,
  formatVerification,
  summariseRecording,
  TOKEN_VERIFICATION_SCOPE,
} from "@slop/notary";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, "../src");

const stamp = (over: Partial<NotaryTimestampRow> = {}): NotaryTimestampRow => ({
  timestampId: "tsr1",
  chainId: "chn1",
  rootSha256: "ab".repeat(32),
  authorityId: "belgium",
  authorityUrl: "https://tsa.belgium.be/connect",
  jurisdiction: "BE, EU qualified",
  status: "granted",
  genTime: "2026-08-24T09:30:00.000Z",
  token: "AAAA",
  failureReason: null,
  requestedAt: "2026-08-24T09:30:01.000Z",
  ...over,
});

describe("the guard is a real guard", () => {
  it("inherits core's list wholesale rather than restating it", () => {
    for (const phrase of FORBIDDEN_VERDICT_PHRASES) {
      expect(FORBIDDEN_ATTESTATION_PHRASES, `core banned ${JSON.stringify(phrase)} and this package did not`).toContain(
        phrase,
      );
    }
    expect(FORBIDDEN_ATTESTATION_PHRASES.length).toBeGreaterThan(FORBIDDEN_VERDICT_PHRASES.length);
  });

  const knownBad: readonly string[] = [
    "Verified human.",
    "This is a human-verified work.",
    "Proof of humanity for this file.",
    "This credential certifies the work is original work.",
    "We guarantee this was made by a human.",
    "This proves the artist drew it.",
    "The creator recorded every step.",
    "A person made this file over four days.",
    "This record is tamper-proof.",
    "The author is identity verified.",
    "This is authentic and genuine.",
  ];

  for (const sentence of knownBad) {
    it(`refuses to emit: ${JSON.stringify(sentence)}`, () => {
      expect(findAttestationViolations(sentence).length, sentence).toBeGreaterThan(0);
      expect(() => assertAttestable(sentence)).toThrow(ForbiddenAttestationError);
    });
  }

  const knownGood: readonly string[] = [
    "We recorded 41 steps of this file's history, the first of them dated 2026-08-20T09:00:00.000Z.",
    "The root of that record was timestamped by 3 independent authorities in 2 jurisdictions.",
    "It does not show who operated it, and we make no claim about any person.",
    "A recorded process shows that a tool was operated over time.",
    "One authority we asked did not return a usable token.",
  ];

  for (const sentence of knownGood) {
    it(`allows: ${JSON.stringify(sentence)}`, () => {
      expect(findAttestationViolations(sentence), sentence).toEqual([]);
    });
  }

  it("lets a sentence name a person only while saying what is not known about them", () => {
    // The rule that does the actual work. Same words, opposite claim, opposite outcome.
    expect(findAttestationViolations("This shows who operated the tool.").length).toBeGreaterThan(0);
    expect(findAttestationViolations("This does not show who operated the tool.")).toEqual([]);
    // And it is word-bounded, so "humanities" in a filename does not read as "human".
    expect(findAttestationViolations("The tool wrote to humanities-notes.txt.")).toEqual([]);
  });

  it("neutralises the word authority, and nothing wider", () => {
    // A real collision found by this suite: core bans "the author", and "the authority" contains
    // it. The carve-out is one noun, and the phrase it collides with must still be caught.
    expect(neutralizeAuthorityNoun("the authority's certificate chain")).toBe("the TSA's certificate chain");
    expect(neutralizeAuthorityNoun("three authorities answered")).toBe("three TSA answered");
    expect(neutralizeAuthorityNoun("the author of the file")).toBe("the author of the file");
    expect(findAttestationViolations("We did not check the signature against the authority chain.")).toEqual([]);
    expect(findAttestationViolations("We recorded what the author did.").length).toBeGreaterThan(0);
    expect(findAttestationViolations("This names the authorship of the file.").length).toBeGreaterThan(0);
  });

  it("covers every humanity noun, not just the obvious one", () => {
    for (const noun of HUMANITY_NOUNS) {
      const sentence = `This record identifies the ${noun} behind the file.`;
      expect(findAttestationViolations(sentence).length, sentence).toBeGreaterThan(0);
    }
  });
});

describe("every sentence the package can emit at runtime", () => {
  const collected: string[] = [];

  it("drives every arm of the credential builder", () => {
    // A full record.
    collected.push(
      buildStatement({
        eventCount: 41,
        firstDeclaredAt: "2026-08-20T09:00:00.000Z",
        lastDeclaredAt: "2026-08-24T11:00:00.000Z",
        rootSha256: "ab".repeat(32),
        grantedTimestamps: [stamp(), stamp({ authorityId: "sigstore", jurisdiction: "US, Linux Foundation" })],
        failedAuthorities: 2,
        chainDefects: [],
        recordingSummary: null,
      }),
    );
    // No timestamps at all.
    collected.push(
      buildStatement({
        eventCount: 1,
        firstDeclaredAt: "2026-08-20T09:00:00.000Z",
        lastDeclaredAt: "2026-08-20T09:00:00.000Z",
        rootSha256: "cd".repeat(32),
        grantedTimestamps: [],
        failedAuthorities: 4,
        chainDefects: [],
        recordingSummary: null,
      }),
    );
    // A broken chain and a recording.
    collected.push(
      buildStatement({
        eventCount: 9,
        firstDeclaredAt: null,
        lastDeclaredAt: null,
        rootSha256: "ef".repeat(32),
        grantedTimestamps: [stamp()],
        failedAuthorities: 0,
        chainDefects: ["leaf_mismatch at 3", "time_reversal at 4"],
        recordingSummary: summariseRecording(
          {
            sourceTool: "procreate",
            parserId: "procreate/v1-minimal",
            frames: [
              { index: 0, atMsFromStart: 0, sha256: "aa".repeat(32), byteLength: 10 },
              { index: 1, atMsFromStart: 1000, sha256: "aa".repeat(32), byteLength: 10 },
            ],
            durationMs: 1000,
            finalFileSha256: "bb".repeat(32),
            unparsedFields: ["the timelapse video segments inside the archive are not extracted by this parser"],
          },
          [{ kind: "repeated_frame", at: 1, detail: "frame 1 is byte-identical to frame 0" }],
        ),
      }),
    );

    collected.push(LIMITATION, VERIFICATION_CAVEAT, ...TOKEN_VERIFICATION_SCOPE.checked, ...TOKEN_VERIFICATION_SCOPE.notChecked);

    collected.push(
      formatVerification({
        credentialId: "crd1",
        revoked: true,
        revocationReason: "the holder asked for it to be withdrawn",
        chain: { intact: false, root: "ab".repeat(32), eventCount: 3, defects: [] },
        rootMatches: false,
        tokens: [
          { authorityId: "belgium", jurisdiction: "BE", storedStatus: "granted", reverified: true, genTime: "2026-08-24T09:30:00.000Z", problem: null },
          { authorityId: "dfn", jurisdiction: "DE", storedStatus: "unreachable", reverified: false, genTime: null, problem: "no token was stored" },
        ],
        authoritiesReverified: 1,
        jurisdictionsReverified: 1,
        statementReproduced: false,
        problems: ["the stored statement is not what these facts produce"],
        recordIntact: false,
      }),
    );

    // The denominator: without it the assertion below could pass over an empty list.
    expect(collected.length).toBeGreaterThan(10);
    expect(collected.join(" ")).toContain("independent authorities");
    expect(collected.join(" ")).toContain("does not show who operated it");
    expect(collected.join(" ")).toContain("nothing here establishes");
  });

  it("finds no forbidden claim in any of them", () => {
    const violations = collected.flatMap((text) =>
      findAttestationViolations(text).map((v) => `${v.kind}: ${v.detail}\n  in: ${v.sentence}`),
    );
    expect(violations, violations.join("\n")).toEqual([]);
  });
});

/* --------------------------------------------------------------------------------------------- */

/** Pull string literals out of TypeScript source, skipping comments and regular expressions. */
function stringLiterals(source: string): string[] {
  const out: string[] = [];
  const REGEX_PRECEDERS = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "*", "\n", ""]);
  let lastSignificant = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (ch === "/" && REGEX_PRECEDERS.has(lastSignificant)) {
      i += 1;
      let inClass = false;
      while (i < source.length) {
        const c = source[i];
        if (c === "\\") {
          i += 2;
          continue;
        }
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "\n") break;
        else if (c === "/" && !inClass) break;
        i += 1;
      }
      i += 1;
      lastSignificant = "/";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      let buf = "";
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") {
          i += 2;
          buf += " ";
          continue;
        }
        if (quote === "`" && source[i] === "$" && source[i + 1] === "{") {
          let depth = 1;
          i += 2;
          while (i < source.length && depth > 0) {
            if (source[i] === "{") depth += 1;
            if (source[i] === "}") depth -= 1;
            i += 1;
          }
          buf += " ";
          continue;
        }
        buf += source[i];
        i += 1;
      }
      i += 1;
      out.push(buf);
      lastSignificant = '"';
      continue;
    }
    if (!/\s/.test(ch)) lastSignificant = ch;
    else if (ch === "\n") lastSignificant = "\n";
    i += 1;
  }
  return out;
}

/** A lowercase identifier-shaped literal is a code, not copy: "granted", "recording-frame". */
const isCode = (literal: string): boolean => /^[a-z0-9_./:+-]*$/.test(literal);

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** `claims.ts` has to WRITE every phrase it bans, so scanning it would be permanently red. */
const EXCLUDED = ["claims.ts"];

describe("every string literal in the source", () => {
  it("scans a non-empty set of files and sees the copy it is supposed to see", async () => {
    const files = await sourceFiles(srcDir);
    expect(files.length).toBeGreaterThan(6);
    const literals = (await Promise.all(files.map((f) => readFile(f, "utf8")))).flatMap(stringLiterals);
    expect(literals.length).toBeGreaterThan(100);
    // Sentinels: if the tokenizer breaks, these vanish and everything below goes vacuously green.
    expect(literals.some((l) => l.includes("does not show who operated it"))).toBe(true);
    expect(literals.some((l) => l.includes("openssl ts -verify"))).toBe(true);
  });

  it("keeps the exclusion list at exactly one file", () => {
    expect(EXCLUDED).toEqual(["claims.ts"]);
  });

  it("contains no forbidden claim", async () => {
    const files = (await sourceFiles(srcDir)).filter((f) => !EXCLUDED.includes(path.basename(f)));
    const violations: string[] = [];
    for (const file of files) {
      for (const literal of stringLiterals(await readFile(file, "utf8"))) {
        if (isCode(literal)) continue;
        for (const v of findAttestationViolations(literal)) {
          violations.push(`${path.relative(srcDir, file)}: [${v.kind}] ${v.detail}\n    in: ${v.sentence}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});

describe("no field anywhere can hold a person", () => {
  /**
   * The biometric refusal, expressed as a property of the type system.
   *
   * BIPA is $1,000 to $5,000 per scan with a private right of action, and the memo's conclusion is
   * that the mitigation which actually works is not collecting any of it. A rule somebody has to
   * follow decays; a schema with nowhere to put a face does not.
   */
  const FORBIDDEN_FIELD_NAMES = [
    "face",
    "selfie",
    "biometric",
    "faceTemplate",
    "voiceprint",
    "fingerprint",
    "keystroke",
    "keystrokes",
    "typingCadence",
    "documentImage",
    "idNumber",
    "ssn",
    "dateOfBirth",
    "fullName",
    "legalName",
    "email",
    "phone",
    "address",
    "ipAddress",
    "geolocation",
    "deviceFingerprint",
  ];
  const PROPERTY = /^\s*(?:readonly\s+|private\s+|public\s+|static\s+)*([A-Za-z_][A-Za-z0-9_]*)\s*[?!]?\s*[:=]/;

  it("scans a non-empty set of declarations, and the pattern can see them", async () => {
    const files = await sourceFiles(srcDir);
    const names: string[] = [];
    for (const file of files) {
      for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        const m = PROPERTY.exec(line);
        if (m?.[1] !== undefined) names.push(m[1]);
      }
    }
    expect(names.length).toBeGreaterThan(80);
    for (const known of ["chainId", "rootSha256", "genTime", "jurisdiction", "contentSha256"]) {
      expect(names, `the property scanner cannot see "${known}", so it proves nothing`).toContain(known);
    }
  });

  it("finds no biometric or identity field", async () => {
    const files = await sourceFiles(srcDir);
    const hits: string[] = [];
    for (const file of files) {
      for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        const name = PROPERTY.exec(line)?.[1];
        if (name === undefined) continue;
        if (FORBIDDEN_FIELD_NAMES.some((bad) => name.toLowerCase().includes(bad.toLowerCase()))) {
          hits.push(`${path.basename(file)}: ${name}`);
        }
      }
    }
    expect(hits, "a field that can hold a person was added. There is deliberately nowhere to put one.").toEqual([]);
  });

  it("would catch one if it were added", () => {
    const fake = "  readonly faceTemplate: string;\n  readonly ipAddress: string;";
    const found = fake
      .split("\n")
      .map((l) => PROPERTY.exec(l)?.[1])
      .filter((n): n is string => n !== undefined)
      .filter((n) => FORBIDDEN_FIELD_NAMES.some((bad) => n.toLowerCase().includes(bad.toLowerCase())));
    expect(found).toEqual(["faceTemplate", "ipAddress"]);
  });
});
