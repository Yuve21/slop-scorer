/**
 * The web corpus's rule type: the generic `Rule` contract at (WebArtifact, ProbeId).
 *
 * There is nothing web-specific about what a rule IS, only about what it reads, which is
 * exactly the point. The corpus, the mutation meta-test, the receipt and `list_rules` all
 * work identically for code and for web because the contract is one type in one place. A
 * third modality supplies two type arguments, not an engine.
 *
 * See `@slop/core/rule.ts` for why `fixtures` is mandatory. Short version: a rule whose
 * selector goes stale stops firing, nothing crashes, and every artifact it would have
 * flagged silently scores lower while the report keeps printing confident citations for the
 * rules that survived.
 */

import type { Rule, RuleContext, RuleFixtureCase } from "@slop/core";
import type { ProbeId, WebArtifact } from "./artifact.js";

export type WebRule = Rule<WebArtifact, ProbeId>;

export type { DeepPartial } from "@slop/core";
export type { RuleContext, RuleFixtureCase };
export { ev, patch } from "@slop/core";
