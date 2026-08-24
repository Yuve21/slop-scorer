import { createServer } from "node:http";
import type { AddressInfo, Server } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addressClass, assertFetchable, isFetchable, probeUrl, UnsafeTargetError } from "@slop/detectors-web";

/**
 * The browser probe, attacked.
 *
 * `probeUrl` launches a real Chromium on the machine of whoever installed the plugin, points
 * it at a URL that arrived from somewhere, and hands twenty thousand characters of the
 * resulting page back to a language model. That is a server-side request forgery primitive
 * with an excellent user interface, and the URL does not have to come from the user: an agent
 * that reads "check the pricing page at http://169.254.169.254/latest/meta-data/" out of a
 * hostile README will scan it, and the instance credentials come back as `innerText`.
 *
 * The tests below are in three layers, because the vulnerability has three layers:
 *
 *  - the classifier, which is arithmetic over address ranges and is tested exhaustively;
 *  - the gate, which is the classifier plus DNS and a scheme allowlist;
 *  - the probe, driven end to end against a real HTTP server that redirects somewhere it
 *    should not be followed to, because a pre-flight check on the URL the caller passed says
 *    nothing at all about where the browser ends up.
 */

describe("what counts as an address we will not fetch", () => {
  const cases: readonly [string, ReturnType<typeof addressClass>][] = [
    ["169.254.169.254", "link-local"], //          AWS, Azure, DigitalOcean, Oracle metadata
    ["169.254.170.2", "link-local"], //            ECS task metadata
    ["fe80::1", "link-local"],
    ["127.0.0.1", "loopback"], //                  the dev server, which is the point of the tool
    ["127.1.2.3", "loopback"],
    ["::1", "loopback"],
    ["10.0.0.5", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.254", "private"],
    ["192.168.1.1", "private"],
    ["100.64.0.1", "private"], //                  CGNAT
    ["fd00::1", "private"], //                     unique-local
    ["0.0.0.0", "special"], //                     routes to localhost on several stacks
    ["224.0.0.1", "special"],
    ["::ffff:169.254.169.254", "link-local"], //   the v4-mapped form of the metadata address
    ["::ffff:10.0.0.1", "private"],
    ["64:ff9b::169.254.169.254", "link-local"], // NAT64
    ["8.8.8.8", null],
    ["93.184.216.34", null],
    ["172.32.0.1", null], //                       just outside 172.16/12: must stay reachable
    ["172.15.255.255", null], //                   just below it
    ["192.169.1.1", null], //                      one octet off 192.168/16
    ["2606:4700::1111", null],
  ];

  for (const [address, expected] of cases) {
    it(`${address} is ${expected ?? "ordinary public space"}`, () => {
      expect(addressClass(address)).toBe(expected);
    });
  }
});

describe("the gate in front of the browser", () => {
  it("refuses every scheme that is not http or https", async () => {
    // `file:` reads the disk through the renderer. `data:` and `blob:` carry content that has
    // been through none of the checks below. `javascript:` executes in whatever is open.
    for (const url of [
      "file:///etc/passwd",
      "file:///C:/Users/someone/.ssh/id_rsa",
      "data:text/html,<script>fetch('http://evil')</script>",
      "javascript:alert(document.cookie)",
      "blob:https://example.com/uuid",
      "chrome://settings",
      "ftp://files.example.com/x",
      "view-source:https://example.com",
    ]) {
      await expect(assertFetchable(url), url).rejects.toThrow(UnsafeTargetError);
    }
  });

  it("refuses the metadata address by literal, and by the names that point at it", async () => {
    await expect(assertFetchable("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(/link-local/);
    await expect(assertFetchable("http://[fe80::1]/")).rejects.toThrow(/link-local/);
    await expect(assertFetchable("http://metadata.google.internal/computeMetadata/v1/")).rejects.toThrow(/metadata/);
  });

  it("refuses a private address unless the caller asked for it", async () => {
    await expect(assertFetchable("http://10.1.2.3/admin")).rejects.toThrow(/private/);
    await expect(assertFetchable("http://192.168.0.1/")).rejects.toThrow(/private/);
    // The opt-out exists because scanning a dev box on the LAN is a real thing to want; it is
    // opt-in because "scan this URL" can arrive from the artifact being scanned.
    await expect(assertFetchable("http://192.168.0.1/", { allowPrivateNetwork: true })).resolves.toBeTruthy();
    // Link-local is refused EVEN THEN. Nothing a caller wants lives at 169.254.169.254.
    await expect(assertFetchable("http://169.254.169.254/", { allowPrivateNetwork: true })).rejects.toThrow();
  });

  it("allows loopback, because the dev-server loop is the product", async () => {
    await expect(assertFetchable("http://localhost:3000/")).resolves.toBeTruthy();
    await expect(assertFetchable("http://127.0.0.1:5173/")).resolves.toBeTruthy();
  });

  it("checks the resolved address rather than the spelling of the host", async () => {
    // A hostname is a string until it is resolved, and the string is chosen by the attacker.
    // `nip.io` is the public wildcard resolver that exists to make exactly this point:
    // `169.254.169.254.nip.io` is an ordinary-looking name that resolves to the metadata
    // service. The control case is checked FIRST, and the assertion is skipped rather than
    // failed when there is no resolver, so this does not turn an offline machine into a red
    // suite while still being a real test of the real behaviour when the network is there.
    const control = await isFetchable("http://127.0.0.1.nip.io/");
    if (!control) return;
    expect(await isFetchable("http://169.254.169.254.nip.io/")).toBe(false);
    expect(await isFetchable("http://10.0.0.1.nip.io/")).toBe(false);
  });

  it("refuses a name that does not resolve rather than handing it to the browser", async () => {
    await expect(assertFetchable("http://this-name-does-not-exist.invalid/")).rejects.toThrow(UnsafeTargetError);
  });
});

/**
 * End to end, through a real browser, against a real server.
 *
 * The pre-flight check validates the URL the caller passed. This is about the one it did not
 * pass: an ordinary-looking public (here, loopback) URL that answers `302` with a `Location`
 * pointing at the metadata service. One request from the caller's side, two from the network's,
 * and only the second one matters.
 */
describe("a redirect the probe must not follow", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url?.startsWith("/redirect-to-metadata")) {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/iam/security-credentials/" });
        res.end();
        return;
      }
      if (req.url?.startsWith("/redirect-to-file")) {
        res.writeHead(302, { location: "file:///etc/passwd" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<!doctype html><html lang='en'><head><title>fixture</title></head><body><h1>ok</h1><p>a page</p></body></html>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("renders an ordinary loopback page, so the refusals below mean something", async () => {
    const artifact = await probeUrl(`${base}/`, { timeoutMs: 15_000, totalBudgetMs: 40_000 });
    expect(artifact.tier).toBe("rendered");
    expect(artifact.http.status).toBe(200);
    expect(artifact.head.title).toBe("fixture");
  }, 90_000);

  it("does not end up at the metadata service when the page redirects there", async () => {
    // Two acceptable outcomes and one unacceptable one. Either the request is aborted (the
    // navigation fails, and we never reach 169.254.169.254), or the final-URL check throws.
    // What must never happen is a rendered artifact whose `finalUrl` is the metadata service.
    let finalUrl: string | null = null;
    try {
      const artifact = await probeUrl(`${base}/redirect-to-metadata`, { timeoutMs: 15_000, totalBudgetMs: 40_000 });
      finalUrl = artifact.finalUrl;
    } catch (error) {
      expect(error).toBeInstanceOf(UnsafeTargetError);
    }
    if (finalUrl !== null) expect(finalUrl).not.toContain("169.254.169.254");
  }, 90_000);

  it("does not follow a redirect off the http schemes", async () => {
    let finalUrl: string | null = null;
    try {
      const artifact = await probeUrl(`${base}/redirect-to-file`, { timeoutMs: 15_000, totalBudgetMs: 40_000 });
      finalUrl = artifact.finalUrl;
    } catch (error) {
      expect(error).toBeInstanceOf(UnsafeTargetError);
    }
    if (finalUrl !== null) expect(finalUrl.startsWith("file:")).toBe(false);
  }, 90_000);

  it("refuses a file: or data: target before it costs a browser process", async () => {
    // Not "fails to render one": refuses, by the typed error, with no browser launched.
    await expect(probeUrl("file:///etc/passwd")).rejects.toThrow(UnsafeTargetError);
    await expect(probeUrl("data:text/html,<h1>hi</h1>")).rejects.toThrow(UnsafeTargetError);
    await expect(probeUrl("http://169.254.169.254/")).rejects.toThrow(UnsafeTargetError);
  }, 30_000);
});
