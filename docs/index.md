# Introduction

![Logo](./img/do-it-swiftly.svg){ align=right }

GenomeSpy is a toolkit for interactive visualization of genomic and other data.
It enables tailored visualizations by providing a declarative
[grammar](grammar/index.md), which allows for mapping data to visual channels
(position, color, etc.) and composing complex visualization from primitive
graphical marks ([points](grammar/mark/point.md),
[rectangles](grammar/mark/rect.md), etc.). The grammar is heavily inspired by
[Vega-Lite](https://vega.github.io/vega-lite/), providing partial compatibility
and extending it with features essential in genome visualization.

The visualizations are rendered using a carefully crafted WebGL-based engine,
enabling fluid interaction and smooth animation for datasets comprising several
million data points. The high interactive performance is achieved using GPU
[shader](https://en.wikipedia.org/wiki/Shader) programs for all
[scale](grammar/scale.md) transformations and rendering of marks. However,
shaders are an implementation detail hidden from the end users.

The toolkit comprises two JavaScript packages:

1. The [**core**](grammar/index.md) library implements the visualization grammar
   and rendering engine and can be embedded in web pages or applications.
2. The [**app**](sample-collections/index.md) extends the core library with support
   for interactive analysis of large sample collections. It broadens the grammar
   by introducing a facet operator that repeats a visualization for multiple
   samples. The app also provides interactions for filtering, sorting, and
   grouping these samples.

Check the [Getting Started](getting-started.md) page to get started with
GenomeSpy and make your own tailored visualizations.

## An interactive example

The example below is interactive. You can zoom in using the mouse wheel.

<div><genome-spy-doc-embed>

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 200000, "as": "x" }
  },
  "transform": [
    { "type": "formula", "expr": "random() * 0.682", "as": "u" },
    {
      "type": "formula",
      "expr": "((datum.u % 1e-8 > 5e-9 ? 1 : -1) * (sqrt(-log(max(1e-9, datum.u))) - 0.618)) * 1.618 + sin(datum.x / 10000)",
      "as": "y"
    }
  ],
  "mark": {
    "type": "point",
    "size": { "expr": "min(0.5 * pow(zoomLevel, 1.5), 200)" }
  },
  "encoding": {
    "x": { "field": "x", "type": "quantitative", "scale": { "zoom": true } },
    "y": { "field": "y", "type": "quantitative" },
    "opacity": { "value": 0.6 }
  }
}
```

</genome-spy-doc-embed></div>

## About

GenomeSpy is developed by [Kari Lavikka](https://twitter.com/KariLavikka) in
[The Systems Biology of Drug Resistance in Cancer
group](https://www.helsinki.fi/en/researchgroups/systems-biology-of-drug-resistance-in-cancer)
at the [University of Helsinki](https://helsinki.fi/).

This project has received funding from the European Union's Horizon 2020
Research and Innovation Programme under Grant agreement No. 667403 (HERCULES)
and No. 965193 (DECIDER)
