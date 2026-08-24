import Link from "next/link";

/**
 * THE ONE NON-UI ARTIFACT ON THIS SITE.
 *
 * design/SELF-AUDIT.md §Risk 1 said the largest open gap in the foundation was that every
 * human-made comparable carries one object that is not UI, and we had none: the whole site
 * was two SVG wireframes. docs/UI-AUDIT-2026-08-24.md §4 agreed and ranked it second of the
 * five changes that would most change a first impression. This is it.
 *
 * DROP-IN NOTE FOR WHOEVER OWNS app/page.tsx (this component was written by a different
 * agent, in parallel, and deliberately does not touch that file):
 *
 *     import { PrintedReceiptArtifact } from "@/components/artifact/printed-receipt";
 *     ...
 *     <PrintedReceiptArtifact />
 *
 * It is self-contained: it renders its own full-bleed <section>, so it wants to sit BETWEEN
 * the existing sections rather than inside the `max-w-page` column, and it needs no props.
 * Place it where the page's rhythm needs breaking — U5 in the audit measured four sections
 * at an identical `gap-24` with no focal point anywhere. This block is deliberately a
 * different shape from every other block on the page: full width, its own surface, an
 * object instead of a paragraph.
 *
 * THREE RULES THIS COMPONENT ENFORCES, NONE OF WHICH ARE COSMETIC:
 *
 *  1. It says the image is RENDERED, in the caption and in the alt text, and the receipt in
 *     the picture says it too, in its own footer, inside the frame where a crop cannot
 *     remove it. This product sells the detection of unlabelled synthetic imagery. An
 *     unlabelled synthetic image on its own homepage would end the argument.
 *  2. It is a plain <img>, NOT next/image, and that is load-bearing rather than lazy. Our own
 *     probe (packages/detectors-web/src/probe.ts) classifies any jpg/webp/avif over 320px as
 *     photographic, and next/image would silently re-encode this PNG to webp. Our own
 *     counter.real-photography rule would then count a drawing as a photograph. Serving it as
 *     an unoptimised PNG is how we avoid gaming our own corpus with our own picture.
 *  3. It claims no counter-evidence. counter.real-photography and counter.handmade-artifact
 *     both want something a person actually made or shot. A render earns neither, and the
 *     caption says which one we would earn if somebody printed it.
 */
export function PrintedReceiptArtifact() {
  return (
    <section
      aria-labelledby="artifact-heading"
      className="border-y border-hairline bg-surface-raised"
    >
      <div className="mx-auto flex max-w-page flex-col gap-8 px-6 py-16 md:flex-row md:items-start md:gap-16 md:px-16 md:py-24">
        <figure className="flex shrink-0 flex-col gap-4">
          <img
            src="/artifact/printed-receipt-4F2A-9C.png"
            alt="A rendered picture, not a photograph: a paper till receipt printed with the report for scan 4F2A-9C, lying on a dark desk. It lists the six rules that fired, their points, the 8.4 seconds it took to remake the page, and a total of 82.0."
            width={1088}
            height={1568}
            decoding="async"
            className="w-full max-w-[420px] border border-hairline md:w-[420px]"
          />
          <figcaption className="max-w-[420px] font-mono text-mono-sm text-ink-muted">
            <span className="font-medium tracking-[0.06em] text-ink uppercase">
              Rendered, not photographed.
            </span>{" "}
            Drawn in a browser by <code>scripts/render-printed-receipt.mjs</code>, which is in
            the repository, and labelled as a render here, in the alt text, and on the receipt
            itself.
          </figcaption>
        </figure>

        <div id="artifact-heading-wrap" className="flex flex-col gap-5">
          <h2 id="artifact-heading" className="max-w-[34ch] text-h2 text-ink">
            Our own corpus says a site should have one object nobody generated
          </h2>
          <p className="max-w-[64ch] text-body text-ink">
            Two of our rules pay a page for evidence a machine will not produce by accident.{" "}
            <code className="font-mono text-mono-sm">counter.real-photography</code> wants
            photographs with alt text somebody wrote.{" "}
            <code className="font-mono text-mono-sm">counter.handmade-artifact</code> wants a
            drawn mark, grain, handwriting, something torn. Until this page, the entire site
            was two vector wireframes and neither rule fired on us.
          </p>
          <p className="max-w-[64ch] text-body text-ink">
            This receipt does not fire them either, and we are not going to pretend otherwise:
            it is a render, so it is not photography and it is not hand-made. Every number on
            it is read from the live report for 4F2A-9C rather than typed into a mockup, and
            the script fails rather than draw a stale figure if the corpus changes underneath
            it. When somebody prints one on real stock and photographs it, this picture gets
            replaced and the rule fires honestly. Not before.
          </p>
          <Link
            href="/method#counter.handmade-artifact"
            className="w-fit font-mono text-mono-sm text-ink-accent underline-offset-4 hover:underline"
          >
            The two counter-evidence rules, in the method →
          </Link>
        </div>
      </div>
    </section>
  );
}
