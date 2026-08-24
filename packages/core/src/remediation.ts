/**
 * The remediation contract: what a finding proposes should change, in a form another agent
 * can apply without re-deriving anything.
 *
 * FIVE CONSTRAINTS, ALL OF THEM ENFORCED BELOW RATHER THAN DOCUMENTED AND HOPED FOR.
 *
 *  1. THIS PACKAGE NEVER WRITES A FILE, AND NEITHER DOES THE MCP SERVER. A remediation is a
 *     description: a path, a line range, the bytes that were observed there, and the bytes
 *     proposed instead. The HOST AGENT applies it with its own edit tools, inside the
 *     approval flow the user already has and already trusts. Duplicating a permission model
 *     inside a detector would be a second thing to get wrong and a worse experience even
 *     when it was right. The plugin proposes; the agent disposes.
 *
 *  2. A FIX IS A CLAIM, SO IT CARRIES ITS EVIDENCE AND ITS CAVEAT. `before` is the text
 *     actually observed at the locator, not a reconstruction, so an applier can refuse when
 *     the file has moved on. `rebuttal` is the rule's own false-positive note, restated on
 *     the fix rather than left behind in the report. `doNotApplyIf` is the explicit
 *     condition under which applying this would be the wrong thing to do. A proposal without
 *     those three is an opinion with a patch attached.
 *
 *  3. ONLY A DETERMINISTIC READ MAY PROPOSE AN APPLICABLE PATCH. A probabilistic or
 *     provenance finding gets `manual` and nothing else. Where the detector itself abstains
 *     from certainty, the fix cannot assert it: an auto-applicable patch is a stronger claim
 *     than the finding underneath it. Checked in `assertWellFormedResult` against the
 *     result's declared `evidenceKind`, so a new modality inherits the rule for free.
 *
 *  4. COUNTER-EVIDENCE IS NEVER REMEDIABLE. A counter finding is a positive signal, an
 *     argument FOR the artifact. There is nothing to fix, and "fixing" one would mean
 *     deleting the best thing on the page. `makeFinding` throws.
 *
 *  5. NOTHING OUTSIDE THE SCANNED ROOT. Every path is repository-relative and is checked for
 *     absolute prefixes and `..` traversal before it can leave this module.
 */

/** How much of the artifact an applier is being asked to touch. Reported, never inferred. */
export type BlastRadius =
  /** One line, or a short run of lines, in one file. */
  | "line"
  /** One whole file: created, replaced or deleted. */
  | "file"
  /** Several files have to change together for the change to be coherent. */
  | "multi-file"
  /** A build, tooling or platform setting, whose effect is not confined to the repository. */
  | "project"
  /** Nothing to change. Some findings are shape observations that no edit follows from. */
  | "none";

/**
 * What an applier is expected to do with this, and therefore how much ceremony it deserves.
 *
 *  - `auto`     apply it: the locator and the replacement are both fully determined.
 *  - `confirm`  apply it only after an explicit human yes. Reserved for deletion.
 *  - `locate`   the change is exact but the FILE it lives in is not known to us, because the
 *               page was read as rendered output. The applier has to find the declaration.
 *  - `manual`   a person has to decide what the right answer is. We say what is wrong and
 *               what a good answer looks like, and we do not invent one.
 */
export type Applicability = "auto" | "confirm" | "locate" | "manual";

interface RemediationCommon {
  /** One imperative line. Describes the edit, never the person who made the artifact. */
  readonly summary: string;
  /** The rule's own false-positive note, carried onto the fix. Why this may be wrong. */
  readonly rebuttal: string;
  /** The explicit condition under which applying this would be the wrong thing to do. */
  readonly doNotApplyIf: string;
  readonly blastRadius: BlastRadius;
  /** Evidence locators from the finding that this edit answers. Never empty. */
  readonly addresses: readonly string[];
}

/**
 * Delete a tracked file.
 *
 * Its own kind, and never anything else's, so a host agent can require a second confirmation
 * for exactly this shape without pattern-matching on prose. `destructive` is a literal
 * `true` in the type: it cannot be omitted and it cannot be set to false.
 */
