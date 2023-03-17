# Importing Views

GenomeSpy facilitates reusing views by allowing them to be imported from
external specification files. The files can be placed flexibly – it may be
practical to split large specifications into multiple files and place them in
the same directory. On the other hand, if you have created, for example, an
annotation track that you would like the share with the research community, you
can upload the specification file and the associated data to a publicly
accessible web server.

### Importing from a URL

Views can be imported from relative and absolute URLs. Relative URLs are
imported with respect to the current [`baseUrl`](./index.md#properties).

The imported specification may contain a single, concatenated, or layered view.
The `baseUrl` of the imported specification is updated to match the directory of
the imported specification. Thus, you can publish a view (or a track as known in
genome browsers) by placing its specification and data available in the same
directory on a web server.

```json title="Example"
{
  ...,
  "vconcat": [
    ...,
    { "import": { "url": "includes/annotations.json" } },
    { "import": { "url": "https://genomespy.app/tracks/cosmic/census_hg38.json" } }
  ]
}
```

### Importing named tracks

!!! missing "Currently unsupported"

    Named imports are currently not supported. Will be back at some point.
