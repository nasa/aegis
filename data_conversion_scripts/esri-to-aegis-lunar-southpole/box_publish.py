#!/usr/bin/env python3
"""Zip a built mission folder and upload it to Box.

Layout produced on Box (under ``BOX_INITIAL_FOLDER_ID``):

    <mission name>/
      Data/   Data.zip            (one zip of everything in <out>/Data)
      Layers/ <layer>.zip ...     (one zip per <out>/Layers/<layer> directory)

The Box client (CCG auth + chunked upload + ``mkdir -p``) is a trimmed port of
``lunar_utils/lunar_utils/box_client.py``. Credentials come from the repo-root ``.env``
(``BOX_CLIENT_ID``/``BOX_CLIENT_SECRET``/``BOX_ENTERPRISE_ID``/``BOX_USER_ID`` and
``BOX_INITIAL_FOLDER_ID``) unless overridden on the CLI.

Run from data_conversion_scripts/ (boxsdk/tqdm are pure-Python PyPI deps):
    pixi run python esri-to-aegis-lunar-southpole/box_publish.py \\
        --out F:/_repos/aegis_static/missionFiles/123 \\
        --mission-name "A03MP026 - ART3 Surface EVA MS 3"
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path

from aegis_api import DEFAULT_ENV_FILE, load_env_value

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

# boxsdk emits a lot of red preflight noise; chunk-upload threads tuned to match lunar_utils.
_MIN_CHUNKED_BYTES = 20_000_000


class BoxError(RuntimeError):
    pass


def box_config_from_env(env_path: Path = DEFAULT_ENV_FILE) -> dict:
    """Collect the Box CCG credentials + root folder id from a .env file."""
    cfg = {
        "BOX_CLIENT_ID": load_env_value("BOX_CLIENT_ID", env_path),
        "BOX_CLIENT_SECRET": load_env_value("BOX_CLIENT_SECRET", env_path),
        "BOX_ENTERPRISE_ID": load_env_value("BOX_ENTERPRISE_ID", env_path),
        "BOX_USER_ID": load_env_value("BOX_USER_ID", env_path),
        "BOX_ROOT_FOLDER_ID": load_env_value("BOX_INITIAL_FOLDER_ID", env_path),
    }
    missing = [k for k, v in cfg.items() if not v]
    if missing:
        raise BoxError(f"Missing Box config in {env_path}: {', '.join(missing)}")
    return cfg


class BoxClient:
    """Minimal Box client: CCG auth, mkdir -p, and (chunked) upload with overwrite."""

    def __init__(self, config: dict, verbose: bool = False):
        self.config = config
        self.verbose = verbose
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from boxsdk import CCGAuth, Client
            from boxsdk.config import API

            API.CHUNK_UPLOAD_THREADS = 6
            auth = CCGAuth(
                client_id=self.config["BOX_CLIENT_ID"],
                client_secret=self.config["BOX_CLIENT_SECRET"],
                enterprise_id=self.config["BOX_ENTERPRISE_ID"],
                user=self.config["BOX_USER_ID"],
            )
            self._client = Client(auth)
        return self._client

    def mkdirp(self, folder_path: Path) -> str:
        """mkdir -p a path relative to the root folder; returns the leaf folder id (string).

        Returns the id rather than a Folder object because boxsdk's lazily-fetched Folder
        (the already-exists case) doesn't expose ``.id`` — only newly-created ones do.
        """
        parent_id = self.config["BOX_ROOT_FOLDER_ID"]
        for part in folder_path.parts:
            found = None
            for child in self.client.folder(parent_id).get_items():
                if child.type == "folder" and child.name == part:
                    found = child.id
                    break
            parent_id = found or self.client.folder(parent_id).create_subfolder(part).id
        return parent_id

    def _existing_file_id(self, name: str, folder_id: str, size: int):
        from boxsdk import BoxAPIException

        try:
            if self.verbose:
                self.client.folder(folder_id).preflight_check(size=size, name=name)
            else:
                with redirect_stderr(StringIO()):
                    self.client.folder(folder_id).preflight_check(size=size, name=name)
        except BoxAPIException as e:
            if e.status == 409:
                return e.context_info["conflicts"]["id"]
        return None

    def upload(self, local_path: Path, folder_id: str, overwrite: bool = True, show_progress: bool = True):
        """Upload one file, creating a new version if a same-name file exists."""
        size = os.stat(local_path).st_size
        existing_id = self._existing_file_id(local_path.name, folder_id, size)
        if existing_id and not overwrite:
            raise BoxError(f"{local_path.name} already exists in folder {folder_id}")

        chunked = size >= _MIN_CHUNKED_BYTES

        if not chunked:
            if existing_id:
                return self.client.file(existing_id).update_contents(str(local_path))
            return self.client.folder(folder_id).upload(str(local_path))

        if existing_id:
            session = self.client.file(existing_id).create_upload_session(file_size=size)
        else:
            session = self.client.folder(folder_id).create_upload_session(
                file_size=size, file_name=local_path.name
            )
        try:
            return self._chunked_upload(session, local_path, size, show_progress)
        except Exception:
            session.abort()
            raise

    def _chunked_upload(self, session, local_path: Path, size: int, show_progress: bool = True):
        sha1 = hashlib.sha1()
        parts = []
        pbar = None
        if show_progress:
            from tqdm import tqdm

            pbar = tqdm(total=size, unit="B", unit_scale=True, desc=local_path.name)
        uploaded = 0
        next_mark = 0.1  # when tqdm is off (parallel), print a flushed line every ~10%
        try:
            with open(local_path, "rb") as stream:
                for part_num in range(session.total_parts):
                    chunk = stream.read(session.part_size)
                    part = session.upload_part_bytes(chunk, part_num * session.part_size, size)
                    parts.append(part)
                    sha1.update(chunk)
                    uploaded += len(chunk)
                    if pbar is not None:
                        pbar.update(len(chunk))
                    elif size and uploaded / size >= next_mark:
                        print(
                            f"  [{local_path.name}] {uploaded / size * 100:3.0f}% "
                            f"({uploaded / 1e6:.0f}/{size / 1e6:.0f} MB)",
                            flush=True,
                        )
                        next_mark += 0.1
        finally:
            if pbar is not None:
                pbar.close()
        return session.commit(content_sha1=sha1.digest(), parts=parts)


# ---------------------------------------------------------------------------
# Zipping
# ---------------------------------------------------------------------------


def _zip_dir(src_dir: Path, zip_path: Path) -> Path:
    """Zip the entire contents of src_dir into zip_path (paths relative to src_dir)."""
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in sorted(src_dir.rglob("*")):
            if file.is_file():
                zf.write(file, file.relative_to(src_dir))
    return zip_path


def upload_mission_folder(
    out_dir: Path,
    mission_name: str,
    env_path: Path = DEFAULT_ENV_FILE,
    overwrite: bool = True,
    verbose: bool = False,
    max_workers: int = 4,
) -> None:
    """Zip <out>/Data and each <out>/Layers/<layer> and upload to Box, in parallel.

    Box destination: ``<mission name>/Data/Data.zip`` and ``<mission name>/Layers/<layer>.zip``.
    Each task zips then uploads on its own thread (with its own Box client, since the SDK's
    session is not shared-thread-safe), so slow uploads overlap other tasks' zipping/uploading.
    """
    out_dir = out_dir.resolve()
    data_dir = out_dir / "Data"
    layers_dir = out_dir / "Layers"
    scratch = out_dir / ".box_zips"
    scratch.mkdir(parents=True, exist_ok=True)

    config = box_config_from_env(env_path)
    box = BoxClient(config, verbose=verbose)  # used only to create the destination folders

    # Build the task list: (src_dir, zip_path, box_subfolder).
    tasks: list[tuple[Path, Path, str]] = []
    if data_dir.exists() and any(data_dir.iterdir()):
        tasks.append((data_dir, scratch / "Data.zip", "Data"))
    else:
        print("  (no Data/ contents to upload)")
    layer_dirs = sorted(d for d in layers_dir.iterdir() if d.is_dir()) if layers_dir.exists() else []
    for d in layer_dirs:
        tasks.append((d, scratch / f"{d.name}.zip", "Layers"))
    if not layer_dirs:
        print("  (no Layers/ directories to upload)")

    if not tasks:
        print("Nothing to upload.")
        return

    # Create the destination subfolders once (sequential — mkdirp is not concurrency-safe).
    subfolder_ids = {
        sub: box.mkdirp(Path(mission_name) / sub) for sub in sorted({t[2] for t in tasks})
    }

    # Suppress per-file tqdm when running several uploads at once (the bars would interleave).
    show_progress = max_workers == 1 or len(tasks) == 1

    def _zip_and_upload(task: tuple[Path, Path, str]) -> str:
        src_dir, zip_path, sub = task
        t0 = time.monotonic()
        print(f"  [{src_dir.name}] zipping → {zip_path.name} ...", flush=True)
        _zip_dir(src_dir, zip_path)
        mb = zip_path.stat().st_size / 1e6
        print(f"  [{src_dir.name}] uploading {zip_path.name} ({mb:.0f} MB) → {sub}/ ...", flush=True)
        # Fresh client per thread: boxsdk's requests session is not safe to share across threads.
        BoxClient(config, verbose=verbose).upload(
            zip_path, subfolder_ids[sub], overwrite=overwrite, show_progress=show_progress
        )
        return f"  [{src_dir.name}] done {zip_path.name} ({mb:.0f} MB) in {time.monotonic() - t0:.0f}s"

    print(f"Zipping + uploading {len(tasks)} item(s) with up to {max_workers} parallel worker(s) ...", flush=True)
    try:
        with ThreadPoolExecutor(max_workers=max_workers) as ex:
            for result in ex.map(_zip_and_upload, tasks):
                print(result, flush=True)
    finally:
        for z in scratch.glob("*.zip"):
            z.unlink(missing_ok=True)
        try:
            scratch.rmdir()
        except OSError:
            pass

    print(f"\nBox upload complete → '{mission_name}' under folder {config['BOX_ROOT_FOLDER_ID']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Zip a mission folder and upload it to Box.")
    parser.add_argument("--out", type=Path, required=True, help="Built mission folder (has Data/ and Layers/).")
    parser.add_argument("--mission-name", required=True, help="Box subfolder name (e.g. mission name).")
    parser.add_argument("--env", type=Path, default=DEFAULT_ENV_FILE, help="Path to .env with Box creds.")
    parser.add_argument("--no-overwrite", action="store_true", help="Fail instead of versioning existing files.")
    parser.add_argument("--max-workers", type=int, default=4, help="Parallel zip/upload workers (default: 4).")
    parser.add_argument("--verbose", action="store_true", help="Show Box preflight output.")
    args = parser.parse_args()

    upload_mission_folder(
        out_dir=args.out,
        mission_name=args.mission_name,
        env_path=args.env,
        overwrite=not args.no_overwrite,
        verbose=args.verbose,
        max_workers=args.max_workers,
    )


if __name__ == "__main__":
    main()
