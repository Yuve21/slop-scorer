import { NoDetectorError } from "./errors.js";
import { buildReport } from "./score.js";
import type { Report, ScoreOptions } from "./score.js";
import type { AnalyzeContext, Detector, DetectorResult, Input, Modality, RuleDescriptor } from "./types.js";
import { assertWellFormedResult } from "./validate.js";

/**
 * The plugin registry. Modalities are added here and nowhere else.
 *
 * `analyze` runs every detector that accepts the input, validates each result against the
 * contract, and hands the lot to the engine. Multi-modal is therefore not a future
 * refactor: a video detector and a text detector can both claim the same file and their
 * findings land in one receipt with one score.
 */
export class DetectorRegistry {
  readonly #detectors = new Map<string, Detector>();

  register(detector: Detector): this {
    if (this.#detectors.has(detector.id)) {
      throw new Error(`Detector "${detector.id}" is already registered.`);
    }
    this.#detectors.set(detector.id, detector);
    return this;
  }

  get(id: string): Detector | undefined {
    return this.#detectors.get(id);
  }

  list(): readonly Detector[] {
    return [...this.#detectors.values()];
  }

  byModality(modality: Modality): readonly Detector[] {
    return this.list().filter((d) => d.modality === modality);
  }

  /** Every rule in every registered corpus. This is the MCP `list_rules` payload. */
  rules(filter?: { readonly family?: string; readonly modality?: Modality }): readonly (RuleDescriptor & {
    readonly detectorId: string;
    readonly modality: Modality;
  })[] {
    return this.list()
      .filter((d) => !filter?.modality || d.modality === filter.modality)
      .flatMap((d) => d.rules.map((r) => ({ ...r, detectorId: d.id, modality: d.modality })))
      .filter((r) => !filter?.family || r.family === filter.family);
  }

  resolve(input: Input): readonly Detector[] {
    return this.list().filter((d) => d.canHandle(input));
  }

  /** Run the detectors that accept this input. Throws if none does. */
  async run(input: Input, ctx?: AnalyzeContext): Promise<readonly DetectorResult[]> {
    const detectors = this.resolve(input);
    if (detectors.length === 0) {
      throw new NoDetectorError(input.kind, [...this.#detectors.keys()]);
    }
    const results = await Promise.all(detectors.map((d) => d.analyze(input, ctx)));
    return results.map(assertWellFormedResult);
  }

  /** Analyze then score. The one call the three product faces share. */
  async analyze(input: Input, ctx?: AnalyzeContext, scoring?: ScoreOptions): Promise<Report> {
    const results = await this.run(input, ctx);
    return buildReport(results, scoring);
  }
}
