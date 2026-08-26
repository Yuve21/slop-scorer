import type { Metadata } from "next";
import Link from "next/link";
import { RULE_DESCRIPTORS } from "@slop/detectors-web";
import { PrintedReceiptArtifact } from "@/components/artifact/printed-receipt";
import { ScanForm } from "@/components/landing/scan-form";
import { SelfScanCard } from "@/components/landing/self-scan-card";
import { McpSection } from "@/components/mcp/mcp-section";
import { ReceiptReveal } from "@/components/receipt/reveal";
import { ReproductionFigure } from "@/components/receipt/reproduction-figure";
import { reproductionFor } from "@/lib/reproduction";
import { sampleReceipt } from "@/lib/receipts";
import { capturedSelfScan, scanHost } from "@/lib/self-scan";
import { absolute, siteUrl } from "@/lib/site";
import { ago } from "@/lib/view";

/**
 * The landing page.
 *
 * Its job is to run the detector on something in front of the visitor, immediately, and the
 * thing it runs on is US. That decision does three jobs at once: it is a live demo, so no
 * video and no explainer are needed; it is the marketing asset ("we pass our own tool, here
 * is the receipt"); and it carries zero legal exposure, because the only artifact judged
 * above the fold is our own. Every alternative names a third party in the first screen.
 *
 * The word "AI" does not appear above the fold. Neither does a logo wall, a three-card
 * pricing grid, a testimonial carousel or a stats row: every one of those is an
 * identical-card-grid tell, and with zero users any of them would be a fabrication.
 *
 * The reading in the fold is server-rendered and complete. `capturedSelfScan()` scores the
 * artifact this deployment's build captured from a real browser render, which is what makes
 * it safe to call while server rendering the page the scan targets: it starts no browser and
 * cannot recurse. The card offers a live run for hosts that have one.
 *
 * ==== THE 2026-08-26 REWORK, AND THE THREE THINGS IT IS ANSWERING ====
 *
 * The founder's verdict, third time of asking: "the ui still looks horrific... it needs to be
 * a wow for sure, also refreshing the page glitches still, and there are no transitions".
 * All three were real and all three were reproduced on localhost before anything was changed.
 * The glitch and the missing motion are fixed in components/receipt/reveal.tsx and
 * components/landing/self-scan-card.tsx, each carrying its own measurement in its own header.
 *
 * What changed HERE is the look, and the diagnosis was that the page had a palette and a type
 * scale but no VISUAL SYSTEM. Four sections at an identical `gap-24`, one size of heading, one
 * neutral, and a single image. Concretely:
 *
 *   THE HERO IS A HERO NOW. `text-display-xl` tops out at 76px instead of a flat 52 at every
 *   width, with a thermal print rule drawing itself underneath it. Still Regular 400, still
 *   -0.01em: our largest type stays our lightest weight, and the fluid step is capped below
 *   54px at mobile width because `css.hero-scale` is our own rule.
 *
 *   THE PAGE IS MADE OF RECEIPT. The thing this product hands you is a printed receipt, so the
 *   receipt is now the visual system rather than one PNG: stock, punched perforations, a torn
 *   edge, a stamp. All of it is geometry in globals.css §THE PAPER SYSTEM — no image, no
 *   request, no shadow.
 *
 *   THE RHYTHM IS BROKEN ON PURPOSE. Six blocks and no two share a shape: an oversized hero, a
 *   document, a full-bleed paper band with an object in it, a legal exhibit, a two-column
 *   ledger, and a narrow receipt tail set in mono. `struct.uniform-section-rhythm` is a rule we
 *   score other people against and we were failing the spirit of it.
 *
 *   THE ARGUMENT MOVED TO THE END. The deck used to open with three sentences of epistemology
 *   at a stranger. It now says what the card below it is, in two lines, and the case for why a
 *   number is the wrong output is made in the tail, after the tool has been seen working.
 *
 * WHAT IS DELIBERATELY *NOT* REVEALED ON SCROLL: the ledger and the tail. Two blocks animate,
 * and that is the whole budget. `motion.every-section-reveals` fires when five or more sections
 * all arrive with an entrance — "saying it about everything says it about nothing" — and a page
 * that trips a rule it publishes is not one we get to ship.
 */

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    title: "This page has already been scanned by the thing it sells",
    description:
      "Not a score. We reproduce the artifact and show you how long it took. The fold carries our own result, measured in a real browser when this version was built, with the time and the commit printed on it.",
    url: absolute("/"),
    type: "website",
  },
};

