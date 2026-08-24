import { describe, expect, it } from "vitest";
import {
  assertMediaSafe,
  decideFetch,
  FORBIDDEN_MEDIA_PHRASES,
  ForbiddenMediaClaimError,
  mediaClaimViolations,
  phraseHit,
  PLATFORM_HOST_PATTERNS,
  platformRefusal,
  sentencesOf,
} from "@slop/provenance";
import { FORBIDDEN_VERDICT_PHRASES } from "@slop/core";

/**
 * The claim guard, mutation-tested.
 *
 * A guard nobody has tried to break is a comment. `packages/core/test/meta.ts` records what
 * happens when a pattern quietly stops expressing its input: a `[a-z_]+` that could not match
 * `wingman_nudge2_sent_at` left a security check silently passing for four commits. A phrase
 * list has exactly the same failure mode, so this file attacks it from both sides — sentences
 * that MUST be rejected, and sentences that must NOT be, because a guard that fires on honest
 * prose gets edited around and then stops guarding anything.
 */

describe("sentences the media detectors must never be able to form", () => {
  const forbidden = [
    // ...the artifact is machine-made
    "This image is synthetic.",
    "This is AI.",
    "The photograph is a deepfake.",
    "The clip was fabricated.",
    "This is likely AI.",
    "The submitter passed off a model's output as their own.",
    // ...the artifact is human-made. The inverse accusation, equally unsupportable.
    "This photograph is genuine.",
    "The recording is authentic and unaltered.",
    "This was made by a human.",
    "Verified human.",
    // ...a person did something
    "The creator used a generator.",
    "The designer lied about how this was produced.",
    "Your image was flagged.",
    // ...certainty
    "This proves the file came from a model.",
    "The manifest conclusively settles it.",
    // ...a voice belongs to somebody
    "This is a cloned voice.",
    "A voice clone of the narrator.",
    "The speaker is impersonating a public figure.",
  ];

  it.each(forbidden)("rejects: %s", (sentence) => {
    expect(mediaClaimViolations(sentence).length, sentence).toBeGreaterThan(0);
    expect(() => assertMediaSafe(sentence)).toThrow(ForbiddenMediaClaimError);
  });
});

describe("sentences the media detectors must remain able to form", () => {
  /**
   * The other half, and the half that is usually missing. Every string below is one this
   * product genuinely needs to print. A guard that rejected them would be quietly disabled by
   * the first person it inconvenienced.
   */
  const permitted = [
    "The manifest declares a digital source type in the trained-algorithmic family.",
    "A text chunk names Stable Diffusion web UI as the tool that wrote it.",
    "We read the container, the metadata and the Content Credential slot and found no declaration either way.",
    "This artifact reached us re-encoded, so we are not reporting a score for it.",
    "The container's writer field names an ffmpeg-family transcoder.",
    "No Content Credential was found, and we draw nothing from that in either direction.",
    "Published attacks remove these marks without access to the detector.",
    "A watermark that is not detected is not a finding.",
    "The EXIF block names a make, a model and a capture time.",
    "We did not retrieve this, because the platform prohibits automated downloading.",
  ];

  it.each(permitted)("permits: %s", (sentence) => {
    expect(mediaClaimViolations(sentence), sentence).toEqual([]);
  });
});

describe("the guard's own patterns are not dead", () => {
  it("inherits core's list wholesale rather than copying it", () => {
    for (const phrase of FORBIDDEN_VERDICT_PHRASES) {
      expect(FORBIDDEN_MEDIA_PHRASES, phrase).toContain(phrase);
    }
    expect(FORBIDDEN_MEDIA_PHRASES.length).toBeGreaterThan(FORBIDDEN_VERDICT_PHRASES.length);
  });

  it("every phrase in the list still matches something", () => {
    // A phrase that can no longer match anything is decoration. Each one is checked against
    // itself embedded in a sentence, which is the weakest possible version of the check and
    // still catches a phrase mangled by an edit.
    for (const phrase of FORBIDDEN_MEDIA_PHRASES) {
      expect(phraseHit(`the report said ${phrase} about it`, phrase), phrase).toBe(true);
    }
  });

  it("single-word phrases are matched at word boundaries, not as substrings", () => {
    // The bug this pins: core's list contains "lied", and a substring test makes "applied",
    // "supplied" and "implied" all violations. The guard would then be firing on honest prose,
    // which is how a guard gets switched off.
    expect(phraseHit("the mark is applied by the producer", "lied")).toBe(false);
    expect(phraseHit("the tool supplied a note", "lied")).toBe(false);
    expect(phraseHit("the designer lied about it", "lied")).toBe(true);
  });

  it("multi-word phrases are still matched as written", () => {
    expect(phraseHit("this is a deepfake of somebody", "is a deepfake")).toBe(true);
    expect(phraseHit("this is a deep fake", "is a deepfake")).toBe(false);
  });

  it("the attribution rule catches an origin word with no speaker", () => {
    const violations = mediaClaimViolations("The image was created in eight seconds.");
    expect(violations.map((v) => v.kind)).toContain("unattributed_origin");
  });

  it("and clears the same claim once it has one", () => {
    expect(mediaClaimViolations("We created a reproduction in eight seconds.")).toEqual([]);
    expect(mediaClaimViolations("The manifest states the file was created by that tool.")).toEqual([]);
  });

  it("splits on newlines as well as sentence terminators, so a list item is checked", () => {
    const text = "A fine sentence.\nThis image is synthetic\nAnother fine sentence.";
    expect(sentencesOf(text)).toHaveLength(3);
    expect(mediaClaimViolations(text).length).toBeGreaterThan(0);
  });
});

describe("the fetch policy refuses platforms and says so", () => {
  it("names a platform for every host in the table", () => {
    expect(PLATFORM_HOST_PATTERNS.length).toBeGreaterThanOrEqual(10);
    for (const { pattern, name } of PLATFORM_HOST_PATTERNS) {
      expect(name, pattern.source).toBeTruthy();
      // Anchored on the host boundary, so `nottiktok.com` is not caught by `tiktok.com`.
      expect(pattern.source.startsWith("(^|\\.)"), pattern.source).toBe(true);
    }
  });

  it("refuses a platform URL with a coded reason", () => {
    const decision = decideFetch("https://www.tiktok.com/@a/video/1");
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("cannot_fetch");
    expect(decision.reason).toBe("platform_terms");
    expect(decision.platform).toBe("TikTok");
  });

  it("does not catch a lookalike host", () => {
    expect(decideFetch("https://nottiktok.example.com/clip.mp4").allowed).toBe(true);
  });

  it("permits an ordinary host, so the policy is a list rather than a blanket", () => {
    expect(decideFetch("https://example.org/clip.mp4").allowed).toBe(true);
  });

  it("refuses a non-http scheme and an unparseable string, each with its own reason", () => {
    const scheme = decideFetch("file:///etc/passwd");
    const garbage = decideFetch("not a url at all");
    expect(scheme.allowed).toBe(false);
    expect(garbage.allowed).toBe(false);
    if (!scheme.allowed) expect(scheme.reason).toBe("unsupported_scheme");
    if (!garbage.allowed) expect(garbage.reason).toBe("not_a_url");
  });

  it("the refusal explains the constraint, offers the route that works, and claims nothing", () => {
    const text = platformRefusal("TikTok");
    expect(text).toMatch(/prohibits automated downloading/);
    expect(text).toMatch(/re-encoding gate/);
    expect(text).toMatch(/hand it to us directly/i);
    expect(mediaClaimViolations(text)).toEqual([]);
  });
});
