import { ImageResponse } from "next/og";
import { DISCLAIMER_BODY, DISCLAIMER_HEADING } from "./reproduction";

/**
 * The shared link-preview card.
 *
 * THE ONE DECISION IN THIS FILE THAT IS NOT COSMETIC: the card never shows the two plates.
 *
 * design/SELF-AUDIT.md risk 3 is that the equal-prominence disclaimer degrades exactly where
 * it matters most, in the export, because 1200x630 does not comfortably fit two panels plus a
 * band and the tempting fix is to shrink the band "just for the card" — which is precisely
 * the defect the legal memo names as insufficient. The memo lists three mitigations in
 * descending order of safety, and the safest is not to display the original and the
 * recreation adjacently at all. So the share card takes that one: no plates, therefore no
 * juxtaposition, therefore nothing for a disclaimer to have to correct. The disclaimer is on
 * the card anyway, at a size nobody has to squint at, because the card is where the claim
 * travels and the claim should never travel alone.
 *
 * Type is the ImageResponse default face rather than our own. The licensed webfont is not
 * bought yet and we do not ship a trial build of a commercial face, here or anywhere.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const INK = "#14161A";
const MUTED = "#5A6068";
const SURFACE = "#F4F4F2";
const RAISED = "#FFFFFF";
const RULE = "#8A8A84";

export function ogCard({
  masthead,
  headline,
  claim,
}: {
  readonly masthead: string;
  readonly headline: string;
  readonly claim: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: SURFACE,
          padding: 64,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            backgroundColor: RAISED,
            border: `1px solid ${RULE}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "20px 32px",
              borderBottom: `1px solid ${RULE}`,
              fontSize: 20,
              letterSpacing: "0.06em",
              color: INK,
              textTransform: "uppercase",
            }}
          >
            <span>Slop Scorer / Receipt</span>
            <span style={{ color: MUTED }}>{masthead}</span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
              padding: 32,
              flex: 1,
            }}
          >
            <div style={{ display: "flex", fontSize: 72, color: INK, lineHeight: 1.06 }}>
              {headline}
            </div>
            <div style={{ display: "flex", fontSize: 26, color: INK, lineHeight: 1.32 }}>
              {claim}
            </div>
          </div>

          {/* The band, at a size that survives a thumbnail. Same colour as the headline. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "20px 32px",
              borderTop: `1px solid ${RULE}`,
            }}
          >
            <div style={{ display: "flex", fontSize: 20, color: INK, letterSpacing: "0.04em" }}>
              {DISCLAIMER_HEADING}
            </div>
            <div style={{ display: "flex", fontSize: 20, color: INK, lineHeight: 1.4 }}>
              {DISCLAIMER_BODY}
            </div>
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
