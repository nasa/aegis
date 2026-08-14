#!/usr/bin/env python3
"""Tiny HTTP client for the AEGIS REST API (mission / layer / sublayer / grid).

Stdlib-only (``urllib``) so it runs under a bare ``.venv`` as well as ``pixi`` — the
``register`` step in ``main.py`` needs no geospatial imports.

Auth is the EMSS token (``emss-token`` header), read from the repo-root ``.env`` if not
passed explicitly.

Endpoints used:
  * ``POST   /api/v1/missionAutomerge/fields`` — set GIS/setup fields on the mission doc
  * ``GET    /api/v1/layer?missionId=``    — list header layers
  * ``POST   /api/v1/layer``               — upsert header layers
  * ``GET    /api/v1/sublayer?missionId=`` — list sublayers
  * ``POST   /api/v1/sublayer``            — upsert sublayers
  * ``GET    /api/v1/grid?missionId=``     — list grid metadata
  * ``POST   /api/v1/grid``                — upsert grids (writes the active grid's coords to Data/)

All AEGIS responses are ``WrappedResponse`` ``{status, message, data?}`` with ``status`` of
``"success"`` | ``"failure"`` | ``"error"``; :meth:`AegisApiClient._unwrap` also accepts
``"ok"`` defensively.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

# repo root holding .env — three levels up: esri-to-aegis-lunar-southpole/ -> GIS_data_conversion_pipeline/ -> aegis/
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = REPO_ROOT / ".env"

_OK_STATUSES = ("success", "ok")


class AegisApiError(RuntimeError):
    """Raised when the AEGIS API returns a non-OK status or an HTTP error."""


def load_env_value(key: str, env_path: Path = DEFAULT_ENV_FILE) -> str | None:
    """Read a single ``KEY="value"`` / ``KEY=value`` entry from a .env file."""
    if not env_path.exists():
        return None
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith(f"{key}="):
            _, _, val = line.partition("=")
            return val.strip().strip('"').strip("'")
    return None


def load_token(env_path: Path = DEFAULT_ENV_FILE) -> str:
    """Read EMSS_TOKEN from a .env file ("" if absent)."""
    return load_env_value("EMSS_TOKEN", env_path) or ""


class AegisApiClient:
    """Thin wrapper around the AEGIS REST API for one server + token."""

    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip("/")
        self.token = token

    # -- low-level ----------------------------------------------------------
    def _request(self, method: str, path: str, payload: dict | None = None) -> dict:
        url = f"{self.base_url}{path}"
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(
            url,
            data=data,
            headers={"emss-token": self.token, "Content-Type": "application/json"},
            method=method,
        )
        try:
            with urllib.request.urlopen(req) as resp:
                body = resp.read().decode()
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")
            raise AegisApiError(f"{method} {url} -> HTTP {e.code}: {detail}") from e
        except urllib.error.URLError as e:
            raise AegisApiError(f"{method} {url} -> {e.reason}") from e
        return json.loads(body) if body else {}

    def _unwrap(self, resp: dict, what: str) -> object:
        """Return ``data`` from a WrappedResponse, raising on a non-OK status."""
        if resp.get("status") not in _OK_STATUSES:
            raise AegisApiError(f"{what} failed: {resp.get('message') or resp}")
        return resp.get("data")

    # -- mission ------------------------------------------------------------
    def update_mission_fields(self, mission_id: int, fields: dict) -> dict:
        """POST allow-listed GIS/setup fields onto the mission's automerge doc."""
        resp = self._request(
            "POST",
            "/api/v1/missionAutomerge/fields",
            {"missionId": mission_id, "fields": fields},
        )
        return self._unwrap(resp, "update mission fields")  # type: ignore[return-value]

    # -- layers -------------------------------------------------------------
    def get_layers(self, mission_id: int) -> list[dict]:
        resp = self._request("GET", f"/api/v1/layer?missionId={mission_id}")
        return self._unwrap(resp, "get layers") or []  # type: ignore[return-value]

    def upsert_layers(self, mission_id: int, layers: list[dict]) -> list[dict]:
        resp = self._request(
            "POST", "/api/v1/layer", {"missionId": mission_id, "layers": layers}
        )
        return self._unwrap(resp, "upsert layers") or []  # type: ignore[return-value]

    # -- sublayers ----------------------------------------------------------
    def get_sublayers(self, mission_id: int) -> list[dict]:
        resp = self._request("GET", f"/api/v1/sublayer?missionId={mission_id}")
        return self._unwrap(resp, "get sublayers") or []  # type: ignore[return-value]

    def upsert_sublayers(self, mission_id: int, sublayers: list[dict]) -> list[dict]:
        resp = self._request(
            "POST",
            "/api/v1/sublayer",
            {"missionId": mission_id, "sublayers": sublayers},
        )
        return self._unwrap(resp, "upsert sublayers") or []  # type: ignore[return-value]

    # -- grid ---------------------------------------------------------------
    def get_grid(self, mission_id: int) -> dict | None:
        """Get the mission's single grid metadata (coordinates omitted), or None."""
        resp = self._request("GET", f"/api/v1/grid?missionId={mission_id}")
        return self._unwrap(resp, "get grid")  # type: ignore[return-value]

    def upsert_grid(
        self, mission_id: int, grid: dict, upsert_full_grid: bool = True
    ) -> dict | None:
        """Upsert the mission's grid. With upsert_full_grid the server writes the grid's
        coordinate JSON into the mission Data/ folder and stores the grid metadata on the
        mission Automerge doc (mission.serverFileGrid)."""
        resp = self._request(
            "POST",
            "/api/v1/grid",
            {
                "missionId": mission_id,
                "grid": grid,
                "upsertFullGrid": upsert_full_grid,
            },
        )
        return self._unwrap(resp, "upsert grid")  # type: ignore[return-value]
