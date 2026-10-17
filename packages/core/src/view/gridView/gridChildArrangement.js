import { ORIENT_CHANNELS } from "../axisView.js";
import { arrangeLocalLegends } from "./legendLayout.js";
import {
    clipCoords,
    combineClipOptions,
    createClipOptions,
    getViewClipFlags,
    normalizeClipOptions,
} from "../renderingContext/clipOptions.js";

/** @typedef {import("../view.js").default} View */
/** @typedef {import("../axisView.js").default} AxisView */
/**
 * @typedef {object} GridChildPlacement
 * @prop {import("./gridChild.js").default} gridChild
 * @prop {import("../layout/rectangle.js").default} containerCoords
 * @prop {import("../layout/rectangle.js").default} viewportCoords
 * @prop {import("../layout/rectangle.js").default} viewCoords
 * @prop {import("./gridChild.js").default["axes"]} [axes] Axes drawn for this placement.
 */

// Secondary ordering within a z-index bucket for grid and facet decorations.
// These are not z-indices themselves: actual layering is decided first by the
// decoration's zindex (underlay vs overlay relative to content), and these
// values are only used as tie-break phases among decorations in the same batch.
export const DECORATION_ORDER = Object.freeze({
    background: 0,
    separator: 10,
    grid: 20,
    backgroundStroke: 30,
    axis: 40,
    legend: 50,
    selectionRect: 80,
    ruler: 82,
    scrollbar: 90,
    title: 100,
});

// Default z-index for axes and view strokes when the content is clipped or
// scrollable. This keeps guides above content-edge artifacts while still
// letting an explicit user zindex override the default.
const CLIPPED_DECORATION_ZINDEX = 10;

/**
 * Selects the outer axes, including the exposed edges of an incomplete row.
 *
 * @param {AxisView[]} axes
 * @param {number} column
 * @param {number} row
 * @param {import("../layout/grid.js").default} grid
 * @returns {import("./gridChild.js").default["axes"]}
 */
export function getOuterAxes(axes, column, row, grid) {
    return Object.fromEntries(
        axes
            .filter(({ axisProps: { orient } }) => {
                switch (orient) {
                    case "left":
                        return column === 0;
                    case "right":
                        return grid.getCellIndex(column + 1, row) === undefined;
                    case "top":
                        return row === 0;
                    case "bottom":
                        return grid.getCellIndex(column, row + 1) === undefined;
                    default:
                        throw new Error("Unknown axis orientation: " + orient);
                }
            })
            .map((axis) => [axis.axisProps.orient, axis])
    );
}

/** Orders local and container decorations around their content placements. */
export function createGridArrangement() {
    /** @type {{ zindex: number, order: number, sequence: number, arrange: () => void }[]} */
    const underlays = [];
    /** @type {{ zindex: number, order: number, sequence: number, arrange: () => void }[]} */
    const overlays = [];
    /** @type {{ zindex: number, arrange: () => void }[]} */
    const contents = [];
    // Repeated facet cells share mark semantics within this arrangement.
    /** @type {WeakMap<View, ReturnType<typeof getViewClipFlags>>} */
    const clipFlags = new WeakMap();
    let sequence = 0;

    const queueDecoration = (
        /** @type {number} */ zindex,
        /** @type {number} */ order,
        /** @type {() => void} */ arrange
    ) => {
        const target = zindex > 0 ? overlays : underlays;
        target.push({
            zindex,
            order,
            sequence: sequence++,
            arrange,
        });
    };

    const arrangeDecorations = (
        /** @type {{ zindex: number, order: number, sequence: number, arrange: () => void }[]} */ items
    ) => {
        items.sort(
            (a, b) =>
                a.zindex - b.zindex ||
                a.order - b.order ||
                a.sequence - b.sequence
        );

        for (const item of items) {
            item.arrange();
        }
    };

    return {
        queueDecoration,
        /** @param {View} view */
        getClipFlags(view) {
            let flags = clipFlags.get(view);
            if (!flags) {
                flags = getViewClipFlags(view);
                clipFlags.set(view, flags);
            }
            return flags;
        },
        /** @param {number} zindex @param {() => void} arrange */
        queueContent(zindex, arrange) {
            contents.push({ zindex, arrange });
        },
        arrange() {
            arrangeDecorations(underlays);

            for (const content of contents.toSorted(
                (a, b) => a.zindex - b.zindex
            )) {
                content.arrange();
            }

            arrangeDecorations(overlays);
        },
    };
}

