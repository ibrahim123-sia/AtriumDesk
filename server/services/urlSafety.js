/**
 * ==========================================================
 * URLSAFETY.JS - SSRF validation (Rev 5 §9.6)
 * ==========================================================
 *
 * "The admin panel accepts arbitrary URLs and fetches them server-side.
 * That is an SSRF risk... Worth unit-testing — pure function, no mocking,
 * and a silently broken validator is exactly the kind of bug nobody
 * notices."
 *
 * This is Node's SANITY CHECK before ever calling Python — cheap, pure,
 * synchronous, no DNS lookups (a lookup would make this impure/async and
 * unmockable-without-network in tests, which is exactly what the spec
 * doesn't want here). It catches the obvious cases: wrong protocol, a
 * literal private/loopback/link-local IP, non-standard ports.
 *
 * It is NOT the authoritative check. Per §9.3: "Python is the only side
 * that sees the redirect chain" — a hostname that resolves fine here can
 * still redirect to an internal IP mid-fetch, and DNS rebinding means the
 * hostname's IP at validation time isn't guaranteed to be its IP at fetch
 * time either. Python's fetch-time check (re-validating the resolved IP on
 * every redirect hop, see python/url_safety.py) is what actually protects
 * the network — this module only stops obviously-bad input early so the
 * admin gets instant feedback instead of waiting for a round trip.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal", // cloud metadata SSRF vector — not in the spec's literal list, but a standard one to block alongside it
]);

// [network, prefixLength] pairs, spec's exact list (§9.6).
const BLOCKED_IPV4_RANGES = [
  ["127.0.0.0", 8],
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["169.254.0.0", 16],
  ["0.0.0.0", 8],
];

function ipv4ToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    n = (n << 8) | octet;
  }
  return n >>> 0;
}

function isIpv4InRange(ip, network, prefixLength) {
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(network);
  if (ipInt === null || netInt === null) return false;
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

const IPV4_LITERAL_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function isBlockedIpv6Literal(hostname) {
  const h = hostname.toLowerCase();
  if (h === "::1" || h === "[::1]") return true;
  const stripped = h.replace(/^\[/, "").replace(/\]$/, "");
  // Unique local (fc00::/7) and link-local (fe80::/10) — checked on the
  // normalized (bracket-stripped) literal, not a full CIDR parse, since
  // these two prefixes only need a cheap prefix match.
  return /^f[cd][0-9a-f]{0,2}:/.test(stripped) || /^fe[89ab][0-9a-f]:/.test(stripped);
}

/**
 * @param {string} urlString
 * @returns {{ safe: boolean, reason: string|null }}
 */
export function isSafeUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: "Not a valid URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: `Protocol must be http or https, got ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: `Hostname "${hostname}" is blocked` };
  }

  if (IPV4_LITERAL_RE.test(hostname)) {
    for (const [network, prefixLength] of BLOCKED_IPV4_RANGES) {
      if (isIpv4InRange(hostname, network, prefixLength)) {
        return { safe: false, reason: `IP ${hostname} is in a blocked private/internal range` };
      }
    }
  } else if (hostname.includes(":") || hostname.startsWith("[")) {
    // Bracketed or bare IPv6 literal.
    if (isBlockedIpv6Literal(hostname)) {
      return { safe: false, reason: `IPv6 address ${hostname} is a blocked loopback/private range` };
    }
  }

  // Non-standard ports: allow only the protocol's own default (i.e. no
  // explicit port at all — URL.port is "" when the port matches the
  // protocol default or was never specified).
  if (parsed.port !== "") {
    return { safe: false, reason: `Non-standard port ${parsed.port} is not allowed` };
  }

  return { safe: true, reason: null };
}
