/**
 * A runnable demonstration of the whole package, with no API keys and no network.
 *
 *   npm run build && node packages/reproduce/demo.mjs
 *
 * It walks all three shipping modalities against the deterministic mock provider, then the two
 * failure arms, the two gates, the export figure and the substantiation aggregate. Every number it
 * prints is measured on this run; nothing is hardcoded.
 */

import { createHash } from "node:crypto";
import {
  EXPORT_SIZES,
  EphemeralStore,
  HeuristicFaceDetector,
  MockProvider,
  ProviderRegistry,
  ReproductionPipeline,
  SubstantiationLog,
  checkDisclaimerProminence,
  composeFigure,
  createRaster,
  deterministicRuntime,
  formatAggregate,
  grantConsent,
  realProviders,
  requiredEnvByModality,
  setPixel,
  RECREATION_LABEL,
  SUBMITTED_LABEL,
} from "./dist/index.js";

const line = (s = "") => console.log(s);
const rule = (title) => {
  line();
  line(`── ${title} ${"─".repeat(Math.max(0, 74 - title.length))}`);
};

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const artifact = (id, bytes, mediaType) => ({
  artifactId: id,
  mediaType,
  byteLength: bytes.byteLength,
  sha256: digest(bytes),
});

function picture(w, h, warm = false) {
  const r = createRaster(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      setPixel(
        r,
        x,
        y,
        warm ? [220, 150, 120] : [150 + ((x * 60) / w) | 0, 165 + ((y * 55) / h) | 0, 235],
      );
    }
  }
  return r;
}

const consentFor = (artifactId, nowMs) =>
  grantConsent({
    consentId: `cns_${artifactId}`,
    artifactId,
    nowMs,
    ttlMs: 3_600_000,
    scopes: ["transmit_to_provider", "regenerate", "compose_side_by_side"],
    submitterAssertsRights: true,
  });

const runtime = deterministicRuntime();
const log = new SubstantiationLog();
const store = new EphemeralStore();

const registry = new ProviderRegistry()
  .register(new MockProvider({ modality: "text" }))
  .register(new MockProvider({ modality: "image" }))
  .register(new MockProvider({ modality: "website-from-screenshot" }));

const pipeline = new ReproductionPipeline({
  registry,
  faceDetector: new HeuristicFaceDetector(),
  runtime,
  log,
  store,
});

const text =
  "However, the team will begin to utilize the new process in order to demonstrate approximately the same result.";
const shot = picture(160, 200);

const inputs = [
  { modality: "text", artifact: artifact("art_text", new TextEncoder().encode(text), "text/plain"), text },
  {
    modality: "image",
    artifact: artifact("art_image", new Uint8Array(picture(96, 96).data.buffer.slice(0)), "image/png"),
    raster: picture(96, 96),
  },
  {
    modality: "website-from-screenshot",
    artifact: artifact("art_site", new Uint8Array(shot.data.buffer.slice(0)), "image/png"),
    raster: shot,
  },
];

let lastSuccess = null;

rule("SUCCEEDED, all three shipping modalities, mock provider, zero keys");
for (const input of inputs) {
  const result = await pipeline.run({
    input,
    consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
  });
  line();
  line(`  ${input.modality}`);
  line(`    status    ${result.status}`);
  line(`    statement ${result.statement}`);
  if (result.status === "succeeded") {
    lastSuccess = { input, result };
    line(`    provider  ${result.attempt.providerId} / ${result.attempt.model}`);
    line(`    prompt    ${result.attempt.prompt}`);
    line(`    output    ${result.attempt.output.kind}`);
    line(`    caveat    ${result.caveat}`);
  }
}

