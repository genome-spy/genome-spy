# GenomeSpy

![Teaser](https://raw.githubusercontent.com/genome-spy/genome-spy/master/docs/img/teaser.png)

![npm version](https://img.shields.io/npm/v/@genome-spy/core)
[![DOI](https://zenodo.org/badge/153765756.svg)](https://zenodo.org/doi/10.5281/zenodo.7852281)

GenomeSpy is a visualization toolkit for genomic (and other) data. It features a
visualization grammar inspired by [Vega-Lite](https://vega.github.io/vega-lite/)
and a high-performance, WebGL-powered graphics renderer.

Documentation and examples can be found at https://genomespy.app/

## Monorepo

GenomeSpy is split into several [packages](./packages/), two of which, core and
app, are the most important:

### Core

The [core](./packages/core/) library provides the visualization grammar and a
WebGL-powered rendering engine.

### Cohort App

The [app](./packages/app/) builds upon the core, extending the visualization
grammar with support for faceting multiple (up to thousands of) patient samples.
It provides a user interface for interactive analysis of the samples, which can
be filtered, sorted, and grouped flexibly. The app includes session handling
with provenance, URL hashes, and bookmarks.

### Embed Examples

The [embed-examples](./packages/embed-examples/) package contains examples of
how to embed GenomeSpy in web applications and use the
[API](https://genomespy.app/docs/api/) for advanced use cases.

## Contributing

### Bootstrapping and running

1. `git clone git@github.com:genome-spy/genome-spy.git`
2. `cd genome-spy`
3. `npm install` (use npm7!)
4. `npm start` (starts a development server with the app package)

The `packages/core/examples` directory contains some random view specification
that can be accessed through urls like
`http://localhost:8080/?spec=examples/first.json`.

The `packages/core/private/` directory is in `.gitignore` and served by the
development server: `http://localhost:8080/?spec=private/foo.json`. Use it for
experiments that should not go into version control.

If you want to use or develop the core library, launch a single-page app using:
`npm -w @genome-spy/core run dev`

### Contributing guidelines

Please see the [CONTRIBUTING.md](./CONTRIBUTING.md) file for more information.

## Citing

If you use GenomeSpy in your research, please cite the following paper:  
Kari Lavikka, Jaana Oikkonen, Yilin Li, Taru Muranen, Giulia Micoli, Giovanni
Marchi, Alexandra Lahtinen, Kaisa Huhtinen, Rainer Lehtonen, Sakari Hietanen,
Johanna Hynninen, Anni Virtanen, Sampsa Hautaniemi, Deciphering cancer genomes
with GenomeSpy: a grammar-based visualization toolkit, _GigaScience_, Volume 13,
2024, giae040, https://doi.org/10.1093/gigascience/giae040

## About

Copyright (c) 2019-2024 Kari Lavikka. See [LICENSE](LICENSE) for details.

GenomeSpy is developed in [The Systems Biology of Drug Resistance in
Cancer](https://www.helsinki.fi/en/researchgroups/systems-biology-of-drug-resistance-in-cancer)
group at the [University of Helsinki](https://www.helsinki.fi/en).

This project has received funding from the European Union's Horizon 2020
research and innovation programme under grant agreement No. 965193
([DECIDER](https://www.deciderproject.eu/)) and No. 847912
([RESCUER](https://www.rescuer.uio.no/)), as well as from the Biomedicum
Helsinki Foundation, the Sigrid Jusélius Foundation, and the Cancer Foundation
Finland.

Contains some code copied and adapted from the following projects:

- Vega and Vega-Lite ([LICENSE](https://github.com/vega/vega-lite/blob/master/LICENSE))
- TWGL ([LICENSE](https://github.com/greggman/twgl.js/blob/master/LICENSE.md))
