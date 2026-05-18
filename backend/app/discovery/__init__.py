"""LAN-wide device discovery.

Mimics the architecture Home Assistant uses:

- Each integration declares its discovery matchers as class attributes
  (zeroconf service types, SSDP STs, DHCP OUI prefixes/hostnames).
- One scanner task per transport (mDNS, SSDP, DHCP, miIO broadcast, TCP sweep)
  runs in the FastAPI lifespan.
- Matches are funnelled into a single in-process `DiscoveryRegistry` that
  dedupes by unique_id and fans out to WebSocket subscribers.
- Frontend lists "discovered but not configured" devices in real-time.

See https://www.home-assistant.io/integrations/#components for the reference
architecture this is modelled after.
"""
from .registry import DiscoveryRegistry, DiscoveredDevice, registry  # noqa: F401
from .matchers import ZeroconfMatcher, SsdpMatcher, DhcpMatcher  # noqa: F401
