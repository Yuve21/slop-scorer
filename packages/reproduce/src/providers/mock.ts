/**
 * The mock provider. Deterministic, offline, keyless - and the only provider the suite uses.
 *
 * This is not a placeholder for a real provider; it is the reference implementation of the
 * contract. Everything the product promises - a measured elapsed time, a measured cost, a prompt
 * shown to the user, a hard timeout, a refusal that is recorded rather than swallowed - is
 * exercised here with no network and no key, so the legal controls around it are tested on every
 * run rather than on the days somebody has credentials.
 *
 * The approximations it produces are real transformations of the real input. A provider that
 * returned a canned image would make every downstream test a test of the canned image.
 */

import { createHash } from "node:crypto";
import type { AttemptBudget } from "../budget.js";
import type { Env, ReproductionProvider } from "../provider.js";
import type { Raster } from "../raster.js";
import { PAPER, createRaster, getPixel, setPixel } from "../raster.js";
import type {
  ReproductionAttempt,
  ReproductionInput,
  ReproductionModality,
  ReproductionOutput,
} from "../types.js";

/** What the mock should do on this call. Explicit, so a test never depends on input trivia. */
export type MockBehaviour =
  | "produce"
  /** Return a provider-side decline, the way a safety filter does. */
  | "safety_refusal"
  /** Reach the model and fail, the way a capability gap shows up in practice. */
  | "capability_gap"
  /** Run past the deadline, so the abort path is exercised rather than assumed. */
  | "overrun";

export interface MockProviderOptions {
  readonly id?: string;
  readonly modality: ReproductionModality;
  readonly behaviour?: MockBehaviour;
  /** Simulated wall clock. Real elapsed is measured against the injected clock either way. */
  readonly latencyMs?: number;
  readonly costUsd?: number;
  readonly model?: string;
}

const DEFAULT_LATENCY: Readonly<Record<ReproductionModality, number>> = {
  text: 1_200,
  image: 2_400,
  "website-from-screenshot": 38_000,
};

const DEFAULT_COST: Readonly<Record<ReproductionModality, number>> = {
  text: 0.0006,
  image: 0.0039,
  "website-from-screenshot": 0.15,
};

export class MockProvider implements ReproductionProvider {
  readonly id: string;
  readonly modality: ReproductionModality;
  readonly model: string;
  readonly declaredCostUsdPerCall: number;
  readonly hardTimeoutMs: number;
  readonly requiredEnv: readonly string[] = [];
  readonly publishableInComparisons = true;
  private readonly behaviour: MockBehaviour;
  private readonly latencyMs: number;

  constructor(opts: MockProviderOptions) {
    this.modality = opts.modality;
    this.id = opts.id ?? `mock-${opts.modality}`;
    this.model = opts.model ?? `mock-${opts.modality}-v1`;
    this.behaviour = opts.behaviour ?? "produce";
    this.latencyMs = opts.latencyMs ?? DEFAULT_LATENCY[opts.modality];
    this.declaredCostUsdPerCall = opts.costUsd ?? DEFAULT_COST[opts.modality];
    this.hardTimeoutMs = Math.max(1_000, Math.round(this.latencyMs * 1.5));
  }

  /** No key, no transport, nothing to configure. That is the point of it. */
  isConfigured(_env: Env): boolean {
    return true;
  }

  estimateCost(input: ReproductionInput): number {
    const units = input.modality === "text" ? input.text.length / 4_000 : pixelsOf(input) / 1_000_000;
    return round4(this.declaredCostUsdPerCall * (1 + Math.min(2, units)));
  }

