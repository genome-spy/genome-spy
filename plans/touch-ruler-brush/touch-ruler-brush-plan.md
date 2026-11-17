# Touch rulers and interval brushes

Support direct touch for pointer rulers and interval selections. Preserve mouse
gestures and filters. Keep one-finger pan as the default on zoomable plots and
hand a second contact to viewport pinch.

## Ownership

The canvas controller routes tool candidates through the existing view
hierarchy. Core grids and the App sample pane report pan availability there,
including zoom on an axis outside an X-only brush. Ruler and interval controllers
reuse their coordinate mapping and the pointer drag helper. A tap places a ruler
on a pannable plot. An eligible press-driven ruler on a fixed plot tracks the
finger from contact. A brush begins once the finger moves and takes priority
when both tools can claim the drag. An explicit, optionally bound `touchDrag`
setting can reserve the gesture for a tool.

## Completed

- [x] Route touch through the existing view hierarchy and preserve pointer
  capture during pinch takeover.
- [x] Verify immediate ruler placement, no brush commit on cancellation, pan
  priority across axes, and explicit brush overrides in integration tests.
- [x] Verify the ASCAT ruler in Chromium touch emulation and exercise touch
  brushing in the zoomable interval documentation example.
- [x] Document the gestures and add a minor Core changeset.

## Follow-up

Native page scrolling for mobile embeds belongs in a separate change. The canvas
currently owns touch gestures across the full embed. A temporary Chromium
experiment with different touch regions informed that follow-up.
