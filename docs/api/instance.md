# Instance, Events, and Export

The object returned by `embed` controls the lifetime of the embedded GenomeSpy
instance and exposes a few instance-level utilities.

## Finalizing

Call `finalize()` when the embedded visualization is no longer needed. It
releases GenomeSpy resources, unregisters event listeners, and removes the
created DOM content from the embed container.

```js
const api = await embed(container, spec);

// Later, when the host component is being destroyed:
api.finalize();
```

## Interaction events

`addEventListener()` and `removeEventListener()` attach listeners for
interaction events emitted by GenomeSpy. Currently, only `"click"` events are
supported. The event object includes `datum`, the underlying datum for the
clicked mark instance.

!!! warning "Legacy API"

    The instance-level interaction event API is legacy and will be removed in a
    future version. Avoid using it in new code.

```js
const listener = (event) => {
  console.log(event.datum);
};

api.addEventListener("click", listener);

// Later:
api.removeEventListener("click", listener);
```

## Exporting the canvas

`exportCanvas()` renders the current visualization into a PNG data URL.

```js
const dataUrl = api.exportCanvas();
```

Optional arguments control the exported logical size, device pixel ratio, and
background color:

```js
const dataUrl = api.exportCanvas(
  1200, // logical width in CSS pixels
  600, // logical height in CSS pixels
  2, // device pixel ratio
  "white" // background color
);
```

If omitted, the logical size defaults to the current canvas size and the device
pixel ratio defaults to `window.devicePixelRatio`. The default background color
is `"white"`.
