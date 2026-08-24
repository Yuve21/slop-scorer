import type { RuleDescriptor } from "@slop/core";
import type { CodeRule } from "../rule.js";
import { AGENT_RULES } from "./agent-artifacts.js";
import { COMMENT_RULES } from "./comments.js";
import { CODE_COUNTER_RULES } from "./counter.js";
import { HISTORY_RULES } from "./history.js";
import { SCAFFOLD_RULES } from "./scaffold.js";
import { UNIFORMITY_RULES } from "./uniformity.js";
import { VERIFICATION_RULES } from "./verification.js";

export const CODE_CORPUS_VERSION = "code-corpus-2026.09";

/**
 * The code corpus.
 *
 * Assembled by SPREADING the family arrays rather than by listing rule ids, so this file can
 * never disagree with the files that own the rules. A list restated in a second place is a
 * list that goes stale in exactly one of them, which is how a security check in the source
 * corpus skipped a column for four commits.
 */
export const CODE_RULES: readonly CodeRule[] = [
  ...AGENT_RULES,
  ...COMMENT_RULES,
  ...SCAFFOLD_RULES,
  ...UNIFORMITY_RULES,
  ...VERIFICATION_RULES,
  ...HISTORY_RULES,
  ...CODE_COUNTER_RULES,
];

export {
  AGENT_RULES,
  CODE_COUNTER_RULES,
  COMMENT_RULES,
  HISTORY_RULES,
  SCAFFOLD_RULES,
  UNIFORMITY_RULES,
  VERIFICATION_RULES,
};

/** The public, citable description of every rule. Half of the MCP `list_rules` payload. */
export const CODE_RULE_DESCRIPTORS: readonly RuleDescriptor[] = CODE_RULES.map((r) => ({
  id: r.id,
  family: r.family,
  title: r.title,
  polarity: r.polarity,
  baseWeight: r.baseWeight,
  severity: r.severity,
  explanation: r.explanation,
  falsePositiveNote: r.falsePositiveNote,
  ...(r.prevention ? { prevention: r.prevention } : {}),
  since: r.since,
}));

export const codeRuleById = (id: string): CodeRule | undefined => CODE_RULES.find((r) => r.id === id);
