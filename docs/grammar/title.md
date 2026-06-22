# Titles

View titles label complete views, tracks, and composed layouts. A title can be
given as a string shorthand or as a title object:

```json title="String title shorthand"
{
  "title": "Copy number"
}
```

```json title="Title object"
{
  "title": {
    "text": "Copy number",
    "subtitle": "Segment mean",
    "orient": "top",
    "anchor": "start"
  }
}
```

### Example

EXAMPLE examples/docs/grammar/title/basic-title.json height=240

## Placement

The `orient` property controls the side of the plot area where the title is
placed. Supported orientations are:

- `top`
- `right`
- `bottom`
- `left`
- `none`

The `anchor` property controls the title position along that side. For example,
with `orient: "top"`, `anchor: "start"` places the title near the left edge,
`"middle"` centers it, and `"end"` places it near the right edge.

## Reserved and overlay titles

By default, titles reserve layout space on the side indicated by `orient`.
Reserved titles are placed outside axes, legends, and other guide space on the
same side.

Set `reserve` to `false` when the title should render without affecting layout.
This enables overlay-style layouts where the title can overlap nearby content or
the plot area.

The `frame` property controls the reference frame used for the title anchor:

- `"group"` anchors the title along the plot area.
- `"bounds"` anchors the title along the full reserved area of the view.

Overlay titles commonly use `reserve: false` and `frame: "group"` so that the
title is positioned relative to the plot area but does not reserve extra space.

## Subtitles

Use `subtitle` to add secondary title text. Subtitles share the same orientation
and anchor as the main title. `subtitlePadding` controls the spacing between the
main title and subtitle.

Subtitle styling can be configured separately with properties such as
`subtitleColor`, `subtitleFontSize`, and `subtitleFontWeight`.

The default subtitle text style comes from the built-in `"group-subtitle"`
style. Override `config.style["group-subtitle"]` to change subtitle defaults
without changing main title text.

## Styling

Title defaults come from `config.title` and from named styles in `config.style`.
If `title.style` is omitted, GenomeSpy applies the built-in `"group-title"`
style. See [Config and Themes](./config.md) for more about configuration scopes
and named styles.

GenomeSpy includes built-in title styles for common layout patterns:

- `"group-title"` for ordinary view and group titles
- `"track-title"` for compact track labels
- `"overlay-title"` for titles drawn over the plot area

EXAMPLE examples/docs/grammar/title/title-styles.json height=280

Named styles can be referenced with `title.style`:

```json
{
  "title": {
    "text": "Custom title",
    "style": "custom-title"
  },
  "config": {
    "style": {
      "custom-title": {
        "fontSize": 18,
        "fontWeight": "bold",
        "color": "#4a90e2"
      }
    }
  }
}
```

Use `config.title` for defaults that apply to all titles in a configuration
scope:

```json
{
  "config": {
    "title": {
      "fontSize": 13,
      "subtitleFontSize": 11,
      "subtitlePadding": 4
    }
  }
}
```

## Properties

SCHEMA Title

### Config Properties

SCHEMA TitleConfig
