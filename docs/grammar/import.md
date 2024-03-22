# Importing Views

GenomeSpy facilitates reusing views by allowing them to be imported from the
same specification by name or from external specification files by a URL. The
files can be placed flexibly – it may be practical to split large specifications
into multiple files and place them in the same directory. On the other hand, if
you have created, for example, an annotation track that you would like the share
with the research community, you can upload the specification file and the
associated data to a publicly accessible web server. The imported views, both
named and URLs, can be parameterized to allow for customization.

## Properties

SCHEMA ImportSpec

### UrlImport

SCHEMA UrlImport

### TemplateImport

SCHEMA TemplateImport

## Importing from a URL

Views can be imported from relative and absolute URLs. Relative URLs are
imported with respect to the current [`baseUrl`](./index.md#properties).

The imported specification may contain a single, concatenated, or layered view.
The `baseUrl` of the imported specification is updated to match the directory of
the imported specification. Thus, you can publish a view (or a track as known in
genome browsers) by placing its specification and data available in the same
directory on a web server.

The URL import supports parameters, which are described below within the
[named templates](#repeating-with-named-templates).

```json title="Example"
{
  ...,
  "vconcat": [
    ...,
    { "import": { "url": "includes/annotations.json" } },
    { "import": { "url": "https://example.site/tracks/annotations.json" } }
  ]
}
```

## Repeating with named templates

Instead of importing from external files, views can offer named `templates` for
reuse by their descendants. In the example below, the provided specification
features a template called "myTrack," which is applied twice, each instance with
a unique set of parameters. The imported view can access the parameters using
[expressions](./expressions.md). This approach enables the modification of
visual elements through parameter changes, streamlining the creation of varied
visualizations from a single template without the need to duplicate the base
specification fragment.

<div><genome-spy-doc-embed height="250">

```json
{
  "vconcat": [
    {
      "import": {
        "template": "myTrack"
      },
      "params": [{ "name": "size", "value": 5 }]
    },
    {
      "import": {
        "template": "myTrack"
      },
      "params": { "offset": 3.141, "size": 20 }
    }
  ],
  "templates": {
    "myTrack": {
      "params": [
        { "name": "offset", "value": 0 },
        { "name": "size", "value": 10 }
      ],
      "data": {
        "sequence": { "start": 0, "stop": 20, "step": 0.2, "as": "x" }
      },
      "transform": [
        { "type": "formula", "expr": "sin(datum.x + offset)", "as": "y" }
      ],
      "mark": "point",
      "encoding": {
        "size": { "value": { "expr": "size" } },
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "y", "type": "quantitative" }
      }
    }
  }
}
```

</genome-spy-doc-embed></div>
