/**
 * Turning a stored artifact into a card.
 *
 * The corpora already exist and are provenanced, so nothing here invents a fixture: a code card is
 * built from the same `RepoArtifact` the code detector scores, and a web card from the same
 * `WebArtifact` the web detector scores. That matters beyond tidiness - the labels we publish
 * discrimination rates against have to be the labels the detector was calibrated on, or the two
 * numbers on the page are about different things.
 *
 * WHAT IS DELIBERATELY NOT ON A CARD:
 *   - `history` / `commits`, in any form. `CommitRecord.authorEmail` is a real field on real corpus
 *     members, and a commit subject routinely names a person. The presenter never reaches for it.
 *   - `url`, `finalUrl`, `canonical`, `ogImage`, `root`. Each one identifies the artifact outright,
 *     which hands over the answer to anyone who recognises the site.
 *   - anything the detector's rules would cite as evidence about a THIRD party rather than about
 *     the artifact.
 *
 * Everything that does appear goes through `redactAndTrim` on the way, and the leak test walks the
 * finished card rather than trusting this comment.
 */

import type { RepoArtifact } from "@slop/detectors-code";
import type { WebArtifact } from "@slop/detectors-web";
import { PRESENTATION_VERSION, type PresentedCard, type PresentedPanel } from "./types.js";
import { redactAndTrim, type Redaction } from "./redact.js";

const take = <T>(xs: readonly T[], n: number): readonly T[] => xs.slice(0, n);

const panel = (heading: string, lines: readonly string[], redaction: Redaction): PresentedPanel | null => {
  const cleaned = lines.map((l) => redactAndTrim(l, redaction)).filter((l) => l.length > 0);
  return cleaned.length === 0 ? null : { heading, lines: cleaned };
};

const compact = (panels: readonly (PresentedPanel | null)[]): readonly PresentedPanel[] =>
  panels.filter((p): p is PresentedPanel => p !== null);

/** The dominant extension, so the card can say what kind of code this is without naming it. */
function dominantLanguage(repo: RepoArtifact): string {
  const counts = new Map<string, number>();
  for (const f of repo.files) counts.set(f.ext, (counts.get(f.ext) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best === undefined ? "source" : best[0].replace(/^\./, "");
}

export function presentRepo(artifactId: string, repo: RepoArtifact, redaction: Redaction): PresentedCard {
  const totalLines = repo.files.reduce((sum, f) => sum + f.lines, 0);
  const comments = take(repo.comments, 4).map((c) => `${c.file.split("/").pop() ?? c.file}:${c.line}  ${c.text}`);
  const files = take(repo.files, 6).map((f) => `${f.path}  ${f.lines} lines`);
  const placeholders = take(repo.placeholders, 3).map((p) => `${p.marker}  ${p.text}`);
  const duplicates = take(repo.duplicates, 2).map(
    (d) => `${d.occurrences.length} copies of ${d.lineCount} lines  ${d.excerpt}`,
  );
  const agentFiles = take(repo.agentFiles, 2).map((a) => `${a.path}  ${a.excerpt}`);

  return {
    artifactId,
    medium: "code",
    summary: `${dominantLanguage(repo)} · ${repo.files.length} files · ${totalLines.toLocaleString("en-US")} lines`,
    panels: compact([
      panel("Comments", comments, redaction),
      panel("Files", files, redaction),
      panel("Placeholders", placeholders, redaction),
      panel("Repeated blocks", duplicates, redaction),
      panel("Tooling in the tree", agentFiles, redaction),
    ]),
    presentationVersion: PRESENTATION_VERSION,
  };
}

export function presentWeb(artifactId: string, web: WebArtifact, redaction: Redaction): PresentedCard {
  // First lines of visible copy. Copy is the most discriminating thing on a page for a human reader
  // and the least identifying, as long as the brand name has been redacted out of it.
  const copy = take(
    web.text.innerText
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0),
    4,
  );

  const type = [
    web.type.hero === null
      ? null
      : `headline: ${web.type.hero.family} ${web.type.hero.weightNum} at ${web.type.hero.sizePx}px, tracking ${web.type.hero.letterSpacingEm}em`,
    web.type.body === null ? null : `body: ${web.type.body.family} ${web.type.body.weightNum} at ${web.type.body.sizePx}px`,
    web.type.faces.length === 0 ? "no self-hosted faces" : `${web.type.faces.length} self-hosted face(s)`,
  ].filter((l): l is string => l !== null);

  const colour = [
    web.color.bodyBackground === null ? null : `background ${web.color.bodyBackground}`,
    web.color.heroGradient === null ? "no hero gradient" : `hero gradient ${web.color.heroGradient}`,
  ].filter((l): l is string => l !== null);

  const structure = [
    `${web.dom.nodeCount} nodes, ${web.dom.h1Count} h1`,
    `${web.dom.cards.length} cards, ${web.dom.sections.length} sections, ${web.dom.images.length} images`,
    `${web.dom.eyebrows.length} eyebrow pills, ${web.dom.pingDots.length} ping dots, ${web.dom.iconTiles.length} icon tiles`,
    `${web.dom.hiddenInputs.length} hidden inputs, ${web.dom.customArtifacts.length} hand-made assets`,
  ];

  return {
    artifactId,
    medium: "web",
    summary: `a page · ${web.text.wordCount} words · ${web.dom.images.length} images`,
    panels: compact([
      panel("Copy", copy, redaction),
      panel("Type", type, redaction),
      panel("Colour", colour, redaction),
      panel("Structure", structure, redaction),
    ]),
    presentationVersion: PRESENTATION_VERSION,
  };
}
