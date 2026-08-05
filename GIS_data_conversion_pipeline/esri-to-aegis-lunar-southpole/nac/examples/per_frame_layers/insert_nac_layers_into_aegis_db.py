#!/usr/bin/env python3
"""
PRESERVED EXAMPLE — insert one AEGIS sublayer record per built NAC frame.

Companion to ``build_nac_layer_pyramids.py``: this registers the per-frame layer
folders it produced as individual AEGIS sublayers (100+ per mission). This is the
test configuration, NOT the shipping path — see the README in this folder.

The script:
  1. GETs existing sublayers for the mission from the AEGIS API.
  2. Scans the given --layers-dir for built NAC frame directories (those
     containing a tilemapresource.xml).
  3. Parses each tilemapresource.xml to extract bounding box and zoom levels.
  4. Skips any frame whose folder name already appears as a sublayer ``path``.
  5. POSTs new sublayers for the missing frames, all attached to the existing
     parent layer UUID (discovered from the GET /layer response by name).

Usage (from GIS_data_conversion_pipeline/):
    pixi run python esri-to-aegis-lunar-southpole/nac/examples/per_frame_layers/insert_nac_layers_into_aegis_db.py \
        --mission-id <id> --layers-dir <output-root>/Layers --layer-name <parent-layer> --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

try:
    import urllib.request as _urllib_request
    import urllib.error as _urllib_error
except ImportError:
    pass  # stdlib – always present

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
# Mission id and layers dir are intentionally NOT defaulted — they are per
# environment and must be passed explicitly (this is an un-pinned example).

BASE_URL = "http://localhost:4001"
DEFAULT_LAYER_NAME = "NAC"  # name of the parent Layer record in AEGIS

# EMSS token – loaded from the repo .env at runtime if not passed on CLI
ENV_FILE = Path("F:/_repos/aegis/.env")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def load_token(env_path: Path) -> str:
    """Read EMSS_TOKEN from a .env file (KEY="value" or KEY=value lines)."""
    if not env_path.exists():
        return ""
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("EMSS_TOKEN"):
            _, _, val = line.partition("=")
            return val.strip().strip('"').strip("'")
    return ""


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z")


def api_get(url: str, token: str) -> dict:
    req = _urllib_request.Request(
        url, headers={"emss-token": token, "Content-Type": "application/json"}
    )
    with _urllib_request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def api_post(url: str, token: str, payload: dict) -> dict:
    data = json.dumps(payload).encode()
    req = _urllib_request.Request(
        url,
        data=data,
        headers={"emss-token": token, "Content-Type": "application/json"},
        method="POST",
    )
    with _urllib_request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


# ---------------------------------------------------------------------------
# tilemapresource.xml parsing
# ---------------------------------------------------------------------------


def parse_tilemapresource(tmr_path: Path) -> dict:
    """Return bounding box and zoom levels from a tilemapresource.xml."""
    tree = ET.parse(tmr_path)
    root = tree.getroot()

    bb = root.find("BoundingBox")
    bounding_box: list[float] = []
    if bb is not None:
        bounding_box = [
            float(bb.get("minx", 0)),
            float(bb.get("miny", 0)),
            float(bb.get("maxx", 0)),
            float(bb.get("maxy", 0)),
        ]

    tile_sets = root.find("TileSets")
    min_zoom: int | None = None
    max_zoom: int | None = None
    if tile_sets is not None:
        for ts in tile_sets:
            order = ts.get("order")
            if order is None:
                continue
            z = int(order)
            if min_zoom is None or z < min_zoom:
                min_zoom = z
            if max_zoom is None or z > max_zoom:
                max_zoom = z

    return {
        "boundingBox": bounding_box,
        "minNativeZoom": min_zoom if min_zoom is not None else 0,
        "maxNativeZoom": max_zoom if max_zoom is not None else 0,
    }


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------


def find_built_nac_frames(layers_dir: Path) -> list[Path]:
    """Return sorted list of NAC frame layer directories that have a tilemapresource.xml."""
    return sorted(
        d
        for d in layers_dir.iterdir()
        if d.is_dir() and (d / "tilemapresource.xml").exists()
        # NAC frames start with M followed by digits (not 'slope' etc.)
        and d.name[0] == "M" and not d.name.startswith("mm2-")
    )


def run(
    mission_id: int,
    base_url: str,
    token: str,
    layers_dir: Path,
    layer_name: str,
    dry_run: bool,
) -> None:
    # ── 1. Fetch existing layers → find the parent layer UUID ──────────────
    print(f"GET {base_url}/api/v1/layer?missionId={mission_id}")
    layer_resp = api_get(f"{base_url}/api/v1/layer?missionId={mission_id}", token)
    if layer_resp.get("status") not in ("success", "ok"):
        print(f"ERROR fetching layers: {layer_resp}", file=sys.stderr)
        sys.exit(1)

    parent_layer = next(
        (l for l in layer_resp["data"] if l["name"] == layer_name), None
    )
    if parent_layer is None:
        print(
            f"ERROR: No layer named '{layer_name}' found for mission {mission_id}. "
            "Create it in the AEGIS admin UI first.",
            file=sys.stderr,
        )
        sys.exit(1)

    parent_layer_uuid = parent_layer["uuid"]
    print(f"  Found parent layer UUID: {parent_layer_uuid}")

    # ── 2. Fetch existing sublayers → collect paths already in DB ──────────
    print(f"GET {base_url}/api/v1/sublayer?missionId={mission_id}")
    sublayer_resp = api_get(f"{base_url}/api/v1/sublayer?missionId={mission_id}", token)
    if sublayer_resp.get("status") not in ("success", "ok"):
        print(f"ERROR fetching sublayers: {sublayer_resp}", file=sys.stderr)
        sys.exit(1)

    existing_paths: set[str] = {s["path"] for s in sublayer_resp["data"]}
    print(f"  Existing sublayer paths in DB: {len(existing_paths)}")

    # ── 3. Scan built NAC frame directories ───────────────────────────────
    nac_frames = find_built_nac_frames(layers_dir)
    print(f"  Built NAC frame directories found: {len(nac_frames)}")

    to_insert: list[dict] = []
    for frame_dir in nac_frames:
        frame_name = frame_dir.name
        if frame_name in existing_paths:
            print(f"  SKIP (already in DB): {frame_name}")
            continue

        tmr_path = frame_dir / "tilemapresource.xml"
        tmr_data = parse_tilemapresource(tmr_path)

        sublayer = {
            "uuid": str(uuid.uuid4()),
            "missionId": mission_id,
            "layerUuid": parent_layer_uuid,
            "type": "tile",
            "name": frame_name,
            "description": "",
            "legend": {"legend": [], "unitsAbbr": "", "version": ""},
            "path": frame_name,
            "tilePattern": "{z}/{x}/{y}.png",
            "boundingBox": tmr_data["boundingBox"],
            "tileFormat": "tms",
            "minNativeZoom": tmr_data["minNativeZoom"],
            "maxNativeZoom": tmr_data["maxNativeZoom"],
            "maxZoom": 30,
            "isTimeBased": False,
            "timeLayerManifest": [],
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        to_insert.append(sublayer)

    print(f"\n  Sublayers to insert: {len(to_insert)}")

    if not to_insert:
        print("Nothing to do — all NAC frames already have sublayer records.")
        return

    if dry_run:
        print("\n[dry-run] Would POST the following sublayers:")
        for s in to_insert:
            print(f"  {s['name']}")
        return

    # ── 4. POST in batches of 20 to avoid oversized requests ──────────────
    BATCH = 20
    total_inserted = 0
    for i in range(0, len(to_insert), BATCH):
        batch = to_insert[i : i + BATCH]
        payload = {"missionId": mission_id, "sublayers": batch}
        print(
            f"\nPOST batch {i // BATCH + 1} "
            f"({len(batch)} sublayers: {batch[0]['name']} … {batch[-1]['name']})"
        )
        result = api_post(f"{base_url}/api/v1/sublayer", token, payload)
        if result.get("status") not in ("success", "ok"):
            print(f"  ERROR: {result}", file=sys.stderr)
            sys.exit(1)
        print(f"  OK — inserted {len(batch)}")
        total_inserted += len(batch)

    print(f"\nDone. {total_inserted} sublayer(s) inserted.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Insert missing per-frame NAC sublayers into AEGIS (preserved example)."
    )
    parser.add_argument(
        "--mission-id", type=int, required=True, help="Mission ID (required)"
    )
    parser.add_argument(
        "--base-url",
        default=BASE_URL,
        help=f"AEGIS API base URL (default: {BASE_URL})",
    )
    parser.add_argument(
        "--token",
        default=None,
        help="EMSS token. If omitted, read from EMSS_TOKEN in F:/_repos/aegis/.env",
    )
    parser.add_argument(
        "--layers-dir",
        type=Path,
        required=True,
        help="Path to the Layers output directory holding the built per-frame NAC folders (required)",
    )
    parser.add_argument(
        "--layer-name",
        default=DEFAULT_LAYER_NAME,
        help=f"Name of the parent Layer record in AEGIS (default: {DEFAULT_LAYER_NAME!r})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be inserted without actually calling the API.",
    )
    args = parser.parse_args()

    token = args.token or load_token(ENV_FILE)
    if not token:
        print(
            "ERROR: No EMSS token found. Pass --token or set EMSS_TOKEN in .env",
            file=sys.stderr,
        )
        sys.exit(1)

    run(
        mission_id=args.mission_id,
        base_url=args.base_url,
        token=token,
        layers_dir=args.layers_dir,
        layer_name=args.layer_name,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
