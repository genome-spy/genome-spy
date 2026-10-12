"""Extract real UMAP coordinates without downloading expression matrices."""

import argparse
import csv
import io
import json
import math
from pathlib import Path
from urllib.request import urlopen

SOURCE = (
    "https://allen-brain-cell-atlas.s3.us-west-2.amazonaws.com/"
    "metadata/WMB-10X/20230830/cell_metadata.csv"
)
DEFAULT_OUTPUT = (
    Path(__file__).resolve().parents[2]
    / "private/lasso/allen-wmb.csv"
)


def prepare(cells: int, output: Path) -> None:
    """Keep the first requested number of finite, uniquely labeled cells."""
    if cells < 1:
        raise ValueError("Cell count must be positive")

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".csv.part")
    seen: set[str] = set()
    scanned = 0
    try:
        with urlopen(SOURCE, timeout=60) as response, temporary.open(
            "w", newline="", encoding="utf-8"
        ) as destination:
            reader = csv.DictReader(io.TextIOWrapper(response, encoding="utf-8"))
            writer = csv.writer(destination)
            writer.writerow(["cell_label", "x", "y", "cluster_alias"])
            for row in reader:
                scanned += 1
                x, y = float(row["x"]), float(row["y"])
                label = row["cell_label"]
                if not math.isfinite(x) or not math.isfinite(y) or label in seen:
                    continue
                seen.add(label)
                writer.writerow([label, row["x"], row["y"], row["cluster_alias"]])
                if len(seen) % 100_000 == 0:
                    print(f"Prepared {len(seen):,} cells", flush=True)
                if len(seen) == cells:
                    break

        if len(seen) != cells:
            raise ValueError(f"Source supplied only {len(seen):,} usable cells")

        # Check the actual output before replacing an existing prepared dataset.
        with temporary.open(newline="", encoding="utf-8") as generated:
            assert sum(1 for _ in csv.DictReader(generated)) == cells
        temporary.replace(output)
        output.with_suffix(".json").write_text(
            json.dumps(
                {
                    "source": SOURCE,
                    "release": "20230830",
                    "cells": cells,
                    "source_rows_scanned": scanned,
                    "sampling": "First finite, uniquely labeled cells in source order",
                    "coordinates": "Original published all-cells UMAP; not recomputed",
                    "citation": "Yao et al. (2023), doi:10.1038/s41586-023-06812-z",
                },
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )
        print(f"Ready: {output} ({cells:,} distinct real cells)", flush=True)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cells", type=int, default=1_100_000)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    prepare(args.cells, args.output)


if __name__ == "__main__":
    main()