  async reproduce(input: ReproductionInput, budget: AttemptBudget): Promise<ReproductionAttempt> {
    const startedAtMs = budget.clock.now();
    const startedAt = budget.clock.iso();
    const seed = seedOf(input);
    const prompt = derivePrompt(input, seed);
    const cost = round4(Math.min(this.estimateCost(input), budget.maxCostUsd));

    budget.checkpoint();
    // `overrun` runs one millisecond past whatever deadline it was handed, rather than past a fixed
    // number of milliseconds. A fixed number would stop overrunning the moment somebody widened the
    // budget and the timeout path would go untested in silence, and landing ON the deadline is also
    // the honest model of an aborted call: it ends when we cut it off, not when it would have.
    const workMs =
      this.behaviour === "overrun" ? budget.deadlineAtMs - budget.clock.now() + 1 : this.latencyMs;
    await budget.sleep(workMs);
    // The deadline is checked AFTER the simulated work, which is where a real client would notice
    // it too. `checkpoint` throws and the pipeline records a timeout attempt.
    budget.checkpoint();

    const base = {
      attemptId: budget.attemptId,
      providerId: this.id,
      model: this.model,
      modality: this.modality,
      prompt,
      parameters: { seed, latencyMs: workMs, behaviour: this.behaviour } as const,
      startedAt,
      finishedAt: budget.clock.iso(),
      elapsedMs: budget.clock.now() - startedAtMs,
    };

    if (this.behaviour === "safety_refusal") {
      return {
        ...base,
        costUsd: 0,
        outcome: "refused",
        // Verbatim from the provider. Never paraphrased, because a paraphrase of a safety refusal
        // is where a claim about the artifact would sneak in.
        refusalNote: "provider declined: request matched a content safety filter",
        confounder: "provider_safety_refusal",
      };
    }
    if (this.behaviour === "capability_gap") {
      return {
        ...base,
        costUsd: cost,
        outcome: "error",
        refusalNote: "provider returned an error after accepting the request",
        confounder: "model_capability_gap",
      };
    }

    return { ...base, costUsd: cost, outcome: "produced", output: approximate(input, seed) };
  }
}

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

const pixelsOf = (input: ReproductionInput): number =>
  input.modality === "text" ? 0 : input.raster.width * input.raster.height;

/** Deterministic 32-bit seed from the artifact digest. Same artifact, same remake, always. */
export function seedOf(input: ReproductionInput): number {
  const h = createHash("sha256").update(input.artifact.sha256).digest();
  return ((h[0] ?? 0) << 24) | ((h[1] ?? 0) << 16) | ((h[2] ?? 0) << 8) | (h[3] ?? 0);
}

/**
 * The prompt, derived from measurable properties of the input.
 *
 * Shown to the user in full. Two constraints it has to satisfy: it describes the ARTIFACT and
 * never a person, and it contains nothing we did not measure. A prompt with an invented
 * adjective in it is the "fluent, specific, wrong" failure mode named in
 * `image-detection-reality.md`, moved from the verdict into the receipt.
 */
export function derivePrompt(input: ReproductionInput, seed: number): string {
  if (input.modality === "text") {
    const words = input.text.trim().split(/\s+/).filter(Boolean);
    const sentences = input.text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
    return [
      `Write a passage of about ${words.length} words in ${sentences.length} sentence(s).`,
      `Mean sentence length ${Math.round(words.length / Math.max(1, sentences.length))} words.`,
      `Register: match the submitted passage. Seed ${seed}.`,
    ].join(" ");
  }
  const { raster } = input;
  const palette = dominantPalette(raster, 4);
  return [
    `Produce an image ${raster.width}x${raster.height}.`,
    `Dominant palette ${palette.join(", ")}.`,
    `Mean luma ${Math.round(meanLuma(raster))} of 255.`,
    input.modality === "website-from-screenshot"
      ? `Layout: ${countBands(raster).length} stacked horizontal bands.`
      : `Detail: coarse, ${Math.round(edgeDensity(raster) * 100)} edge units per 100 samples.`,
    `Seed ${seed}.`,
  ].join(" ");
}

function approximate(input: ReproductionInput, seed: number): ReproductionOutput {
  if (input.modality === "text") return { kind: "text", text: approximateText(input.text, seed) };
  if (input.modality === "image") return { kind: "raster", raster: approximateImage(input.raster, seed) };
  const { html, preview } = approximateSite(input.raster, seed);
  return { kind: "html", html, preview };
}

/**
 * Text: a deterministic near-paraphrase.
 *
 * Substitutions only, order preserved. It is a stand-in for a model call and it behaves like the
 * cheap end of one: recognisably the same passage, not the same words.
 */
export function approximateText(text: string, seed: number): string {
  const swaps: readonly (readonly [RegExp, string])[] = [
    [/\bhowever\b/gi, "that said"],
    [/\btherefore\b/gi, "so"],
    [/\bin order to\b/gi, "to"],
    [/\bvery\b/gi, "quite"],
    [/\bbegin\b/gi, "start"],
    [/\bpurchase\b/gi, "buy"],
    [/\butilize\b/gi, "use"],
    [/\badditionally\b/gi, "also"],
    [/\bapproximately\b/gi, "about"],
    [/\bdemonstrate\b/gi, "show"],
  ];
  let out = text.replace(/\s+/g, " ").trim();
  for (const [re, to] of swaps) out = out.replace(re, to);
  // One seeded, reversible tic, so two different artifacts do not produce byte-identical remakes.
  const tail = seed % 2 === 0 ? "" : " ";
  return `${out}${tail}`.trimEnd();
}

