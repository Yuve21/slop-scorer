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
 *  5. NOTHING OUTSIDE THE SCANNED ROOT. Every path is repository-relative and is checked by
 *     `assertWithinTarget` before it can leave this module. That function is the single most
 *     security-critical thing in this package, because the union above contains a kind that
 *     DELETES, and it is documented and tested as an adversarial surface rather than as a
 *     tidiness check. Read its comment before changing it.
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

/** The longest path this product will name. Beyond it, something is generating, not reading. */
export const MAX_REMEDIATION_PATH_LENGTH = 400;

/**
 * The largest patch body this product will hand to an applier.
 *
 * A remediation is a description of a small, checkable change. A megabyte of `after` is not
 * that, and a rule that produces one has either lost a loop bound or is being driven by an
 * artifact that wants to fill somebody's context window.
 */
export const MAX_PATCH_BYTES = 64 * 1024;

/**
 * Windows device names. Opening one of these is not opening a file: `CON`, `NUL`, `PRN` and
 * the numbered serial and printer ports resolve to devices no matter what directory the
 * relative path appears to be in, and a rewrite aimed at `docs/NUL` goes to the null device
 * rather than to `docs/`. Checked with and without an extension, which is how Windows
 * resolves them.
 */
const WINDOWS_DEVICE_RE = /^(?:CON|PRN|AUX|NUL|COM[0-9\u00b2\u00b3\u00b9]|LPT[0-9\u00b2\u00b3\u00b9])(?:\.|$)/i;

/** Percent-encoded separators and dots: `..%2f`, `%2e%2e/`, `%5c`. */
const ENCODED_TRAVERSAL_RE = /%2e|%2f|%5c|%00/i;

/**
 * Guardrail: a remediation may only name something inside the scanned target root.
 *
 * Every path in every artifact this repository produces is root-relative, so the check is a
 * shape check and does not need the root itself. A patch that can name `/etc/hosts` is not a
 * patch, it is a vulnerability with a rationale field, and the destructive kind makes it a
 * vulnerability that deletes things.
 *
 * NINE WAYS OUT, ALL OF THEM CLOSED HERE. The first four were already covered; the rest were
 * found by attacking this function, and every one of them produces a path that a host agent's
 * `path.resolve(root, p)` lands OUTSIDE `root`:
 *
 *  1. A leading separator, `/etc/passwd` or `\Windows\System32`.
 *  2. A drive-rooted path, `C:\Windows`.
 *  3. A home reference, `~/.ssh/authorized_keys`.
 *  4. A literal `..` segment, at any depth, before or after anything else.
 *  5. A DRIVE-RELATIVE path, `C:evil`. There is no separator after the colon so the old drive
 *     check did not fire, and on Windows it resolves against the current directory OF DRIVE C,
 *     which is not the target and is not knowable from here. This is the subtle one.
 *  6. A UNC or extended path, `\\server\share`, `//server/share`, `\\?\C:\`. The first two are
 *     caught as absolute; `\\?\` is called out by name because it also disables the
 *     normalisation every other layer assumes is happening.
 *  7. An NTFS ALTERNATE DATA STREAM, `notes.txt:hidden.exe`. A colon inside a segment writes a
 *     stream nobody lists and nobody reviews.
 *  8. A CONTROL CHARACTER, most importantly NUL and newline. NUL truncates the path in any C
 *     API downstream (`a.txt\0.png` opens `a.txt`), and a newline in a path that is being
 *     INSERTED into `.gitignore` forges extra ignore lines. POSIX permits both in a filename,
 *     so a hostile repository can put them there and this scanner will read them back out.
 *  9. A PERCENT-ENCODED separator or dot. Nothing in this product decodes them, but an
 *     applier that treats the path as a URL fragment first would, and that is one library
 *     choice away rather than impossible.
 *
 * Plus a Windows device name and a length ceiling, neither of which escapes the root but both
 * of which write somewhere other than where the text says.
 */
