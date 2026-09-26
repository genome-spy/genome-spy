# Capture a focused view

When a large visualization makes a rendering problem hard to inspect, capture
the current canvas region of one view or layout subtree. A unit view's bounds
focus on that view; a container view's bounds cover its laid-out subtree. This
is a crop of the live frame, not an independent layout, so it preserves shared
scales, zoom state, parameters, parent clipping, and renderer-specific output.

Prefer a named view selector because it can be resolved again after Playground
re-embeds an edited specification. For an anonymous or repeated runtime view,
use the `id` of a `ViewHandle` obtained from `api.views.root()` and its
`children()` in the current embed only. Resolve the handle inside the browser
context; do not try to serialize a `ViewHandle`.

With a Playwright `page`, compute a document-relative screenshot clip from the
public layout bounds and the live canvas:

```js
const address = { scope: [], view: "detail" };
// For an exact runtime instance instead, use: { id: "current-handle-id" }
const clip = await page.evaluate((requestedAddress) => {
  /**
   * Converts canvas-coordinate layout bounds to viewport-relative CSS bounds.
   * This generic DOM helper is intentionally local to the browser workflow.
   *
   * @param {{ x: number, y: number, width: number, height: number }} bounds
   * @param {HTMLCanvasElement} canvas
   */
  function viewLayoutBoundsToClientBounds(bounds, canvas) {
    const canvasBounds = canvas.getBoundingClientRect();
    if (canvas.offsetWidth <= 0 || canvas.offsetHeight <= 0) {
      throw new Error("Cannot convert bounds for a canvas with no layout.");
    }

    const scaleX = canvasBounds.width / canvas.offsetWidth;
    const scaleY = canvasBounds.height / canvas.offsetHeight;
    const contentX = canvasBounds.left + canvas.clientLeft * scaleX;
    const contentY = canvasBounds.top + canvas.clientTop * scaleY;

    return {
      x: contentX + bounds.x * scaleX,
      y: contentY + bounds.y * scaleY,
      width: bounds.width * scaleX,
      height: bounds.height * scaleY,
    };
  }

  const api = window.__genomeSpy.api;
  if (!api) {
    throw new Error("GenomeSpy has not finished embedding.");
  }

  let address = requestedAddress;
  if ("id" in requestedAddress) {
    const pending = [api.views.root()];
    let handle;
    while (pending.length > 0) {
      const candidate = pending.pop();
      if (candidate.id === requestedAddress.id) {
        handle = candidate;
        break;
      }
      pending.push(...candidate.children());
    }
    if (!handle) {
      throw new Error("The view handle is stale or does not exist.");
    }
    address = handle;
  }

  const bounds = api.views.getLayoutBounds(address);
  if (!bounds) {
    throw new Error("The view has no rendered layout bounds.");
  }

  const canvas = document.querySelector(".canvas-wrapper > canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("GenomeSpy canvas not found.");
  }

  const left = Math.max(0, bounds.x);
  const top = Math.max(0, bounds.y);
  const right = Math.min(canvas.clientWidth, bounds.x + bounds.width);
  const bottom = Math.min(canvas.clientHeight, bounds.y + bounds.height);
  if (right <= left || bottom <= top) {
    throw new Error("The view is outside the visible canvas.");
  }

  const clientBounds = viewLayoutBoundsToClientBounds(
    {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    },
    canvas
  );

  return {
    x: window.scrollX + clientBounds.x,
    y: window.scrollY + clientBounds.y,
    width: clientBounds.width,
    height: clientBounds.height,
  };
}, address);

await page.screenshot({ path: "view.png", clip });
```

Wait for the relevant render or completed layout update before capturing. Keep
the full-visualization screenshot as context when the bug may involve a parent,
shared guide, sibling overlap, or surrounding layout. The crop includes every
pixel painted inside the rectangle; it does not isolate paint ownership, and
guides or shadows extending outside the view bounds are omitted. Use structured
SVG groups when the distinction between overlapping view subtrees matters.
