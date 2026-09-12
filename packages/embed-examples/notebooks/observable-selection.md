# Observable selection recipe

Use the same public selection envelope in an Observable cell. The subscription
is future-only, and the returned cleanup function belongs in the cell's
`invalidation` handler.

```js
viewof chart = html`<div style="height: 260px"></div>`

api = {
  const result = await genomeSpy.embed(chart, spec)
  invalidation.then(() => result.finalize())
  return result
}

selection = api.params.getSelection("brush")

selectionState = {
  Generators.observe((change) => {
    const stop = selection.subscribe(change, { delivery: "commit" })
    change(selection.getValue())
    return stop
  })
}
```

For annotation rows, keep the Core dataset declaration in the authored spec and
publish plain JSON-safe rows with `api.datasets.set("annotations", rows)`. The
notebook owns transport, persistence, and any projection needed before sending
rows to another runtime.
