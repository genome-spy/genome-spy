# JavaScript API

GenomeSpy's JavaScript API supports embedding visualizations, controlling live
view hierarchies, updating runtime state, exporting images, and customizing
embed behavior.

The `embed` function returns a promise that resolves into an object that
provides the current public API. The API is documented in the [interface
definition](https://github.com/genome-spy/genome-spy/blob/master/packages/core/src/types/embedApi.d.ts).

For practical examples of using the API, check the
[embed-examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples)
package.

## API topics

- [Embedding and entry points](./embedding.md)
- [View hierarchy](./views.md)
- [Runtime state](./runtime-state.md)
- [Instance, events, and export](./instance.md)
- [Embed options](./embed-options.md)
