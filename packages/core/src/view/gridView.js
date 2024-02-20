/* eslint-disable max-depth */
import { primaryPositionalChannels } from "../encoder/encoder.js";
import {
    FlexDimensions,
    getLargestSize,
    mapToPixelCoords,
    parseSizeDef,
    ZERO_SIZEDEF,
} from "./layout/flexLayout.js";
import Grid from "./layout/grid.js";
import Padding from "./layout/padding.js";
import Rectangle from "./layout/rectangle.js";
import AxisGridView from "./axisGridView.js";
import AxisView, { CHANNEL_ORIENTS, ORIENT_CHANNELS } from "./axisView.js";
import ContainerView from "./containerView.js";
import LayerView from "./layerView.js";
import createTitle from "./title.js";
import UnitView from "./unitView.js";
import { interactionToZoom } from "./zoom.js";
import clamp from "../utils/clamp.js";
import { makeLerpSmoother } from "../utils/animator.js";

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
     * @typedef {import("./view.js").default} View
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
     * @type { Partial<Record<import("../spec/channel.js").PrimaryPositionalChannel, AxisView>> } }
     */
    #sharedAxes = {};

    #childSerial = 0;

    /**
     *
     * @param {import("../spec/view.js").AnyConcatSpec} spec
     * @param {import("../types/viewContext.js").default} context
     * @param {ContainerView} layoutParent
     * @param {View} dataParent
     * @param {string} name
     * @param {number} columns
     * @param {import("./view.js").ViewOptions} [options]
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

        /** @type {import("./layout/flexLayout.js").SizeDef[]} */
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
     * @return {import("./layout/flexLayout.js").SizeDef}
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
         * @param {import("../spec/axis.js").AxisOrient} orient
         */
        const getSharedAxisSize = (orient) => {
            const channel = ORIENT_CHANNELS[orient];
            const axisView = this.#sharedAxes[channel];
            if (axisView?.axisProps.orient !== orient) {
                return 0;
            }

            return Math.max(
                axisView.getPerpendicularSize() + axisView.axisProps.offset ??
                    0,
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
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./layout/rectangle.js").default} coords
     * @param {import("../types/rendering.js").RenderingOptions} [options]
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

            for (const scrollbar of Object.values(gridChild.scrollbars)) {
                scrollbar.updateScrollbar(viewportCoords, viewCoords);
                scrollbar.render(context, coords, options);
            }

            title?.render(context, viewportCoords, options);
        }

        context.popView(this);
    }

    /**
     * @param {import("../utils/interactionEvent.js").default} event
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
     * @param {import("./layout/rectangle.js").default} coords Coordinates
     * @param {View} view
     * @param {import("./zoom.js").ZoomEvent} zoomEvent
     */
    #handleZoom(coords, view, zoomEvent) {
        for (const [channel, resolutionSet] of Object.entries(
            getZoomableResolutions(view)
        )) {
            if (resolutionSet.size <= 0) {
                continue;
            }

            const p = coords.normalizePoint(zoomEvent.x, zoomEvent.y);
            const tp = coords.normalizePoint(
                zoomEvent.x + zoomEvent.xDelta,
                zoomEvent.y + zoomEvent.yDelta
            );

            const delta = {
                x: tp.x - p.x,
                y: tp.y - p.y,
            };

            for (const resolution of resolutionSet) {
                resolution.zoom(
                    2 ** zoomEvent.zDelta,
                    channel == "y" ? 1 - p[channel] : p[channel],
                    channel == "x" ? delta.x : -delta.y
                );
            }
        }

        this.context.animator.requestRender();
    }

    /**
     * @param {import("../spec/channel.js").Channel} channel
     * @param {import("../spec/view.js").ResolutionTarget} resolutionType
     * @returns {import("../spec/view.js").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        return "independent";
    }
}

/**
 * @param {import("../spec/view.js").ViewBackground} viewBackground
 * @returns {import("../spec/view.js").UnitSpec}
 */
export function createBackground(viewBackground) {
    if (
        !viewBackground ||
        !viewBackground.fill ||
        viewBackground.fillOpacity === 0
    ) {
        return;
    }

    return {
        configurableVisibility: false,
        data: { values: [{}] },
        mark: {
            color: viewBackground.fill,
            opacity: viewBackground.fillOpacity ?? 1.0,
            type: "rect",
            clip: false, // Shouldn't be needed
            tooltip: null,
            minHeight: 1,
            minOpacity: 0,
        },
    };
}

/**
 * @param {import("../spec/view.js").ViewBackground} viewBackground
 * @returns {import("../spec/view.js").UnitSpec}
 */
