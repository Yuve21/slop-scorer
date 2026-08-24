/**
 * Nothing on a card may identify a person.
 *
 * Two separate reasons, and they need separate machinery because they fail differently.
 *
 *  1. IDENTITY. `publicity-defamation-risk.md` Tier 1 #1: defamation and false light both require
 *     an identified plaintiff. A card that carries `authorEmail` from a commit record, or a
 *     copyright line, or somebody's handle, turns a game round into a statement about a named
 *     person. The corpus is FULL of these - `CommitRecord.authorEmail` is a real field on a real
 *     artifact in `packages/detectors-code`, and the provenance strings name maintainers by design,
 *     because that is how a stranger checks the label. So identity redaction is unconditional and
 *     the presenters simply never reach for history.
 *
 *  2. ATTRIBUTION. A player who recognises the project recognises the answer. "express" appearing
 *     in a card is not a privacy problem, it is a game-integrity problem, and the fix is the same
 *     substitution with a different placeholder so a reader can tell which rule fired.
 *
 * The distinction the corpus doc draws still holds: the PUBLISHED calibration table cites source
 * and provenance in full, because a label with no stated basis is an assertion. The player sees
 * artifacts; the reader of the accuracy table sees receipts. Two audiences, two rules.
 */

/** Multi-word capitalised sequences: "TJ Holowaychuk", "Python Software Foundation". */
const NAME_SEQUENCE = /\b([A-Z][A-Za-z'’-]+(?:\s+(?:van|von|de|der|del|di|da|of|the)\s+)?(?:\s+[A-Z][A-Za-z'’-]+)+)\b/g;

/**
 * Capitalised sequences that are not people.
 *
 * Kept short and specific on purpose. A long allowlist is a slow leak: every entry is a name shape
 * the redactor has been told to ignore, and the cost of over-redacting a card is a duller card
 * while the cost of under-redacting one is a person's name on a screen.
 */
const NOT_A_PERSON = [
  "Software Foundation",
  "Public License",
  "General Public",
  "All Rights Reserved",
];

export const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
export const URL = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/g;
export const HANDLE = /(^|[\s(])@[A-Za-z0-9_-]{2,}/g;
export const COPYRIGHT = /(copyright|\(c\)|©)\s*[^\n]*/gi;

export const IDENTITY_PLACEHOLDER = "[name removed]";
export const LINK_PLACEHOLDER = "[link removed]";
export const PROJECT_PLACEHOLDER = "[project]";

export interface Redaction {
  /** Person and organisation names, pulled out of the corpus entry's provenance. */
  readonly identityTerms: readonly string[];
  /** Project and org slugs, pulled out of the corpus entry's source. */
  readonly projectTerms: readonly string[];
}

const STOPWORDS = new Set([
  "The", "A", "An", "In", "On", "By", "For", "From", "With", "And", "Or", "It", "Its", "This", "That",
  "Created", "Written", "Maintained", "Donated", "Published", "Every", "Over", "Under", "Small",
  "Named", "Its", "One", "Two", "Three", "Four", "Five", "Ten", "Fifteen",
]);

/** Longest first, so "Python Software Foundation" is removed before "Python". */
const byLengthDesc = (terms: readonly string[]): readonly string[] =>
  [...new Set(terms)].sort((a, b) => b.length - a.length);

/**
 * Derive the terms to strip from a corpus entry.
 *
 * Deliberately over-inclusive on the provenance side: everything capitalised that is not a
 * stopword goes, because a provenance sentence exists precisely to name the people behind a label.
 */
export function redactionFor(entry: { readonly source: string; readonly provenance: string }): Redaction {
  const names = [...entry.provenance.matchAll(NAME_SEQUENCE)]
    .map((m) => (m[1] as string).trim())
    .filter((n) => !NOT_A_PERSON.some((allowed) => n.includes(allowed)));

  const singles = (entry.provenance.match(/\b[A-Z][A-Za-z'’-]{2,}\b/g) ?? []).filter((w) => !STOPWORDS.has(w));

  const projects = entry.source
    .split(/[\s/@#:]+/)
    .map((p) => p.replace(/\.(com|org|io|dev|net|co|test)$/i, ""))
    .filter((p) => p.length >= 3 && !/^https?$/i.test(p) && p !== "github" && p !== "www");

  return {
    identityTerms: byLengthDesc([...names, ...singles]),
    projectTerms: byLengthDesc(projects),
  };
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Redact one line.
 *
 * Order matters and is not arbitrary: emails and links first (they can CONTAIN a name, and a
 * removed link cannot then be partially name-redacted into something readable), then the copyright
 * form, then explicit terms, then handles.
 */
export function redactLine(line: string, redaction: Redaction): string {
  let out = line.replace(EMAIL, IDENTITY_PLACEHOLDER).replace(URL, LINK_PLACEHOLDER);
  out = out.replace(COPYRIGHT, `${IDENTITY_PLACEHOLDER}`);
  for (const term of redaction.identityTerms) {
    out = out.replace(new RegExp(`\\b${escape(term)}\\b`, "gi"), IDENTITY_PLACEHOLDER);
  }
  for (const term of redaction.projectTerms) {
    out = out.replace(new RegExp(`\\b${escape(term)}\\b`, "gi"), PROJECT_PLACEHOLDER);
  }
  out = out.replace(HANDLE, `$1${IDENTITY_PLACEHOLDER}`);
  return out.replace(/\s+/g, " ").trim();
}

/** Hard cap. A card is a comparison, not a reading exercise, and a long line can smuggle a lot. */
export const MAX_LINE_CHARS = 120;

export function redactAndTrim(line: string, redaction: Redaction): string {
  const redacted = redactLine(line, redaction);
  return redacted.length <= MAX_LINE_CHARS ? redacted : `${redacted.slice(0, MAX_LINE_CHARS - 1)}…`;
}

/**
 * Field names that must never appear in a serialised card, whatever the surrounding shape.
 *
 * Exported so the leak test and the presenters share one list. Same construction as
 * `packages/reproduce/test/no-creator-field.test.ts`: the near-misses are the point, because a
 * `sourceUrl` carries an identity without looking like it does.
 */
export const FORBIDDEN_CARD_FIELDS: readonly string[] = [
  "author",
  "authorEmail",
  "creator",
  "artist",
  "owner",
  "maintainer",
  "handle",
  "username",
  "email",
  "url",
  "finalUrl",
  "canonical",
  "ogImage",
  "root",
  "source",
  "provenance",
  "label",
  "humanIndex",
  "sha",
  "commits",
  "history",
];

/**
 * The same list plus `artifactId`, for anything travelling to a browser.
 *
 * A stored card keeps its corpus id - that is how the pool is joined to the label. A card in a
 * ROUND VIEW must not, because the ids are descriptive by design and the leak test caught exactly
 * that: `code:synthetic-scaffold` next to `code:sinatra` is a solved round.
 */
export const FORBIDDEN_VIEW_FIELDS: readonly string[] = [...FORBIDDEN_CARD_FIELDS, "artifactId"];
