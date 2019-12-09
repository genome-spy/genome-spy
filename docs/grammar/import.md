# Importing Views

TODO: Elaborate the concept of tracks and `concat`

GenomeSpy facilitates reusing views by allowing them to be imported from
external specification files. The files can be placed flexibly – it may be
practical to split large specifications into multiple files and put them in
the same directory. On the other hand, if you have created, for example, an
annotation track that you would like the share with the research community,
you can upload the specification file and the associated data to a publicly
accessible web server.

### Importing named tracks

GenomeSpy provides a few built-in tracks, mainly to support genomic data
exploration. They must be imported by a name. Read more at [genome
tracks](../genomic-data/tracks.md).

Usage:

```json
{
  ...,
  "concat": [
    ...,
    { "import": { "name": "cytobands" } }
  ]
}
```

### Importing from a URL

You can also import views from relative or absolute URLs. Relative URLs
are imported with respect to the current TODO: [baseUrl](TODO!).

The imported specification may contain a single, concatenated, or layered
view. The baseUrl of the imported specification is updated to match its
directory. Thus, you can publish a track by placing its specification and
data available in the same directory on a web server.

Usage:

```json
{
  ...,
  "concat": [
    ...,
    { "import": { "url": "includes/annotations.json" } },
    { "import": { "url": "https://genomespy.app/tracks/cosmic/census_hg38.json" } }
  ]
}
```
