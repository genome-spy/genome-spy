# GenomeSpy Schema Extension

This package provides the custom Markdown extension used by the GenomeSpy
Zensical site.

For local development, do not install this package manually. The repository root
manages it through the docs `uv` environment declared in
[`pyproject.toml`](../../pyproject.toml).

## Links to Python examples

The `EXAMPLE` macro adds a **View Python example** link beneath a live
visualization when its JSON spec has a curated Python counterpart. The exact
spec-path-to-gallery-slug matches live in `PYTHON_GALLERY_EXAMPLES` in
[`extension/extension.py`](extension/extension.py). The macro passes the gallery
URL to the [`<genome-spy-doc-embed>` component](../../packages/doc-embed/index.js)
as `python-url`. Matching by spec path also adds the link wherever that spec is
reused in the documentation.

To add or change a match, review the Python example in the separate
`genome-spy-python` repository under `docs/examples/<slug>.py`, then update the
mapping. Its gallery page is published at
`https://genomespy.app/genome-spy-python/gallery/<slug>.html`. Match the example's
data, chart, and interactions rather than inferring a port from its filename.
Some Python examples adapt the original or import its JSON tracks, so the link
is labeled **View Python example** rather than promising an exact translation.

Verify changes with the Markdown extension tests and a docs build:

```sh
uv run --group docs python -m unittest discover -s utils/markdown_extension/tests
npm run build:docs
```
