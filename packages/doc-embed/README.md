# genome-spy-doc-embed component

This package features `<genome-spy-doc-embed>` [custom
element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components), which
turns static code blocks in the documentation into interactive visualizations.
By embedding example specifications within this element, they are presented as
live, interactive displays alongside the code.

The documentation is generated using MkDocs, which uses a syntax highlighter to
convert the markdown code blocks into colorized `<code>` elements, which the
`<genome-spy-doc-embed>` element then transforms into interactive visualizations.

## Example

````
<div><genome-spy-doc-embed height="200">

```json
{
  "data": { "url": "sincos.csv" },
  "transform": [
    { "type": "formula", "expr": "abs(datum.sin)", "as": "abs(sin)" }
  ],
  "mark": "point",
  "encoding": {
    "x": { "field": "x", "type": "quantitative" },
    "y": { "field": "abs(sin)", "type": "quantitative" },
    "size": { "field": "x", "type": "quantitative" }
  }
}
```

</genome-spy-doc-embed></div>
````
