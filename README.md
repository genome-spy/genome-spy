# GenomeSpy

![Teaser](docs/img/teaser.png)

![npm version](https://img.shields.io/npm/v/genome-spy)

GenomeSpy is a visualization toolkit for genomic (and other) data. It has a [Vega-Lite](https://vega.github.io/vega-lite/) inspired visualization grammar and high-performance WebGL-powered graphics rendering.

The software is still work in progress. Documentation and examples for the current version can be found at https://genomespy.app/

## Monorepo

GenomeSpy is split into several [packages](./packages/), two of which are the most important:

### Core

The [core](./packages/core/) library provides the visualization grammar and a WebGL-powered rendering engine.

### App

The [app](./packages/app/) builds upon the core, extending the visualization grammar with support for faceting multiple (up to thousands of) patient samples. It provides a user interface for interactive analysis of the samples, which can be filtered, sorted, and grouped flexibly. A session handling with provenance, url hashes, and bookmarks is included.

## Contributing

### Bootstrapping and running

1. `git clone git@github.com:tuner/genome-spy.git`
2. `cd genome-spy`
3. `npm install` (use npm7!)
4. `npm start` (starts the App)

The `packages/core/examples` directory contains some random view specification that can be accessed through urls like `http://localhost:8080/?spec=examples/first.json`.

The `packages/core/private/` directory is in `.gitignore` and served by the development server: `http://localhost:8080/?spec=private/foo.json`. Use it for experiments that should not go into version control.

If you want to use or develop the core library, launch a single-page app using: `npm -w @genome-spy/core run dev`

## About

Copyright (c) 2019-2021 Kari Lavikka. See [LICENSE](LICENSE) for details.

GenomeSpy is developed in [The Systems Biology of Drug Resistance in
Cancer](https://www.helsinki.fi/en/researchgroups/systems-biology-of-drug-resistance-in-cancer) group at the University of Helsinki.

This project has received funding from the European Union’s Horizon 2020 research and innovation programme under grant agreement No 667403 for HERCULES
