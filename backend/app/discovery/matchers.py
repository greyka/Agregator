"""Matchers an integration uses to claim a discovered device.

Shape modelled after Home Assistant's manifest.json schema. fnmatch-style
wildcards work for `name`, `hostname`, TXT properties, MAC OUI prefixes.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class ZeroconfMatcher:
    """Match an mDNS service."""
    type: str                                            # e.g. "_shelly._tcp.local."
    name: str | None = None                              # fnmatch on instance name
    properties: tuple[tuple[str, str], ...] = ()         # tuple of (key, fnmatch_value)


@dataclass(frozen=True, slots=True)
class SsdpMatcher:
    """Match an SSDP NOTIFY / M-SEARCH response."""
    st: str | None = None                                # search target / urn
    manufacturer: str | None = None
    device_type: str | None = None
    server: str | None = None                            # fnmatch on Server header


@dataclass(frozen=True, slots=True)
class DhcpMatcher:
    """Match a DHCPDISCOVER / DHCPREQUEST packet (or ARP-discovered entry)."""
    hostname: str | None = None                          # fnmatch
    mac_oui: str | None = None                           # 6-12 hex chars at start of MAC


@dataclass(frozen=True, slots=True)
class HttpMatcher:
    """HTTP-fingerprint matcher used by the TCP-sweep scanner."""
    port: int
    path: str = "/"
    body_contains: str | None = None                     # case-insensitive substring
    header_present: str | None = None                    # header name
    response_json_keys: tuple[str, ...] = ()
