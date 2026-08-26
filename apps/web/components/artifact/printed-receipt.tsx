import Link from "next/link";
import { FEED_ATTR } from "@/lib/reveal-attrs";

/**
 * THE ONE NON-UI ARTIFACT ON THIS SITE.
 *
 * design/SELF-AUDIT.md §Risk 1 said the largest open gap in the foundation was that every
 * human-made comparable carries one object that is not UI, and we had none: the whole site
 * was two SVG wireframes. docs/UI-AUDIT-2026-08-24.md §4 agreed and ranked it second of the
 * five changes that would most change a first impression. This is it.
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
 *
 * ==== 2026-08-26: THE BAND IS NOW MADE OF THE THING IT CONTAINS ====
 *
 * The founder's verdict was that the site had "no imagery beyond one PNG" and no focal point,
 * and that the receipt should be used "bigger and better". Three changes, and each of them is
 * the receipt metaphor made structural rather than a decoration applied to it:
 *
 *   THE BAND IS STOCK. `data-paper` + `data-perf="both"` in globals.css §THE PAPER SYSTEM: the
 *   only warm surface on the site, punched top and bottom so the section reads as a length of
 *   till roll torn out of the page rather than as a grey box with a picture in it. The punch
 *   holes are filled with `--perf-behind`, which is set here to the PAGE surface, because that
 *   is literally what is behind this band — get that wrong and it is a dotted border.
 *
 *   THE OBJECT IS AN OBJECT. Up from 420px to 520px, resting at a quarter-degree off-axis, with
 *   a stamp over it, and it squares up and lifts when the pointer is on it (`data-lift`, 260 ms,
 *   slower than any UI transition here, because a physical thing has mass and a link does not).
 *
 *   IT PRINTS. `FEED_ATTR` gives it beat 4 — a bottom-up clip at a constant 2.2 px/ms with a 1px
 *   accent print head riding the cut, whose duration is the element's OWN rendered height, gated
 *   on entering the viewport. That beat has existed for two revisions and had nothing on the
 *   landing route to run on, because this component was outside every `ReceiptReveal`. It is
 *   inside one now. It cannot cause the blank-flash the reveal file is built to avoid: the
 *   viewport rule in reveal.tsx skips any feed that is already on screen at load.
 *
 * THE STAMP SAYS "RENDER" AND THAT IS A LEGAL CHOICE, NOT A GRAPHIC ONE. A stamp is the most
 * assertive mark you can put on a document, so the only thing ours is allowed to assert is a
 * fact about OUR OWN artifact. It is `aria-hidden` because the same word is already in the
 * caption and in the alt text, where a screen reader gets it as a sentence rather than as a
 * decoration read out of order.
 */
export function PrintedReceiptArtifact() {
  return (
    <section
      aria-labelledby="artifact-heading"
      data-paper
      data-perf="both"
      className="[--perf-behind:var(--surface)]"
    >
      <div className="mx-auto flex max-w-page flex-col gap-10 px-6 py-24 md:flex-row md:items-center md:gap-20 md:px-16 md:py-32">
        <figure className="flex shrink-0 flex-col gap-5">
          <div data-lift className="relative w-fit">
            {/* The feed wrapper is a DIV rather than the <img> itself, and that is required
                rather than tidy: `[data-feeding]::after` draws the print head, and pseudo-
                elements do not render on replaced elements. */}
            <div {...{ [FEED_ATTR]: "" }} className="border border-hairline">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/artifact/printed-receipt-4F2A-9C.png"
                alt="A rendered picture, not a photograph: a paper till receipt printed with the report for scan 4F2A-9C, lying on a dark desk. It lists the six rules that fired, their points, the 8.4 seconds it took to remake the page, and a total of 82.0."
                width={1088}
                height={1568}
                decoding="async"
                className="block w-full max-w-[520px] md:w-[520px]"
              />
            </div>
            {/* ON the photograph, not on the page: the desk in this PNG is black in both colour
                schemes, so the mark is inked light and placed inside the image where there is
                dark to read it against. See the `on-dark` note in globals.css. */}
            <span data-stamp="on-dark" aria-hidden="true" className="absolute top-7 right-6">
              Render
            </span>
          </div>
          <figcaption className="max-w-[520px] font-mono text-mono-sm text-ink-muted">
            <span className="font-medium tracking-[0.06em] text-ink uppercase">
              Rendered, not photographed.
            </span>{" "}
            Drawn in a browser by <code>scripts/render-printed-receipt.mjs</code>, which is in
            the repository, and labelled as a render here, in the alt text, and on the receipt
            itself.
          </figcaption>
        </figure>

        <div className="flex flex-col gap-5">
          <h2 id="artifact-heading" className="max-w-[20ch] text-h1 font-normal text-ink">
            Our own corpus says a site should have one object nobody generated
          </h2>
          <p className="max-w-[58ch] text-lg text-ink">
            Two of our rules pay a page for evidence a machine will not produce by accident.{" "}
            <code className="font-mono text-mono-sm">counter.real-photography</code> wants
            photographs with alt text somebody wrote.{" "}
            <code className="font-mono text-mono-sm">counter.handmade-artifact</code> wants a
            drawn mark, grain, handwriting, something torn. Until this page, the entire site was
            two vector wireframes and neither rule fired on us.
          </p>
          <p className="max-w-[58ch] text-lg text-ink">
            This receipt does not fire them either, and we are not going to pretend otherwise:
            it is a render, so it is not photography and it is not hand-made. Every number on it
            is read from the live report for 4F2A-9C rather than typed into a mockup, and the
            script fails rather than draw a stale figure if the corpus changes underneath it.
            When somebody prints one on real stock and photographs it, this picture gets replaced
            and the rule fires honestly. Not before.
          </p>
          <Link
            href="/method#counter.handmade-artifact"
            className="w-fit font-mono text-mono-md text-ink-accent underline-offset-4 hover:underline"
          >
            The two counter-evidence rules, in the method
          </Link>
        </div>
      </div>
    </section>
  );
}
