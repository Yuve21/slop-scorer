/**
 * The labeled NEGATIVE corpus: five artifacts a person made.
 *
 * WHERE THESE NUMBERS COME FROM. Four of the five were read out of a live browser at 390x844
 * on 2026-08-15 and written up with per-field measurements (background hex, headline foundry
 * and weight, word count, page height, image count, hidden-input count, licence status of
 * every face). The write-ups are `waitlist-competitive-look.md` and
 * `waitlist-new-comparables.md`. The fifth, stripe.com, is included as an unambiguous
 * human-made control at a completely different scale.
 *
 * WHY THIS CORPUS IS THE POINT. Every one of these sites trips something. Three of the four
 * comparables use a warm off-white background, which every competing vibe-code detector
 * treats as a tell. Two set enormous display type. One uses a free Google serif for
 * everything. If a rule change starts calling these "many signals", the corpus has begun
 * flagging funded, design-literate human work, and `calibration.test.ts` fails the build and
 * names the rule that did it. That failure mode, not a missed generator, is what kills this
 * category: `image-detection-reality.md` documents four people publicly accused of being
 * machines, and in the canonical case the artist offered his layered source files and was
 * told "I don't believe you".
 *
 * ONE HONEST CAVEAT, STATED RATHER THAN HIDDEN. These are hand-transcribed from a measured
 * audit, not live captures, so the audit's recorded fields are exact and the fields it did
 * not record are set to the CHARITABLE default (craft hygiene present). Defaulting the other
 * way would manufacture craft-floor findings nobody observed, which would make the corpus
 * flatter this build than it deserves. `capturedAt` and `provenance` carry the distinction so
 * a later live capture can be told apart from this transcription.
 */

import type { CorpusCase } from "@slop/core";
import { neutralArtifact } from "../artifact.js";
import type { WebArtifact } from "../artifact.js";

const AUDIT = "2026-08-15";

/** Repeat a card signature n times, for pages that genuinely ship a card grid. */
const cardGrid = (n: number, radius: string, border: string, shadow: string) =>
  Array.from({ length: n }, (_, i) => ({ selector: `.card:nth-child(${i + 1})`, radius, border, shadow }));

const photo = (src: string, alt: string | null) => ({ src, alt, photographic: true });

function capture(over: Partial<WebArtifact>): WebArtifact {
  return neutralArtifact(over);
}

/**
 * Overtone. Justin McLeod (Hinge founder), $18M, FirstMark/Pace/Match Group.
 * 18 words, no imagery, a paid Commercial Type face, #F0EBDC warm paper, form off-site on Tally.
 */
const overtone: WebArtifact = capture({
  url: "https://overto.ne/",
  finalUrl: "https://overto.ne/",
  fetchedAt: `${AUDIT}T12:00:00.000Z`,
  head: {
    title: "overtone",
    generator: null,
    description: "the making of a matchmaker.",
    ogImage: "https://overto.ne/og.png",
    canonical: "https://overto.ne/",
    htmlLang: "en",
    favicon: true,
    jsonLd: false,
  },
  type: {
    faces: [
      { family: "Focal Maxi Trial", src: "/fonts/focal-maxi-trial.woff2", weight: "500" },
      { family: "Focal Light Trial", src: "/fonts/focal-light-trial.woff2", weight: "300 400" },
    ],
    familiesInUse: ["Focal Maxi Trial", "Focal Light Trial"],
    hero: { selector: "h1", family: "Focal Maxi Trial", weightNum: 500, sizePx: 34, letterSpacingEm: -0.01 },
    body: { selector: "p", family: "Focal Light Trial", weightNum: 300, sizePx: 17, letterSpacingEm: 0 },
  },
  color: { bodyBackground: "#F0EBDC", heroGradient: null },
  dom: {
    nodeCount: 210,
    h1Count: 1,
    images: [],
    eyebrows: [],
    pingDots: [],
    numberedLabels: [],
    cards: [],
    iconTiles: [],
    sections: [{ selector: "main > div", heightPx: 844 }],
    hiddenInputs: [],
    customArtifacts: [],
  },
  assets: {
    chunks: [{ url: "/_next/static/chunks/main-4b1e.js", bytes: 96_000, sourceMappingURL: false, mapReachable: false }],
    totalJsBytes: 96_000,
    thirdPartyHosts: ["tally.so"],
  },
  routes: ["/", "/intro"],
  text: {
    innerText:
      "overtone. the making of a matchmaker. an essay on why introductions are the last thing worth building. join the waitlist.",
    wordCount: 18,
  },
});