// Scored per request from the captured artifact, so the fold reflects the corpus this
// deployment ships rather than whatever the corpus said when a prerender happened to run.
// This is also what licenses server-rendering the reading's AGE: on a per-request render the
// age is accurate when it is sent rather than baked. See SelfScanCard's `initialAge`.
export const dynamic = "force-dynamic";

const RULE_TITLES = Object.fromEntries(RULE_DESCRIPTORS.map((rule) => [rule.id, rule.title]));

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Slop Scorer",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  description:
    "Reproduces an artifact, reports how long the reproduction took, and cites every measurement that made the shortcut possible. Reports abstention as a first-class result.",
  url: siteUrl(),
};

/**
 * The thermal print rule under the headline.
 *
 * Two paths, not one, and the gap between them is the point: an ink-starved thermal head skips,
 * and a perfectly continuous underline is what every template ships. The wobble is in the
 * control points — a till printer does not draw a straight line either.
 *
 * Inline SVG rather than a border, because a border cannot be drawn on. The inking animation is
 * CSS (`globals.css` §THE HERO RULE), so it runs at first paint while the JavaScript is still in
 * flight; `aria-hidden`, so if it never renders the headline is simply a headline.
 */
function HeroRule() {
  return (
    <svg
      data-hero-rule
      aria-hidden="true"
      viewBox="0 0 340 14"
      className="mt-2 block h-[13px] w-full max-w-[340px] text-ink-accent"
      fill="none"
      preserveAspectRatio="none"
    >
      <path
        d="M2 9.4C56 4.2 112 11.8 168 6.6"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M188 7.1C238 3.4 290 10.9 338 5.8"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default async function Home() {
  const self = await capturedSelfScan();
  const sample = sampleReceipt("4F2A-9C");
  // The host the reading is OF, not the host serving this request. On a preview deployment
  // those differ, and the card must name the one that was rendered.
  const target = scanHost(self.view.target || siteUrl());
  // Derived from the reading, never hardcoded: if the domain is ever bought, the note below
  // disappears on the next deploy rather than becoming a paragraph about a fixed problem.
  const ownGoal = self.view.findings.some((f) => f.ruleId === "builder.bare-platform-domain");

  return (
    <>
      {/* ============================ 1. THE HERO ============================
          Oversized, wide, and the only block on the page with nothing in a box. */}
      <section className="mx-auto flex max-w-page flex-col gap-6 px-6 pt-14 pb-10 md:px-16 md:pt-20">
        <script
          type="application/ld+json"
          // Structured data on the homepage only. Never on a receipt: a machine-readable
          // record of a page about somebody else's artifact is the last thing we want indexed.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />

        <div className="flex flex-col">
          {/* Regular 400 at up to 76px. Our largest type is our lightest weight.
              20ch, not the old 940px: a measure in characters holds three lines at every step of
              the fluid scale, where a pixel measure gave four lines at 1440 and one at 390. Three
              lines is what leaves the self-scan card reaching into the first screen, which
              design/SURFACES.md §B requires and a taller headline would have quietly broken. */}
          <h1 className="max-w-[20ch] text-display-xl font-normal text-ink">
            This page has already been scanned by the thing it sells.
          </h1>
          <HeroRule />
        </div>

        {/* Two lines, and neither of them argues. The case against publishing a number is real
            and it is made at the bottom of this page, after the tool has been watched working:
            leading with it meant a stranger's first sentence here was a lecture. */}
        <p className="max-w-[54ch] text-lead text-ink">
          Below is this page&rsquo;s own report, taken by a real browser at the moment this
          version was built. It is the same report any URL gets, and we did not get to pick a
          flattering one.
        </p>
      </section>

      {/* ============================ 2. THE DOCUMENT ============================
          Tight to the hero, because it is the evidence for the sentence above it, not the next
          topic. `gap-6` where every other seam on this page is 20 or 24. */}
      <section className="mx-auto flex max-w-page flex-col gap-6 px-6 pb-24 md:px-16">
        <SelfScanCard
          initial={self.view}
          ruleTitles={RULE_TITLES}
          target={target}
          commit={self.commit}
          capturedAt={self.view.ranAt}
          staleReason={self.staleReason}
          initialAge={ago(self.view.ranAt)}
        />

        {ownGoal ? (
          // OUR OWN FINDING, NAMED. It would be trivially easy to buy a domain, make this one
          // finding disappear and print a clean card, and that is exactly the move this
          // product exists to catch: teaching to your own test. So it stays up, with the
          // reason, until the domain is bought for a reason other than the scoreboard.
          <p className="max-w-[72ch] text-sm text-ink-muted">
            The finding in that card is about us. This site is served from a bare{" "}
            <span className="font-mono text-mono-sm text-ink">vercel.app</span> subdomain, which
            is one of the {RULE_DESCRIPTORS.length} tells in the corpus: skipping the one step
            that costs money and takes a human decision. We have not bought a domain yet. We are
            not going to buy one to make our own card look clean, and we are not going to
            quietly drop the rule that catches us.
          </p>
        ) : null}

        <div className="pt-4">
          <ScanForm />
        </div>
      </section>

      {/* ============================ 3. THE PAPER BAND ============================
          Full bleed, warm stock, punched top and bottom, with the one object on the site sitting
          in it at the size an object deserves. This is the focal point the audit said the page
          did not have at any viewport, and it is the only block with a temperature.

          Wrapped so the receipt can PRINT when it is scrolled to. Beat 4 has existed for two
          revisions and had nothing on this route to run on. */}
      <ReceiptReveal>
        <PrintedReceiptArtifact />
      </ReceiptReveal>

      {sample ? (
        // ============================ 4. THE EXHIBIT ============================
        // A heading and a legal figure, back on the page surface. Wrapped so the recreation
        // panel wipes in when it is reached — which it could never do before, because this
        // figure sat outside every ReceiptReveal on the route and beat 2 was therefore
        // unreachable on the landing page entirely.
        <ReceiptReveal className="mx-auto flex max-w-page flex-col gap-7 px-6 pt-24 pb-24 md:px-16">
          <div className="flex flex-col gap-4">
            <h2 className="max-w-[26ch] text-h1 font-normal text-ink">
              The part our lawyer cares about, before you sign up
            </h2>
            <p className="max-w-[68ch] text-lg text-ink-muted">
              When an original and a recreation appear together, the disclaimer sits inside the
              same frame, at the same size as the panel labels. That is a legal requirement, not
              a styling preference, and it is on this page so you can check it before you give
              us anything.
            </p>
          </div>
          <ReproductionFigure reproduction={reproductionFor(sample.id)} />
          <Link
            href={`/receipt/${sample.id}`}
            className="w-fit text-body text-ink-accent underline-offset-4 hover:underline"
          >
            Read the whole receipt, including what we could not assess
          </Link>
        </ReceiptReveal>
      ) : null}

      {/* ============================ 5. THE LEDGER ============================
          Two columns with a ruled seam between them, on the sunk surface: the only block on the
          page that is not a single column, and the heading sits BESIDE its body rather than
          above it, which no other block here does.

          No entrance animation. It is a statement of fact, not a beat, and two moving blocks is
          the whole budget — see the note on `motion.every-section-reveals` at the top of this
          file. `McpSection` keeps that: it renders a plain <section>, deliberately with no
          reveal attributes, so dropping it in here does not spend a beat this page has not got.

          The MCP content lives in `components/mcp/mcp-section.tsx` rather than inline, because
          two agents were editing this file at once and a section in its own file can be moved,
          reordered or restyled from here with one line. It reads its evidence and every install
          command out of a capture and `lib/mcp.ts`, so nothing about it is typed twice. */}
      <McpSection />

      {/* ============================ 6. THE RECEIPT TAIL ============================
          The narrowest block on the page, set in mono on stock, torn along its top edge. This is
          where the argument finally goes, and the FORM is half of the argument: the limits of a
          reading belong on the tail of the receipt, printed at the same size as everything else,
          which is how small print stops being small print.

          `--perf-behind` is the page surface, because that is what is behind this band. */}
      <section data-paper data-tear className="[--perf-behind:var(--surface)]">
        <div className="mx-auto flex max-w-[62ch] flex-col gap-5 px-6 py-20">
          <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase">
            What this cannot see
          </p>
          <p className="font-mono text-mono-md text-ink">
            {RULE_DESCRIPTORS.length} rules is not a verdict on taste. There is no score in the
            card above and there is not going to be one: what the reading gives you is what was
            found and how much was checked, and both of those are facts in a way a number out of
            a hundred is not.
          </p>
          <p className="font-mono text-mono-md text-ink-muted">
            The scan reads hygiene and rendered style on one page at one viewport. It reads
            motion, including whether prefers-reduced-motion is actually honoured, and the type
            drawn inside an SVG. It cannot read audio, type rendered into a photograph, or
            whether the writing is any good. A clean run means the checks that ran found nothing
            they know how to cite, and nothing more than that.
          </p>
          <p className="font-mono text-mono-md text-ink-muted">
            We do not name creators. We do not assert that anything is AI.
          </p>
          <Link
            href="/method"
            className="w-fit font-mono text-mono-md text-ink-accent underline-offset-4 hover:underline"
          >
            The method, in full, including the parts that argue against us
          </Link>
        </div>
      </section>
    </>
  );
}
