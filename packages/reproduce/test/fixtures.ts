/**
 * Shared fixtures. No keys, no network, no timers, no randomness.
 *
 * Every artifact here is built from bytes the test owns and digested for real, because
 * `ArtifactRef.sha256` is also the mock provider's seed: a fixture with a fake digest would make
 * every determinism assertion in the suite a tautology.
 */

import { createHash } from "node:crypto";
import type { ArtifactRef, ConsentRecord, Raster, ReproductionInput } from "@slop/reproduce";
import { createRaster, grantConsent, setPixel } from "@slop/reproduce";

export function artifactFrom(bytes: Uint8Array, mediaType: string, id = "art_test"): ArtifactRef {
  return {
    artifactId: id,
    mediaType,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export const SAMPLE_TEXT =
  "However, the team will begin to utilize the new process in order to demonstrate approximately the same result. Therefore the purchase was very simple.";

export function textInput(text: string = SAMPLE_TEXT, id = "art_text"): ReproductionInput {
  const bytes = new TextEncoder().encode(text);
  return { modality: "text", artifact: artifactFrom(bytes, "text/plain", id), text };
}

/**
 * A light, smooth gradient. No pixel is dark enough to read as ink.
 *
 * Cool rather than warm, and that is not decoration: the first version ran red-dominant and its
 * bottom-right corner drifted into the heuristic detector's skin-tone band, so the "no face here"
 * control case was quietly testing a face. The stand-in detector really is that crude, which is why
 * it declares itself not production grade.
 */
export function gradientRaster(w = 96, h = 96): Raster {
  const r = createRaster(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      setPixel(r, x, y, [150 + (((x * 60) / w) | 0), 165 + (((y * 55) / h) | 0), 235]);
    }
  }
  return r;
}

/**
 * A deliberately hostile panel image: high-contrast, mostly near-black, full of hard edges.
 *
 * The OCR export test runs against this as well as the gentle gradient, because a figure whose
 * disclaimer is only readable over pale artwork is a figure whose disclaimer is not readable.
 */
export function harshRaster(w = 96, h = 96): Raster {
  const r = createRaster(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const on = ((x >> 2) + (y >> 3)) % 3 !== 0;
      setPixel(r, x, y, on ? [8, 10, 14] : [240, 238, 232]);
    }
  }
  return r;
}

/** Fills a block with a tone the heuristic detector's skin-tone band accepts. */
export function faceLikeRaster(w = 96, h = 96): Raster {
  const r = createRaster(w, h, [245, 245, 245]);
  for (let y = 0; y < Math.floor(h / 2); y += 1) {
    for (let x = 0; x < Math.floor(w / 2); x += 1) setPixel(r, x, y, [220, 150, 120]);
  }
  return r;
}

export function imageInput(raster: Raster = gradientRaster(), id = "art_image"): ReproductionInput {
  return {
    modality: "image",
    artifact: artifactFrom(new Uint8Array(raster.data.buffer.slice(0)), "image/png", id),
    raster,
  };
}

export function siteInput(raster: Raster = harshRaster(160, 200), id = "art_site"): ReproductionInput {
  return {
    modality: "website-from-screenshot",
    artifact: artifactFrom(new Uint8Array(raster.data.buffer.slice(0)), "image/png", id),
    raster,
  };
}

/** A valid, unexpired, correctly scoped consent for one artifact. */
export function consentFor(artifactId: string, nowMs: number): ConsentRecord {
  return grantConsent({
    consentId: `cns_${artifactId}`,
    artifactId,
    nowMs,
    ttlMs: 60 * 60 * 1000,
    scopes: ["transmit_to_provider", "regenerate", "compose_side_by_side"],
    submitterAssertsRights: true,
  });
}