/**
 * Rodeo. Ex-Hinge COO + ex-Hinge CPO, $8.5M seed. Nine words on the whole page, a paid NaN
 * face for display, self-hosted Libre Franklin for body, #FFFBF0, distribution entirely
 * off-site (App Store badge, a founder TikTok, a Substack, a WhatsApp group).
 */
const rodeo: WebArtifact = capture({
  url: "https://rodeorodeorodeo.com/",
  finalUrl: "https://rodeorodeorodeo.com/",
  fetchedAt: `${AUDIT}T12:10:00.000Z`,
  head: {
    title: "Rodeo",
    generator: null,
    description: "Save it. Do it.",
    ogImage: "https://rodeorodeorodeo.com/og.png",
    canonical: "https://rodeorodeorodeo.com/",
    htmlLang: "en",
    favicon: true,
    jsonLd: false,
  },
  type: {
    faces: [
      { family: "NaN Jaune", src: "/fonts/NaNJaune-Medium.woff2", weight: "500 700" },
      { family: "Libre Franklin", src: "/fonts/libre-franklin-var.woff2", weight: "400 700" },
    ],
    familiesInUse: ["NaN Jaune", "Libre Franklin"],
    hero: { selector: "h1", family: "NaN Jaune", weightNum: 700, sizePx: 44, letterSpacingEm: -0.02 },
    body: { selector: "p", family: "Libre Franklin", weightNum: 400, sizePx: 16, letterSpacingEm: 0 },
  },
  color: { bodyBackground: "#FFFBF0", heroGradient: null },
  dom: {
    nodeCount: 150,
    h1Count: 1,
    images: [{ src: "/plate.png", alt: "Rodeo", photographic: false }],
    eyebrows: [],
    pingDots: [],
    numberedLabels: [],
    cards: [],
    iconTiles: [],
    sections: [{ selector: "main", heightPx: 844 }],
    hiddenInputs: [],
    customArtifacts: [],
  },
  assets: {
    chunks: [{ url: "/assets/index-7c21.js", bytes: 42_000, sourceMappingURL: false, mapReachable: false }],
    totalJsBytes: 42_000,
    thirdPartyHosts: ["apps.apple.com", "instagram.com", "tiktok.com", "rodeoapp.substack.com", "chat.whatsapp.com"],
  },
  routes: ["/"],
  text: { innerText: "Rodeo. Save it. Do it. Get the app.", wordCount: 9 },
});

/**
 * Sitch. M13 + a16z speedrun, $7M. Black background, two paid faces, 547 words, 53 images,
 * a 10,642px page and roughly ten honeypots plus hidden UTM and referral plumbing. The
 * anti-spam layer is the giveaway that a person shipped this: a generator does not write one.
 */