/** Image: downsample, quantise, upsample. A visible approximation of the same picture. */
export function approximateImage(src: Raster, seed: number): Raster {
  const levels = 5 + (seed % 3);
  const block = Math.max(2, Math.round(Math.min(src.width, src.height) / 24));
  const out = createRaster(src.width, src.height, PAPER);
  for (let by = 0; by < src.height; by += block) {
    for (let bx = 0; bx < src.width; bx += block) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = by; y < Math.min(src.height, by + block); y += 1) {
        for (let x = bx; x < Math.min(src.width, bx + block); x += 1) {
          const p = getPixel(src, x, y);
          r += p[0];
          g += p[1];
          b += p[2];
          n += 1;
        }
      }
      if (n === 0) continue;
      const q = (v: number): number => Math.round(Math.round(v / n / (255 / levels)) * (255 / levels));
      const color: readonly [number, number, number] = [q(r), q(g), q(b)];
      for (let y = by; y < Math.min(src.height, by + block); y += 1) {
        for (let x = bx; x < Math.min(src.width, bx + block); x += 1) setPixel(out, x, y, color);
      }
    }
  }
  return out;
}

interface SiteBand {
  readonly y: number;
  readonly h: number;
  readonly ink: number;
}

/** Rows whose ink density crosses the page mean, grouped. The crudest possible layout read. */
export function countBands(src: Raster): SiteBand[] {
  const density: number[] = [];
  for (let y = 0; y < src.height; y += 1) {
    let dark = 0;
    for (let x = 0; x < src.width; x += 1) {
      const p = getPixel(src, x, y);
      if (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2] < 200) dark += 1;
    }
    density.push(dark / src.width);
  }
  const mean = density.reduce((a, b) => a + b, 0) / Math.max(1, density.length);
  const bands: SiteBand[] = [];
  let start = -1;
  for (let y = 0; y <= src.height; y += 1) {
    const on = y < src.height && (density[y] ?? 0) > mean;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      const slice = density.slice(start, y);
      bands.push({
        y: start,
        h: y - start,
        ink: slice.reduce((a, b) => a + b, 0) / Math.max(1, slice.length),
      });
      start = -1;
    }
  }
  return bands;
}

/** Website from screenshot: bands become sections, and the preview is drawn from the sections. */
export function approximateSite(src: Raster, seed: number): { html: string; preview: Raster } {
  const bands = countBands(src);
  const preview = createRaster(src.width, src.height, PAPER);
  const rows: string[] = [];
  for (const band of bands) {
    const shade = Math.max(0, Math.min(255, Math.round(255 - band.ink * 255)));
    rows.push(
      `    <section style="height:${band.h}px;background:rgb(${shade},${shade},${shade})"></section>`,
    );
    for (let y = band.y; y < band.y + band.h; y += 1) {
      for (let x = 0; x < src.width; x += 1) setPixel(preview, x, y, [shade, shade, shade]);
    }
  }
  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    "    <meta charset=\"utf-8\" />",
    `    <title>Approximation ${seed}</title>`,
    "  </head>",
    "  <body style=\"margin:0\">",
    ...rows,
    "  </body>",
    "</html>",
  ].join("\n");
  return { html, preview };
}

function meanLuma(r: Raster): number {
  let total = 0;
  const step = Math.max(1, Math.floor((r.width * r.height) / 20_000));
  let n = 0;
  for (let i = 0; i < r.width * r.height; i += step) {
    const p = getPixel(r, i % r.width, Math.floor(i / r.width));
    total += 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
    n += 1;
  }
  return n === 0 ? 0 : total / n;
}

function edgeDensity(r: Raster): number {
  let edges = 0;
  let n = 0;
  for (let y = 1; y < r.height; y += 4) {
    for (let x = 1; x < r.width; x += 4) {
      const a = getPixel(r, x, y);
      const b = getPixel(r, x - 1, y - 1);
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 60) edges += 1;
      n += 1;
    }
  }
  return n === 0 ? 0 : edges / n;
}

function dominantPalette(r: Raster, count: number): string[] {
  const buckets = new Map<string, number>();
  const step = Math.max(1, Math.floor((r.width * r.height) / 8_000));
  for (let i = 0; i < r.width * r.height; i += step) {
    const p = getPixel(r, i % r.width, Math.floor(i / r.width));
    const key = [p[0], p[1], p[2]].map((v) => Math.round(v / 32) * 32).join("-");
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([key]) => key.split("-").map((v) => Number(v).toString(16).padStart(2, "0")).join(""));
}
