# Slop Scorer — design system

Status: shipped. Written 2026-08-23; **§2, §6, §7 rewritten and §7b, §8 added 2026-08-24.**
Governing constraint: **this product will be run through its own detector.** Every token below has to
survive `scan_ui` and a hostile human reading the CSS. No magic numbers; each line carries its reason.

Companion docs: `COMPONENTS.md` (what we install), `SURFACES.md` (what we build),
`SELF-AUDIT.md` (where we are still at risk).

> **2026-08-24 — the founder's verdict, and what it overruled.**
>
> *"the black ui is shit, no emotion to the app at all, and no animation throughout it, or in the
> backdrop"*.
>
> This document specified an austere forensic object: zero radius, no shadows in light mode, no
> imagery, four surfaces' worth of colour compressed into two, and **exactly one motion moment per
> view on a 500 ms budget**. Each call was individually defensible. Stacked, they produced something
> that reads as a compliance PDF, and the founder owns taste on his product.
>
> **What was overruled:** §2's two-surface palette, §6's "no elevation model", §7's one-moment
> budget, and the absence of any backdrop. **What survives untouched, and is not negotiable for
> aesthetics:** no red/amber/green severity ramp anywhere (§2 — a legal position, not a preference);
> no score gauge, dial or `N/100` in the fold (`SURFACES.md` §A); the disclaimer band inside the same
> frame as both panels at the same pixel height as the panel labels, with no animation permitted
> through it (§7); `prefers-reduced-motion` fully honoured (§7); and zero radius on documents (§5).
>
> §8 is new and is the receipt for all of it: our own site, measured in a real browser against our
> own motion rules. It found us failing one of them.

---

## 0. Figma artifacts

Private personal draft, in the founder's own Drafts folder (`Yuvraj Chandyok's team`, student plan,
**View seat** — drafts are still editable, team/project files are not, so a draft was the only
compliant *and* possible option; this also matches the standing "no shared team/project file" rule).

| Artifact | URL |
|---|---|
| File | https://www.figma.com/design/NnoU34k0nkZWqRsJwYQLs2/Slop-Scorer---design-foundation--private-draft- |
| Page `Slop Scorer — surfaces` | node `1:2` |
| **RECEIPT — verdict view** (1200×1601) | https://www.figma.com/design/NnoU34k0nkZWqRsJwYQLs2?node-id=1-3 |
| **LANDING — fold runs the detector on us** (1440×1126) | https://www.figma.com/design/NnoU34k0nkZWqRsJwYQLs2?node-id=1-69 |

Both frames are set in **IBM Plex Sans / IBM Plex Mono**, which are stand-ins available inside Figma.
They are *not* the shipping faces. Read §1.

MCP calls made: `mcp__figma__whoami`, `create_new_file`, `use_figma` ×2, `get_screenshot` ×2.
**Caveat stated plainly:** the Figma server asks that `/figma-use` be loaded before `use_figma`. That
skill is not installed in this environment and there is no resource-reader tool available here to
fetch the `skill://figma/figma-use/SKILL.md` fallback. I proceeded without it, verified the output by
screenshot, and repaired the two layout defects it produced (four `SPACE_BETWEEN` rows had collapsed
to hug-width and were overlapping their own labels). Anyone continuing this work should load the
skill first.

---

## 1. Typeface

### What actually shipped, 2026-08-24

| Role | Face | Designer / foundry | Weights shipped | Licence |
|---|---|---|---|---|
| Text + display | **IBM Plex Sans** | Mike Abbink with Bold Monday | Regular 400, Medium 500 | SIL OFL 1.1 |
| Evidence, locators, code, all numerals in a receipt | **IBM Plex Mono** | Bold Monday | Regular 400, Medium 500 | SIL OFL 1.1 |

Self-hosted `woff2` out of `/public/fonts`, subset by `scripts/vendor-fonts.mjs` from the official
`@ibm/plex-sans@1.1.0` and `@ibm/plex-mono@2.5.0` npm packages. **Zero third-party font requests.**
No Google Fonts CDN, no Adobe kit, no Fontshare link tag. Verified in a browser against the built
site: `document.fonts` reports all four faces `loaded`, the computed stack head on every heading is
`IBM Plex Sans`, the mono column is `IBM Plex Mono`, and the page makes zero off-origin requests.

| File | Subset | Shipped |
|---|---|---|
| `IBMPlexSans-Regular.subset.woff2` | see below | 17.6 KB |
| `IBMPlexSans-Medium.subset.woff2` | | 18.7 KB |
| `IBMPlexMono-Regular.subset.woff2` | | 13.1 KB |
| `IBMPlexMono-Medium.subset.woff2` | | 13.4 KB |
| **Total** | | **62.9 KB** |

Half the 120 KB cap and 40 KB under the Diatype budget below. Hinting is kept (it costs about 5 KB a
file) because most of this site is 13-16px text and a large share of the audience is on Windows,
where DirectWrite uses it.

