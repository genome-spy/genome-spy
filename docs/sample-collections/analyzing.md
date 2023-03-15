# Analyzing Sample Collections

!!! note "End-User Documentation"

    This page is mainly intended for end users who analyze sample collections
    interactively using the GenomeSpy app.

## Elements of the user interface

Because GenomeSpy visualizations are highly customizable, the actual
visualization and the available user-interface elements may differ significantly
from the one shown below.

![User interface](../img/app-ui.webp)

1. **Location / search field** shows the genomic coordinates of the current viewport
   in a UCSC-style format. You can look up features such as gene symbols using the
   field. In addition, you can filter the sample collection by categorical
   metadata attibutes by typing a categorical value into this field.
2. **Undo history and provenance** allows you to undo and redo actions performed on the
   sample collections. The (:fontawesome-solid-ellipsis:) button shows
   all perfomed actions and serves as provenance information when you view a bookmarked
   visualization state.
3. **View visibility menu** allows for toggling the visibility of elements such as
   metadata attributes or annotation tracks.
4. **Bookmark menu** shows a list of pre-defined bookmarks and allows you to save
   the visualization state as a local bookmark into your web browser. The adjacent share
   button constructs a shareable URL, which captures the visualization state and optional
   notes related to the current visualization state.
5. **Fullscreen toggle** opens the visualization in fullscreen mode
6. **Group markers** become visible when the sample collection has been stratified
   using some attribute.
7. **Sample names** identify the samples.
8. **Metadata** such as clinical attributes or computed variables shown as a heatmap.
9. **Genomic data** is shown here.

## Interactions

### Navigating around the genome

![Mouse and touchpad](../img/mouse-and-touchpad.svg){ align="right" style="width: 45%; max-width: 350px"}

To navigate around the genome in GenomeSpy, you can use either a mouse or a
touchpad. If you're using a mouse, you can zoom the genome axis in and out using
the scroll wheel. To pan the view, click with the left mouse button and start
dragging.

If you're using a touchpad, you can zoom the genome axis by performing a
vertical two-finger gesture. Similarly, you can pan the view by performing a
horizontal gesture.

### Peeking samples

The GenomeSpy app is designed for the exploration of large datasets containing
hundreds or thousands of samples. To provide a better overview of patterns
across the entire sample collection, GenomeSpy displays the samples as a bird's
eye view that fits them into the available vertical space. If you discover
interesting patterns or outliers in the dataset, you can peek individual samples
by activating a close-up view from the context menu or by pressing the ++e++ key
on the keyboard.

Once the close-up view is activated, the zooming interaction will change to
vertical scrolling. However, you can still zoom in and out by holding down the
++ctrl++ key while operating the mouse wheel or touchpad.

<video autoplay muted controls>
  <source src="../../img/peeking.mp4" type="video/mp4">
</video>

### Manipulating the sample collection

Samples can be interactively sorted by sample-specific attributes and the
actual data.

- Abstract attributes
- Actions
- The form undo history and provenance

#### By sample-specific attributes

You can sort the samples by clicking the labels of the attributes.

#### By the actual data

TODO

#### Sorting

TODO

#### Filtering

TODO

#### Grouping

TODO

## Bookmarking and sharing

TODO

### Bookmarks

TODO

### Sharing

TODO