export function createBackgroundStroke(viewBackground) {
    if (
        !viewBackground ||
        !viewBackground.stroke ||
        viewBackground.strokeWidth === 0 ||
        viewBackground.strokeOpacity === 0
    ) {
        return;
    }

    // Using rules to draw a non-filled rectangle.
    // We are not using a rect mark because it is not optimized for outlines.
    // TODO: Implement "hollow" mesh for non-filled rectangles
    return {
        configurableVisibility: false,
        resolve: {
            scale: { x: "excluded", y: "excluded" },
            axis: { x: "excluded", y: "excluded" },
        },
        data: {
            values: [
                { x: 0, y: 0, x2: 1, y2: 0 },
                { x: 1, y: 0, x2: 1, y2: 1 },
                { x: 1, y: 1, x2: 0, y2: 1 },
                { x: 0, y: 1, x2: 0, y2: 0 },
            ],
        },
        mark: {
            size: viewBackground.strokeWidth ?? 1.0,
            color: viewBackground.stroke ?? "lightgray",
            strokeCap: "square",
            strokeOpacity: viewBackground.strokeOpacity ?? 1.0,
            type: "rule",
            clip: false,
            tooltip: null,
        },
        encoding: {
            x: { field: "x", type: "quantitative", scale: null },
            y: { field: "y", type: "quantitative", scale: null },
            x2: { field: "x2" },
            y2: { field: "y2" },
        },
    };
}

/**
 *
 * @param {View} view
 * @returns
 */
