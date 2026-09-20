"""
========================================================
URL_SAFETY.PY - SSRF validation, authoritative side (Rev 5 §9.6)
========================================================

Node's `services/urlSafety.js` does a cheap syntactic sanity check before
ever calling this service. This module is the AUTHORITATIVE check — per the
spec: "Python is the only side that sees the redirect chain." A hostname
that looks fine can still redirect to an internal IP mid-fetch, and DNS
rebinding means a hostname's resolved IP at validation time isn't
guaranteed to be its IP at fetch time either. So this module:

  1. Re-checks protocol/hostname/port the same way Node did (defense in
     depth — never trust a client-supplied "it's already validated").
  2. Resolves the hostname's actual IP address(es) and checks them against
     the private/loopback/link-local ranges using Python's `ipaddress`
     module (far more reliable than hand-rolled CIDR math).
  3. Manually follows the redirect chain (not via `requests`' automatic
     `allow_redirects=True`, which would fetch straight through to an
     unsafe hop before this code ever sees it) and re-validates every hop.
"""

import ipaddress
import socket
from urllib.parse import urlparse

import requests

BLOCKED_HOSTNAMES = {
    "localhost",
    "ip6-localhost",
    "ip6-loopback",
    "metadata.google.internal",
}

MAX_REDIRECTS = 5


class UnsafeUrlError(Exception):
    """Raised when a URL (or a hop in its redirect chain) fails SSRF validation."""


def _check_syntax(url):
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeUrlError(f"Protocol must be http or https, got {parsed.scheme!r}")
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise UnsafeUrlError("URL has no hostname")
    if hostname in BLOCKED_HOSTNAMES:
        raise UnsafeUrlError(f'Hostname "{hostname}" is blocked')
    # Non-standard port: urlparse only sets .port from what's literally in
    # the URL string, it does NOT normalize an explicit default (e.g.
    # "https://example.com:443/" still parses to port=443) — comparing
    # against None alone would wrongly reject a URL for writing out a port
    # that was already standard for its scheme.
    default_port = 443 if parsed.scheme == "https" else 80
    if parsed.port is not None and parsed.port != default_port:
        raise UnsafeUrlError(f"Non-standard port {parsed.port} is not allowed")
    return hostname


def _check_resolved_ips(hostname):
    """DNS-resolves hostname and rejects it if ANY resolved address is
    private/loopback/link-local/reserved. Checking all of them (not just
    the first) matters because a DNS response can list a safe address
    first and an internal one second — some resolvers/clients aren't
    guaranteed to always pick index 0."""
    try:
        addrinfo = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise UnsafeUrlError(f"Could not resolve hostname {hostname!r}: {exc}") from exc

    for family, _, _, _, sockaddr in addrinfo:
        ip_str = sockaddr[0]
        ip = ipaddress.ip_address(ip_str)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise UnsafeUrlError(f"{hostname} resolves to blocked address {ip_str}")


def validate_redirect_chain(url, max_redirects=MAX_REDIRECTS):
    """Follows redirects manually, re-validating every hop's syntax AND
    resolved IP before following it. Returns the final, validated URL.
    Raises UnsafeUrlError the moment any hop fails validation."""
    current = url
    for _ in range(max_redirects + 1):
        hostname = _check_syntax(current)
        _check_resolved_ips(hostname)

        response = requests.head(current, allow_redirects=False, timeout=10)
        if response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get("Location")
            if not location:
                raise UnsafeUrlError(f"Redirect from {current} had no Location header")
            current = requests.compat.urljoin(current, location)
            continue
        return current

    raise UnsafeUrlError(f"Too many redirects (> {max_redirects}) starting from {url}")
