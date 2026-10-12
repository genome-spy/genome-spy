# Lasso development tests

These local test pages are committed with the PR, outside the embedding examples
and docs deployment. From a checkout of the PR branch, use the Node/npm versions
specified in the root `package.json`, then run:

```sh
npm ci
npm run dev:lasso
```

Open the printed development URL (by default `http://127.0.0.1:5174/`) in a
WebGPU-enabled browser. If that port is occupied, use
`npm run dev:lasso -- --port 5175` and substitute the printed port below.

| Native example                                      | URL path                                  | Data preparation                                           |
| --------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| 10M synthetic points, fast density display          | `/nativeDense/?points=10000000&density`   | None; seeded points are generated locally                  |
| 10M synthetic points, ordinary point colors         | `/nativeDense/?points=10000000`           | None; compare the cost of point redraws                    |
| Real 1.1M-cell UMAP, log/sqrt axes, density display | `/nativeDense/?umap&nonlinear&density`    | Run the command below once                                 |
| Linked plots and bookmark/undo/redo                 | `/native/?linked&history&renderer=webgpu` | None; use `renderer=webgl` or `renderer=canvas` to compare |

For the same real-cell example, use Python 3.9 or newer; no Python packages or
credentials are required:

```sh
python3 tests/lasso/prepareData.py --cells 1100000
```

The script downloads a pinned public Allen metadata release and writes the CSV
and provenance JSON to ignored `private/lasso/`. Keep the default output path:
the example pages load those files through the local server. No expression matrix
or large dataset is included in the PR. Preparation may take time; progress is
printed every 100,000 cells. After it finishes, refresh the UMAP example.

Shift-drag draws/replaces a lasso, Escape cancels, double-click clears, scrolling
zooms, and ordinary dragging pans. Navigation waits while release confirmation
finishes. To start with a smaller synthetic workload, use `points=1000000`.
The 10M workload deliberately stresses browser and GPU memory; qualification
results are specific to the tested hardware.

`/native/` tests Core's `select: "region"` grammar and conditional color on three
points with log/sqrt axes. Use `?renderer=webgpu` or `?renderer=canvas` to compare
backends, `?linear` for linear axes, and `?zoom` for Shift-drag with navigation.
Add `&linked` to exercise a rotated linked plot and a selection-filtered consumer,
sharing IDs assigned on their ancestor. The other pages remain separate
CPU-reference and GPU-compute workload fixtures.

## Million-cell UMAP lasso test

Prepare 1,100,000 real cells from the Allen Brain Cell Atlas WMB-10X metadata:

```sh
python3 tests/lasso/prepareData.py
npm run dev:lasso
```

Open `/lassoUmap/` on the printed development URL. Shift-drag draws a lasso;
normal dragging pans and scrolling zooms. The buttons select the current center,
select all loaded cells, clear selection, and reset navigation.

The downloader streams the original metadata, keeps the first requested number
of finite, uniquely labeled cells, and preserves their published UMAP coordinates.
It downloads no expression matrix. Files and provenance are written to
`private/lasso/`, which is ignored by Git. This is an ordered subset,
not a representative biological sample. A larger subset can be prepared with
`--cells 2000000`; the page shows the actual number loaded.