**The subset range is measured, not copied.** It is the union of Latin-1, the two Latin-Extended-A
letters Plex's kerning expects, General Punctuation, the currency and trademark marks, and
`U+2190-2193`. That last one is load-bearing: `→` is set ten times in this codebase and is **absent
from Google Fonts' "latin" subset**, which carries only `U+2191` and `U+2193`. Shipping the
`@fontsource` latin build would have dropped every arrow on the site to a fallback face at a
different width — the exact class of defect this product sells the detection of. Emoji and CJK are
deliberately excluded: they appear in this repo only as detector *inputs*, never as UI chrome.

Loading: `font-display: swap` on all four, the two Regulars preloaded from the root layout (Medium is
below the fold on every surface), and a metric-matched fallback pair whose four override numbers are
measured rather than invented — `ascent/descent/line-gap` from the shipped subsets' `hhea` table with
fonttools, `size-adjust` from rendering the same string in both faces in headless chromium against
the running build. The numbers and their provenance are in the `globals.css` header.

### Why IBM Plex, in one paragraph

Plex is the only free, self-hostable, genuinely-drawn family on the shortlist whose sans and mono are
**one design on one skeleton**, and that is the whole argument. This product's core UI is a document
with a machine-read citation column running down it: a finding title in sans, its locator in mono,
one baseline grid, one voice. Satoshi, Switzer and Cabinet Grotesk are all good faces with no mono
sibling, so choosing one means a Frankenstein pairing in the single place the design cannot afford
one. Plex is also a commissioned face with a designer and a brief rather than a default — it was
drawn for IBM by Bold Monday, it has a slightly awkward humanist-grotesque temperament that reads as
somebody's decision, and it carries none of the AI-default associations. It is not Inter, not Geist,
not Space Grotesk, not General Sans (Lark's face — these two products must never look related), and
not Söhne. Its one genuine cost: it is free, so it does **not** earn our own
`counter.licensed-foundry-face`, which requires a self-hosted non-free face. We are not going to
pretend otherwise, and the Diatype note below is what closes that gap when somebody pays for it.

### The intended upgrade, still open: ABC Diatype

Everything from here to the end of §1 describes the face we would rather have licensed. It is kept
because the argument is still right and the purchase is still a live decision, **not** because it
describes what is on the site. Nothing below is shipped.

### Why Diatype and not the alternatives

- **Inter / Geist / Space Grotesk are banned** by the founder mandate and by our own corpus — they are
  the three most common faces on vibe-coded sites. Using one is self-incrimination.
- **Söhne is rejected on purpose, and this is the most opinionated call in the document.** It is the
  obvious "serious tech" answer, and it is also OpenAI's typeface. An AI-slop detector set in the
  typeface of the largest AI company is a self-own that every design-literate reader will notice on
  first glance. Do not revisit this.
- **The Pangram Pangram catalogue (PP Mori, PP Neue Montreal) is rejected** because it has become the
  Framer/startup default. Sitch — one of the four comparables Lark measured — is set in PP Mori.
  Cheap licence, but the differentiation is gone.
- **Diatype wins on a structural argument, not a taste one:** it has a true monospace sibling drawn on
  the same skeleton. This product's core UI is a *document with a citation column* — prose and
  machine-read locators sitting on the same baseline grid. One family covering both means the evidence
  column and the sentence above it are one voice, not a Frankenstein pairing. No other face on the
  shortlist gives us that from a single licence and a single invoice.
- **A bought foundry face is negative evidence inside our own rule corpus.** Three of four funded
  human-made comparables Lark measured bought a face (Focal Maxi/Commercial Type, NaN Jaune/NaN,
  Seriously Nostalgic/Nicky Laatz). Paying for type is one of the cheapest, most reliable human
  signals there is. Buying one is therefore both honest and literally on-brand for us.

### Licence and cost

Dinamo sells a **webfont licence priced by monthly pageviews**, purchased per style at
`abcdinamo.com`. Four styles at the entry pageview tier.
**UNVERIFIED: I did not fetch live pricing.** Budget €300–700 and confirm before purchase; treat any
number I state as an estimate, not a quote.

**Hard rule, from the corpus:** Overtone ships a `Focal *Trial*` build to production and Sitch ships
`Belmonte Ballpoint *Trial*` and `Padlock Script *DEMO*`. We will not. There is no development period
during which we run an unlicensed build "just locally" — the licensed webfont lands with the first
commit that sets type, or we run a face we are entitled to run until it does.

**How the interim was got wrong, so nobody repeats it.** The original wording of that rule was "or we
run the system stack until it does", and `ABC Diatype` was left at the head of the CSS stack with its
`@font-face` blocks commented out. The result was not a documented interim: it was a production site
whose every headline silently rendered in **Segoe UI**, which `SELF-AUDIT.md` §4 had predicted in
advance ("do not launch in the interim state and call it the design") and which the 2026-08-24 UI
audit found first and ranked as the single largest contributor to the founder's verdict on the site.
A font stack must only ever name faces that are actually being served. If a face is unbought, it does
not appear in `--font-doc-sans`; it appears in this document.

### Weight budget, as originally planned for Diatype

| File | Subset | Est. |
|---|---|---|
| `Diatype-Regular.woff2` | latin | ~26 KB |
| `Diatype-Medium.woff2` | latin | ~26 KB |
| `DiatypeMono-Regular.woff2` | latin | ~26 KB |
| `DiatypeMono-Medium.woff2` | latin | ~26 KB |
| **Total** | | **~104 KB** |

Hard cap **120 KB**. Latin only, `unicode-range` declared, no latin-ext, no variable file (we need two
weights, not an axis, and the static pair is smaller than the VF). Reference point: Lark ships
General Sans at ~90 KB.

Loading: `font-display: swap`, plus a `@font-face` **fallback override** on the local system stack
using `size-adjust` / `ascent-override` / `descent-override` so the swap costs 0 CLS. Preload the two
Regular files only; Medium is used below the fold on both surfaces.

Fallback stack (unchanged, and now sitting behind Plex rather than in front of nothing):
`ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` and
`ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Menlo, monospace`.
Note the absence of `Inter` and `system-ui` — `system-ui` resolves to Roboto/Inter-alikes and quietly
reintroduces the tell on some Linux and Android configurations.

**If the Diatype licence is bought:** run `scripts/vendor-fonts.mjs` as the model, drop the four
woff2s into `public/fonts/`, swap the four `@font-face` blocks and the two custom properties in
`globals.css`, re-measure the two `size-adjust` values against Diatype rather than reusing Plex's, and
update the table at the top of this section. Plex stays in the stack behind it as the second name.

---

## 1b. The non-UI artifact

`SELF-AUDIT.md` §Risk 1 named the largest open gap in this foundation: every human-made comparable
carries **one object that is not UI** (Amata's photographed handwriting, Rodeo's joke domain,
Overtone's 1,854-word essay) and we had none — the entire site was two SVG wireframes. Its proposal
was to print a receipt, photograph it, and let that photograph be the only image on the site. The
2026-08-24 UI audit repeated it as change 2 of 5.

**What shipped is the render, not the photograph, and the difference is stated everywhere it appears.**

| | |
|---|---|
| Asset | `apps/web/public/artifact/printed-receipt-4F2A-9C.png`, 518 KB, 1088×1568 |
| Produced by | `scripts/render-printed-receipt.mjs` — headless chromium, committed, reproducible |
| Component | `apps/web/components/artifact/printed-receipt.tsx`, a self-contained full-bleed `<section>` |
| Provenance sidecar | `apps/web/public/artifact/printed-receipt-4F2A-9C.json`, served publicly |

Four decisions in it are not cosmetic:

1. **It is labelled as a render in three places**: the figure caption, the `alt` text, and printed on
   the receipt inside the picture, in the same face and size as the rest of its footer, where a crop
   cannot separate the label from the image. A product that sells the detection of unlabelled
   synthetic imagery cannot carry an unlabelled synthetic image on its own homepage.
2. **The content is real.** Every line is rebuilt from the live `4F2A-9C` report through `@slop/core`
   and the corpus — the same six rule ids, the same points, the same 82.0 — rather than typed into a
   mockup. The script asserts the finding count and the total and fails rather than draw a stale one.
3. **It is a PNG, and it is served through a plain `<img>` rather than `next/image`.** Our own probe
   classifies any jpg/webp/avif over 320px as `photographic`; a JPEG here, or a `next/image` re-encode
   to webp, would make `counter.real-photography` fire on a picture nobody photographed. Not gaming
   our own corpus with our own image is worth more than the bytes.
4. **It claims no counter-evidence, and the page says so.** `counter.real-photography` and
   `counter.handmade-artifact` both want something a person shot or made by hand. A render is neither
   and we do not claim either. What it buys is a focal point on a page the audit measured as having
   none. When somebody prints one on real stock and photographs it, the picture is replaced, the rule
   fires honestly, and §1's `counter.licensed-foundry-face` gap is the only one left.

---

## 2. Palette

**Rebuilt 2026-08-24.** The founder's verdict on the first palette was *"the black ui is shit, no
emotion to the app at all"*, and it was correct in a way that is measurable rather than a matter of
taste. Dark mode was **two surfaces nine luminance points apart with no hue anywhere in it** —
`#101215` page, `#191C21` card, grey text. Nothing on a dark page had an edge, an elevation or a
temperature, so a page of documents rendered as a page of nothing. Two further defects, both found
by measuring rather than looking, are recorded below and both were live in production.

What did **not** change, and is not up for revision:

**One accent. No severity ramp.** That second half is a legal decision as much as an aesthetic one:
this product must never *assert* that something is AI. A red/amber/green severity scale asserts it in
colour before a single word is read, and a court reading a screenshot would see a verdict. So the
palette contains **no red, no amber, no green**, in either mode, at any strength. Findings are set in
ink; the only chromatic elements are the accent and its quiet wash, and both mean *interactive* or
*hierarchy*, never *guilty*. This also, conveniently, deletes an entire family of slop tells at once
(the emerald-check / rose-warning / violet-primary Tailwind default triad).

### The model: four surfaces, on an uneven ladder

Two surfaces is not a palette, it is a light and a dark. Both modes now carry four:

| Token | Role |
|---|---|
| `--surface-sunk` | the desk. Nav, footer, the page floor behind everything. |
| `--surface` | the page. |
| `--surface-raised` | a document: the receipt frame, the figure, an evidence row. |
| `--surface-overlay` | a row inside a document, a chip, a hover, a popover. |

The steps between them are deliberately **uneven** (dark: 7, 9 and 10 luminance points). The gap
widens as you come up, because the difference between a document and a row inside it is doing more
work than the difference between the desk and the page. A uniform ramp is also, on its own terms, one
of the things this product detects.

### Light — receipt stock

The default for a machine with no stated preference, and the mode every exported PNG and OG image is
drawn in. See "Which mode is the default" below.

| Token | Hex | Role | Why |
|---|---|---|---|
| `--surface-sunk` | `#E4E3DD` | nav, footer, page floor | The desk the stock is lying on. |
| `--surface` | `#F2F1EC` | page | Warm neutral, the colour of thermal receipt stock, warmed one step from the old flat `#F4F4F2`. Warm neutrals are explicitly *not* a tell (3 of 4 funded human dating sites use one) but this is deliberately **greyer than cream** so it is never confused with Lark's `#F4EFE4`. Different product, different room. |
| `--surface-raised` | `#FFFFFF` | receipt card, figure frame, evidence rows | Pure white sits *on* the stock, so a receipt reads as a document laid on a desk. |
| `--surface-overlay` | `#EAE9E3` | rows, chips, hover, popovers | |
| `--ink` | `#16150F` | body + display text | Near-black with the same warm cast as the surfaces. Not `#000000` (a default) and not `#111827` (Tailwind gray-900, a default). |
| `--ink-muted` | `#585549` | citations, metadata, timestamps | One step down, AA at body size on all four surfaces. Not a 40%-opacity black — opacity-derived greys are a scaffold habit. |
| `--hairline` | `#C8C6BD` | decorative structure: row separators, card edges | Explicitly non-load-bearing. Does not need 3:1 (WCAG 1.4.11 applies to boundaries required to identify a control) and is documented as such so nobody "fixes" it later. |
| `--border-control` | `#87847A` | inputs, buttons, the figure frame | Load-bearing. Meets 3:1 on all three surfaces it appears on. |
| `--accent` | `#13416E` | CTA fill, links, focus ring | Deep cobalt ink. Institutional, not alarming. Deliberately **not** a Tailwind hex (`#3B82F6`, `#6366F1`, `#8B5CF6` are all named tells), not a dev-tool acid lime, not a gradient endpoint. |
| `--accent-ink` | `#FFFFFF` | text on accent | |
| `--accent-quiet` | `#E4E9F0` | the scan card's masthead band | The one chromatic wash. Header bands only, never near a finding. |

### Dark — the room the machine works in

Three changes from the old palette, each a reason rather than a nudge.

1. **Four surfaces**, per the ladder above.
2. **Warmth, which is where the whole feel comes from.** Every neutral is hue-shifted to roughly 40°:
   a graphite with an ochre cast, not a blue-grey. It is the dark-room version of the same receipt
   stock light mode is printed on, and it is the single thing that stops this looking like every
   other `#0B0B0F` developer tool.
3. **An accent that reads.** `#6FB4FF` against warm graphite is a genuine chromatic event — 8.31:1
   on the page surface and unmistakably the interactive colour. The old `#7FA8E8` was a desaturated
   periwinkle sitting on a blue-grey ground: same hue family as its background, so it read as
   slightly-brighter grey rather than as a colour.

| Token | Hex | Role |
|---|---|---|
| `--surface-sunk` | `#100F0D` | nav, footer, page floor. Not `#000` — pure black destroys elevation and is a default. |
| `--surface` | `#171613` | page |
| `--surface-raised` | `#201E1A` | a document |
| `--surface-overlay` | `#2A2823` | rows, chips, hover, popovers |
| `--ink` | `#F1EEE7` | body. A warm paper-white, not a cool grey. |
| `--ink-muted` | `#ABA49A` | citations |
| `--hairline` | `#332F29` | decorative |
| `--border-control` | `#7A7366` | load-bearing. **Was `#4C525A`, which failed 1.4.11 — see below.** |
| `--accent` | `#6FB4FF` | lifted cobalt |
| `--accent-ink` | `#100F0D` | text on accent |
| `--accent-quiet` | `#1B2430` | the scan card's masthead band |

### Two defects this rebuild fixed, both measured rather than noticed

**1. The dark control border failed WCAG 1.4.11 and this document said it did not.** The old
`--border-control: #4C525A` computes **2.38 : 1** on the old dark page and **2.17 : 1** on the old
dark card, against a 3:1 requirement for boundaries that identify a control. The table in the
previous version of this section asserted "Load-bearing. Meets 3:1" and then printed the light-mode
number only. Every dark ratio is now in the table below, computed, with no pair omitted.

**2. The `dark:` variant was dead.** `globals.css` declared
`@custom-variant dark (&:where([data-theme="dark"], ...))`, and **`data-theme` is set by nothing in
this app** — no `next-themes` provider, no cookie, no inline script, and the media query is what
actually switches the custom properties. So all thirteen `dark:` utilities the installed shadcn
components ship with (`dark:bg-input/30` on every input and textarea, `dark:border-input` on the
outline button, the whole tab active state) matched zero elements, and dark mode ran the light-mode
branch of every control while the tokens underneath had switched. The variant now activates on both
`prefers-color-scheme: dark` and the attribute, the attribute surviving as an escape hatch for the OG
and export renderers, which draw on a fixed ground and must not follow the machine.

### Which mode is the default, and why

There is **no theme-switcher control**, and there should not be one: a switcher is a second thing to
get wrong and this product has one visual idea, not two.

The mode a visitor with no stated preference gets is **light**, and that is a considered call rather
than an inherited one. The artifact this product hands you is a *printed receipt*; paper is the
metaphor the entire design rests on; and every asset that leaves the site — the export PNGs, all four
OG images — is drawn on light stock, so a light default is the only one where the site and its own
output are the same object.

**But dark is what most visitors actually see**, because the audience is developers and agents and
the OS default follows them. Dark is therefore not the afterthought it was: it gets the four-surface
ladder, the warmth, the accent, the graded light-catch, and its own full row in the contrast table
below. If the two modes are ever allowed to diverge in quality again, this is the sentence that was
violated.

### Contrast, computed (WCAG 2.x relative luminance, not eyeballed)

Every text pair on every surface it can appear on. **No pair below AA. No load-bearing border below
3:1.** Generated by `node scripts/contrast.mjs`, which enumerates the full cross product and exits
non-zero on any failure, against the shipped hexes. Recompute and repaste before
changing any value here.

| Mode | Pair | Ratio | Verdict |
|---|---|---|---|
| light | `ink` on `surface-sunk` | 14.22 : 1 | AAA |
| light | `ink-muted` on `surface-sunk` | 5.81 : 1 | AA |
| light | `accent` on `surface-sunk` | 8.13 : 1 | AAA |
| light | `ink` on `surface` | 16.17 : 1 | AAA |
| light | `ink-muted` on `surface` | 6.61 : 1 | AA |
| light | `accent` on `surface` | 9.24 : 1 | AAA |
| light | `ink` on `surface-raised` | 18.29 : 1 | AAA |
| light | `ink-muted` on `surface-raised` | 7.47 : 1 | AAA |
| light | `accent` on `surface-raised` | 10.45 : 1 | AAA |
| light | `ink` on `surface-overlay` | 15.03 : 1 | AAA |
| light | `ink-muted` on `surface-overlay` | 6.14 : 1 | AA |
| light | `accent` on `surface-overlay` | 8.59 : 1 | AAA |
| light | `ink` on `accent-quiet` | 14.99 : 1 | AAA |
| light | `ink-muted` on `accent-quiet` | 6.12 : 1 | AA |
| light | `accent` on `accent-quiet` | 8.57 : 1 | AAA |
| light | `accent-ink` on `accent` fill | 10.45 : 1 | AAA |
| light | `border-control` on `surface` | 3.31 : 1 | passes 1.4.11 |
| light | `border-control` on `surface-raised` | 3.74 : 1 | passes 1.4.11 |
| light | `border-control` on `surface-overlay` | 3.08 : 1 | passes 1.4.11 |
| light | `hairline` on `surface` | 1.51 : 1 | decorative only, by declaration |
| light | `hairline` on `surface-raised` | 1.71 : 1 | decorative only, by declaration |
| dark | `ink` on `surface-sunk` | 16.53 : 1 | AAA |
| dark | `ink-muted` on `surface-sunk` | 7.76 : 1 | AAA |
| dark | `accent` on `surface-sunk` | 8.80 : 1 | AAA |
| dark | `ink` on `surface` | 15.62 : 1 | AAA |
| dark | `ink-muted` on `surface` | 7.33 : 1 | AAA |
| dark | `accent` on `surface` | 8.31 : 1 | AAA |
| dark | `ink` on `surface-raised` | 14.36 : 1 | AAA |
| dark | `ink-muted` on `surface-raised` | 6.74 : 1 | AA |
| dark | `accent` on `surface-raised` | 7.65 : 1 | AAA |
| dark | `ink` on `surface-overlay` | 12.71 : 1 | AAA |
| dark | `ink-muted` on `surface-overlay` | 5.97 : 1 | AA |
| dark | `accent` on `surface-overlay` | 6.76 : 1 | AA |
| dark | `ink` on `accent-quiet` | 13.51 : 1 | AAA |
| dark | `ink-muted` on `accent-quiet` | 6.34 : 1 | AA |
| dark | `accent` on `accent-quiet` | 7.19 : 1 | AAA |
| dark | `accent-ink` on `accent` fill | 8.80 : 1 | AAA |
| dark | `border-control` on `surface` | **3.85 : 1** | passes 1.4.11 (was 2.38, failing) |
| dark | `border-control` on `surface-raised` | **3.54 : 1** | passes 1.4.11 (was 2.17, failing) |
| dark | `border-control` on `surface-overlay` | 3.14 : 1 | passes 1.4.11 |
| dark | `hairline` on `surface` | 1.36 : 1 | decorative only, by declaration |
| dark | `hairline` on `surface-raised` | 1.25 : 1 | decorative only, by declaration |

Nothing on either surface relies on colour alone to carry meaning — a hard requirement here, since
the palette has no severity ramp to lean on in the first place.

---
## 3. Type scale

Ten steps, all snapped to the 4px grid, **not** a clean geometric ratio. A perfectly regular 1.25 ramp
is itself a generated-looking artifact; the irregular steps (13, 21, 26) are human choices and are
meant to be visible as such under audit.

| Token | px | Line-height | Face / weight | Use |
|---|---|---|---|---|
| `--t-mono-xs` | 12 | 145% | Mono Medium, `+0.06em` | mastheads, chips (`INCONCLUSIVE`), the fold marker |
| `--t-mono-sm` | 13 | 145% | Mono Regular | citations, timestamps, machine metadata |
| `--t-mono-md` | 14 | 145% | Mono Medium/Regular | panel labels **and the equal-prominence disclaimer** — these two share a size by law, not by accident |
| `--t-sm` | 14 | 145% | Sans Regular | secondary UI |
| `--t-body` | 16 | 145% | Sans Regular/Medium | finding titles, controls |
| `--t-lg` | 18 | 140% | Sans Regular | long-form method copy |
| `--t-lead` | 21 | 132% | Sans Regular | the claim sentence under a receipt headline |
| `--t-h3` | 26 | 128% | Sans Medium, `-0.005em` | section heads ("What let us shortcut it") |
| `--t-h2` | 32 | 118% | Sans Regular, `-0.01em` | |
| `--t-h1` | 42 | 108% | Sans Regular, `-0.01em` | receipt headline |
| `--t-display` | 56 | 106% | Sans Regular, `-0.01em` | the elapsed-time figure; landing H1 at 52 |

Two rules that come straight out of the Lark audit and are non-negotiable:

1. **The headline is set at Regular 400, not Bold.** Every measured human comparable sets its headline
   *lighter* than expected: Overtone 500, Rodeo 700, **Amata 300**. Lark's Inter 800 hero was one of
   the things that read machine-made. Our largest type is our lightest weight.
2. **Tracking never goes below `-0.01em`.** "Crushed letter-spacing" is a named tell; Lark was shipping
   `-0.04em` at weight 800. `-0.01em` at 400 is optical correction. `-0.04em` at 800 is a look.

Never used anywhere: `letter-spacing` above `+0.08em` on sentence case, all-caps sans headings,
italic serif, and any face outside the two above.

---

## 4. Spacing grid

4px base. Allowed steps:

```
4  8  12  16  20  24  32  44  64  96
```

`20` and `44` are deliberately off a pure doubling ramp. That is not decoration — it is a direct
countermeasure to our own `SPACE-02` rule ("every gap on the page ∈ {16, 24, 32, 64}: no off-scale
value anywhere"). A layout whose gaps are entirely predictable from the default scale is one of the
strongest machine-authorship signals we detect, and we would fail our own check without this.

Component padding is intentionally uneven where the content asks for it: receipt gutters are 72,
figure panels are 20, evidence rows are `18` vertical / `20` horizontal, buttons are `14/22`. Every
one of those is a decision about that element, not a token applied globally.

Measure: content column caps at **1056px** on the receipt, **1248px** on the landing. Prose line
length caps at **72ch** (the claim sentence, the method copy) — long measures are how a report starts
looking like a blog template.

---

## 5. Radii

| Token | Value | Applied to | Why |
|---|---|---|---|
| `--r-doc` | `0` | receipt frame, figure frame, evidence rows, panels | **Documents do not have rounded corners.** This is the single strongest visual argument the product makes about itself. |
| `--r-control` | `3px` | buttons, inputs, chips | Just enough to read as pressable. |
| `--r-overlay` | `6px` | dialog, popover, tooltip | |

**Banned: `16px` (`rounded-2xl`).** Lark's audit named the `rounded-2xl` + hairline-border +
diffuse-shadow card as a signature slop combination, and shadcn's default `--radius` of `0.625rem`
(10px) applied uniformly is the same tell one notch quieter. We override the shadcn radius token at
install time rather than accepting it.

---

---

## 6. Elevation

**There are still no blurred drop shadows. Anywhere, in either mode.** The named tell is unchanged
and specific: Lark's own `--shadow-sm: 0 1px 2px, 0 6px 16px`, the two-layer hairline-plus-diffuse
stack that ships with every component library and every generated card. Not one blurred outer shadow
exists on this site.

What changed on 2026-08-24 is that "no shadows in light mode, one 4% inset in dark" was **not an
elevation model, it was the absence of one**, and combined with two surfaces and grey text it is how
a design becomes a compliance PDF. There are now three levels, and none of them is a drop shadow:

| Level | What | Treatment |
|---|---|---|
| 1 | a document | `--surface-raised` + 1px `--hairline` + the top light-catch |
| 2 | a document you act on | as above, with 1px `--border-control` instead |
| 3 | an overlay | `--surface-overlay` + `--border-control` + the light-catch at 1.5× |

**The top light-catch** is `inset 0 1px 0 var(--light-catch)`, a one-pixel hard inset on the top edge
only. It is not elevation faked with blur; it is the specular line a real edge picks up from a light
above it, which is why it is 1px, hard, and never anywhere but the top. Dark mode sets it to
`rgb(255 255 255 / 0.05)`. **Light mode sets it to fully transparent**, because white paper on warm
stock does not catch a highlight: light-mode elevation is the surface step and the border, exactly as
it always was. Selected with `[data-doc]` and `[data-doc][data-level="3"]`.

Overlays (dialog, popover) may use a single scrim: `rgba(20,22,26,0.42)`. That is a modality signal,
not elevation.

---

## 7. Motion

**Superseded 2026-08-24.** The previous version of this section specified *one moment per view, total
budget 500 ms*. The founder overruled it — *"no animation throughout it, or in the backdrop"* — and
the ruling stands. What follows is not "more animation": it is the same standard applied more widely.

### The standard

> Every moment animates a fact. The fact is measured. The animation is how the measurement arrives.
> **If a candidate animation cannot name the fact it reports, it does not get to move.**

That is the bar the count-up already cleared, and it is the only reason this section can grow without
becoming decoration. Five beats now clear it:

| Beat | What it reports | Duration derived from | Easing |
|---|---|---|---|
| count-up | a measured wall-clock duration | fixed 480 ms | `out(3)` |
| panel wipe | the artifact our pipeline produced | fixed 320 ms | `out(3)` |
| row resolve | the **order the corpus evaluated its checks in** | the run's own ordering | `out(2)` |
| print feed | a ruled document coming off the printer | **the element's own height** ÷ 2.2 px/ms | `linear` |
| locator write | a machine writing a citation | **the string's own length** ÷ 0.34 chars/ms | `linear` |

Three of the five derive their duration from a property of their own content, which is what makes a
uniform value structurally impossible rather than merely unfashionable.

**The easings are four different curves and each is the physically correct one.** `out(3)` and
`out(2)` are values settling toward rest. The print feed and the locator write are **linear**, and
that is not a style choice: a printer feeds paper at a constant rate and a machine writes at constant
characters per second, so an eased print is a *wrong* print.

**Row resolve is the one sequential reveal on the site, and it is licensed by a datum.** The rows in
the fold's scan card carry `data-reveal-order`, which is each rule's index in the detector's own
`evaluated` array — the order the corpus actually ran. So the delays are uneven *because the run
was*. Measured in a browser, four rows land at 0.41 / 0.88 / 0.11 / 0.00 relative progress at the
same instant: not an index times a constant. Without that datum the sequence would be a uniform
per-card stagger asserting a discovery order that never happened, which is both a named tell in our
own corpus and a false statement about our own output. **If the ordering datum ever goes away, the
sequence goes with it.** Everywhere else — the receipt's evidence list — a list arrives as one block.

The locator write spaces each line by a **fraction of the previous line's own content-derived
duration** (0.38), so two identical intervals require two identical string lengths.

### Rules the budget still enforces

- **`prefers-reduced-motion: reduce` → nothing happens at all.** The timelines return before touching
  the DOM. The end state is already on screen, so there is nothing to fast-forward to. No fade-only
  compromise. The two backdrop loops are cancelled **by name** (`animation: none`), not by the
  blanket `0.01ms` override, because a 0.01 ms infinite animation still schedules a frame forever;
  the scan band additionally goes `display: none`, since a frozen band is a stripe, not ambience.
- **SSR-safe.** No `initial: { opacity: 0 }` in the server HTML, ever. The finished number, the
  panels, the rows and every locator string are in the markup; the timelines wind *backwards* from
  that after hydration. Every start-state write is paired with its own undo (`wind()`), so an unmount
  mid-timeline restores exactly what the server sent. A blank flash on a receipt is worse than no
  animation, and a server-rendered `opacity:0` is itself a hydration tell. There is a test asserting
  the fold ships its finished number.
- **The disclaimer band is never animated.** No timeline may clip, fade or translate it: it is a
  compliance artifact that must sit in the same frame as both panels at every instant. Beat 2 moves
  the recreation panel *only*, and `data-reveal-feed` is deliberately **absent from the figure**,
  because a top-down clip reveal would pass *through* the band. Animate around it, never through it.
- **No infinite loops on any element.** There is no `loop` in `reveal.tsx` at all. The only two loops
  on the site are in the backdrop, argued for in §7b.
- `will-change` set on entry and cleared on complete.

### Library

**anime.js, pinned to `4.5.0`**, written against the v4 API and verified against the shipped
package's own type definitions (`node_modules/animejs/dist/modules/{timeline,animation,utils}`):
`createTimeline`, `animate`, `utils.set`.

**Stated rather than papered over:** the `mcp__gateway__anime__*` MCP server documents **3.2.1**
(`anime.timeline()`, `import anime from 'animejs/lib/anime.es.js'`) and a snippet ported from it does
not compile here. That MCP was **also unreachable** in the session that wrote this pass — it was not
registered on the gateway, and neither was the `shadcn` MCP — so the API surface was taken from the
installed package instead. That is the better source either way: it is what npm resolves and what
actually ships.

---

## 7b. The backdrop

The founder asked for one and he was right to: a detector whose own site is inert is an argument
against itself. Everything here is derived from the product's own subject rather than borrowed from a
hero-gradient template. All layers are `aria-hidden`, `pointer-events: none`, and rendered by the
server in the first response — a backdrop that arrives on hydration is a flash of a different page.
Cost is two composited layers moving `transform` only; no content repaints.

| Layer | What | Motion |
|---|---|---|
| **plate grid** | a 32px minor lattice with a 192px major rule at 2× the ink | **static** |
| **grain** | SVG `feTurbulence`, 3% light / 6% dark | 3 discrete positions over **7.3 s**, `steps(3)` |
| **scan band** | one 40vh band crossing the viewport | **31 s**, `linear` |
| **gutter rule** | a measuring scale down the left margin, ticks every 8px, major every 96px, ≥1280px only | **static** |

The grid is a *measuring plate* — the same 32/192 relationship the SVG plates in the reproduction
figure are drawn against — and the two frequencies are what make an empty region of the page read as
ruled rather than as an unfinished background. The grain is `steps(3)`, not a smooth translate,
because **film grain cuts, it does not slide**; it is the only stepped timing function on the site and
must not share an easing with any UI. The scan band is the product's verb.

**Why an infinite loop is allowed here when §7 bans them.** The ban is aimed at, and still aimed at,
*per-element decorative loops* — floats, pulses, ping dots, shimmer — because those are the named tell
and because an element that never stops moving asserts an importance it has not earned. A single
page-scale ambient field at 5% is a different object: it carries no information, so it cannot lie; it
belongs to no component, so it cannot pull the eye off content; and a 31 s period means a reader
finishing a paragraph sees it once. **Nothing inside a document loops.**

Both loops live on `::before` / `::after` pseudo-elements, which the motion probe does not sample, so
they contribute **zero** animation records — see §8.

---

## 8. Do we pass our own motion rules?

The `motion-signature` family landed on 2026-08-24 and reads computed styles in a real browser, so
the only honest way to answer is to point a real browser at our own site.
`node scripts/motion-selfcheck.mjs` does exactly that, re-implementing `readMotion` and the six
thresholds **deliberately rather than importing them**: if the copy and
`packages/detectors-web/src/rules/motion.ts` ever disagree, one of them is wrong and the disagreement
is worth finding.

**It caught a real self-own on its first run.** `motion.framework-default-timing` fires when a page
has ≥8 transitions and ≥60% of them compute to exactly Tailwind's shipped default pairing,
`150ms cubic-bezier(0.4, 0, 0.2, 1)` — the number nobody chose. We measured **7 of 11 (64%)** on the
landing page, **12 of 18 (67%)** on a receipt and **12 of 12 (100%)** on `/method`. A detector that
ships the exact value it detects is not a detector. The fix is two theme variables and a decision:
`--default-transition-duration: 120ms` and
`--default-transition-timing-function: cubic-bezier(0.2, 0, 0, 1)` — 120 because everything these
utilities move is a *colour on a document* and a document's state change should read as immediate,
and a hard-out curve because the change should be gone before it has announced itself.

Result after, measured on all three routes:

| Rule | Threshold | Us | Verdict |
|---|---|---|---|
| `motion.uniform-timing` | ≥6 element animations, ≥70% one bucket | **0 element animations** | clear |
| `motion.stagger-ladder` | ≥4 delays in an exact arithmetic ladder | delays come from `evaluated` order | clear |
| `motion.infinite-decorative-loop` | ≥2 infinite decorative **element** animations | 0 (both loops are pseudo-elements) | clear |
| `motion.library-fingerprint` | animate.css / AOS / WOW / ScrollReveal | none; anime.js is not in the list | clear |
| `motion.every-section-reveals` | ≥5 sections and *every one* reveals | 5 / 2 / 3 sections, none with a CSS entrance | clear |
| `motion.framework-default-timing` | ≥8 transitions, ≥60% at the Tailwind default | 0 of 41 at the default | clear (**was firing on all three routes**) |

**Two counter-evidence rules we do not earn, said out loud rather than gamed.**
`counter.bespoke-keyframe` wants ≥4 stops animating something past opacity/transform, or ≥6 stops of
anything; `grain-cut` has 3 stops of `transform` and `scan-pass` has 2. `counter.reduced-motion-
honoured` requires ≥3 *element* animations before the reduced read, and our two loops are on
pseudo-elements. Both are one edit away — six grain stops, or moving the layers onto real divs — and
neither edit would change a single thing a visitor experiences. That is the definition of teaching to
your own test, which is the behaviour this product exists to catch, and it is the same posture as the
`builder.bare-platform-domain` finding we publish about ourselves on the homepage. When there is a
reason other than the scoreboard, they change. Not before.