const sitch: WebArtifact = capture({
  url: "https://waitlist.joinsitch.com/",
  finalUrl: "https://waitlist.joinsitch.com/",
  fetchedAt: `${AUDIT}T12:20:00.000Z`,
  head: {
    title: "Sitch: get on the list",
    generator: null,
    description: "AI plus human matchmaking. Tell us about yourself and get curated matches.",
    ogImage: "https://waitlist.joinsitch.com/og.png",
    canonical: "https://waitlist.joinsitch.com/",
    htmlLang: "en",
    favicon: true,
    jsonLd: false,
  },
  type: {
    faces: [
      { family: "Belmonte Ballpoint Trial", src: "/fonts/belmonte-ballpoint-trial.woff2", weight: "400" },
      { family: "Seriously Nostalgic", src: "/fonts/seriously-nostalgic.woff2", weight: "400" },
      { family: "PP Mori", src: "/fonts/PPMori-Regular.woff2", weight: "400 600" },
    ],
    familiesInUse: ["Seriously Nostalgic", "PP Mori", "Belmonte Ballpoint Trial"],
    hero: { selector: "h1", family: "Seriously Nostalgic", weightNum: 400, sizePx: 46, letterSpacingEm: -0.01 },
    body: { selector: "p", family: "PP Mori", weightNum: 400, sizePx: 16, letterSpacingEm: 0 },
  },
  color: { bodyBackground: "#000000", heroGradient: null },
  dom: {
    nodeCount: 2_400,
    h1Count: 1,
    images: [
      photo("/img/couple-01.jpg", "Two people laughing at a bar"),
      photo("/img/couple-02.jpg", "A first date at a diner"),
      photo("/img/matchmaker-03.jpg", "A matchmaker at a laptop"),
      { src: "/img/chat-ui-04.png", alt: "A simulated matchmaker conversation", photographic: false },
    ],
    eyebrows: [{ selector: ".kicker", text: "HOW SITCH WORKS" }],
    pingDots: [],
    numberedLabels: [],
    cards: cardGrid(4, "24px", "1px solid rgba(255,255,255,0.08)", "rgba(0,0,0,0.5) 0px 24px 48px 0px"),
    iconTiles: [],
    sections: [
      { selector: "section.hero", heightPx: 900 },
      { selector: "section.chat", heightPx: 2_600 },
      { selector: "section.how", heightPx: 1_800 },
      { selector: "section.proof", heightPx: 3_100 },
      { selector: "section.faq", heightPx: 1_400 },
      { selector: "footer", heightPx: 842 },
    ],
    hiddenInputs: [
      { name: "company", reason: "honeypot" },
      { name: "website", reason: "honeypot" },
      { name: "fax", reason: "honeypot" },
      { name: "address2", reason: "honeypot" },
      { name: "utm_source", reason: "attribution field" },
      { name: "utm_medium", reason: "attribution field" },
      { name: "utm_campaign", reason: "attribution field" },
      { name: "referral_code", reason: "attribution field" },
    ],
    customArtifacts: [{ selector: ".chat-thread", kind: "blend-mode", detail: "screen" }],
  },
  assets: {
    chunks: [
      { url: "/_next/static/chunks/main-1a2b.js", bytes: 310_000, sourceMappingURL: false, mapReachable: false },
      { url: "/_next/static/chunks/pages-3c4d.js", bytes: 240_000, sourceMappingURL: false, mapReachable: false },
    ],
    totalJsBytes: 550_000,
    thirdPartyHosts: ["branch.io", "apps.apple.com"],
  },
  routes: ["/", "/privacy", "/terms"],
  text: {
    innerText:
      "GET ON THE LIST. Sitch pairs a real matchmaker with an AI that has actually read your answers. Tell us about yourself, get curated matches, and see if you make the cut. Dini has left the conversation.",
    wordCount: 547,
  },
});

/**
 * Amata. NYC AI matchmaker, $6M. The hard case in this set, and it is here BECAUSE it is
 * hard: a single free Google serif (Crimson Pro) doing every job at weight 300 and display
 * size is, by the corpus's own visual rules, the cheapest way to look like you bought a
 * typeface. It should trip visual rules and it should still come nowhere near a finding,
 * because 19 real photographs, a photographed handwritten manifesto and a torn-paper plate
 * are counter-evidence a generator does not produce.
 */
const amata: WebArtifact = capture({
  url: "https://www.amata.ai/",
  finalUrl: "https://www.amata.ai/",
  fetchedAt: `${AUDIT}T12:30:00.000Z`,
  head: {
    title: "Amata: your AI matchmaker",
    generator: null,
    description: "Real dates at real places. Amata introduces you to people worth meeting.",
    ogImage: "https://www.amata.ai/og.png",
    canonical: "https://www.amata.ai/",
    htmlLang: "en",
    favicon: true,
    jsonLd: false,
  },
  type: {
    faces: [{ family: "Crimson Pro", src: "/fonts/crimson-pro-var.woff2", weight: "300 600" }],
    familiesInUse: ["Crimson Pro"],
    hero: { selector: "h1", family: "Crimson Pro", weightNum: 300, sizePx: 56, letterSpacingEm: -0.01 },
    body: { selector: "p", family: "Crimson Pro", weightNum: 400, sizePx: 18, letterSpacingEm: 0 },
  },
  color: { bodyBackground: "#ffffff", heroGradient: null },
  dom: {
    nodeCount: 880,
    h1Count: 1,
    images: [
      photo("/img/couple-fountain.jpg", "A couple on a bench in Washington Square Park"),
      photo("/img/date-hive.jpg", "The Hive Cocktail Bar in Soho"),
      photo("/img/manifesto.jpg", "A handwritten manifesto photographed on a desk"),
      photo("/img/founder.jpg", "Ludovic in the Amata office"),
    ],
    eyebrows: [],
    pingDots: [],
    numberedLabels: [],
    cards: cardGrid(2, "12px", "1px solid #eee", "none"),
    iconTiles: [],
    sections: [
      { selector: "section.hero", heightPx: 844 },
      { selector: "section.manifesto", heightPx: 1_600 },
      { selector: "section.date", heightPx: 1_100 },
      { selector: "section.rsvp", heightPx: 837 },
    ],
    hiddenInputs: [],
    customArtifacts: [
      { selector: ".manifesto img", kind: "handwriting", detail: "photographed handwritten manifesto" },
      { selector: ".torn", kind: "torn-paper", detail: "scanned torn paper edge as a section divider" },
    ],
  },
  assets: {
    chunks: [{ url: "/_next/static/chunks/main-9e8f.js", bytes: 190_000, sourceMappingURL: false, mapReachable: false }],
    totalJsBytes: 190_000,
    thirdPartyHosts: ["amata.onelink.me"],
  },
  routes: ["/", "/events"],
  text: {
    innerText:
      "Get started. Amata introduces you to people worth meeting, at a specific bar, at a specific time. The Hive Cocktail Bar in Soho, NYC, on June 5 at 7PM. RSVP to a matchmaking party.",
    wordCount: 147,
  },
});