/**
 * Queues one placement of a child and its local chrome. Ownership stays with
 * the caller so a facet can place the same child at multiple coordinates.
 *
 * @param {import("../renderingContext/viewRenderingContext.js").default} context
 * @param {GridChildPlacement} item
 * @param {import("../../types/rendering.js").RenderingOptions} options
 * @param {ReturnType<typeof createGridArrangement>} queue
 * @param {import("./gridChild.js").default["axes"]} [legendAxes]
 * @returns {boolean} Whether clipping raises the default guide z-index.
 */
export function queueGridChild(
    context,
    item,
    options,
    queue,
    legendAxes = item.axes ?? item.gridChild.axes
) {
    const {
        gridChild,
        viewportCoords,
        viewCoords,
        containerCoords: coords,
    } = item;
    const { queueDecoration } = queue;
    const parentClip = normalizeClipOptions(options);
    const visibleChildCoords = clipCoords(viewportCoords, parentClip);
    const scrollable = gridChild.view.isScrollable();

    const { background } = gridChild;
    if (background) {
        queueDecoration(
            gridChild.backgroundZindex,
            DECORATION_ORDER.background,
            () =>
                background.arrange(context, visibleChildCoords, {
                    ...options,
                    clipRect: undefined,
                })
        );
    }

    const {
        view,
        gridLines,
        backgroundStroke,
        title,
        selectionRect,
        rulerOverlays,
    } = gridChild;
    const axes = item.axes ?? gridChild.axes;

    const { all: clippedChildren, any: anyClippedChildren } =
        queue.getClipFlags(view);
    const clipped = clippedChildren || scrollable;
    const clippedDecorations = anyClippedChildren || scrollable;

    for (const gridLineView of Object.values(gridLines)) {
        queueDecoration(
            gridLineView.axisProps.zindex ?? 0,
            DECORATION_ORDER.grid,
            () => gridLineView.arrange(context, viewportCoords, options)
        );
    }

    const childClip = clipped
        ? combineClipOptions(
              parentClip,
              createClipOptions(
                  visibleChildCoords,
                  clippedChildren || Boolean(gridChild.scrollbars.horizontal),
                  clippedChildren || Boolean(gridChild.scrollbars.vertical)
              )
          )
        : options.clip;

    const arrangeContent = () =>
        view.arrange(
            context,
            viewCoords,
            clipped
                ? {
                      ...options,
                      clipRect: childClip?.rect,
                      clip: childClip,
                  }
                : options
        );

    queue.queueContent(view.getZindex(), arrangeContent);

    if (backgroundStroke) {
        queueDecoration(
            defaultBackgroundStrokeZindex(
                gridChild.backgroundStrokeZindex,
                clippedDecorations
            ),
            DECORATION_ORDER.backgroundStroke,
            () =>
                backgroundStroke.arrange(context, visibleChildCoords, {
                    ...options,
                    clipRect: undefined,
                })
        );
    }

    // Independent axes
    for (const [orient, axisView] of Object.entries(axes)) {
        const direction =
            orient == "left" || orient == "right" ? "vertical" : "horizontal";

        const scrollable = gridChild.scrollbars[direction];

        // Axes should stick to the viewport edge but move with the view
        // when scrolling.
        const coords = scrollable
            ? viewportCoords.modify(
                  direction == "vertical"
                      ? {
                            y: () => viewCoords.y,
                            height: viewCoords.height,
                        }
                      : {
                            x: () => viewCoords.x,
                            width: viewCoords.width,
                        }
              )
            : gridChild.getAxisCoords(viewportCoords);

        const translatedCoords = translateAxisCoords(coords, orient, axisView);

        let clip = normalizeClipOptions(options);
        let clipRect = clip?.rect;

        // Scrollable axes must be clipped along the scroll direction.
        if (scrollable) {
            const axisClip = createClipOptions(
                viewportCoords,
                direction == "horizontal",
                direction == "vertical"
            );
            clip = combineClipOptions(clip, axisClip);
            clipRect = clip?.rect;
        }

        if (clip && axisView.labelClipPolicy === "anchor") {
            clip = createClipOptions(
                clip.rect,
                ORIENT_CHANNELS[orient] === "x",
                ORIENT_CHANNELS[orient] === "y"
            );
            clipRect = clip?.rect;
        }

        queueDecoration(
            defaultAxisZindex(axisView.axisProps, clippedDecorations),
            DECORATION_ORDER.axis,
            () =>
                axisView.arrange(context, translatedCoords, {
                    ...options,
                    clipRect,
                    clip,
                })
        );
    }

    arrangeLocalLegends(
        gridChild.legends,
        legendAxes,
        viewportCoords,
        context,
        options,
        queueDecoration,
        DECORATION_ORDER.legend
    );

    if (selectionRect) {
        queueDecoration(
            selectionRect.zindex,
            DECORATION_ORDER.selectionRect,
            () => selectionRect.view.arrange(context, viewCoords, options)
        );
    }

    for (const overlay of rulerOverlays) {
        queueDecoration(overlay.zindex, DECORATION_ORDER.ruler, () =>
            overlay.view.arrange(context, viewCoords, options)
        );
    }

    for (const scrollbar of Object.values(gridChild.scrollbars)) {
        queueDecoration(1, DECORATION_ORDER.scrollbar, () => {
            scrollbar.updateScrollbar(viewportCoords, viewCoords);
            scrollbar.arrange(context, coords, options);
        });
    }

    if (title) {
        queueDecoration(
            gridChild.getTitleZindex(),
            DECORATION_ORDER.title,
            () => gridChild.arrangeTitle(context, viewportCoords, options, axes)
        );
    }

    return clippedDecorations;
}