export interface DeleteFileRemediation extends RemediationCommon {
  readonly kind: "delete_file";
  readonly path: string;
  readonly destructive: true;
  /** Size observed at scan time, so an applier can tell it is deleting what we saw. */
  readonly bytes?: number;
}

/** Replace an observed run of lines. `after: ""` means delete those lines. */
export interface ReplaceRangeRemediation extends RemediationCommon {
  readonly kind: "replace_range";
  readonly path: string;
  /** 1-based, inclusive. */
  readonly startLine: number;
  /** 1-based, inclusive. */
  readonly endLine: number;
  /**
   * The text the scanner read at that range, as the artifact records it.
   *
   * Excerpts in this codebase are capped (200 characters, comment bodies without their
   * marker), so an applier must treat this as a SUBSTRING the range has to contain, not as a
   * byte-for-byte equality, and must stop when it does not match. Rules only propose this
   * kind where the recorded text is the raw line; anything normalised gets `manual` instead.
   */
  readonly before: string;
  /** The replacement. Empty string means the range is removed. */
  readonly after: string;
}

/** Insert text before a line. `atLine: 0` appends at end of file. */
export interface InsertRemediation extends RemediationCommon {
  readonly kind: "insert";
  readonly path: string;
  /** 1-based line to insert BEFORE. 0 appends to the end of the file. */
  readonly atLine: number;
  readonly text: string;
  /** True when the file may not exist yet and creating it is part of the fix. */
  readonly createIfMissing?: boolean;
}

/** Replace a whole file's contents. */
export interface ReplaceFileRemediation extends RemediationCommon {
  readonly kind: "replace_file";
  readonly path: string;
  /** Contents observed at scan time, when the scanner held them. */
  readonly before?: string;
  readonly after: string;
}

/**
 * A change to a rendered page, expressed as selector plus property.
 *
 * The UI half of the product reads a RENDERED document, which means it knows exactly what is
 * wrong and exactly where it appears on screen, and does not know which source file produced
 * it. Pretending otherwise would be the one thing this codebase is built not to do, so this
 * kind is `locate`: the change is fully specified, and finding the declaration is the host
 * agent's job because the host agent is the one holding the repository.
 */
export interface UiChangeRemediation extends RemediationCommon {
  readonly kind: "ui_change";
  /** CSS selector, or an element description, as it appeared in the evidence. */
  readonly selector: string;
  /** The CSS property, DOM attribute or head element being changed. */
  readonly property: string;
  /** The value actually computed or read on the rendered page. */
  readonly before: string;
  /**
   * The value proposed. Only ever set where the observation fully determines it: a rule that
   * cannot say what the right value IS proposes `manual` instead of guessing one. An empty
   * string means remove the declaration rather than set it to nothing.
   */
  readonly after: string;
  /** Where a host agent should start looking for the declaration. */
  readonly sourceHint: string;
}

/** No patch. A person decides. Carries the locator and what a good answer looks like. */
export interface ManualRemediation extends RemediationCommon {
  readonly kind: "manual";
  /** Where to look: a path, a line, a selector, a metric name. */
  readonly locator: string;
  /** What a good answer looks like. Never a value we invented and cannot justify. */
  readonly guidance: string;
}

export type Remediation =
  | DeleteFileRemediation
  | ReplaceRangeRemediation
  | InsertRemediation
  | ReplaceFileRemediation
  | UiChangeRemediation
  | ManualRemediation;

export type RemediationKind = Remediation["kind"];

/** Every kind the union can express. Exported so a host agent can branch exhaustively. */
export const REMEDIATION_KINDS: readonly RemediationKind[] = [
  "delete_file",
  "replace_range",
  "insert",
  "replace_file",
  "ui_change",
  "manual",
];