/**
 * stripe.com. Included as a control at a different scale: an enormous, deliberately designed,
 * unambiguously human marketing site that ships a large bundle and a full card system, i.e. it
 * trips the craft-floor and structural families for reasons that have nothing to do with
 * generation. If a corpus change lets weight and uniformity carry a verdict, this is the
 * artifact that catches it.
 */
const stripe: WebArtifact = capture({
  url: "https://stripe.com/",
  finalUrl: "https://stripe.com/",
  fetchedAt: `${AUDIT}T12:40:00.000Z`,
  viewport: { width: 390, height: 844 },
  head: {
    title: "Stripe | Financial Infrastructure to Grow Your Revenue",
    generator: null,
    description:
      "Stripe powers online and in-person payment processing and financial solutions for businesses of all sizes.",
    ogImage: "https://images.stripeassets.com/og.png",
    canonical: "https://stripe.com/",
    htmlLang: "en-US",
    favicon: true,
    jsonLd: true,
  },
  type: {
    faces: [
      { family: "sohne-var", src: "/img/v3/home/fonts/sohne-var.woff2", weight: "100 700" },
      { family: "Berkeley Mono", src: "/fonts/berkeley-mono.woff2", weight: "400" },
    ],
    familiesInUse: ["sohne-var", "Berkeley Mono"],
    hero: { selector: "h1", family: "sohne-var", weightNum: 600, sizePx: 48, letterSpacingEm: -0.02 },
    body: { selector: "p", family: "sohne-var", weightNum: 425, sizePx: 17, letterSpacingEm: 0 },
  },
  color: { bodyBackground: "#ffffff", heroGradient: "linear-gradient(190deg, rgb(0, 217, 255) 0%, rgb(0, 122, 255) 40%, rgb(255, 88, 0) 100%)" },
  dom: {
    nodeCount: 4_100,
    h1Count: 1,
    images: [
      photo("/img/home/dashboard.jpg", "The Stripe Dashboard on a laptop"),
      photo("/img/customers/atlassian.jpg", "An Atlassian office"),
    ],
    eyebrows: [{ selector: ".Eyebrow", text: "PAYMENTS" }],
    pingDots: [],
    numberedLabels: [],
    cards: cardGrid(9, "16px", "none", "rgba(50,50,93,0.1) 0px 13px 27px -5px, rgba(0,0,0,0.15) 0px 8px 16px -8px"),
    iconTiles: [{ selector: ".ProductIcon" }],
    sections: [
      { selector: "section.HomepageHero", heightPx: 1_240 },
      { selector: "section.Payments", heightPx: 2_100 },
      { selector: "section.Platform", heightPx: 1_760 },
      { selector: "section.Customers", heightPx: 940 },
      { selector: "section.Global", heightPx: 1_480 },
      { selector: "footer", heightPx: 2_600 },
    ],
    hiddenInputs: [{ name: "utm_campaign", reason: "attribution field" }],
    customArtifacts: [{ selector: ".HeroGradient", kind: "blend-mode", detail: "multiply" }],
  },
  assets: {
    chunks: [
      { url: "/js/main-1f2e.js", bytes: 980_000, sourceMappingURL: false, mapReachable: false },
      { url: "/js/vendor-4a9c.js", bytes: 1_100_000, sourceMappingURL: false, mapReachable: false },
    ],
    totalJsBytes: 2_080_000,
    thirdPartyHosts: ["js.stripe.com", "images.stripeassets.com", "b.stripecdn.com"],
  },
  wellKnown: [
    { path: "/robots.txt", status: 200, contentType: "text/plain", excerpt: "Sitemap: https://stripe.com/sitemap/sitemap.xml" },
    { path: "/sitemap.xml", status: 200, contentType: "application/xml" },
    { path: "/llms.txt", status: 404, contentType: "text/html" },
    { path: "/CLAUDE.md", status: 404, contentType: "text/html" },
    { path: "/AGENTS.md", status: 404, contentType: "text/html" },
    { path: "/.cursorrules", status: 404, contentType: "text/html" },
  ],
  routes: ["/", "/payments", "/billing", "/radar", "/customers", "/pricing", "/newsroom"],
  text: {
    innerText:
      "Financial infrastructure to grow your revenue. Millions of companies of all sizes use Stripe online and in person to accept payments, send payouts, automate financial processes, and ultimately grow revenue.",
    wordCount: 1_240,
  },
});

