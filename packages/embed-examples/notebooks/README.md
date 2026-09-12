# Selection bridge notebook

This directory contains a small marimo bridge for the selection-driven form.
The bridge is intentionally outside GenomeSpy Core: the browser sends plain
selection snapshots and annotation rows over HTTP, while the notebook can
publish edited rows back to the browser.

## Start

From the repository root, install marimo if needed and run:

```sh
python -m pip install marimo
marimo edit packages/embed-examples/notebooks/selection_bridge.py
npm -w @genome-spy/embed-examples run dev -- --host 127.0.0.1
```

Open `selectionForm/?bridge=1` from the Vite server. The notebook bridge listens on
`http://127.0.0.1:8765`; its CORS policy allows local `127.0.0.1` and
`localhost` example pages, including alternate Vite development ports.

## Verify

1. Brush a region in the browser. The committed snapshot appears after using
   **Refresh selection** in the notebook.
2. Enter JSON-safe annotation rows in the notebook and choose **Publish rows**.
3. Confirm the browser table and blue annotation layer update.
4. Stop marimo and the Vite server when finished. The browser example remains
   usable without the bridge.

The bridge uses `start`, `GET /selection`, `POST /selection`, `GET /annotations`,
and `POST /annotations`. It is a local development example, not a production
transport or authentication layer.
