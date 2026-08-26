import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReceiptView } from "@/components/receipt/receipt-view";
import { gauntletReceipt } from "@/lib/gauntlet/receipt";
import POOL_IDS from "@/lib/gauntlet/pool-ids.json";
import { absolute } from "@/lib/site";

/**
 * The receipt behind one card.
 *
 * `notFound()` on an unknown id, never a redirect to the index: a soft 200 on an unknown path
 * is one of the exact defects our own corpus flags, and it is the trap that bit the codebase
 * this design system was learned from.
 *
 * `generateStaticParams` reads `pool-ids.json`, which holds ids and nothing else. It must not
 * touch `lib/gauntlet/store.ts` or `pool.json`: the first is `server-only` and throws in the
 * worker Next evaluates this in, and the second is the answer key. That failure mode surfaces
 * as "Jest worker encountered 2 child process exceptions" with no module named, which is why
 * the split exists at all.
 */

const IDS = POOL_IDS as readonly { readonly corpus: string; readonly name: string }[];

export function generateStaticParams() {
  return IDS.map(({ corpus, name }) => ({ corpus, name }));
}

export async function generateMetadata({
  params,
}: PageProps<"/gauntlet/artifact/[corpus]/[name]">): Promise<Metadata> {
  const { corpus, name } = await params;
  const receipt = gauntletReceipt(corpus, name);
  if (!receipt) return { title: "No such artifact" };
  return {
    title: `Corpus artifact ${receipt.artifactId}`,
    description: `The full detector reading behind one gauntlet card. ${receipt.claim}`,
    alternates: { canonical: `/gauntlet/artifact/${corpus}/${name}` },
    // Most of this corpus is somebody else's public work. A report about a stranger's artifact
    // is not indexed by default, and it is not in the sitemap either. This is the same call
    // our own legal research makes, and it is deliberate rather than an oversight.
    robots: { index: false, follow: false },
  };
}

export default async function GauntletArtifactPage({
  params,
}: PageProps<"/gauntlet/artifact/[corpus]/[name]">) {
  const { corpus, name } = await params;
  const receipt = gauntletReceipt(corpus, name);
  if (!receipt) notFound();

  return (
    <div className="flex flex-col">
      <ReceiptView
        id={receipt.id}
        artifact={receipt.artifact}
        headline={receipt.headline}
        claim={receipt.claim}
        view={receipt.view}
        reproduction={receipt.reproduction}
        permalink={absolute(`/gauntlet/artifact/${corpus}/${name}`)}
      />
      <p className="mx-auto max-w-receipt px-6 pb-16 font-mono text-mono-sm text-ink-muted md:px-[72px]">
        This artifact is a member of the gauntlet pool.{" "}
        <Link href="/gauntlet" className="text-ink-accent underline underline-offset-4">
          Play a round
        </Link>
        . The label it carries is a stated fact about the artifact&rsquo;s origin, checkable at the
        source named in the masthead. It is not something this reading concluded, and this reading
        was produced without it.
      </p>
    </div>
  );
}