export function assertWithinTarget(ruleId: string, p: string): void {
  const bad = (why: string): never => {
    throw new Error(
      `Rule "${ruleId}" proposed a remediation for "${JSON.stringify(p)}", which ${why}. A remediation may only name a path inside the scanned target.`,
    );
  };
  if (!p || p.trim() === "") bad("is empty");
  if (p.length > MAX_REMEDIATION_PATH_LENGTH) bad(`is longer than the ${MAX_REMEDIATION_PATH_LENGTH} character limit`);
  // eslint-disable-next-line no-control-regex -- the whole point of the check
  if (/[\u0000-\u001f\u007f]/.test(p)) bad("contains a control character, which can truncate or forge the path");
  if (p.startsWith("/") || p.startsWith("\\")) bad("is absolute");
  if (/^[a-zA-Z]:/.test(p)) bad("names a drive, and a drive-relative path resolves against that drive's own cwd");
  if (p.startsWith("~")) bad("names a home directory");
  const parts = p.split(/[\\/]/);
  if (parts.includes("..")) bad("traverses out of the target with a '..' segment");
  if (ENCODED_TRAVERSAL_RE.test(p)) bad("contains a percent-encoded separator or dot, which is a traversal in disguise");
  for (const segment of parts) {
    if (segment.includes(":")) bad("contains a ':' inside a path segment, which names an alternate data stream");
    if (WINDOWS_DEVICE_RE.test(segment)) bad(`names the Windows device "${segment}" rather than a file`);
  }
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

  // `destructive` is a `true` literal on exactly one kind, which the compiler already enforces
  // for code inside this repository. This is the check for everything else: a remediation that
  // arrived as JSON, through an `as` cast, or from a rule in a package compiled against an
  // older version of this type. The failure it prevents is a `replace_file` that a host agent
  // routes down its deletion path because it read a `destructive` flag and trusted it.
  const flagged = (r as { readonly destructive?: unknown }).destructive;
  if (r.kind === "delete_file") {
    if (flagged !== true) bad("is a deletion whose `destructive` flag is not the literal true");
  } else if (flagged !== undefined) {
    bad("carries a `destructive` flag while not being a delete_file, which is the only destructive kind");
  }

  switch (r.kind) {
    case "replace_range":
      if (r.startLine < 1) bad("starts before line 1");
      if (!Number.isInteger(r.startLine) || !Number.isInteger(r.endLine)) bad("names a line that is not an integer");
      if (r.endLine < r.startLine) bad("ends before it starts");
      if (r.before.length === 0) bad("has an empty `before`, so an applier cannot tell whether the file has moved on");
      if (r.before === r.after) bad("proposes exactly what is already there");
      if (r.after.length > MAX_PATCH_BYTES) bad(`writes more than the ${MAX_PATCH_BYTES} character limit`);
      break;
    case "insert":
      if (r.atLine < 0) bad("inserts at a negative line");
      if (!Number.isInteger(r.atLine)) bad("inserts at a line that is not an integer");
      if (r.text.trim().length === 0) bad("inserts nothing");
      if (r.text.length > MAX_PATCH_BYTES) bad(`inserts more than the ${MAX_PATCH_BYTES} character limit`);
      // The `.gitignore` inserts in the code corpus interpolate a path READ FROM THE SCANNED
      // TREE into their text. POSIX allows a newline or an escape in a filename, so a repo can
      // ship `evil\n!important-secret` and turn one ignore line into two. `assertWithinTarget`
      // refuses such a path, and this refuses the text it would have been written into.
      if (/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(r.text)) {
        bad("inserts text containing a control character, which can forge lines in the file it is written to");
      }
      break;
    case "replace_file":
      if (r.after.length === 0) bad("would replace the file with nothing; delete_file is the honest kind for that");
      if (r.before !== undefined && r.before === r.after) bad("proposes exactly what is already there");
      if (r.after.length > MAX_PATCH_BYTES) bad(`writes more than the ${MAX_PATCH_BYTES} character limit`);
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