/**
 * Default z-index for axes. Inside axes default to overlays because they share
 * plot space with marks. Clipped or scrollable outside axes get a higher
 * default to keep guides above visible edge artifacts.
 *
 * @param {import("../../spec/axis.js").Axis} axisProps
 * @param {boolean} clipped
 * @returns {number}
 */
export function defaultAxisZindex(axisProps, clipped) {
    if (axisProps.zindex !== undefined) {
        return axisProps.zindex;
    } else if (axisProps.placement === "inside") {
        return 1;
    } else if (clipped) {
        return CLIPPED_DECORATION_ZINDEX;
    } else {
        return 0;
    }
}

/**
 * Default z-index for view strokes. Clipped or scrollable content gets a
 * higher default to keep the stroke above visible edge artifacts.
 *
 * @param {number | undefined} zindex
 * @param {boolean} clipped
 * @returns {number}
 */
function defaultBackgroundStrokeZindex(zindex, clipped) {
    return zindex ?? (clipped ? CLIPPED_DECORATION_ZINDEX : 0);
}

/**
 *
 * @param {import("../layout/rectangle.js").default} coords
 * @param {import("../../spec/axis.js").AxisOrient} orient
 * @param {AxisView} axisView
 */
export function translateAxisCoords(coords, orient, axisView) {
    const props = axisView.axisProps;
    const ps = axisView.getPerpendicularSize();
    const inside = props.placement === "inside";
    const offset = props.offset ?? 0;

    if (orient == "bottom") {
        return inside
            ? coords.translate(0, coords.height - ps - offset).modify({
                  height: ps,
              })
            : coords.translate(0, coords.height + offset).modify({
                  height: ps,
              });
    } else if (orient == "top") {
        return inside
            ? coords.translate(0, offset).modify({ height: ps })
            : coords.translate(0, -ps - offset).modify({ height: ps });
    } else if (orient == "left") {
        return inside
            ? coords.translate(offset, 0).modify({ width: ps })
            : coords.translate(-ps - offset, 0).modify({ width: ps });
    } else if (orient == "right") {
        return inside
            ? coords.translate(coords.width - ps - offset, 0).modify({
                  width: ps,
              })
            : coords.translate(coords.width + offset, 0).modify({ width: ps });
    }
}
