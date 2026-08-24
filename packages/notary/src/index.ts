/**
 * @slop/notary
 *
 * Attest the MAKING. Never the person.
 *
 * The binding analysis is `human-verification-licensing.md`: identity verification is a service to
 * outsource and biometrics are a liability to refuse outright (Illinois BIPA, $1,000-$5,000 per
 * scan, private right of action, and directing a provider to collect does not reliably move it).
 * What is left is stronger anyway, and it is already a standard. RFC 3161 forbids a timestamp
 * authority from identifying the requester - an entire deployed protocol for attesting that
 * something existed at a time without attesting who made it. This package wires that up.
 *
 * Four things a reader of this file should take away:
 *
 *  - THERE IS NOWHERE TO PUT A PERSON. No type in this package holds a name, a face, a document, a
 *    keystroke trace or an email, and a test walks the source to keep it that way.
 *  - THE CREDENTIAL CANNOT OVERSTATE. `claims.ts` bans the certification vocabulary outright and
 *    requires any sentence that mentions a person to carry a limitation in the same breath. Every
 *    credential ends with the same two lines: what we did not check, and what a process cannot show.
 *  - THE STAMP IS PLURAL AND FAILURE IS NORMAL. Four free authorities in three jurisdictions, fanned
 *    out in parallel; one failing is recorded and counted, never fatal, and the credential states
 *    the count rather than implying a set.
 *  - VERIFICATION RECOMPUTES. `verifyCredential` rebuilds the root from the event fields, re-parses
 *    every stored token against it, and rebuilds the statement from the facts. It touches no
 *    network, so a holder can run it offline.
 *
 * It all runs with no keys and no network: `MockTsaTransport` emits real DER, so the parser, the
 * imprint comparison and the nonce check are exercised on every test run.
 */

/* ---- the chain ------------------------------------------------------------------------------- */
export type { ChainCheck, ChainDefect, InclusionProof, ProcessEvent } from "./chain.js";
export {
  CHAIN_FORMAT_VERSION,
  checkChain,
  inclusionProof,
  leafHash,
  leafOf,
  leafPreimage,
  merkleRoot,
  nodeHash,
  sha256Hex,
  verifyInclusion,
} from "./chain.js";

/* ---- DER and RFC 3161 -------------------------------------------------------------------------- */
export type { DerNode } from "./der.js";
export {
  DerError,
  TAG,
  decodeGeneralizedTime,
  decodeInteger,
  decodeOid,
  encode,
  integer,
  nullValue,
  octetString,
  oid,
  parse,
  sequence,
  walk,
} from "./der.js";

export type { Authority, FanOutOptions, MockTsaOptions, ParsedToken, StampResult, TsaRequest, TsaTransport } from "./tsa.js";
export {
  DEFAULT_AUTHORITIES,
  DEFAULT_TSA_TIMEOUT_MS,
  MockTsaTransport,
  OID_SHA256,
  OID_SIGNED_DATA,
  OID_TST_INFO,
  TOKEN_VERIFICATION_SCOPE,
  buildRequest,
  httpTransport,
  newNonce,
  parseResponse,
  stampEverywhere,
} from "./tsa.js";

/* ---- OpenTimestamps ---------------------------------------------------------------------------- */
export type { CalendarSubmission, OpenTimestampsClient } from "./opentimestamps.js";
export { DEFAULT_CALENDARS, MockOpenTimestamps, httpOpenTimestamps } from "./opentimestamps.js";

/* ---- the wording ------------------------------------------------------------------------------- */
export type { AttestationViolation } from "./claims.js";
export {
  FORBIDDEN_ATTESTATION_PHRASES,
  ForbiddenAttestationError,
  HUMANITY_NOUNS,
  LIMITATION_MARKERS,
  assertAttestable,
  findAttestationViolations,
  neutralizeAuthorityNoun,
  sentencesOf,
} from "./claims.js";

export type { CredentialFacts, IssueInput } from "./credential.js";
export { LIMITATION, STATEMENT_VERSION, VERIFICATION_CAVEAT, buildStatement, issueCredentialRow } from "./credential.js";

/* ---- process recordings -------------------------------------------------------------------------- */
export type { ProcessRecording, RecordingDefect, RecordingFrame, RecordingInput, RecordingParser } from "./recording.js";
export {
  DEFAULT_FRAME_INTERVAL_MS,
  GenericFrameSequenceParser,
  RECORDING_PARSERS,
  checkRecording,
  clipStudioParser,
  parserFor,
  procreateParser,
  recordingToEvents,
  summariseRecording,
} from "./recording.js";

/* ---- verification ------------------------------------------------------------------------------- */
export type { TokenVerification, VerificationReport, VerifyInput } from "./verify.js";
export { formatVerification, verifyCredential } from "./verify.js";

/* ---- the service --------------------------------------------------------------------------------- */
export type { NotaryRuntime, NotaryServiceOptions, StampSummary } from "./service.js";
export { NotaryService } from "./service.js";