Data source: [Allen Brain Cell Atlas WMB-10X](https://alleninstitute.github.io/abc_atlas_access/notebooks/10x_snRNASeq_tutorial_part_1.html),
release 20230830; [Yao et al. (2023)](https://doi.org/10.1038/s41586-023-06812-z).
Use is subject to the [Allen Institute data terms](https://alleninstitute.org/legal/terms-of-use).

This development example uses Core’s internal lasso gesture controller and CPU
region helpers, with a separate highlight point layer. The controller derives
the projection from the named point view and supports quantitative x/y
fields on linear, log, sqrt, pow, or symlog scales without offsets. The polygon
and captured numeric scale mappings share normalized plot coordinates, so
nonlinear membership follows the drawn outline and can be reconstructed after
navigation. Rounded/custom interpolation is rejected. Escape, window blur, and disposal cancel drawing; a
data, layout, or scale change during a gesture prevents its publication. It does not activate public `select: "region"` syntax,
upload a selection hash table, or run GPU containment. The scan metric isolates
CPU materialization; the highlight metric includes array construction, dataset
publication, and two animation frames, without waiting for GPU completion.
Synchronous scans may pause the page. Picking is disabled. This example is a
correctness and workload test, not a complete GPU selection benchmark.

## Lasso on nonlinear scales

Open `/lassoScales/` for a download-free comparison of three synthetic points
on linear/linear and log/sqrt axes. The test triangle selects A, B, C on the
left and A, C on the right. B lies outside the displayed nonlinear triangle;
inverse-mapping only its vertices would incorrectly include B. Shift-drag draws
a new lasso; the button restores the reference triangle. This uses the same
internal CPU controller/materializer and highlight-layer approach as the UMAP test.

## Live WebGPU lasso prototype

Open `/lassoGpu/` for a renderer-only compute demo. Drag to update orange
highlighting while drawing; release reads the selected IDs to the CPU, and Escape
clears. Use `/lassoGpu/?points=10000000` for ten million seeded synthetic points.
These are workload fixtures, not real cells. The CPU examples remain separate.

The compute shader retains its persistent selection hash and selected-ID list.
The live preview counts total and selected rows per pixel, then recolors a cached
gray plot according to the local selected fraction. It does not redraw point
geometry on polygon updates or release. This preserves cached density/coverage
rather than reproducing conditional point transparency; it is a dedicated
uniform-gray-on-white preview. Resize rebuilds the image and counts together.

No ID download/upload round trip occurs while drawing. This prototype uses
already projected f32 coordinates, a 512-vertex trace budget, and population-sized
staging on explicit readback. The 10M table alone uses 128 MiB; image/count caches
add 12 bytes per physical pixel. The demo reports initialization/device errors;
it does not claim a portable frame-rate target or integrate Core region grammar
or bookmarks. Status messages stay below the plot so wrapping does not move it.

## Real-cell GPU comparison

Open `/lassoUmapGpu/` after running the same Allen-data preparation command used
by `/lassoUmap/`. The page validates unique labels, finite coordinates and the
provenance count, and requires more than one million real cells. It uses every
prepared row without replication. The renderer-generic scene accepts projected
f32 arrays instead of generating synthetic points; release exposes a copied
polygon and ID snapshot to the example host.

Choose linear, log or sqrt independently for the two axes. Coordinates are
translated once so each minimum is 1; linear geometry is unchanged. Core's
resolved forward mappings normalize points before GPU upload. After drawing,
click **Compare selected IDs with CPU** to run the separate f64 CPU materializer.
It reports exact missing/extra ID counts, including mismatches; this explicit
comparison can briefly pause the page. Changing scales replaces the scene and
clears the comparison; status stays below the plot.

Scroll or pinch over the plot to zoom up to 32× around the pointer. Right-click
resets zoom while preserving the selection. Zooming refreshes the cached plot;
lasso drawing continues to use the image preview without redrawing points.

The tested 1,100,000-cell center and full selections matched exactly on linear
and mixed log/sqrt axes. This does not establish universal f64/f32 agreement:
a near-edge fixture demonstrates f32 rounding a point onto the polygon boundary.
This standalone comparison is separate from the native region grammar below.

## Native GPU lasso

Open `/nativeDense/?points=10000000&density` for ten million synthetic points,
or `/nativeDense/?umap&nonlinear&density` for the prepared real cells on log/sqrt
scales. These use Core's native region grammar. GPU compute updates the selection
hash table while drawing; release reads IDs and input-row indices for CPU
consumers without rescanning positions or reuploading the table. The CPU reference
remains separate in the earlier fixtures and in WebGL/Canvas.

Shift-drag draws or replaces a lasso; Escape cancels, double-click clears, and
scrolling zooms. Zoom and pan pause until readback and CPU membership publication
finish. Density avoids point redraws and shows local selected fractions. GPU
membership follows captured rendered f32 centers and the saved sampled path;
the CPU reference and bookmark replay can differ near polygon boundaries.
Use `/native/?linked&renderer=webgpu` to check linked encodings without density,
or add `&history` for App bookmark and undo/redo checks.
