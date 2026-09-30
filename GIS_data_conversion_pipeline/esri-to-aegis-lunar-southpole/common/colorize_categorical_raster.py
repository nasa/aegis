#!/usr/bin/env python3
"""Validate a palette-indexed categorical GeoTIFF and expand it to RGBA."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from colorize_classified_mask import (
    colorize_categorical_raster,
    load_class_definition,
    sha256_file,
    validate_categorical_raster,
)

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Validate a Byte categorical GeoTIFF against an explicitly selected JSON "
            "product and embedded palette, then expand exact values to RGBA."
        )
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--class-definition", type=Path, required=True)
    parser.add_argument("--product", required=True)
    parser.add_argument("--audit-out", type=Path, required=True)
    args = parser.parse_args()

    if not args.input.is_file():
        parser.error(f"Input GeoTIFF does not exist: {args.input}")
    if not args.class_definition.is_file():
        parser.error(f"Class definition does not exist: {args.class_definition}")

    document, classes, nodata = load_class_definition(
        args.class_definition, args.product
    )
    counts, grid = validate_categorical_raster(args.input, classes, nodata)
    colorize_categorical_raster(args.input, args.output, classes, nodata)

    audit = {
        "source": str(args.input.resolve()),
        "source_checksum_sha256": sha256_file(args.input),
        "class_definition": str(args.class_definition.resolve()),
        "class_definition_checksum_sha256": sha256_file(args.class_definition),
        "schema": document.get("schema"),
        "schema_version": document.get("schema_version"),
        "toolbox_version": document.get("toolbox_version"),
        "product": args.product,
        "grid": grid,
        "class_counts": {str(value): count for value, count in sorted(counts.items())},
        "classes": [
            {"value": entry["value"], "label": entry["label"], "color": entry["hex"]}
            for entry in classes
        ],
    }
    args.audit_out.parent.mkdir(parents=True, exist_ok=True)
    args.audit_out.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(f"Categorical raster: {args.product}")
    print(f"  source:  {args.input}")
    print(f"  classes: {len(classes)} declared; values present={sorted(counts)}")
    print(f"  RGBA:    {args.output}")
    print(f"  audit:   {args.audit_out}")


if __name__ == "__main__":
    main()
