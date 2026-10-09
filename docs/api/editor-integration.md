# Editor Integration

Editors and tools that generate GenomeSpy specifications can link runtime errors
to the declarations that need correcting. Playground uses these locations to
underline errors in its specification editor.

Validate the specification's structure against GenomeSpy's
[JSON Schema](../grammar/index.md#schema-assisted-editing) before embedding. The
runtime diagnostics described here complement schema validation: for example,
the schema can check that `field` is a string, but whether that field exists
depends on the loaded data.

A _fragment_ is an object within the specification, such as
`{ "field": "positon", "type": "quantitative" }` at `encoding.x`. Before
embedding, Playground walks the parsed specification and records each object and
its address in a `WeakMap`. It uses JSON Pointers: `/encoding/x` means the `x`
declaration inside `encoding`. The `getSpecOrigin(fragment)` callback looks up
that object's address; GenomeSpy itself does not know the JSON text or its line
numbers.

When a runtime error identifies a problem with that fragment's `field` property,
GenomeSpy reports its origin (`"/encoding/x"`) and a relative path (`["field"]`).
Playground follows the combined path, `/encoding/x/field`, in the parsed editor
document. The parser provides the value's character range, which the editor
underlines. These structural addresses still work after formatting changes the
line numbers.

## Locating specification errors

Editors can locate errors involving missing encoding fields, invalid expressions,
duplicate parameter names, missing `push: "outer"` targets, and transform
construction failures. Provide `getSpecOrigin(fragment)` to return your recorded
identifier for an object in the specification passed to `embed`. Import
`getSpecErrorLocation` from `@genome-spy/core` (also available from the minimal
entry point) and call it on an error received by `onError` or caught from `embed`.

The result is `{ origin, path }`, where `origin` is the string returned by your
callback and `path` identifies a property within that declaration. A syntax error,
unknown parameter, or missing static top-level `datum` field in an expression
identifies its `expr` property. Duplicate parameters identify the second
declaration's `name`; missing `push: "outer"` targets identify the referencing
parameter's `name`. Transform construction
failures identify the whole transform (`path: []`). The helper also checks wrapped
errors' causes. GenomeSpy treats `origin` as an opaque string; using JSON Pointers
is a choice made by the embedding application.
Not every error has a location. Nested `datum` properties and computed field names
are not validated.

Track-local processing failures carry the same information in
[`dataLoading` entries](./instance.md#data-loading) as `errorLocation`. Their
`origin` still identifies the data source declaration, which may differ from
the encoding or expression that failed.

## Feedback for LLM agents

An LLM agent that generates or revises specifications can use error locations as
structured feedback. The error message explains what failed, while the location
identifies the declaration to edit. Available-field hints can also help the agent
correct a misspelled field name.

For example, with JSON Pointer origins, a host application could send the agent:

```json
{
  "message": "Invalid field \"positon\". Available fields or properties: position, value",
  "origin": "/encoding/x",
  "path": ["field"]
}
```

The agent can then change `/encoding/x/field` to `"position"` and submit the
revised specification for validation.

A validation loop can:

1. Validate the structure against the JSON Schema, then index the parsed
   specification's objects and provide their origins through
   `getSpecOrigin` when embedding.
2. Collect failures from `onError` or the rejected `embed` promise, extracting
   their locations with `getSpecErrorLocation`. When embedding succeeds, await
   `api.awaitVisibleLazyData()`, handle any rejection, and inspect
   `api.dataLoading.getSnapshot()` for entries with `status: "error"`.
3. Send the agent each error's message and location. For loading entries, prefer
   `errorLocation`; fall back to `origin` to identify the data declaration.
   Keep the message even when no location is available.
4. Finalize any existing instance, apply the agent's revision, and embed again to
   check it.

A successful `embed()` can still contain failed data sources, so the loading
snapshot is part of validation. Lazy-data checks cover the current visible
requests; they do not certify hidden tracks or future viewport requests.