rule("COULD_NOT_REPRODUCE, a receipt of our attempt");
{
  const refusing = new ReproductionPipeline({
    registry: new ProviderRegistry()
      .register(new MockProvider({ modality: "image", id: "mock-a", behaviour: "safety_refusal" }))
      .register(new MockProvider({ modality: "image", id: "mock-b", behaviour: "capability_gap" })),
    faceDetector: new HeuristicFaceDetector(),
    runtime,
    log,
  });
  const input = inputs[1];
  const result = await refusing.run({
    input,
    consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
  });
  line();
  line(`    status      ${result.status}`);
  line(`    statement   ${result.statement}`);
  line(`    caveat      ${result.caveat}`);
  line("    tried");
  for (const t of result.tried) line(`      ${t.providerId} ${t.outcome} ${t.elapsedMs} ms $${t.costUsd} - ${t.note ?? ""}`);
  line(`    confounders (none ruled out): ${result.confounders.join(", ")}`);
}

rule("REFUSED, the face gate, before any regeneration");
{
  const face = picture(96, 96, true);
  const input = {
    modality: "image",
    artifact: artifact("art_face", new Uint8Array(face.data.buffer.slice(0)), "image/png"),
    raster: face,
  };
  const result = await pipeline.run({
    input,
    consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
  });
  line();
  line(`    status    ${result.status} / ${result.refusal}`);
  line(`    statement ${result.statement}`);
  line(`    detail    ${result.detail}`);
}

rule("REFUSED, the consent gate: no consent, no call");
{
  const result = await pipeline.run({ input: inputs[0] });
  line();
  line(`    status    ${result.status} / ${result.refusal}`);
  line(`    statement ${result.statement}`);
}

rule("NOT_CONFIGURED, the real providers with no keys and no transport");
{
  const real = new ProviderRegistry();
  for (const p of realProviders()) real.register(p);
  const bare = new ReproductionPipeline({ registry: real, faceDetector: new HeuristicFaceDetector(), runtime });
  const result = await bare.run({
    input: inputs[0],
    consent: consentFor(inputs[0].artifact.artifactId, runtime.clock.now()),
  });
  line();
  line(`    status     ${result.status}`);
  line(`    statement  ${result.statement}`);
  line(`    attempts   ${result.attempts.length}, cost $${result.totals.costUsd}`);
  line();
  line("    what a real provider would need:");
  for (const [modality, keys] of Object.entries(requiredEnvByModality())) {
    line(`      ${modality.padEnd(26)} ${keys.join(", ")}`);
  }
}

rule("THE EXPORT FIGURE, OCR'd back out of the finished pixels at every size");
if (lastSuccess !== null) {
  const submitted = lastSuccess.input.raster ?? picture(96, 96);
  const recreation = lastSuccess.result.attempt.output.raster ?? picture(96, 96);
  line();
  line("    size            scale  label px  disclaimer px  inside border  ok");
  for (const size of EXPORT_SIZES) {
    const figure = composeFigure(
      {
        submitted: { label: SUBMITTED_LABEL, meta: "AS UPLOADED - 96 X 96", image: submitted },
        recreation: { label: RECREATION_LABEL, meta: "MADE BY US - 2.4 S - $0.0039", image: recreation },
      },
      size,
    );
    const report = checkDisclaimerProminence(figure.raster);
    line(
      `    ${`${size.id} ${size.width}x${size.height}`.padEnd(24)}${String(figure.layout.textScale).padEnd(7)}${String(report.labelHeightPx).padEnd(10)}${String(report.disclaimerHeightPx).padEnd(15)}${String(report.ok).padEnd(15)}${report.ok ? "PASS" : `FAIL: ${report.problems.join("; ")}`}`,
    );
  }
}

rule("RETENTION, hard delete on notice follows the derivation");
{
  line();
  line(`    held before notice: ${store.ids().join(", ")}`);
  const event = store.deleteOnNotice("art_image", runtime.clock.now(), "notice");
  line(`    deleted:            ${event.deletedIds.join(", ")}`);
  line(`    held after notice:  ${store.ids().join(", ")}`);
}

rule("SUBSTANTIATION, computed from this run, nothing hardcoded");
line();
line(
  formatAggregate(log.aggregate())
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n"),
);
line();
