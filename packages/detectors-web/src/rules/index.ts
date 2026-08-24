import type { RuleDescriptor } from "@slop/core";
import type { WebRule } from "../rule.js";
import { BUILDER_RULES } from "./builder.js";
import { COPY_RULES } from "./copy.js";
import { COUNTER_RULES } from "./counter.js";
import { CRAFT_RULES } from "./craft.js";
import { IMAGE_TEXT_RULES } from "./imagetext.js";
import { MOTION_RULES } from "./motion.js";
import { STRUCTURE_RULES } from "./structure.js";
import { VISUAL_RULES } from "./visual.js";

export const CORPUS_VERSION = "corpus-2026.09";

/**
 * The corpus.
 *
 * Deliberately assembled by SPREADING the family arrays rather than by listing rule ids,
 * so this file can never disagree with the files that own the rules. A list restated in a
 * second place is a list that goes stale in exactly one of them.
 */
export const WEB_RULES: readonly WebRule[] = [
  ...BUILDER_RULES,
  ...VISUAL_RULES,
  ...CRAFT_RULES,
  ...STRUCTURE_RULES,
  ...MOTION_RULES,
  ...COPY_RULES,
  ...IMAGE_TEXT_RULES,
  ...COUNTER_RULES,
];

export {
  BUILDER_RULES,
  VISUAL_RULES,
  CRAFT_RULES,
  STRUCTURE_RULES,
  MOTION_RULES,
  COPY_RULES,
  IMAGE_TEXT_RULES,
  COUNTER_RULES,
};

/** The public, citable description of every rule. This is the MCP `list_rules` payload. */
export const RULE_DESCRIPTORS: readonly RuleDescriptor[] = WEB_RULES.map((r) => ({
  id: r.id,
  family: r.family,
  title: r.title,
  polarity: r.polarity,
  baseWeight: r.baseWeight,
  severity: r.severity,
  ...(r.evidenceKind ? { evidenceKind: r.evidenceKind } : {}),
  explanation: r.explanation,
  falsePositiveNote: r.falsePositiveNote,
  ...(r.prevention ? { prevention: r.prevention } : {}),
  since: r.since,
}));

export const ruleById = (id: string): WebRule | undefined => WEB_RULES.find((r) => r.id === id);
