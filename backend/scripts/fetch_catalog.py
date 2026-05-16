"""Fetch and normalize the supported-devices catalog.

Run:  python backend/scripts/fetch_catalog.py [--out catalog.json.gz]

Outputs a gzipped JSON array of records:
    {vendor, model, description, integration_kind, image_url?}

Sources (all license-clean for bundling):
  - zigbee2mqtt    : zigbee-herdsman-converters npm tarball, MIT
  - tasmota        : blakadder templates.json,             CC-BY-SA 4.0 (content)
  - shelly         : hand-curated allterco product list,   public catalogue
  - yeelight       : hand-curated LAN-spec models,         public spec
  - xiaomi_miio    : python-miio device id table,          GPL-3.0 docs (names only)

Note: only names/IDs/descriptions are bundled, not source code, so GPL fan-out
does not apply to the python-miio name list.
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import os
import re
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path
from typing import Iterable

USER_AGENT = "smart-home-aggregator/1.0 (+catalog-builder)"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _get(url: str, *, binary: bool = False) -> bytes | str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    return data if binary else data.decode("utf-8")


def _norm(vendor: str, model: str, description: str, kind: str,
          image_url: str | None = None) -> dict:
    rec = {
        "vendor": (vendor or "").strip(),
        "model": (model or "").strip(),
        "description": (description or "").strip(),
        "integration_kind": kind,
    }
    if image_url:
        rec["image_url"] = image_url
    return rec


# ---------------------------------------------------------------------------
# zigbee2mqtt: pull the npm tarball, run its devices index in node, dump JSON
# ---------------------------------------------------------------------------

ZHC_REGISTRY = "https://registry.npmjs.org/zigbee-herdsman-converters/latest"

_NODE_DUMP = r"""
const path = require('path');
const root = process.argv[2];
const zhc = require(path.join(root, 'package', 'dist', 'index.js'));
// zhc exports an array of definition objects; field is `.definitions` since 26.x
const defs = zhc.definitions || zhc.default?.definitions || [];
const out = defs.map(d => ({
  vendor: d.vendor,
  model: d.model,
  description: d.description,
  // exposes is rich; reduce to a feature-tag list to keep bytes small
  exposes: (typeof d.exposes === 'function' ? d.exposes() : d.exposes || [])
              .map(e => e.name || e.type).filter(Boolean),
}));
process.stdout.write(JSON.stringify(out));
"""


def fetch_zigbee2mqtt() -> list[dict]:
    meta = json.loads(_get(ZHC_REGISTRY))
    tarball_url = meta["dist"]["tarball"]
    print(f"[z2m] downloading {tarball_url}", file=sys.stderr)
    blob = _get(tarball_url, binary=True)

    with tempfile.TemporaryDirectory() as tmp:
        with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tf:
            tf.extractall(tmp)
        # install runtime deps so the index can require() them
        pkg_dir = Path(tmp) / "package"
        subprocess.run(
            ["npm", "install", "--omit=dev", "--silent", "--no-audit",
             "--no-fund", "--prefix", str(pkg_dir)],
            check=True,
        )
        proc = subprocess.run(
            ["node", "-e", _NODE_DUMP, tmp],
            check=True, capture_output=True, text=True,
        )
        raw = json.loads(proc.stdout)

    out = []
    for d in raw:
        rec = _norm(d.get("vendor"), d.get("model"), d.get("description"),
                    "zigbee2mqtt")
        if d.get("exposes"):
            rec["exposes"] = d["exposes"]
        out.append(rec)
    print(f"[z2m] {len(out)} devices", file=sys.stderr)
    return out


# ---------------------------------------------------------------------------
# tasmota: blakadder templates.json (Jekyll-rendered, has invalid JSON quirks)
# ---------------------------------------------------------------------------

TASMOTA_URL = "https://templates.blakadder.com/templates.json"

# blakadder's generator emits both:
#   `"template": ,`                                  (empty value)
#   `"template": {"NAME"=>"...", "GPIO"=>[...]}`     (Ruby hash syntax, invalid JSON)
# We don't need the template field for the catalog, so strip it entirely
# before parsing — both legal-but-empty and Ruby-hash variants.
_EMPTY_VALUE_RE = re.compile(r':\s*(?=[,}])')
# blakadder's `template` field carries Ruby hash syntax, bare words ("Module 18"),
# duplicate `}}`, and various other invalid-JSON quirks. We don't use the field
# anyway — so just wipe everything from `"template":` to end of line.
_TEMPLATE_LINE_RE = re.compile(r'"template"\s*:[^\n]*$', re.MULTILINE)


def _scrub_blakadder(raw: str) -> str:
    # Replace entire template line with a safe null. The `,` at end (or trailing
    # `}}` to balance entries) is preserved by capturing only up to newline.
    def repl(m):
        original = m.group(0)
        ends_with_comma = original.rstrip().endswith(",")
        return '"template": null' + ("," if ends_with_comma else "")
    raw = _TEMPLATE_LINE_RE.sub(repl, raw)
    # `"key": ,`  ->  `"key": null,`
    raw = _EMPTY_VALUE_RE.sub(": null", raw)
    return raw


def fetch_tasmota() -> list[dict]:
    raw = _get(TASMOTA_URL)
    raw = _scrub_blakadder(raw)
    data = json.loads(raw)

    base_img = "https://templates.blakadder.com"
    out = []
    for t in data.get("templates", []):
        name = t.get("name") or ""
        # name is e.g. "Sonoff Basic R2" - split vendor/rest on first space
        vendor, _, rest = name.partition(" ")
        out.append(_norm(
            vendor=vendor,
            model=t.get("model") or rest or name,
            description=name,
            kind="tasmota",
            image_url=(base_img + t["image"]) if t.get("image") else None,
        ))
    print(f"[tasmota] {len(out)} devices", file=sys.stderr)
    return out


# ---------------------------------------------------------------------------
# shelly: hand-curated. Allterco has no public catalog JSON; this list covers
# every shipping Gen1/Gen2/Gen3/Gen4 product as of 2026-05. Easy to update.
# ---------------------------------------------------------------------------

SHELLY_DEVICES: list[tuple[str, str]] = [
    # (model_id, marketing_name)
    ("SHSW-1",        "Shelly 1"),
    ("SHSW-PM",       "Shelly 1PM"),
    ("SHSW-L",        "Shelly 1L"),
    ("SHSW-25",       "Shelly 2.5"),
    ("SHIX3-1",       "Shelly i3"),
    ("SHPLG-S",       "Shelly Plug S"),
    ("SHPLG-U1",      "Shelly Plug US"),
    ("SHEM",          "Shelly EM"),
    ("SHEM-3",        "Shelly 3EM"),
    ("SHDM-1",        "Shelly Dimmer"),
    ("SHDM-2",        "Shelly Dimmer 2"),
    ("SHBDUO-1",      "Shelly Duo"),
    ("SHRGBW2",       "Shelly RGBW2"),
    ("SHBLB-1",       "Shelly Bulb"),
    ("SHHT-1",        "Shelly H&T"),
    ("SHWT-1",        "Shelly Flood"),
    ("SHDW-2",        "Shelly Door/Window 2"),
    ("SHGS-1",        "Shelly Gas"),
    ("SHMOS-01",      "Shelly Motion"),
    ("SHMOS-02",      "Shelly Motion 2"),
    ("SHBTN-2",       "Shelly Button 1"),
    ("SHTRV-01",      "Shelly TRV"),
    # Gen2 Plus
    ("SNSW-001X16EU", "Shelly Plus 1"),
    ("SNSW-001P16EU", "Shelly Plus 1PM"),
    ("SNSW-002P16EU", "Shelly Plus 2PM"),
    ("SNPL-00112EU",  "Shelly Plus Plug S"),
    ("SNDM-0013US",   "Shelly Plus Dimmer"),
    ("SNSN-0024X",    "Shelly Plus i4"),
    ("SNSN-0013A",    "Shelly Plus H&T"),
    ("SNSN-0031Z",    "Shelly Plus Smoke"),
    # Gen2 Pro
    ("SPSW-201XE16EU", "Shelly Pro 1"),
    ("SPSW-201PE16EU", "Shelly Pro 1PM"),
    ("SPSW-202XE16EU", "Shelly Pro 2"),
    ("SPSW-202PE16EU", "Shelly Pro 2PM"),
    ("SPSW-004PE16EU", "Shelly Pro 4PM"),
    ("SPEM-003CEBEU",  "Shelly Pro 3EM"),
    # Gen3
    ("S3SW-001X16EU", "Shelly 1 Gen3"),
    ("S3SW-001P16EU", "Shelly 1PM Gen3"),
    ("S3SW-002P16EU", "Shelly 2PM Gen3"),
    ("S3PL-00112EU",  "Shelly Plug S Gen3"),
    ("S3DM-0010WW",   "Shelly Dimmer Gen3"),
    ("S3SN-0024X",    "Shelly i4 Gen3"),
    ("S3SN-0U12A",    "Shelly H&T Gen3"),
    # Gen4 (2025-2026)
    ("S4SW-001X16EU", "Shelly 1 Gen4"),
    ("S4SW-001P16EU", "Shelly 1PM Gen4"),
    ("S4EM-001PXCEU", "Shelly EM Mini Gen4"),
    ("S4PL-00112EU",  "Shelly Plug M Gen3"),
]


def fetch_shelly() -> list[dict]:
    out = [_norm("Shelly", model, name, "shelly")
           for model, name in SHELLY_DEVICES]
    print(f"[shelly] {len(out)} devices", file=sys.stderr)
    return out


# ---------------------------------------------------------------------------
# yeelight: published LAN-API model list
# ---------------------------------------------------------------------------

YEELIGHT_DEVICES: list[tuple[str, str]] = [
    ("mono",       "Yeelight Mono color bulb"),
    ("mono1",      "Yeelight Mono color bulb v1"),
    ("color",      "Yeelight Color bulb"),
    ("color1",     "Yeelight Color bulb v1"),
    ("color2",     "Yeelight Color bulb v2"),
    ("color4",     "Yeelight LED bulb 1S color"),
    ("colora",     "Yeelight LED bulb 1SE color"),
    ("colorb",     "Yeelight Smart LED bulb W3 color"),
    ("colorc",     "Yeelight Smart bulb 1SE"),
    ("strip",      "Yeelight Lightstrip"),
    ("strip1",     "Yeelight Lightstrip v1"),
    ("strip2",     "Yeelight Lightstrip Plus"),
    ("strip4",     "Yeelight Lightstrip Pro"),
    ("stripa",     "Yeelight Lightstrip 1S"),
    ("stripx",     "Yeelight Lightstrip Color"),
    ("ceiling",    "Yeelight Ceiling Light"),
    ("ceiling1",   "Yeelight Ceiling Light v1"),
    ("ceiling2",   "Yeelight Ceiling Light v2"),
    ("ceiling3",   "Yeelight Ceiling Light v3"),
    ("ceiling4",   "Yeelight Ceiling Light v4"),
    ("ceiling10",  "Yeelight Ceiling Light Mini"),
    ("ceiling20",  "Yeelight LED Pendant"),
    ("ceil26",     "Yeelight Arwen Ceiling"),
    ("bslamp",     "Yeelight Bedside lamp"),
    ("bslamp1",    "Yeelight Bedside lamp v1"),
    ("bslamp2",    "Yeelight Bedside lamp 2"),
    ("bslamp3",    "Yeelight Bedside lamp Pro"),
    ("desklamp",   "Yeelight Desk Lamp"),
    ("lamp",       "Yeelight Lamp"),
    ("lamp4",      "Yeelight Staria Bedside Lamp Pro"),
    ("fancl1",     "Yeelight Smart Fan"),
    ("fancl2",     "Yeelight Smart Fan v2"),
]


def fetch_yeelight() -> list[dict]:
    out = [_norm("Yeelight", model, desc, "yeelight")
           for model, desc in YEELIGHT_DEVICES]
    print(f"[yeelight] {len(out)} devices", file=sys.stderr)
    return out


# ---------------------------------------------------------------------------
# xiaomi_miio: scrape model IDs from python-miio's source. License: GPL-3.0,
# but bundling the model-id list (factual names) is fair-use, not derivative.
# ---------------------------------------------------------------------------

PYTHON_MIIO_REPO_API = (
    "https://api.github.com/repos/rytilahti/python-miio/contents/miio/integrations"
)

_MODEL_LINE_RE = re.compile(
    r'MODEL_[A-Z0-9_]+\s*=\s*["\']([a-z0-9.\-_]+)["\']'
)


def fetch_xiaomi_miio() -> list[dict]:
    # Walk miio/integrations/*/*.py looking for MODEL_* = "xxxx.yyy.zz" lines
    queue = [PYTHON_MIIO_REPO_API]
    files: list[str] = []
    seen_dirs = set()
    while queue:
        url = queue.pop()
        if url in seen_dirs:
            continue
        seen_dirs.add(url)
        try:
            listing = json.loads(_get(url))
        except Exception as exc:                          # noqa: BLE001
            print(f"[miio] WARN {url}: {exc}", file=sys.stderr)
            continue
        for entry in listing:
            if entry["type"] == "dir":
                queue.append(entry["url"])
            elif entry["name"].endswith(".py"):
                files.append(entry["download_url"])

    models: set[str] = set()
    for raw_url in files:
        try:
            body = _get(raw_url)
        except Exception:
            continue
        for m in _MODEL_LINE_RE.finditer(body):
            models.add(m.group(1))

    out = []
    for mid in sorted(models):
        # model id pattern: vendor.kind.variant  e.g. "zhimi.airpurifier.m1"
        vendor = mid.split(".", 1)[0].capitalize()
        out.append(_norm(vendor, mid, mid, "xiaomi_miio"))
    print(f"[miio] {len(out)} devices", file=sys.stderr)
    return out


# ---------------------------------------------------------------------------
# orchestrator
# ---------------------------------------------------------------------------

SOURCES = {
    "zigbee2mqtt": fetch_zigbee2mqtt,
    "tasmota":     fetch_tasmota,
    "shelly":      fetch_shelly,
    "yeelight":    fetch_yeelight,
    "xiaomi_miio": fetch_xiaomi_miio,
}


def build_catalog(only: Iterable[str] | None = None) -> list[dict]:
    selected = list(only) if only else list(SOURCES)
    all_records: list[dict] = []
    for name in selected:
        try:
            all_records.extend(SOURCES[name]())
        except Exception as exc:                          # noqa: BLE001
            print(f"[{name}] FAILED: {exc}", file=sys.stderr)
            if os.environ.get("CATALOG_STRICT"):
                raise

    # de-dupe on (integration_kind, model) keeping first occurrence
    deduped: dict[tuple[str, str], dict] = {}
    for rec in all_records:
        key = (rec["integration_kind"], rec["model"].lower())
        if key not in deduped:
            deduped[key] = rec
    return sorted(deduped.values(),
                  key=lambda r: (r["integration_kind"], r["vendor"], r["model"]))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="catalog.json.gz",
                    help="output path (.json or .json.gz)")
    ap.add_argument("--source", action="append",
                    help="only fetch these sources (repeatable)")
    args = ap.parse_args()

    catalog = build_catalog(args.source)
    payload = json.dumps(catalog, ensure_ascii=False, separators=(",", ":"))

    out_path = Path(args.out)
    if out_path.suffix == ".gz":
        with gzip.open(out_path, "wt", encoding="utf-8", compresslevel=9) as fh:
            fh.write(payload)
    else:
        out_path.write_text(payload, encoding="utf-8")

    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"wrote {len(catalog)} devices -> {out_path} ({size_mb:.2f} MB)",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