function getZoomableResolutions(view) {
    /** @type {Record<import("../spec/channel.js").PrimaryPositionalChannel, Set<import("./scaleResolution.js").default>>} */
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
 * @param {import("./layout/rectangle.js").default} coords
 * @param {import("../spec/axis.js").AxisOrient} orient
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

export class GridChild {
    /**
     * @param {View} view
     * @param {ContainerView} layoutParent
     * @param {number} serial
     */
    constructor(view, layoutParent, serial) {
        this.layoutParent = layoutParent;
        this.view = view;
        this.serial = serial;

        /** @type {UnitView} */
        this.background = undefined;

        /** @type {UnitView} */
        this.backgroundStroke = undefined;

        /** @type {Partial<Record<import("../spec/axis.js").AxisOrient, AxisView>>} axes */
        this.axes = {};

        /** @type {Partial<Record<import("../spec/axis.js").AxisOrient, AxisGridView>>} gridLines */
        this.gridLines = {};

        /** @type {Partial<Record<ScrollDirection, Scrollbar>>} */
        this.scrollbars = {};

        /** @type {UnitView} */
        this.title = undefined;

        /** @type {Rectangle} */
        this.coords = Rectangle.ZERO;

        if (view.needsAxes.x || view.needsAxes.y) {
            const spec = view.spec;
            const viewBackground = "view" in spec ? spec?.view : undefined;

            const backgroundSpec = createBackground(viewBackground);
            if (backgroundSpec) {
                this.background = new UnitView(
                    backgroundSpec,
                    layoutParent.context,
                    layoutParent,
                    view,
                    "background" + serial,
                    {
                        blockEncodingInheritance: true,
                    }
                );
            }

            const backgroundStrokeSpec = createBackgroundStroke(viewBackground);
            if (backgroundStrokeSpec) {
                this.backgroundStroke = new UnitView(
                    backgroundStrokeSpec,
                    layoutParent.context,
                    layoutParent,
                    view,
                    "backgroundStroke" + serial,
                    {
                        blockEncodingInheritance: true,
                    }
                );
            }

            const title = createTitle(view.spec.title);
            if (title) {
                const unitView = new UnitView(
                    title,
                    layoutParent.context,
                    layoutParent,
                    view,
                    "title" + serial,
                    {
                        blockEncodingInheritance: true,
                    }
                );
                this.title = unitView;
            }
        }

        // TODO: More specific getter for this
        if (view.spec.viewportWidth != null) {
            this.scrollbars.horizontal = new Scrollbar(this, "horizontal");
        }

        if (view.spec.viewportHeight != null) {
            this.scrollbars.vertical = new Scrollbar(this, "vertical");
        }
    }

    *getChildren() {
        if (this.background) {
            yield this.background;
        }
        if (this.backgroundStroke) {
            yield this.backgroundStroke;
        }
        if (this.title) {
            yield this.title;
        }
        yield* Object.values(this.axes);
        yield* Object.values(this.gridLines);
        yield this.view;
        yield* Object.values(this.scrollbars);
    }

    /**
     * Create view decorations, grid lines, axes, etc.
     */
    async createAxes() {
        const { view, axes, gridLines } = this;

        /**
         * @param {import("./axisResolution.js").default} r
         * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
         */
        const getAxisPropsWithDefaults = (r, channel) => {
            const propsWithoutDefaults = r.getAxisProps();
            if (propsWithoutDefaults === null) {
                return;
            }

            const props = propsWithoutDefaults
                ? { ...propsWithoutDefaults }
                : {};

            // Pick a default orient based on what is available.
            // This logic is needed for layer views that have independent axes.
            if (!props.orient) {
                for (const orient of CHANNEL_ORIENTS[channel]) {
                    if (!axes[orient]) {
                        props.orient = orient;
                        break;
                    }
                }
                if (!props.orient) {
                    throw new Error(
                        "No slots available for an axis! Perhaps a LayerView has more than two children?"
                    );
                }
            }

            props.title ??= r.getTitle();

            if (!CHANNEL_ORIENTS[channel].includes(props.orient)) {
                throw new Error(
                    `Invalid axis orientation "${props.orient}" on channel "${channel}"!`
                );
            }

            return props;
        };

        /**
         * @param {import("./axisResolution.js").default} r
         * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
         * @param {View} axisParent
         */
        const createAxis = async (r, channel, axisParent) => {
            const props = getAxisPropsWithDefaults(r, channel);

            if (props) {
                if (axes[props.orient]) {
                    throw new Error(
                        `An axis with the orient "${props.orient}" already exists!`
                    );
                }

                const axisView = new AxisView(
                    props,
                    r.scaleResolution.type,
                    this.layoutParent.context,
                    this.layoutParent,
                    axisParent
                );
                axes[props.orient] = axisView;
                await axisView.initializeChildren();
            }
        };

        /**
         * @param {import("./axisResolution.js").default} r
         * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
         * @param {View} axisParent
         */
        const createAxisGrid = async (r, channel, axisParent) => {
            const props = getAxisPropsWithDefaults(r, channel);

            if (props && (props.grid || props.chromGrid)) {
                const axisGridView = new AxisGridView(
                    props,
                    r.scaleResolution.type,
                    this.layoutParent.context,
                    this.layoutParent,
                    axisParent
                );
                gridLines[props.orient] = axisGridView;
                await axisGridView.initializeChildren();
            }
        };

        // Handle children that have caught axis resolutions. Create axes for them.
        for (const channel of /** @type {import("../spec/channel.js").PrimaryPositionalChannel[]} */ ([
            "x",
            "y",
        ])) {
            if (view.needsAxes[channel]) {
                const r = view.resolutions.axis[channel];
                if (!r) {
                    continue;
                }

                await createAxis(r, channel, view);
            }
        }

        // Handle gridlines of children. Note: children's axis resolution may be caught by
        // this view or some of this view's ancestors.
        for (const channel of /** @type {import("../spec/channel.js").PrimaryPositionalChannel[]} */ ([
            "x",
            "y",
        ])) {
            if (view.needsAxes[channel]) {
                const r = view.getAxisResolution(channel);
                if (!r) {
                    continue;
                }

                // TODO: Optimization: the same grid view could be reused for all children
                // because they share the axis and scale resolutions anyway.
                await createAxisGrid(r, channel, view);
            }
        }

        // Handle LayerView's possible independent axes
        if (view instanceof LayerView) {
            // First create axes that have an orient preference
            for (const layerChild of view) {
                for (const [channel, r] of Object.entries(
                    layerChild.resolutions.axis
                )) {
                    const props = r.getAxisProps();
                    if (props && props.orient) {
                        await createAxis(r, channel, layerChild);
                    }
                }
            }

            // Then create axes in a priority order
            for (const layerChild of view) {
                for (const [channel, r] of Object.entries(
                    layerChild.resolutions.axis
                )) {
                    const props = r.getAxisProps();
                    if (props && !props.orient) {
                        await createAxis(r, channel, layerChild);
                    }
                }
            }

            // TODO: Axis grid
        }

        // Axes are created after scales are resolved, so we need to resolve possible new scales here
        [...Object.values(axes), ...Object.values(gridLines)].forEach((v) =>
            v.visit((view) => {
                if (view instanceof UnitView) {
                    view.resolve("scale");
                }
            })
        );
    }

    getOverhang() {
        const calculate = (
            /** @type {import("../spec/axis.js").AxisOrient} */ orient
        ) => {
            const axisView = this.axes[orient];
            return axisView
                ? Math.max(
                      axisView.getPerpendicularSize() +
                          axisView.axisProps.offset ?? 0,
                      0
                  )
                : 0;
        };

        // Axes and overhang should be mutually exclusive, so we can just add them together
        return new Padding(
            calculate("top"),
            calculate("right"),
            calculate("bottom"),
            calculate("left")
        ).add(this.view.getOverhang());
    }

    getOverhangAndPadding() {
        return this.getOverhang().add(this.view.getPadding());
    }
}

class Scrollbar extends UnitView {
    /** @type {ScrollDirection} */
    #scrollDirection;

    #scrollbarCoords = Rectangle.ZERO;

    #maxScrollOffset = 0;

    #maxViewportOffset = 0;

    // This is the actual state of the scrollbar. It's better to keep track of
    // the viewport offset rather than the scrollbar offset because the former
    // is more stable when the viewport size changes.
    viewportOffset = 0;

    /**
     * @param {GridChild} gridChild
     * @param {ScrollDirection} scrollDirection
     */
    constructor(gridChild, scrollDirection) {
        // TODO: Configurable
        const config = {
            scrollbarSize: 8,
            scrollbarPadding: 2,
            // TODO: inside/outside view
        };

        super(
            {
                data: { values: [{}] },
                mark: {
                    type: "rect",
                    fill: "#b0b0b0",
                    fillOpacity: 0.6,
                    stroke: "white",
                    strokeWidth: 1,
                    strokeOpacity: 1,
                    cornerRadius: 5,
                    clip: false,
                },
                configurableVisibility: false,
            },
            gridChild.layoutParent.context,
            gridChild.layoutParent,
            gridChild.view,
            "scrollbar-" + scrollDirection, // TODO: Serial
            {
                blockEncodingInheritance: true,
            }
        );

        this.config = config;
        this.#scrollDirection = scrollDirection;

        // Make it smooth!
        this.interpolateViewportOffset = makeLerpSmoother(
            this.context.animator,
            (value) => {
                this.viewportOffset = value.x;
            },
            50,
            0.4,
            { x: this.viewportOffset }
        );

        this.addInteractionEventListener("mousedown", (coords, event) => {
            event.stopPropagation();

            if (this.#maxScrollOffset <= 0) {
                return;
            }

            const getMouseOffset = (/** @type {MouseEvent} */ mouseEvent) =>
                scrollDirection == "vertical"
                    ? mouseEvent.clientY
                    : mouseEvent.clientX;

            const mouseEvent = /** @type {MouseEvent} */ (event.uiEvent);
            mouseEvent.preventDefault();

            const initialScrollOffset = this.scrollOffset;
            const initialOffset = getMouseOffset(mouseEvent);

            const onMousemove = /** @param {MouseEvent} moveEvent */ (
                moveEvent
            ) => {
                const scrollOffset = clamp(
                    getMouseOffset(moveEvent) -
                        initialOffset +
                        initialScrollOffset,
                    0,
                    this.#maxScrollOffset
                );

                this.interpolateViewportOffset({
                    x:
                        (scrollOffset / this.#maxScrollOffset) *
                        this.#maxViewportOffset,
                });
            };

            const onMouseup = () => {
                document.removeEventListener("mousemove", onMousemove);
                document.removeEventListener("mouseup", onMouseup);
            };

            document.addEventListener("mouseup", onMouseup, false);
            document.addEventListener("mousemove", onMousemove, false);
        });
    }

    get scrollOffset() {
        return (
            (this.viewportOffset / this.#maxViewportOffset) *
            this.#maxScrollOffset
        );
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./layout/rectangle.js").default} coords
     * @param {import("../types/rendering.js").RenderingOptions} [options]
     */
    render(context, coords, options) {
        super.render(context, this.#scrollbarCoords, options);
    }

    /**
     *
     * @param {Rectangle} viewportCoords
     * @param {Rectangle} coords
     */
    updateScrollbar(viewportCoords, coords) {
        const sPad = this.config.scrollbarPadding;
        const sSize = this.config.scrollbarSize;

        const dimension =
            this.#scrollDirection == "horizontal" ? "width" : "height";

        const visibleFraction = Math.min(
            1,
            viewportCoords[dimension] / coords[dimension]
        );
        const maxScrollLength = viewportCoords[dimension] - 2 * sPad;
        const scrollLength = visibleFraction * maxScrollLength;

        this.#maxScrollOffset = maxScrollLength - scrollLength;
        this.#maxViewportOffset = coords[dimension] - viewportCoords[dimension];
        this.viewportOffset = clamp(
            this.viewportOffset,
            0,
            this.#maxViewportOffset
        );

        this.#scrollbarCoords =
            this.#scrollDirection == "vertical"
                ? new Rectangle(
                      () =>
                          viewportCoords.x +
                          viewportCoords.width -
                          sSize -
                          sPad,
                      () => viewportCoords.y + sPad + this.scrollOffset,
                      () => sSize,
                      () => scrollLength
                  )
                : new Rectangle(
                      () => viewportCoords.x + sPad + this.scrollOffset,
                      () =>
                          viewportCoords.y +
                          viewportCoords.height -
                          sSize -
                          sPad,
                      () => scrollLength,
                      () => sSize
                  );
    }
}
