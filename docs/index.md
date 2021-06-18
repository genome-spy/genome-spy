# Introduction

GenomeSpy is an interactive visualization tool for genomic and other data. It
provides a declarative [grammar](grammar/index.md) for mapping data to visual
channels (position, color, etc.) and composing complex visualization from
primitive graphical marks ([points](grammar/mark/point.md),
[rectangles](grammar/mark/rect.md), etc.). The grammar is heavily inspired by
[Vega-Lite](https://vega.github.io/vega-lite/).

The visualizations are rendered using a carefully crafted WebGL-based engine,
and thus, GenomeSpy is able to provide fluid interactions and smooth animations
for datasets as large as a few million data points.

To facilitate exploration of large cohorts of patients and (biological) samples,
GenomeSpy supports aggregation and [interactive
manipulation](grammar/samples.md) of large sample sets.

# Example

TODO: A simple example with some sensible, preferably genomic data.

<!--
<div class="embed-example" data-url="data/examples/sampletrack.json" style="height: 300px"></div>
-->

# About

GenomeSpy is developed by [Kari Lavikka](https://twitter.com/KariLavikka) in
[The Systems Biology of Drug Resistance in Cancer
group](https://www.helsinki.fi/en/researchgroups/systems-biology-of-drug-resistance-in-cancer)
at the [University of Helsinki](https://helsinki.fi/).
