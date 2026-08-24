/**
 * The code corpus's rule type: the generic `Rule` contract at (RepoArtifact, ProbeId).
 * Same contract as the web corpus, two different type arguments. See `@slop/core/rule.ts`.
 */

import type { Rule, RuleContext, RuleFixtureCase } from "@slop/core";
import type { ProbeId, RepoArtifact } from "./artifact.js";

export type CodeRule = Rule<RepoArtifact, ProbeId>;

export type { DeepPartial } from "@slop/core";
export type { RuleContext, RuleFixtureCase };
export { ev, patch } from "@slop/core";
