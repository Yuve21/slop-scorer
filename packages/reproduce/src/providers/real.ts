/**
 * Real providers, absent by default.
 *
 * Every one of these is a DESCRIPTOR plus a transport seam. None of them ships a network client,
 * and that is deliberate rather than unfinished: the moment this package can make a call by
 * itself, the legal controls in front of the call become the only thing standing between a stray
 * environment variable and somebody else's artifact leaving the process. Wiring a transport is
 * therefore an explicit, reviewable act.
 *
 * `isConfigured` requires BOTH a key and a transport, so a half-configured provider reports
 * `not_configured` with the missing variables named, rather than failing at call time or - much
 * worse - returning something plausible.
 *
 * Note what is not here. Azure OpenAI, FLUX.1 [dev], the free Gemini tier, Sora and Midjourney are
 * in `FORBIDDEN_PROVIDERS` in `provider.ts` with the reason attached to each; the registry throws
 * if one is registered. FLUX schnell is fine (Apache-2.0) and is below.
 */

import type { AttemptBudget } from "../budget.js";
import type { Env, ReproductionProvider } from "../provider.js";
import type { ReproductionAttempt, ReproductionInput, ReproductionModality } from "../types.js";

/**
 * The seam a real client plugs into.
 *
 * Intentionally minimal and intentionally unimplemented in this package. A caller that wants live
 * providers supplies one, and the supplying code is where request signing, retries and vendor
 * quirks live - not in the module that also owns the refusal logic.
 */
export interface ProviderTransport {
  readonly id: string;
  send(request: {
    readonly url: string;
    readonly method: "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body: unknown;
    readonly signal: AbortSignal;
  }): Promise<{ readonly status: number; readonly body: unknown }>;
}

interface RealProviderSpec {
  readonly id: string;
  readonly modality: ReproductionModality;
  readonly model: string;
  readonly endpoint: string;
  readonly requiredEnv: readonly string[];
  readonly declaredCostUsdPerCall: number;
  readonly hardTimeoutMs: number;
  readonly publishableInComparisons: boolean;
  /** Why this vendor was chosen, and any duty that attaches before the first call. */
  readonly note: string;
}

/**
 * The whole real-provider catalogue, as data.
 *
 * Costs are ceilings for budgeting, not price quotes. They are not published anywhere and they
 * are not a claim about any vendor's pricing.
 */
export const REAL_PROVIDER_SPECS: readonly RealProviderSpec[] = [
  {
    id: "anthropic-text",
    modality: "text",
    model: "claude-sonnet-latest",
    endpoint: "https://api.anthropic.com/v1/messages",
    requiredEnv: ["SLOP_ANTHROPIC_API_KEY"],
    declaredCostUsdPerCall: 0.004,
    hardTimeoutMs: 20_000,
    publishableInComparisons: true,
    note: "Preferred for the text leg and for prompt inversion: of the vendors reviewed it imposes the fewest affirmative duties this product would be guaranteed to breach. Its indemnity is void here either way, on input-rights grounds.",
  },
  {
    id: "openai-text",
    modality: "text",
    model: "gpt-latest",
    endpoint: "https://api.openai.com/v1/responses",
    requiredEnv: ["SLOP_OPENAI_API_KEY"],
    declaredCostUsdPerCall: 0.004,
    hardTimeoutMs: 20_000,
    publishableInComparisons: true,
    note: "Direct OpenAI only. Azure OpenAI is on the forbidden list; its copyright commitment requires mitigations against exactly the behaviour this product depends on.",
  },
  {
    id: "fal-flux-schnell",
    modality: "image",
    model: "flux-1-schnell",
    endpoint: "https://fal.run/fal-ai/flux/schnell",
    requiredEnv: ["SLOP_FAL_KEY"],
    declaredCostUsdPerCall: 0.02,
    hardTimeoutMs: 30_000,
    publishableInComparisons: true,
    note: "Schnell weights are Apache-2.0, so the licence travels cleanly onto a host. The [dev] weights do not and are forbidden. The host also forbids output that closely mimics assets used to train third-party models, which is a live constraint on how close we may try to get.",
  },
  {
    id: "bfl-flux-commercial",
    modality: "image",
    model: "flux-commercial",
    endpoint: "https://api.bfl.ai/v1/generate",
    requiredEnv: ["SLOP_BFL_API_KEY", "SLOP_BFL_CONTENT_LICENCE_OPTOUT_CONFIRMED"],
    declaredCostUsdPerCall: 0.06,
    hardTimeoutMs: 30_000,
    publishableInComparisons: true,
    note: "The second variable is not a key. Absent a signed opt-out sent to the vendor, its terms take a perpetual, sublicensable licence over inputs and outputs, and the inputs here are not ours to license. The flag records that the opt-out was sent before the first call.",
  },
  {
    id: "v0-site",
    modality: "website-from-screenshot",
    model: "v0-latest",
    endpoint: "https://api.v0.dev/v1/chat/completions",
    requiredEnv: ["SLOP_V0_API_KEY"],
    declaredCostUsdPerCall: 0.75,
    hardTimeoutMs: 180_000,
    publishableInComparisons: false,
    note: "The only screenshot-to-site service reviewed with a real headless API that accepts image attachments. Marked unpublishable in comparisons: its terms permit benchmarking of the vendor's services OTHER THAN its AI services, so a published comparison naming it is outside the permission.",
  },
];

