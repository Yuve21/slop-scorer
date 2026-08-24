/**
 * The provider contract, and the providers we are not allowed to use.
 *
 * Assume NO API KEY EXISTS. That is not a temporary state of this repository, it is the design:
 * everything in this package must be testable and demonstrable with zero keys and zero network,
 * because a legal control that only runs when a key is present is a legal control that has never
 * been tested. `MockProvider` is what the suite exercises; real providers are descriptors that
 * decline cleanly until somebody wires both a key and a transport.
 */

import type { AttemptBudget } from "./budget.js";
import type { ReproductionAttempt, ReproductionInput, ReproductionModality } from "./types.js";

export type Env = Readonly<Record<string, string | undefined>>;

export interface ReproductionProvider {
  readonly id: string;
  readonly modality: ReproductionModality;
  /** The specific model this provider calls. Printed on the receipt; never inferred. */
  readonly model: string;
  /** Declared per-call cost, in dollars. Checked against the ledger BEFORE the call is made. */
  readonly declaredCostUsdPerCall: number;
  /** Abort at this point no matter what the request budget allows. */
  readonly hardTimeoutMs: number;
  /** Environment variables this provider needs. Reported verbatim in `not_configured`. */
  readonly requiredEnv: readonly string[];
  /**
   * False when the vendor's terms bar us from publishing comparative measurements of it.
   *
   * Two vendors in the research have operative benchmarking clauses that bite. Carrying it as a
   * field means the substantiation aggregate can exclude them from anything published, rather
   * than somebody remembering.
   */
  readonly publishableInComparisons: boolean;
  /** True only when a key AND a working transport are both present. */
  isConfigured(env: Env): boolean;
  /** Dollars, for this specific input. Must not perform I/O. */
  estimateCost(input: ReproductionInput): number;
  reproduce(input: ReproductionInput, budget: AttemptBudget): Promise<ReproductionAttempt>;
}

/**
 * Providers this product may not call, with the reason attached to each.
 *
 * These are refusals, not preferences. Registering one throws. The comments are the citation,
 * because in twelve months somebody will propose the fastest image model on the list and the only
 * thing that will stop them is the sentence explaining why it was excluded.
 */
export interface ForbiddenProvider {
  readonly id: string;
  readonly reason: string;
  readonly source: string;
  /** True when the service is simply unreachable to us rather than disallowed. */
  readonly unreachable?: boolean;
}

export const FORBIDDEN_PROVIDERS: readonly ForbiddenProvider[] = [
  {
    id: "azure-openai",
    // The Customer Copyright Commitment requires a metaprompt directing the model to prevent
    // copyright infringement, and an evaluation report in which "significant ongoing reproduction
    // of third-party content must be addressed". Reproduction is the feature. Accepting the
    // commitment would put us in documented breach of a benefit we thought we had, and our own
    // compliance artifact becomes the adverse exhibit. Worse than having no indemnity at all.
    reason:
      "Its copyright commitment requires mitigations that directly contradict this product's mechanic, and the compliance artifact it requires would be evidence against us.",
    source: "market-check-reproduction.md (d), vendor terms",
  },
  {
    id: "flux-1-dev",
    // The non-commercial licence excludes revenue-generating activity AND "end-user
    // interactions", so a public product breaches on day one - and the restriction follows the
    // weights onto hosted providers, so renting it does not launder it. FLUX schnell is
    // Apache-2.0 and is fine; the commercial BFL API is fine.
    reason:
      "Its licence is non-commercial and bars end-user interactions, and that restriction follows the weights onto any host that serves them.",
    source: "market-check-reproduction.md (d)",
  },
  {
    id: "gemini-developer-api-free-tier",
    // The free tier takes training rights in inputs. We do not own the inputs and cannot grant
    // that, which makes every call a warranty we are breaching.
    reason:
      "The free tier takes training rights in inputs, and the inputs here belong to somebody else, so that grant is not ours to give.",
    source: "market-check-reproduction.md (d)",
  },
  {
    id: "sora",
    reason: "The API is discontinued as of 2026-09-24, and the modality it served is deferred anyway.",
    source: "market-check-reproduction.md (c) blocker 1",
  },
  {
    id: "midjourney",
    // No API exists and automating the service is prohibited outright. This one is not a caution,
    // it is a permanent hole in the mechanic: the most likely generator behind a viral AI image
    // cannot be called at all. That is why `generator_inaccessible` is a first-class confounder
    // and why "we could not reproduce this" has to be an honest outcome rather than a failure.
    reason:
      "There is no API and automating the service is prohibited, so the most likely source of a widely shared image is permanently out of reach for this pipeline.",
    source: "market-check-reproduction.md (c) blocker 2",
    unreachable: true,
  },
];

export class ForbiddenProviderError extends Error {
  constructor(readonly entry: ForbiddenProvider) {
    super(`provider "${entry.id}" is not permitted: ${entry.reason} (${entry.source})`);
    this.name = "ForbiddenProviderError";
  }
}

export function findForbidden(providerId: string): ForbiddenProvider | undefined {
  const id = providerId.toLowerCase();
  // Substring in one direction only. The reverse ("sora" matching a provider called "s") would
  // make the guard fire on unrelated ids, and a guard that cries wolf gets deleted.
  return FORBIDDEN_PROVIDERS.find((f) => id === f.id || id.includes(f.id));
}

/**
 * The registry. Registration is the enforcement point for the forbidden list.
 *
 * Checking at call time would be too late: the interesting failure is somebody adding a provider,
 * seeing it work locally, and shipping it.
 */
export class ProviderRegistry {
  private readonly providers: ReproductionProvider[] = [];

  register(provider: ReproductionProvider): this {
    const forbidden = findForbidden(provider.id);
    if (forbidden !== undefined) throw new ForbiddenProviderError(forbidden);
    if (this.providers.some((p) => p.id === provider.id)) {
      throw new Error(`provider "${provider.id}" is already registered`);
    }
    this.providers.push(provider);
    return this;
  }

  all(): readonly ReproductionProvider[] {
    return this.providers;
  }

  for(modality: ReproductionModality): readonly ReproductionProvider[] {
    return this.providers.filter((p) => p.modality === modality);
  }

  configuredFor(modality: ReproductionModality, env: Env): readonly ReproductionProvider[] {
    return this.for(modality).filter((p) => p.isConfigured(env));
  }

  /** Every env var a caller would have to set to get this modality working, deduplicated. */
  missingEnvFor(modality: ReproductionModality, env: Env): readonly string[] {
    const missing = new Set<string>();
    for (const p of this.for(modality)) {
      for (const key of p.requiredEnv) if (env[key] === undefined || env[key] === "") missing.add(key);
    }
    return [...missing].sort();
  }
}