export function applicabilityOf(r: Remediation): Applicability {
  switch (r.kind) {
    case "delete_file":
      return "confirm";
    case "replace_range":
    case "insert":
    case "replace_file":
      return "auto";
    case "ui_change":
      return "locate";
    case "manual":
      return "manual";
  }
}

export const isDestructive = (r: Remediation): r is DeleteFileRemediation => r.kind === "delete_file";

/** True when the remediation asserts a concrete edit rather than describing one. */
export const isApplicable = (r: Remediation): boolean => applicabilityOf(r) !== "manual";

/** The path a remediation touches, when it touches one. */
export const pathOf = (r: Remediation): string | null =>
  r.kind === "delete_file" || r.kind === "replace_range" || r.kind === "insert" || r.kind === "replace_file"
    ? r.path
    : null;

/**
 * Guardrail: a remediation may only name something inside the scanned target root.
 *
 * Every path in every artifact this repository produces is root-relative, so the check is a
 * shape check and does not need the root itself: no absolute prefix, no drive letter, no
 * `..` segment, no leading separator. A patch that can name `/etc/hosts` is not a patch, it
 * is a vulnerability with a rationale field.
 */
export function assertWithinTarget(ruleId: string, p: string): void {
  const bad = (why: string): never => {
    throw new Error(
      `Rule "${ruleId}" proposed a remediation for "${p}", which ${why}. A remediation may only name a path inside the scanned target.`,
    );
  };
  if (!p || p.trim() === "") bad("is empty");
  if (p.startsWith("/") || p.startsWith("\\")) bad("is absolute");
  if (/^[a-zA-Z]:[\\/]/.test(p)) bad("names a drive");
  if (p.startsWith("~")) bad("names a home directory");
  const parts = p.split(/[\\/]/);
  if (parts.includes("..")) bad("traverses out of the target with a '..' segment");
}

/**
 * The shape check every remediation passes before it can reach a host agent.
 *
 * Refuses the two ways a fix goes quietly wrong: a caveat nobody wrote, and a patch whose
 * `after` is identical to its `before` (a no-op that still reads as work done).
 */
export function assertWellFormedRemediation(ruleId: string, r: Remediation): Remediation {
  const bad = (why: string): never => {
    throw new Error(`Rule "${ruleId}" produced a ${r.kind} remediation that ${why}.`);
  };
  if (r.summary.trim().length < 10) bad("has no summary");
  if (r.rebuttal.trim().length < 30) {
    bad("carries no rebuttal. Every fix restates the rule's own false-positive note; a fix is a claim");
  }
  if (r.doNotApplyIf.trim().length < 20) {
    bad("carries no 'do not apply if' condition. A patch with no stop condition is an instruction, not a proposal");
  }
  if (r.addresses.length === 0) bad("addresses no evidence locator, so nobody can check what it is answering");

  const p = pathOf(r);
  if (p !== null) assertWithinTarget(ruleId, p);

  switch (r.kind) {
    case "replace_range":
      if (r.startLine < 1) bad("starts before line 1");
      if (r.endLine < r.startLine) bad("ends before it starts");
      if (r.before.length === 0) bad("has an empty `before`, so an applier cannot tell whether the file has moved on");
      if (r.before === r.after) bad("proposes exactly what is already there");
      break;
    case "insert":
      if (r.atLine < 0) bad("inserts at a negative line");
      if (r.text.trim().length === 0) bad("inserts nothing");
      break;
    case "replace_file":
      if (r.after.length === 0) bad("would replace the file with nothing; delete_file is the honest kind for that");
      if (r.before !== undefined && r.before === r.after) bad("proposes exactly what is already there");
      break;
    case "ui_change":
      if (!r.selector.trim()) bad("names no selector");
      if (!r.property.trim()) bad("names no property");
      if (r.before === r.after) bad("proposes exactly what is already there");
      break;
    case "manual":
      if (!r.locator.trim()) bad("names no locator");
      if (r.guidance.trim().length < 20) bad("gives no guidance, which is the only thing a manual remediation is for");
      break;
    case "delete_file":
      break;
  }
  return r;
}
