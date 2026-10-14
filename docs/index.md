---
title: Interactive Genomic Visualization with GenomeSpy
---

# GenomeSpy

![Logo](./img/do-it-swiftly.svg){ align=right }

GenomeSpy is a toolkit for creating interactive visualizations of genomic and
other data. Its [visualization grammar](grammar/index.md) uses
[JSON specifications](getting-started.md) to describe what to display and how it
should appear. You can combine charts and genome tracks into custom views, such
as a genome browser. Software developers can write the JSON directly;
bioinformaticians and data scientists may prefer
[GenomeSpy for Python](https://genomespy.app/genome-spy-python/), which builds
the same specifications from Python chart definitions.

GenomeSpy Core renders these visualizations in a web browser. Its WebGL-based
engine supports smooth interaction with datasets containing several million
rows.

[GenomeSpy App](sample-collections/index.md) builds on Core for analyzing large
sample collections, such as cancer cohorts. In a configured App, researchers can
inspect genomic measurements alongside metadata and sort, filter, and group
samples. If you are using an existing App, start with
[Analyzing Sample Collections](sample-collections/analyzing.md).

## Minimal genomic example

This illustrative copy-number view shows three segments on chromosome 3. The
`x` and `x2` encodings place each segment along the genomic axis, and `color`
distinguishes loss, neutral, and gain.

EXAMPLE examples/docs/index/interactive-overview.json height=100

## More genomic examples

The same grammar supports more specialized views. These examples show
translated sequence context and splice-junction evidence.

EXAMPLE_GALLERY examples/docs/examples/genomic-data

- [Indexed FASTA Six-Frame Translation](examples/genomic-data/indexed-fasta-six-frame-translation.md) indexed-fasta-six-frame-translation.json
- [Sashimi Plot from Splice Junctions](examples/genomic-data/sashimi-plot.md) sashimi-plot.json

See [Genomic Data Examples](examples/index.md) for the full list.

## About

GenomeSpy is developed by [Kari Lavikka](https://karilavikka.fi/) and
contributors. It originated in 2018 as his Master's thesis project in [The
Systems Biology of Drug Resistance in Cancer
group](https://www.helsinki.fi/en/researchgroups/systems-biology-of-drug-resistance-in-cancer)
at the [University of Helsinki](https://helsinki.fi/).

This project has received funding from the European Union's Horizon 2020
Research and Innovation Programme under Grant agreement No. 965193 (DECIDER) and
No. 847912 (RESCUER), the Sigrid Jusélius Foundation, the Cancer Foundation
Finland, and Orion Research Foundation.
