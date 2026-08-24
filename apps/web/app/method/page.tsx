import type { Metadata } from "next";
import Link from "next/link";
import { WEB_FAMILIES } from "@slop/core";
import { CORPUS_VERSION, RULE_DESCRIPTORS } from "@slop/detectors-web";
import { Badge } from "@/components/ui/badge";
import { absolute } from "@/lib/site";

/**
 * The method.
 *
 * This page exists for two reasons and only one of them is user experience.
 *
 *  1. FTC substantiation is the top-ranked risk in our own legal research. In re Workado
 *     treats an accuracy claim about an inference as a substantiation-bearing statement. The
 *     defence is that every claim we make is a claim about a measurement, published with the
 *     measurement. This page publishes the corpus: every rule, its weight, why it exists and
 *     when it is wrong.
 *  2. Every rule id on every receipt links here by anchor. A locator that does not resolve to
 *     a definition is not a citation.
 *
 * The "when it is wrong" column is not a hedge. It is the falsifier, printed next to the
 * claim, for every single rule. A detector that publishes no false-positive conditions is
 * asking to be trusted, which is the thing this product exists to refuse.
 */

export const metadata: Metadata = {
  title: "The method, and what it cannot see",
  description:
    "Every rule in the corpus, its weight, the reason it exists and the conditions under which it is wrong. Plus the things this detector cannot read at all.",
  alternates: { canonical: "/method" },
  openGraph: {
    title: "The method, and what it cannot see · Slop Scorer",
    description:
      "Every rule in the corpus, published with its weight and its false-positive conditions.",
    url: absolute("/method"),
    type: "article",
  },
};

const FAMILY_TITLE = Object.fromEntries(WEB_FAMILIES.map((f) => [f.id, f.title]));

export default function MethodPage() {
  const byFamily = new Map<string, typeof RULE_DESCRIPTORS>();
  for (const rule of RULE_DESCRIPTORS) {
    const bucket = byFamily.get(rule.family) ?? [];
    byFamily.set(rule.family, [...bucket, rule] as typeof RULE_DESCRIPTORS);
  }

  return (
    <div className="mx-auto flex max-w-receipt flex-col gap-16 px-6 py-16 md:px-[72px]">
      <header className="flex flex-col gap-5">
        <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase">
          Slop Scorer / Method · {CORPUS_VERSION}
        </p>
        <h1 className="max-w-[20ch] text-h1 font-normal text-ink">
          Every rule, its weight, and the conditions under which it is wrong.
        </h1>
        <p className="max-w-[72ch] text-lead text-ink">
          A detector that publishes findings but not its corpus is asking to be trusted. This
          page is here so nothing on a receipt has to be.
        </p>
      </header>

      <section className="flex flex-col gap-5">
        <h2 className="text-h3 font-medium text-ink">What this cannot do</h2>
        <ul className="flex max-w-[72ch] list-none flex-col gap-4 text-body text-ink">
          <li className="border-l border-border-control pl-5">
            It reads one page, at one viewport, in one browser. It says nothing about the rest
            of a site.
          </li>
          <li className="border-l border-border-control pl-5">
            It cannot read motion, audio, or typography that lives inside an image. Those are
            reported as not assessed, and absence of a finding there is not a finding.
          </li>
          <li className="border-l border-border-control pl-5">
            It cannot tell you who made something or how. Every rule is a statement about the
            artifact in front of it. There is no rule in this corpus whose subject is a person.
          </li>
          <li className="border-l border-border-control pl-5">
            It can be gamed by anyone who reads this page, which is the cost of publishing it,
            and a cost worth paying. A rule that only works while it is secret is not a rule,
            it is a trick.
          </li>
          <li className="border-l border-border-control pl-5">
            Our own site is subject to the same corpus, and the result runs live on the home
            page. We did not exempt ourselves, and we do not hide a regression when we cause
            one.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="text-h3 font-medium text-ink">The typeface, stated plainly</h2>
        <p className="max-w-[72ch] text-body text-ink">
          The shipping faces are IBM Plex Sans and IBM Plex Mono, drawn by Bold Monday for IBM
          and released under the SIL Open Font License. They are self hosted as four subset
          woff2 files totalling 62.9 KB, served from this origin. There is no Google Fonts
          link and no third party font request of any kind, because a third party font request
          is itself something this corpus flags. We chose Plex because the sans and the mono
          are one family on one skeleton, and a receipt is a document with a machine read
          citation column running down it: the sentence and the locator under it have to be
          the same voice. ABC Diatype remains the face we would rather license, and until
          somebody pays for it we will not ship a trial or demo build of a commercial face.
          That is a tell in our own corpus, and doing it while selling this product would be
          the least defensible thing on the site.
        </p>
      </section>

      <section className="flex flex-col gap-11">
        <h2 className="text-h3 font-medium text-ink">
          The corpus: {RULE_DESCRIPTORS.length} rules
        </h2>
        {[...byFamily.entries()].map(([family, rules]) => (
          <div key={family} className="flex flex-col gap-5">
            <h3 className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase">
              {FAMILY_TITLE[family] ?? family} · {rules.length}{" "}
              {rules.length === 1 ? "rule" : "rules"}
            </h3>
            <div className="flex flex-col gap-px bg-hairline">
              {rules.map((rule) => (
                <article
                  key={rule.id}
                  id={rule.id}
                  className="flex flex-col gap-3 bg-surface-raised p-5 scroll-mt-24"
                >
                  <div className="flex flex-wrap items-baseline gap-4">
                    <a
                      href={`#${rule.id}`}
                      className="font-mono text-mono-sm font-medium text-ink-accent underline-offset-4 hover:underline"
                    >
                      {rule.id}
                    </a>
                    <span className="font-mono text-mono-sm text-ink-muted">
                      weight {rule.baseWeight} · {rule.severity} · since {rule.since}
                    </span>
                    {rule.polarity === "counter" ? (
                      <Badge
                        variant="outline"
                        className="rounded-sm border-border-control font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase"
                      >
                        Subtracts
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-body font-medium text-ink">{rule.title}</p>
                  <p className="max-w-[72ch] text-sm text-ink">{rule.explanation}</p>
                  <p className="max-w-[72ch] text-sm text-ink-muted">
                    <span className="font-mono text-mono-sm text-ink">When it is wrong: </span>
                    {rule.falsePositiveNote}
                  </p>
                  {rule.prevention ? (
                    <p className="max-w-[72ch] text-sm text-ink-muted">
                      <span className="font-mono text-mono-sm text-ink">
                        How to not do this:{" "}
                      </span>
                      {rule.prevention}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>

      <p className="text-body text-ink">
        <Link href="/receipt/self" className="text-ink-accent underline-offset-4 hover:underline">
          Our own receipt, run against this deployment
        </Link>
      </p>
    </div>
  );
}