/**
 * A configured-by-env, called-through-a-transport provider.
 *
 * `reproduce` is reachable only when `isConfigured` is true, which requires the transport. The
 * defensive branch returns an attempt marked `error` with a literal note. It does not throw and it
 * does not invent an output; a fake success here would poison the substantiation log, which is the
 * one record that has to be true.
 */
class EnvGatedProvider implements ReproductionProvider {
  readonly id: string;
  readonly modality: ReproductionModality;
  readonly model: string;
  readonly declaredCostUsdPerCall: number;
  readonly hardTimeoutMs: number;
  readonly requiredEnv: readonly string[];
  readonly publishableInComparisons: boolean;
  readonly note: string;

  constructor(
    spec: RealProviderSpec,
    private readonly transport?: ProviderTransport,
  ) {
    this.id = spec.id;
    this.modality = spec.modality;
    this.model = spec.model;
    this.declaredCostUsdPerCall = spec.declaredCostUsdPerCall;
    this.hardTimeoutMs = spec.hardTimeoutMs;
    this.requiredEnv = spec.requiredEnv;
    this.publishableInComparisons = spec.publishableInComparisons;
    this.note = spec.note;
  }

  isConfigured(env: Env): boolean {
    if (this.transport === undefined) return false;
    return this.requiredEnv.every((key) => {
      const value = env[key];
      return typeof value === "string" && value.length > 0;
    });
  }

  estimateCost(): number {
    return this.declaredCostUsdPerCall;
  }

  async reproduce(_input: ReproductionInput, budget: AttemptBudget): Promise<ReproductionAttempt> {
    const startedAt = budget.clock.iso();
    const startedAtMs = budget.clock.now();
    return {
      attemptId: budget.attemptId,
      providerId: this.id,
      model: this.model,
      modality: this.modality,
      prompt: "",
      parameters: {},
      startedAt,
      finishedAt: budget.clock.iso(),
      elapsedMs: budget.clock.now() - startedAtMs,
      costUsd: 0,
      outcome: "error",
      refusalNote: `no transport is wired for "${this.id}" in this build, so no call was made`,
    };
  }
}

/**
 * Build the real providers. With no transport (the default) every one reports unconfigured, and
 * the pipeline returns `not_configured` naming the variables that are missing.
 */
export function realProviders(transport?: ProviderTransport): readonly ReproductionProvider[] {
  return REAL_PROVIDER_SPECS.map((spec) => new EnvGatedProvider(spec, transport));
}

/** Documentation surface: which variables each modality would need. Used by the demo and the web app. */
export function requiredEnvByModality(): Readonly<Record<ReproductionModality, readonly string[]>> {
  const out: Record<ReproductionModality, string[]> = { text: [], image: [], "website-from-screenshot": [] };
  for (const spec of REAL_PROVIDER_SPECS) {
    for (const key of spec.requiredEnv) if (!out[spec.modality].includes(key)) out[spec.modality].push(key);
  }
  return out;
}
