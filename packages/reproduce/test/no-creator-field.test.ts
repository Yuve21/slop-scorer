/**
 * You cannot name someone if there is nowhere to put the name.
 *
 * Defamation and false light both require that the plaintiff be identified
 * (`publicity-defamation-risk.md` Tier 1 #1). Every other control against that is a rule somebody
 * has to follow; this one is a property of the type system, and the only way it degrades is if
 * somebody adds a field. So this test walks the source for creator-shaped property names.
 *
 * It also checks the other direction: `providerId`, `model` and `prompt` DO exist, because those
 * name our own suppliers and our own words, which is the opposite direction of travel and is what
 * makes the receipt substantiable.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deterministicRuntime } from "@slop/reproduce";
import {
  MockProvider,
  NoFacesDetector,
  ProviderRegistry,
  ReproductionPipeline,
} from "@slop/reproduce";
import { consentFor, imageInput } from "./fixtures.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, "../src");

/**
 * Names that could hold a human identity for the SUBMITTED artifact.
 *
 * Deliberately broad, including the near-misses (`handle`, `sourceUrl`, `fileName`) that carry an
 * identity without looking like they do: an original filename is routinely a person's name, and a
 * source URL is routinely their profile.
 */
const FORBIDDEN_FIELD_NAMES = [
  "creator",
  "author",
  "artist",
  "owner",
  "uploader",
  "designer",
  "developer",
  "client",
  "vendor",
  "maker",
  "photographer",
  "handle",
  "username",
  "userName",
  "userId",
  "email",
  "accountId",
  "profileUrl",
  "sourceUrl",
  "originUrl",
  "filename",
  "fileName",
  "displayName",
  "attribution",
  "byline",
  "copyrightHolder",
];

/**
 * The allowlist, pinned at one.
 *
 * `submitterAssertsRights` is a boolean on the consent record: it stores WHETHER a representation
 * was made, never by whom. It matches the pattern only because the word "submitter" appears in it.
 * Pinning the length is what stops this from becoming the place inconvenient fields go to live.
 */
const ALLOWED = ["submitterAssertsRights"];

/** `name: type` or `name?: type` or `name = ...` at the start of a line. */
const PROPERTY = /^\s*(?:readonly\s+|private\s+|public\s+|static\s+)*([A-Za-z_][A-Za-z0-9_]*)\s*[?!]?\s*[:=]/;

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

async function declaredProperties(): Promise<{ readonly file: string; readonly name: string }[]> {
  const out: { file: string; name: string }[] = [];
  for (const file of await sourceFiles(srcDir)) {
    const text = await readFile(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      // Skip comment lines so a word in prose is not read as a field.
      if (/^\s*(\*|\/\/)/.test(line)) continue;
      const m = PROPERTY.exec(line);
      if (m?.[1] !== undefined) out.push({ file: path.relative(srcDir, file), name: m[1] });
    }
  }
  return out;
}

describe("no field anywhere can hold the identity of whoever made the submitted artifact", () => {
  it("scans a non-empty set of declarations, and the pattern can actually see them", async () => {
    // The denominator, plus a mutation of the pattern itself. Both are here because a regex that
    // cannot express its input fails SILENTLY, which is the exact bug the source corpus shipped.
    const props = await declaredProperties();
    expect(props.length).toBeGreaterThan(150);
    const names = new Set(props.map((p) => p.name));
    for (const known of ["artifactId", "providerId", "model", "prompt", "costUsd", "sha256", "scopes"]) {
      expect(names, `the property scanner cannot see "${known}", so it proves nothing`).toContain(known);
    }
  });

  it("finds no creator-shaped field", async () => {
    const props = await declaredProperties();
    const hits = props.filter(
      (p) =>
        !ALLOWED.includes(p.name) &&
        FORBIDDEN_FIELD_NAMES.some((bad) => p.name.toLowerCase() === bad.toLowerCase() || p.name.toLowerCase().includes(bad.toLowerCase())),
    );
    expect(
      hits.map((h) => `${h.file}: ${h.name}`),
      "a field that can hold a person's identity was added. There is deliberately nowhere to put one.",
    ).toEqual([]);
  });

  it("keeps the allowlist at exactly one, boolean, entry", async () => {
    expect(ALLOWED).toEqual(["submitterAssertsRights"]);
    const consentSource = await readFile(path.join(srcDir, "consent.ts"), "utf8");
    expect(consentSource).toContain("readonly submitterAssertsRights: boolean;");
  });

  it("would catch a creator field if one were added", async () => {
    // Mutation of the check. Without this the file could be passing on a scanner that reads nothing.
    const fake = "  readonly creatorName: string;\n  readonly originUrl: string;";
    const hits = fake
      .split("\n")
      .map((line) => PROPERTY.exec(line)?.[1])
      .filter((n): n is string => n !== undefined)
      .filter((n) => FORBIDDEN_FIELD_NAMES.some((bad) => n.toLowerCase().includes(bad.toLowerCase())));
    expect(hits).toEqual(["creatorName", "originUrl"]);
  });

  it("carries only what identifies OUR side, on a real result", async () => {
    const runtime = deterministicRuntime();
    const pipeline = new ReproductionPipeline({
      registry: new ProviderRegistry().register(new MockProvider({ modality: "image" })),
      faceDetector: new NoFacesDetector(),
      runtime,
    });
    const input = imageInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    // Serialise the whole thing, the way a caller logging a result would.
    const json = JSON.stringify(result, (_k, v: unknown) =>
      v instanceof Uint8ClampedArray ? `<${v.length} bytes>` : v,
    );
    for (const bad of FORBIDDEN_FIELD_NAMES) {
      expect(json.toLowerCase(), `a serialised result contains "${bad}"`).not.toContain(`"${bad.toLowerCase()}"`);
    }
    expect(json).toContain("providerId");
    expect(json).toContain("prompt");
  });

  it("holds a digest and a byte length for the artifact, and nothing else about where it came from", async () => {
    const source = await readFile(path.join(srcDir, "types.ts"), "utf8");
    const block = /export interface ArtifactRef \{([\s\S]*?)\n\}/.exec(source)?.[1];
    expect(block, "ArtifactRef could not be located, so this assertion proves nothing").toBeTruthy();
    const fields = (block ?? "")
      .split("\n")
      .map((l) => PROPERTY.exec(l)?.[1])
      .filter((n): n is string => n !== undefined);
    expect(fields.sort()).toEqual(["artifactId", "byteLength", "mediaType", "sha256"]);
  });
});
