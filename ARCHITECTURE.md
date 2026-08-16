# GenomeSpy Architecture

This document is the repository-level architecture map. Follow the relevant
subsystem link instead of loading every architecture document for each task.

## System map

GenomeSpy is a fully client-side visualization system with three main layers:

1. **GenomeSpy Core** implements the declarative grammar, view hierarchy,
   dataflow, scales, parameters, layout, and GPU rendering.
2. **GenomeSpy App** embeds Core in a cohort-analysis application whose Redux
   state and provenance model coordinate sample operations and view state.
3. **GenomeSpy App Agent** is an experimental plugin that exposes App
   capabilities to an LLM through browser-owned context and tools, with a thin
   Python relay for model-provider communication.

## Subsystem references

- Core overview and topic routing: `packages/core/ARCHITECTURE.md`
- Core views, layout, dataflow, and lifecycle:
  `packages/core/docs/architecture/views-and-dataflow.md`
- Core rendering, shaders, resources, and WebGPU implications:
  `packages/core/docs/architecture/rendering.md`
- Core parameters and expressions:
  `packages/core/docs/architecture/reactivity.md`
- App Redux, provenance, async intents, and bookmark restoration:
  `packages/app/APP_ARCHITECTURE.md`
- App-agent ownership and entry points: `packages/app-agent/ARCHITECTURE.md`
- Python relay: `packages/app-agent/server/ARCHITECTURE.md`

## Project structure

- `packages/core`: GenomeSpy Core library
- `packages/app`: GenomeSpy cohort-analysis application
- `packages/app-agent`: browser-side AI agent plugin and Python relay
- `packages/doc-embed`: live documentation-spec web component
- `packages/embed-examples`: standalone embedding examples
- `packages/react-component`: React integration
- `packages/playground`: interactive specification editor
- `docs`: user-facing documentation site sources

## Product and interaction context

GenomeSpy is a grammar-based toolkit for authoring tailored, interactive genomic
visualizations and embedding them in applications and web pages. It has been
demonstrated with 753 ovarian cancer samples from the DECIDER trial, including
interactive cohort exploration and clinically actionable variant inspection.

Important interaction patterns include:

- Rapid bird's-eye-to-close-up transitions for large sample collections
- Incremental, reversible actions with provenance
- Score-based semantic zoom that reduces overplotting while retaining signal
- Data-summary tracks such as copy-number summaries

## Embedding and example frontends

- `packages/doc-embed` provides `<genome-spy-doc-embed>`, which upgrades
  Markdown code blocks into live specifications. Its `README.md` describes the
  transformation and connection to the Zensical Python Markdown extension.
- `packages/embed-examples` contains standalone HTML/JavaScript examples for
  shared scale domains, dynamic data, FASTA data, named data providers, and the
  React wrapper. Its index imports `@genome-spy/core` and links the scenarios.
- `packages/react-component/src/main.js` calls `embed` from a React hook,
  captures the resulting API, and disposes it on unmount.
- `packages/playground/src/index.js` implements the Lit-powered split-pane
  specification editor used by the docs and site. It loads `defaultspec.json`
  and re-embeds Core when the specification or options change.

## Documentation site resources

- `docs/` contains canonical tutorials, grammar reference, data examples, and
  `genome-spy-schema.json`.
- `zensical.toml` configures site metadata, theme, Markdown extensions, assets,
  navigation, and the custom theme directory.
- `custom_theme/` and `docs/stylesheets/` contain theme and CSS overrides.
- `site/` contains generated documentation output.