/**
 * The corpus. `label: "human"` on every member, and `checkNegativeCorpus` requires every one
 * of them to land strictly below the band the product would print as a finding.
 *
 * THERE IS NO POSITIVE SET IN THIS MODULE, and there never will be. A synthetic positive set
 * written by us would measure our imagination rather than any generator, and a measured
 * positive set is a labeling problem with its own provenance requirements.
 *
 * Those requirements have since been met, elsewhere: `test/corpus/` holds four live public pages
 * that name their own builder in their own markup, captured through the real probe and pinned by
 * fetch date. They live under `test/` rather than here because they are captures rather than
 * fixtures - bytes on disk with a capture script, an index and a re-check that aborts if the
 * declaration is missing - and because nothing in the shipped package should be able to import a
 * positive set by accident. `test/calibration.test.ts` runs both halves in one table.
 *
 * Neither half states a recall number. Five artifacts and four artifacts cannot.
 */
export const NEGATIVE_CORPUS: readonly CorpusCase<WebArtifact>[] = [
  {
    id: "overtone",
    label: "human",
    source: "https://overto.ne/",
    provenance:
      "Justin McLeod (Hinge founder), $18M from FirstMark/Pace/Match Group, covered by TechCrunch and Fast Company July 2026. Faces are a paid Commercial Type trial build, self-hosted. Measured in a live browser at 390x844.",
    artifact: overtone,
    capturedAt: AUDIT,
  },
  {
    id: "rodeo",
    label: "human",
    source: "https://rodeorodeorodeo.com/",
    provenance:
      "Ex-Hinge COO Sam Levy and ex-Hinge CPO Tim MacGougan, $8.5M seed. Display face is NaN Jaune (paid, self-hosted). Measured in a live browser at 390x844.",
    artifact: rodeo,
    capturedAt: AUDIT,
  },
  {
    id: "sitch",
    label: "human",
    source: "https://waitlist.joinsitch.com/",
    provenance:
      "M13 and a16z speedrun, $7M, TechCrunch June 2025. Two paid faces (Nicky Laatz, Pangram Pangram) and roughly ten honeypot and attribution fields nobody generates. Measured in a live browser at 390x844.",
    artifact: sitch,
    capturedAt: AUDIT,
  },
  {
    id: "amata",
    label: "human",
    source: "https://www.amata.ai/",
    provenance:
      "Founder Ludovic Huraux, $6M, Global Dating Insights launch coverage. Single free Google serif at weight 300, plus a photographed handwritten manifesto. The hardest negative in the set. Measured in a live browser at 390x844.",
    artifact: amata,
    capturedAt: AUDIT,
  },
  {
    id: "stripe",
    label: "human",
    source: "https://stripe.com/",
    provenance:
      "A public company's marketing site, a self-hosted licensed Klim face, a named in-house design team. Included as a large-scale control: heavy bundle and a full card system, both innocent.",
    artifact: stripe,
    capturedAt: AUDIT,
  },
];
