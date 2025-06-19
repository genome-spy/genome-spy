/* eslint-disable max-depth */
import { primaryPositionalChannels } from "../../encoder/encoder.js";
import {
    FlexDimensions,
    getLargestSize,
    mapToPixelCoords,
    parseSizeDef,
    ZERO_SIZEDEF,
} from "../layout/flexLayout.js";
import Grid from "../layout/grid.js";
import Padding from "../layout/padding.js";
import Rectangle from "../layout/rectangle.js";
import AxisView, { CHANNEL_ORIENTS, ORIENT_CHANNELS } from "../axisView.js";
import ContainerView from "../containerView.js";
import LayerView from "../layerView.js";
import UnitView from "../unitView.js";
import { interactionToZoom } from "../zoom.js";
import GridChild from "./gridChild.js";

/**
 * Modeled after: https://vega.github.io/vega/docs/layout/
 *
 * This should take care of the following:
 * - Composition: [hv]concat / facet / repeat
 * - Views
 * - Axes
 * - Grid lines
 * - View background
 * - View titles
 * - Facet (column / row) titles
 * - Header / footer
 * - Zoom / pan
 * - Scrollable viewports (with scrollbars)
 * - And later on, brushing, legend(?)
 */
export default class GridView extends ContainerView {
    /**
     * @typedef {"row" | "column"} Direction
     * @typedef {"horizontal" | "vertical"} ScrollDirection
     *
     * @typedef {import("../view.js").default} View
     */

    /** */
    #columns = Infinity;

    #spacing = 10;

    /**
     * @type { GridChild[] }
     */
    #children = [];

    /**
     * Note: shared axes are not included in #children because we have to handle
     * toggleable view visibilities. For example, if the bottom view is suddenly hidden,
     * the axis should be shown in the view that takes its place as the new bottom view.
     *
     * @type { Partial<Record<import("../../spec/channel.js").PrimaryPositionalChannel, AxisView>> } }
     */
    #sharedAxes = {};

    #childSerial = 0;

    /**
     *
     * @param {import("../../spec/view.js").AnyConcatSpec} spec
     * @param {import("../../types/viewContext.js").default} context
     * @param {ContainerView} layoutParent
     * @param {View} dataParent
     * @param {string} name
     * @param {number} columns
     * @param {import("../view.js").ViewOptions} [options]
     */
    constructor(
        spec,
        context,
        layoutParent,
        dataParent,
        name,
        columns,
        options
    ) {
        super(spec, context, layoutParent, dataParent, name, options);
        this.spec = spec;

        this.#spacing = spec.spacing ?? 10;
        this.#columns = columns;

        this.#children = [];

        this.wrappingFacet = false;
    }

    /**
     * @param {View} view
     */
    appendChild(view) {
        view.layoutParent ??= this;
        this.#children.push(new GridChild(view, this, this.#childSerial));
        this.#childSerial++;
    }

