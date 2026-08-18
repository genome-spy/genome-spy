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

## Exporting raster images

`imageExport.raster()` exports the current visualization as a PNG `Blob`.

```js
const { blob } = await api.imageExport.raster();
```

The default logical dimensions match the current canvas, and `pixelRatio`
defaults to `window.devicePixelRatio`. The visualization background is used
when configured; otherwise it defaults to white. Pass `null` for a transparent
background:

```js
const { blob } = await api.imageExport.raster({
  logicalWidth: 1200,
  logicalHeight: 600,
  pixelRatio: 2,
  background: null,
  mimeType: "image/png",
});
```

`image/png` is currently the only supported MIME type.

Raster export uses the active rendering backend. In Canvas2D mode, GenomeSpy
renders the current view into a detached Canvas2D surface and encodes it without
requesting WebGL. Native-font and effect limitations are the same as in the
live [Canvas2D renderer](./embed-options.md#canvas2d-limitations).

!!! warning "Deprecated canvas export"

    `exportCanvas(width, height, devicePixelRatio, background)` remains
    available for compatibility and returns a PNG data URL. Use
    `imageExport.raster()` for new code.

## Exporting SVG

`imageExport.svg()` exports the current visualization as an SVG `Blob`. Views
become nested SVG groups, and supported marks, axes, legends, and titles remain
editable vector elements.

```js
const { blob, warnings, rasterized } = await api.imageExport.svg();
```

The default dimensions match the current canvas. The visualization background
is used when configured; otherwise it defaults to white. Pass `null` for a
transparent background:

```js
const result = await api.imageExport.svg({
  logicalWidth: 1200,
  logicalHeight: 600,
  background: null,
});
```

The result contains:

- `blob`: the serialized SVG with MIME type `image/svg+xml`.
- `warnings`: unsupported visual properties that were ignored. These warnings
  do not prevent the rest of the visualization from being exported.
- `rasterized`: descriptions of mark layers embedded as raster images.

Exported text uses the configured font followed by a list of system-font
fallbacks. The exact appearance can vary when the configured font is not
available in the application that opens the SVG.

### Downloading the SVG

Use the returned `Blob` with the browser's download APIs or pass it directly to
another file or upload API:

```js
const { blob, warnings } = await api.imageExport.svg();
warnings.forEach((warning) => console.warn(warning));

const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = "visualization.svg";
document.body.appendChild(link);
link.click();
link.remove();

// Revoke the URL after the browser has started the download.
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

### Rasterizing dense layers

Large mark layers can make SVG files slow to open and edit. The optional
`rasterization` setting embeds a mark as a transparent PNG when its visible,
post-culling instance count exceeds `maxVectorInstances`. Adjacent rasterized
layers are combined into the same image when possible, while axes, labels, and
other layers remain vectors.

```js
const result = await api.imageExport.svg({
  rasterization: {
    maxVectorInstances: 5000,
    pixelRatio: 2,
  },
});
```

`pixelRatio` controls the resolution of embedded images and defaults to `2`.
Higher values produce sharper raster layers and larger files. It does not
change the SVG dimensions or vector elements.

Rasterization uses GenomeSpy's existing WebGL renderer. If no WebGL context is
available, export remains functional and emits vectors instead, with a warning
in the result. Omitting `rasterization` produces a vector-only SVG and does not
require WebGL.

### Previewing rasterization

`imageExport.analyzeSvg()` reports the visible instance count of each mark layer
without creating an SVG or using WebGL. It can be used to preview which layers
would cross a rasterization threshold:

```js
const { layers } = await api.imageExport.analyzeSvg();
const threshold = 5000;

const rasterizedLayers = layers.filter(
  (layer) => layer.instanceCount > threshold
);
```

Each layer reports its view name, optional resolved view title, hierarchy path,
mark type, and instance count. The optional `logicalWidth` and `logicalHeight`
settings use the same CSS-pixel coordinate system as `imageExport.svg()`.
