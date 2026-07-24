# Configuring App Features

!!! note "Developer Documentation"

    This page is intended for users who develop tailored visualizations
    using the GenomeSpy app.

This page describes configuration for interactive App features. For the
corresponding end-user workflows, see
[Analyzing Sample Collections](analyzing.md).

## Bookmarking

The GenomeSpy app can save visualization state, including scale domains and view
visibilities, as bookmarks. Bookmarks are stored in the web browser's
[IndexedDB](https://developer.mozilla.org/en-US/docs/Glossary/IndexedDB) and are
unique to the visualization's [origin](https://developer.mozilla.org/en-US/docs/Glossary/Origin).
Give each visualization a unique `specId` to enable local bookmarks:

```json
{
  "specId": "My example visualization",

  "vconcat": { ... },
  ...
}
```

### Pre-defined bookmarks and tours

Remote bookmarks are stored in a JSON file on a web server and appear in the
bookmark menu. Enable `tour` to open the first bookmark automatically and let
users navigate through the bookmark file.

```json title="View specification"
{
  "bookmarks": {
    "remote": {
      "url": "tour.json",
      "tour": true
    }
  },

  "vconcat": { ... },
  ...
}
```

The `remote` object accepts the following properties:

APP_SCHEMA RemoteBookmarkConfig url initialBookmark tour afterTourBookmark

### Bookmark files

A remote bookmark file is an array of bookmark objects. Create a bookmark in
the app and choose _Share_ from its submenu
(:fontawesome-solid-ellipsis-vertical:) to copy it as a JSON object.

```json title="Bookmark file (tour.json)"
[
  {
    "name": "First bookmark",
    "actions": [ ... ],
    ...
  },
  {
    "name": "Second bookmark",
    "actions": [ ... ],
    ...
  }
]
```

!!! tip "Providing an initial state"

    Create a bookmark with the desired actions and viewport, then set
    `initialBookmark` to its name.

## Toggleable view visibility

GenomeSpy App can let users toggle visibility of nodes in the view hierarchy.
The visibility state is included in shareable links and bookmarks.

Toggleable views need an explicit unique `name`. GenomeSpy uses the name to
address visibility state in bookmarks and shared state.

Views have two properties for controlling visibility:

APP_SCHEMA AppUnitSpec visible configurableVisibility

Use object-form `configurableVisibility` to make views mutually exclusive in the
menu. Views that share a `group` in the same import scope are radio buttons:

```json
{
  "name": "rawCoverage",
  "configurableVisibility": { "group": "coverageMode" },
  ...
}
```

## Actions

The app provides context-menu actions for sorting, filtering, grouping, and
other sample-collection operations. See
[Analyzing Sample Collections](analyzing.md#manipulating-the-sample-collection)
for the available actions and how users access them.

Actions also require each view to have an explicit unique `name`. GenomeSpy uses
the name to address a view in action definitions and to replay actions from
bookmarks, shared state, and provenance history.

## Search

The toolbar's location/search field can navigate to features in the data. Use
the `search` channel on marks that represent searchable data objects.

`search` accepts a field definition or an array of field definitions. A datum
matches when any configured field matches the entered term case-insensitively.

```json title="One searchable field"
{
  ...,
  "mark": "rect",
  "encoding": {
    "search": { "field": "geneSymbol" },
    ...
  },
  ...
}
```

```json title="Several searchable fields"
{
  ...,
  "mark": "rect",
  "encoding": {
    "search": [
      { "field": "geneSymbol" },
      { "field": "geneId" },
      { "field": "alias" }
    ],
    ...
  },
  ...
}
```