    get #visibleChildren() {
        return this.#children.filter((gridChild) =>
            gridChild.view.isConfiguredVisible()
        );
    }

    get #grid() {
        return new Grid(
            this.#visibleChildren.length,
            this.#columns ?? Infinity
        );
    }

    /**
     * @param {View[]} views
     */
    setChildren(views) {
        this.#children = [];
        for (const view of views) {
            this.appendChild(view);
        }
    }

    /**
     * @param {View} child
     * @param {View} replacement
     */
    replaceChild(child, replacement) {
        const i = this.#children.findIndex(
            (gridChild) => gridChild.view == child
        );
        if (i >= 0) {
            this.#children[i] = new GridChild(
                replacement,
                this,
                this.#childSerial
            );
        } else {
            throw new Error("Not my child view!");
        }
    }

    /**
     * Read-only view to children
     */
    get children() {
        return this.#children.map((gridChild) => gridChild.view);
    }

    get childCount() {
        return this.#children.length;
    }

    /**
     * @protected
     */
    async createAxes() {
        /** @type {Promise<void>[]} */
        const promises = [];

        // Axis ticks, labels, etc. They should be created only if this view has caught
        // the scale resolution for the channel.
        for (const channel of primaryPositionalChannels) {
            const r = this.resolutions.axis[channel];
            if (r) {
                const props = r.getAxisProps();
                if (props) {
                    const propsWithDefaults = {
                        title: r.getTitle(),
                        orient: CHANNEL_ORIENTS[channel][0],
                        ...props,
                    };
                    // TODO: Validate that channel and orient are compatible
                    const v = new AxisView(
                        propsWithDefaults,
                        r.scaleResolution.type,
                        this.context,
                        this,
                        this
                    );
                    promises.push(v.initializeChildren());
                    this.#sharedAxes[channel] = v;
                }
            }
        }

        // Create view decorations, grid lines, and independent axes for each child
        return Promise.all([
            ...promises,
            ...this.#children.map((gridChild) => gridChild.createAxes()),
        ]);
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        for (const gridChild of this.#children) {
            yield* gridChild.getChildren();
        }

        for (const axisView of Object.values(this.#sharedAxes)) {
            yield axisView;
        }
    }

    /**
     * @param {Direction} direction
     */
    #getSizes(direction) {
        const dim = direction == "column" ? "width" : "height";

        /**
         * @type {(indices: number[], side: 0 | 1) => number}
         */
        const getMaxAxisSize = (indices, side) =>
            indices
                .map((index) => {
                    const child = this.#visibleChildren[index];
                    const overhang = child.getOverhangAndPadding();

                    return direction == "column"
                        ? side
                            ? overhang.right
                            : overhang.left
                        : side
                          ? overhang.bottom
                          : overhang.top;
                })
                .reduce((a, b) => Math.max(a, b), 0);

        return this._cache(`size/directionSizes/${direction}`, () =>
            this.#grid[direction == "column" ? "colIndices" : "rowIndices"].map(
                (col) => ({
                    axisBefore: getMaxAxisSize(col, 0),
                    axisAfter: getMaxAxisSize(col, 1),
                    view: getLargestSize(
                        col.map(
                            (rowIndex) =>
                                this.#visibleChildren[
                                    rowIndex
                                ].view.getViewportSize()[dim]
                        )
                    ),
                })
            )
        );
    }

    /**
     * An example layout with two children, either column or row-based direction:
     *
     * 0. title
     * 1. header
     * 2. axis/padding
     * 3. view
     * 4. axis/padding
     * 5. footer (if column and wrapping)
     * 5. spacing
     * 6. header (if column and wrapping)
     * 7. axis/padding
     * 8. view
     * 9. axis/padding
     * 10. footer
     *
     * @param {Direction} direction
     */
    #makeFlexItems(direction) {
        const sizes = this.#getSizes(direction);

        /** @type {import("../layout/flexLayout.js").SizeDef[]} */
        const items = [];

        // Title
        items.push(ZERO_SIZEDEF);

        for (const [i, size] of sizes.entries()) {
            if (i > 0) {
                // Spacing
                items.push({ px: this.#spacing, grow: 0 });
            }

            if (i == 0 || this.wrappingFacet) {
                // Header
                items.push(ZERO_SIZEDEF);
            }

            // Axis/padding
            items.push({ px: size.axisBefore, grow: 0 });

            // View
            items.push(size.view);

            // Axis/padding
            items.push({ px: size.axisAfter, grow: 0 });

            if (i == sizes.length - 1 || this.wrappingFacet) {
                //Footer
                items.push(ZERO_SIZEDEF);
            }
        }

        return items;
    }

    /**
     * @param {Direction} direction
     * @return {import("../layout/flexLayout.js").SizeDef}
     */
    #getFlexSize(direction) {
        let grow = 0;
        let px = 0;

        const explicitSize =
            direction == "row" ? this.spec.height : this.spec.width;
        if (explicitSize || explicitSize === 0) {
            return parseSizeDef(explicitSize);
        }

        const sizes = this.#getSizes(direction);

        for (const [i, size] of sizes.entries()) {
            if (i > 0) {
                // Spacing
                px += this.#spacing;
            }

            if (i == 0 || this.wrappingFacet) {
                // Header
                px += 0;
            }

            // Axis/padding
            px += size.axisBefore;

            // View
            px += size.view.px ?? 0;
            grow += size.view.grow ?? 0;

            // Axis/padding
            px += size.axisAfter;

            if (i == sizes.length - 1 || this.wrappingFacet) {
                //Footer
                px += 0;
            }
        }

        return { px, grow };
    }

    /**
     * Locates a view slot in FlexLayout
     *
     * @param {Direction} direction
     * @param {number} index column/row number
     */
    #getViewSlot(direction, index) {
        return direction == "row" && this.wrappingFacet
            ? // Views have header/footer on every row
              1 + 6 * index + 2
            : // Only first row has header, last row has footer.
              2 + 4 * index + 1;
    }

    /**
     * @return {Padding}
     */
    getOverhang() {
        return this.#getGridOverhang().union(this.#getSharedAxisOverhang());
    }

    #getGridOverhang() {
        const cols = this.#getSizes("column");
        const rows = this.#getSizes("row");

        if (!cols.length || !rows.length) {
            return Padding.zero();
        }

        return new Padding(
            rows.at(0).axisBefore,
            cols.at(-1).axisAfter,
            rows.at(-1).axisAfter,
            cols.at(0).axisBefore
        );
    }

    #getSharedAxisOverhang() {
        /**
         * @param {import("../../spec/axis.js").AxisOrient} orient
         */
        const getSharedAxisSize = (orient) => {
            const channel = ORIENT_CHANNELS[orient];
            const axisView = this.#sharedAxes[channel];
            if (axisView?.axisProps.orient !== orient) {
                return 0;
            }

            return Math.max(
                axisView.getPerpendicularSize() +
                    (axisView.axisProps.offset ?? 0),
                0
            );
        };

        return new Padding(
            getSharedAxisSize("top"),
            getSharedAxisSize("right"),
            getSharedAxisSize("bottom"),
            getSharedAxisSize("left")
        );
    }

    /**
     * @returns {FlexDimensions}
     */
    getSize() {
        return this._cache("size", () =>
            new FlexDimensions(
                this.#getFlexSize("column"),
                this.#getFlexSize("row")
            ).addPadding(this.#getSharedAxisOverhang())
        );
    }

    /**
     * @param {import("../renderingContext/viewRenderingContext.js").default} context
     * @param {import("../layout/rectangle.js").default} coords
     * @param {import("../../types/rendering.js").RenderingOptions} [options]
     */
    // eslint-disable-next-line complexity
    render(context, coords, options = {}) {
        super.render(context, coords, options);

        if (!this.isConfiguredVisible()) {
            return;
        }

        if (!this.layoutParent) {
            // Usually padding is applied by the parent GridView, but if this is the root view, we need to apply it here
            coords = coords.shrink(this.getPadding());
        }
        coords = coords.shrink(this.#getSharedAxisOverhang());

        context.pushView(this, coords);

        const flexOpts = {
            devicePixelRatio: this.context.devicePixelRatio,
        };
        const columnFlexCoords = mapToPixelCoords(
            this.#makeFlexItems("column"),
            coords.width,
            flexOpts
        );

        const rowFlexCoords = mapToPixelCoords(
            this.#makeFlexItems("row"),
            coords.height,
            flexOpts
        );

        const grid = new Grid(
            this.#visibleChildren.length,
            this.#columns ?? Infinity
        );

        /** @param {number} x */
        const round = (x) =>
            Math.round(x * devicePixelRatio) / devicePixelRatio;

        for (const [i, gridChild] of this.#visibleChildren.entries()) {
            const {
                view,
                axes,
                gridLines,
                background,
                backgroundStroke,
                title,
                selectionRect,
            } = gridChild;

            const [col, row] = grid.getCellCoords(i);
            const colLocSize =
                columnFlexCoords[this.#getViewSlot("column", col)];
            const rowLocSize = rowFlexCoords[this.#getViewSlot("row", row)];

            const viewportSize = view.getViewportSize();
            const viewSize = view.getSize();

            const overhang = view.getOverhang();

            const x = colLocSize.location - overhang.left;
            const y = rowLocSize.location - overhang.top;

            // TODO: Optimize for cases where viewportSize and viewSize have equal identity

            /**
             * @param {FlexDimensions} size
             * @param {"width" | "height"} dimension
             */
            const getLen = (size, dimension) =>
                (size[dimension].grow
                    ? (dimension == "width" ? colLocSize : rowLocSize).size
                    : size[dimension].px) + overhang[dimension];

            const viewportWidth = getLen(viewportSize, "width");
            const viewportHeight = getLen(viewportSize, "height");
            const viewWidth = getLen(viewSize, "width");
            const viewHeight = getLen(viewSize, "height");

            const hScrollbar = gridChild.scrollbars.horizontal;
            const vScrollbar = gridChild.scrollbars.vertical;

            const getHScrollOffset = hScrollbar
                ? () => round(hScrollbar.viewportOffset)
                : () => 0;
            const getVScrollOffset = vScrollbar
                ? () => round(vScrollbar.viewportOffset)
                : () => 0;

            // TODO: Part of the following rendering logic could be moved to GridChild

            const viewportCoords = new Rectangle(
                () => coords.x + x,
                () => coords.y + y,
                () => viewportWidth,
                () => viewportHeight
            );

            const scrollable = view.isScrollable();

            const viewCoords = scrollable
                ? new Rectangle(
                      () => coords.x + x - getHScrollOffset(),
                      () => coords.y + y - getVScrollOffset(),
                      () => viewWidth,
                      () => viewHeight
                  )
                : viewportCoords;

            gridChild.coords = viewportCoords;

            const clippedChildCoords = options.clipRect
                ? viewportCoords.intersect(options.clipRect)
                : viewportCoords;

            background?.render(context, clippedChildCoords, {
                ...options,
                clipRect: undefined,
            });

            for (const gridLineView of Object.values(gridLines)) {
                gridLineView.render(context, viewportCoords, options);
            }

            const clipped = isClippedChildren(view) || scrollable;

            // If clipped, the axes should be drawn on top of the marks (because clipping may not be pixel-perfect)
            if (clipped) {
                view.render(context, viewCoords, {
                    ...options,
                    clipRect: clippedChildCoords,
                });
            }

            backgroundStroke?.render(context, clippedChildCoords, {
                ...options,
                clipRect: undefined,
            });

            // Independent axes
            for (const [orient, axisView] of Object.entries(axes)) {
                const direction =
                    orient == "left" || orient == "right"
                        ? "vertical"
                        : "horizontal";

                const scrollable = gridChild.scrollbars[direction];

                // Axes should stick to the viewport edge but move with the view
                // when scrolling.
                const coords = scrollable
                    ? viewportCoords.modify(
                          direction == "vertical"
                              ? {
                                    y: () => viewCoords.y,
                                    height: viewHeight,
                                }
                              : {
                                    x: () => viewCoords.x,
                                    width: viewWidth,
                                }
                      )
                    : viewportCoords;

                const translatedCoords = translateAxisCoords(
                    coords,
                    orient,
                    axisView
                );

                let clipRect = options.clipRect;

                // Scrollable axes must be clipped along the scroll direction.
                if (scrollable) {
                    clipRect = translatedCoords.intersect(clipRect).intersect(
                        scrollable
                            ? viewportCoords.modify(
                                  // Ugly hack. Need to implement intersectX and intersectY.
                                  direction == "vertical"
                                      ? {
                                            x: -100000,
                                            width: 200000,
                                        }
                                      : {
                                            y: -100000,
                                            height: 200000,
                                        }
                              )
                            : undefined
                    );
                }

                axisView.render(context, translatedCoords, {
                    ...options,
                    clipRect,
                });
            }

            // Axes shared between children
            // TODO: What if some have scrollable viewports?
            // Should throw an error because cannot have shared axes in such cases.
            for (const axisView of Object.values(this.#sharedAxes)) {
                const props = axisView.axisProps;
                const orient = props.orient;
                if (
                    (orient == "left" && col == 0) ||
                    (orient == "right" && col == grid.nCols - 1) ||
                    (orient == "top" && row == 0) ||
                    (orient == "bottom" && row == grid.nRows - 1)
                ) {
                    axisView.render(
                        context,
                        translateAxisCoords(
                            viewportCoords.shrink(gridChild.view.getOverhang()),
                            orient,
                            axisView
                        ),
                        options
                    );
                }
            }

            if (!clipped) {
                view.render(context, viewCoords, options);
            }

            selectionRect?.render(context, viewCoords, options);

            for (const scrollbar of Object.values(gridChild.scrollbars)) {
                scrollbar.updateScrollbar(viewportCoords, viewCoords);
                scrollbar.render(context, coords, options);
            }

            title?.render(context, viewportCoords, options);
        }

        context.popView(this);
    }

    /**
     * @param {import("../../utils/interactionEvent.js").default} event
     */
    propagateInteractionEvent(event) {
        this.handleInteractionEvent(undefined, event, true);

        if (event.stopped) {
            return;
        }

        const pointedChild = this.#visibleChildren.find((gridChild) =>
            gridChild.coords.containsPoint(event.point.x, event.point.y)
        );

        for (const scrollbar of Object.values(pointedChild?.scrollbars ?? {})) {
            if (scrollbar.coords.containsPoint(event.point.x, event.point.y)) {
                scrollbar.propagateInteractionEvent(event);
                if (event.stopped) {
                    return;
                }
            }
        }

        const pointedView = pointedChild?.view;
        if (pointedView) {
            pointedView.propagateInteractionEvent(event);

            if (event.stopped) {
                return;
            }

            // Hmm, maybe this should be registered when needed and not include
            // as a hardcoded interaction?
            if (
                pointedView instanceof UnitView ||
                pointedView instanceof LayerView
            ) {
                interactionToZoom(
                    event,
                    pointedChild.coords,
                    (zoomEvent) =>
                        this.#handleZoom(
                            pointedChild.coords,
                            pointedChild.view,
                            zoomEvent
                        ),
                    this.context.getCurrentHover(),
                    this.context.animator
                );
            }
        }

        if (event.stopped) {
            return;
        }

        this.handleInteractionEvent(undefined, event, false);
    }

    /**
     *
     * @param {import("../layout/rectangle.js").default} coords Coordinates
     * @param {View} view
     * @param {import("../zoom.js").ZoomEvent} zoomEvent
     */
    #handleZoom(coords, view, zoomEvent) {
        for (const [channel, resolutionSet] of Object.entries(
            getZoomableResolutions(view)
        )) {
            if (resolutionSet.size <= 0) {
                continue;
            }

            for (const resolution of resolutionSet) {
                resolution.zoom(
                    2 ** zoomEvent.zDelta,
                    channel == "x"
                        ? zoomEvent.x - coords.x
                        : coords.height - zoomEvent.y + coords.y,
                    channel == "x" ? zoomEvent.xDelta : -zoomEvent.yDelta
                );
            }
        }

        this.context.animator.requestRender();
    }

    /**
     * @param {import("../../spec/channel.js").Channel} channel
     * @param {import("../../spec/view.js").ResolutionTarget} resolutionType
     * @returns {import("../../spec/view.js").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        return "independent";
    }
}

/**
 *
 * @param {View} view
 * @returns
 */
function getZoomableResolutions(view) {
    /** @type {Record<import("../../spec/channel.js").PrimaryPositionalChannel, Set<import("../scaleResolution.js").default>>} */
    const resolutions = {
        x: new Set(),
        y: new Set(),
    };

    // Find all resolutions (scales) that are candidates for zooming
    view.visit((v) => {
        for (const [channel, resolutionSet] of Object.entries(resolutions)) {
            const resolution = v.getScaleResolution(channel);
            if (resolution && resolution.isZoomable()) {
                resolutionSet.add(resolution);
            }
        }
    });

    return resolutions;
}

/**
 * @param {View} view
 */
export function isClippedChildren(view) {
    let clipped = true;

    view.visit((v) => {
        if (v instanceof UnitView) {
            clipped &&= v.mark.properties.clip === true;
        }
    });

    return clipped;
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

    if (orient == "bottom") {
        return coords
            .translate(0, coords.height + props.offset)
            .modify({ height: ps });
    } else if (orient == "top") {
        return coords.translate(0, -ps - props.offset).modify({ height: ps });
    } else if (orient == "left") {
        return coords.translate(-ps - props.offset, 0).modify({ width: ps });
    } else if (orient == "right") {
        return coords
            .translate(coords.width + props.offset, 0)
            .modify({ width: ps });
    }
}
