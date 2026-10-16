# Shared point selection reproduction

This is a native Core example, independent of Scanpy and the Python wrapper.
Each point view declares a `point` selection with `push: "outer"`, targeting one
ancestor value. An explicit `identifier` transform assigns row identity before
the dataflow splits into the two panels.

```sh
npm ci
npx playwright install chromium
npx vite . --config packages/core/vite.config.js --host 127.0.0.1 --port 8891 --strictPort
```

Open <http://127.0.0.1:8891/tests/point-selection/>. Click the lower-left point A
in the first panel, then Shift-click the upper point B in the second panel.
Both panels should highlight A and B; Shift-clicking A again should leave B.

On unmodified master `74bbd7e1315bf2d14c7f2f4b05d4e977170f74a1`, the second
click throws `Cannot read properties of undefined (reading 'data')`. Only A
remains selected. The one-line fix changes the event handler's scope-local read
to its existing lexical lookup. The adjacent subsystem test exercises real
input dispatch and native selection reads, toggles, and clearing.

## Screen recordings

The files in `media/` record actual browser input and rendered frames at
1120 × 800. The red cursor marker and Shift indicator follow browser input
events; the selection readout and error text come from Core's API and the
browser error event. GIFs are smaller 8 fps conversions of the original WebMs.
No selection results or chart frames are synthesized.

The recordings use Canvas to isolate the input-handler issue. This PR does not
qualify linked WebGL rendering, which reports a separate selection-texture error
with this ancestor-value configuration on the same baseline.

With the dev server running, record the fixed interaction using:

```sh
node tests/point-selection/record.mjs --label="After fix" --output=test-results/point-selection
```

`--expect-failure` checks and records the original failure when running against
the unfixed source. `CORE_TEST_SERVER` overrides the server origin. Each run
saves the original WebM, a final screenshot, and the observed selection/error
metadata. The before recording was captured with the tracked Core source
unchanged from the master commit named above; the after recording changes only
the lookup in `unitView.js`.
