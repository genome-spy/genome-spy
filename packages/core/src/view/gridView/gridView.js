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
import {
    propagateInteraction,
    propagateInteractionSurface,
} from "../interactionRouting.js";
import LayerView from "../layerView.js";
import UnitView from "../unitView.js";
import { interactionToZoom } from "../zoom.js";
import GridChild from "./gridChild.js";
import KeyboardZoomController from "./keyboardZoomController.js";
import SeparatorView, { resolveSeparatorProps } from "./separatorView.js";
import { getZoomableResolutions } from "./zoomNavigationUtils.js";
import { isHConcatSpec, isVConcatSpec } from "../viewSpecGuards.js";

// Secondary ordering within a z-index bucket for GridView-owned decorations.
// These are not z-indices themselves: actual layering is decided first by the
// decoration's zindex (underlay vs overlay relative to content), and these
// values are only used as tie-break phases among decorations in the same batch.
const DECORATION_ORDER = Object.freeze({
    background: 0,
    separator: 10,
    grid: 20,
    backgroundStroke: 30,
    axis: 40,
    selectionRect: 80,
    scrollbar: 90,
    title: 100,
});

// Default z-index for axes and view strokes when the content is clipped or
// scrollable. This keeps guides above content-edge artifacts while still
// letting an explicit user zindex override the default.
const CLIPPED_DECORATION_ZINDEX = 10;

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
 *
 * @template {import("../../spec/view.js").AnyConcatSpec} [TSpec=import("../../spec/view.js").AnyConcatSpec]
 * @extends {ContainerView<TSpec>}
 */
export default class GridView extends ContainerView {
    /**
     * Users guide:
     * - GridView owns GridChild instances and manages decorations and shared axes.
     * - Use ConcatView helpers for dynamic insertion/removal so dataflow and axes
     *   lifecycle stays consistent.
     */

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

    /** @type {Partial<Record<"horizontal" | "vertical", SeparatorView>>} */
    #separatorViews = {};

    /** @type {KeyboardZoomController | null} */
    #keyboardZoomController = null;

    /**
     *
     * @param {TSpec} spec
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

        const separatorProps = resolveSeparatorProps(spec.separator);
        if (separatorProps) {
            for (const direction of getSeparatorDirections(spec)) {
                this.#separatorViews[direction] = new SeparatorView({
                    direction,
                    props: separatorProps,
                    context: this.context,
                    layoutParent: this,
                    dataParent: this,
                    getName: (prefix) => this.getNextAutoName(prefix),
                });
            }
        }

        if (!this.layoutParent) {
            this.#keyboardZoomController = new KeyboardZoomController({
                context: this.context,
                viewRoot: this,
            });
        }
    }

    /**
     * @param {View} view
     */
    appendChild(view) {
        this.appendChildView(view);
    }

    /**
     * Appends a child view without initializing dataflow or axes.
     * Intended for ConcatView when building the initial hierarchy.
     *
     * @param {View} view
     * @returns {GridChild}
     */
    appendChildView(view) {
        return this.insertChildViewAt(view, this.#children.length);
    }

    /**
     * Inserts a child view without initializing dataflow or axes.
     * Callers should create axes, initialize subtree data, and request layout.
     *
     * @param {View} view
     * @param {number} index
     * @returns {GridChild}
     */
    insertChildViewAt(view, index) {
        view.layoutParent ??= this;
        const gridChild = new GridChild(view, this, this.#childSerial);
        this.#childSerial++;
        this.#children.splice(index, 0, gridChild);
        this.invalidateSizeCache();
        return gridChild;
    }

    /**
     * Removes a child by instance and disposes its subtree.
     * Callers should sync shared axes and request layout.
     *
     * @param {View} view
     */
    removeChildView(view) {
        const index = this.#children.findIndex(
            (gridChild) => gridChild.view === view
        );
        if (index < 0) {
            throw new Error("Not my child view!");
        }
        this.removeChildAt(index);
    }

    /**
     * Removes a child by index and disposes its subtree.
     * Callers should sync shared axes and request layout.
     *
     * @param {number} index
     */
    removeChildAt(index) {
        const gridChild = this.#children[index];
        if (!gridChild) {
            throw new Error("Child index out of range!");
        }
        this.#disposeGridChild(gridChild);
        this.#children.splice(index, 1);
        this.invalidateSizeCache();
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
        for (const gridChild of this.#children) {
            this.#disposeGridChild(gridChild);
        }
        this.#children = [];
        for (const view of views) {
            this.appendChild(view);
        }
        this.invalidateSizeCache();
    }

    /**
     * @param {GridChild} gridChild
     */
    #disposeGridChild(gridChild) {
        gridChild.disposeAxisViews();
        for (const view of gridChild.getChildren()) {
            view.disposeSubtree();
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
        await this.syncSharedAxes();
        await Promise.all(
            this.#children.map((gridChild) => gridChild.createAxes())
        );
    }

    /**
     * Recreates shared axes based on current axis resolutions.
     *
     * This is used after dynamic child insert/remove to keep shared axes in sync.
     */
    async syncSharedAxes() {
        for (const axisView of Object.values(this.#sharedAxes)) {
            axisView.disposeSubtree();
        }
        this.#sharedAxes = {};

        /** @type {Promise<void>[]} */
        const promises = [];

        for (const channel of primaryPositionalChannels) {
            const r = this.resolutions.axis[channel];
            if (!r) {
                continue;
            }

            const props = r.getAxisProps();
            if (!props) {
                continue;
            }

            const propsWithDefaults = {
                title: r.getTitle(),
                orient: CHANNEL_ORIENTS[channel][0],
                ...props,
            };
            const axisView = new AxisView(
                propsWithDefaults,
                r.scaleResolution.type,
                this.context,
                this,
                this
            );
            promises.push(axisView.initializeChildren());
            this.#sharedAxes[channel] = axisView;
        }

        await Promise.all(promises);
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        for (const gridChild of this.#children) {
            yield* gridChild.getChildren();
        }

        for (const separatorView of Object.values(this.#separatorViews)) {
            yield separatorView.view;
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

        const devicePixelRatio = context.getDevicePixelRatio();

        const flexOpts = {
            devicePixelRatio,
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

        // Compute layout once and then dispatch decorations around the content
        // render pass without recomputing per-child coordinates.
        const renderItems = [];

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

            renderItems.push({
                col,
                row,
                view,
                axes,
                gridLines,
                background,
                backgroundStroke,
                title,
                selectionRect,
                viewportCoords,
                viewCoords,
                clippedChildCoords,
                viewWidth,
                viewHeight,
                scrollable,
                gridChild,
            });
        }

        const gridOverhang = this.#getGridOverhang();

        /** @type {{ zindex: number, order: number, sequence: number, render: () => void }[]} */
        const underlays = [];
        /** @type {{ zindex: number, order: number, sequence: number, render: () => void }[]} */
        const overlays = [];
        /** @type {(() => void)[]} */
        const contents = [];
        let sequence = 0;

        const queueDecoration = (
            /** @type {number} */ zindex,
            /** @type {number} */ order,
            /** @type {() => void} */ render
        ) => {
            const target = zindex > 0 ? overlays : underlays;
            target.push({
                zindex,
                order,
                sequence: sequence++,
                render,
            });
        };

        const renderDecorations = (
            /** @type {{ zindex: number, order: number, sequence: number, render: () => void }[]} */ items
        ) => {
            items.sort(
                (a, b) =>
                    a.zindex - b.zindex ||
                    a.order - b.order ||
                    a.sequence - b.sequence
            );

            for (const item of items) {
                item.render();
            }
        };

        for (const item of renderItems) {
            if (item.background) {
                queueDecoration(
                    item.gridChild.backgroundZindex,
                    DECORATION_ORDER.background,
                    () =>
                        item.background?.render(
                            context,
                            item.clippedChildCoords,
                            {
                                ...options,
                                clipRect: undefined,
                            }
                        )
                );
            }
        }

        const verticalSeparator = this.#separatorViews.vertical;
        if (verticalSeparator) {
            verticalSeparator.update(
                columnFlexCoords,
                grid.nCols,
                coords,
                (direction, index) => this.#getViewSlot(direction, index),
                this.wrappingFacet,
                gridOverhang
            );
            queueDecoration(
                verticalSeparator.getZindex(),
                DECORATION_ORDER.separator,
                () => verticalSeparator.render(context, coords, options)
            );
        }

        const horizontalSeparator = this.#separatorViews.horizontal;
        if (horizontalSeparator) {
            horizontalSeparator.update(
                rowFlexCoords,
                grid.nRows,
                coords,
                (direction, index) => this.#getViewSlot(direction, index),
                this.wrappingFacet,
                gridOverhang
            );
            queueDecoration(
                horizontalSeparator.getZindex(),
                DECORATION_ORDER.separator,
                () => horizontalSeparator.render(context, coords, options)
            );
        }

        for (const item of renderItems) {
            const {
                view,
                axes,
                gridLines,
                backgroundStroke,
                title,
                selectionRect,
                viewportCoords,
                viewCoords,
                clippedChildCoords,
                viewWidth,
                viewHeight,
                scrollable,
                gridChild,
                col,
                row,
            } = item;

            const clipped = isClippedChildren(view) || scrollable;

            for (const gridLineView of Object.values(gridLines)) {
                queueDecoration(
                    gridLineView.axisProps.zindex ?? 0,
                    DECORATION_ORDER.grid,
                    () => gridLineView.render(context, viewportCoords, options)
                );
            }

            const renderContent = () =>
                view.render(
                    context,
                    viewCoords,
                    clipped
                        ? {
                              ...options,
                              clipRect: clippedChildCoords,
                          }
                        : options
                );

            contents.push(renderContent);

            if (backgroundStroke) {
                queueDecoration(
                    defaultBackgroundStrokeZindex(
                        gridChild.backgroundStrokeZindex,
                        clipped
                    ),
                    DECORATION_ORDER.backgroundStroke,
                    () =>
                        backgroundStroke?.render(context, clippedChildCoords, {
                            ...options,
                            clipRect: undefined,
                        })
                );
            }

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

                queueDecoration(
                    defaultAxisZindex(axisView.axisProps.zindex, clipped),
                    DECORATION_ORDER.axis,
                    () =>
                        axisView.render(context, translatedCoords, {
                            ...options,
                            clipRect,
                        })
                );
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
                    queueDecoration(
                        defaultAxisZindex(axisView.axisProps.zindex, clipped),
                        DECORATION_ORDER.axis,
                        () =>
                            axisView.render(
                                context,
                                translateAxisCoords(
                                    viewportCoords.shrink(
                                        gridChild.view.getOverhang()
                                    ),
                                    orient,
                                    axisView
                                ),
                                options
                            )
                    );
                }
            }

            if (selectionRect) {
                queueDecoration(
                    selectionRect.getZindex(),
                    DECORATION_ORDER.selectionRect,
                    () => selectionRect?.render(context, viewCoords, options)
                );
            }

            for (const scrollbar of Object.values(gridChild.scrollbars)) {
                queueDecoration(1, DECORATION_ORDER.scrollbar, () => {
                    scrollbar.updateScrollbar(viewportCoords, viewCoords);
                    scrollbar.render(context, coords, options);
                });
            }

            if (title) {
                queueDecoration(
                    gridChild.titleZindex,
                    DECORATION_ORDER.title,
                    () => title?.render(context, viewportCoords, options)
                );
            }
        }

        renderDecorations(underlays);

        for (const renderContent of contents) {
            renderContent();
        }

        renderDecorations(overlays);

        context.popView(this);
    }

    /**
     * @param {import("../../utils/interaction.js").default} event
     */
    propagateInteraction(event) {
        propagateInteraction(this, event, () => {
            const pointedChild = this.#visibleChildren.find((gridChild) =>
                gridChild.coords.containsPoint(event.point.x, event.point.y)
            );
            const pointedView = pointedChild?.view;
            const gapZoomTarget = !pointedChild
                ? this.#getGapZoomTarget(event.point)
                : undefined;

            if (event.type === "wheelclaimprobe") {
                // Probe path: claim wheel ownership without executing regular wheel
                // behavior. InteractionController uses this to decide whether native
                // wheel should be preventDefault()'ed before inertia kicks in.
                if (!pointedView) {
                    if (gapZoomTarget) {
                        event.claimWheel();
                    }
                    return;
                }

                if (isZoomInteractionView(pointedView)) {
                    if (hasZoomableResolutions(pointedView)) {
                        event.claimWheel();
                    }
                } else {
                    pointedView.propagateInteraction(event);
                }
                return;
            }

            this.#keyboardZoomController?.handlePointerEvent(
                pointedChild,
                event
            );

            for (const scrollbar of Object.values(
                pointedChild?.scrollbars ?? {}
            )) {
                propagateInteractionSurface(
                    event,
                    () =>
                        scrollbar.coords.containsPoint(
                            event.point.x,
                            event.point.y
                        ),
                    () => scrollbar.propagateInteraction(event)
                );

                if (event.stopped) {
                    return;
                }
            }

            if (!pointedView) {
                if (gapZoomTarget) {
                    this.#propagateGapZoomInteraction(event, gapZoomTarget);
                }
                return;
            }

            propagateInteractionSurface(
                event,
                () => true,
                () => pointedView.propagateInteraction(event),
                isZoomInteractionView(pointedView)
                    ? () =>
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
                          )
                    : undefined
            );
        });
    }

    /**
     * @param {import("../layout/point.js").default} point
     * @returns {{ coords: Rectangle, zoomableResolutions: ReturnType<typeof getZoomableResolutionSet> } | undefined}
     */
    #getGapZoomTarget(point) {
        const channel = this.#getGapZoomChannel();
        if (!channel) {
            return;
        }

        const resolution = this.getScaleResolution(channel);
        if (!resolution || !resolution.isZoomable()) {
            return;
        }

        const coords = this.#getGapZoomCoords(channel);
        if (!coords) {
            return;
        }

        if (!coords.containsPoint(point.x, point.y)) {
            return;
        }

        return {
            coords,
            zoomableResolutions: getZoomableResolutionSet(channel, resolution),
        };
    }

    /**
     * @returns {import("../../spec/channel.js").PrimaryPositionalChannel | undefined}
     */
    #getGapZoomChannel() {
        if (isVConcatSpec(this.spec)) {
            return "x";
        } else if (isHConcatSpec(this.spec)) {
            return "y";
        }
    }

    /**
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
     * @returns {Rectangle | undefined}
     */
    #getGapZoomCoords(channel) {
        const firstChild = this.#visibleChildren[0];
        if (!firstChild) {
            return;
        }

        const firstViewportCoords = firstChild.coords;
        const firstExpandedCoords = firstChild.coords.expand(
            firstChild.getOverhang()
        );

        let minX = firstViewportCoords.x;
        let minY = firstExpandedCoords.y;
        let maxX = firstViewportCoords.x2;
        let maxY = firstExpandedCoords.y2;

        for (const gridChild of this.#visibleChildren.slice(1)) {
            const viewportCoords = gridChild.coords;
            const expandedCoords = gridChild.coords.expand(
                gridChild.getOverhang()
            );

            if (channel == "x") {
                minX = Math.max(minX, viewportCoords.x);
                maxX = Math.min(maxX, viewportCoords.x2);
                minY = Math.min(minY, expandedCoords.y);
                maxY = Math.max(maxY, expandedCoords.y2);
            } else {
                minX = Math.min(minX, expandedCoords.x);
                maxX = Math.max(maxX, expandedCoords.x2);
                minY = Math.max(minY, viewportCoords.y);
                maxY = Math.min(maxY, viewportCoords.y2);
            }
        }

        for (const axisView of Object.values(this.#sharedAxes)) {
            const axisCoords = axisView.coords;
            if (!axisCoords) {
                continue;
            }

            const orient = axisView.axisProps.orient;
            if (channel == "x" && (orient == "top" || orient == "bottom")) {
                minY = Math.min(minY, axisCoords.y);
                maxY = Math.max(maxY, axisCoords.y2);
            } else if (
                channel == "y" &&
                (orient == "left" || orient == "right")
            ) {
                minX = Math.min(minX, axisCoords.x);
                maxX = Math.max(maxX, axisCoords.x2);
            }
        }

        if (minX >= maxX || minY >= maxY) {
            return;
        }

        return Rectangle.create(minX, minY, maxX - minX, maxY - minY);
    }

    /**
     * @param {import("../../utils/interaction.js").default} event
     * @param {{ coords: Rectangle, zoomableResolutions: ReturnType<typeof getZoomableResolutionSet> }} gapZoomTarget
     */
    #propagateGapZoomInteraction(event, gapZoomTarget) {
        event.target = this;

        interactionToZoom(
            event,
            gapZoomTarget.coords,
            (zoomEvent) =>
                zoomResolutions(
                    gapZoomTarget.coords,
                    zoomEvent,
                    gapZoomTarget.zoomableResolutions,
                    this.context.animator
                ),
            this.context.getCurrentHover(),
            this.context.animator
        );
    }

    /**
     *
     * @param {import("../layout/rectangle.js").default} coords Coordinates
     * @param {View} view
     * @param {import("../zoom.js").ZoomEvent} zoomEvent
     * @returns {boolean} `true` when there was at least one zoomable resolution
     */
    #handleZoom(coords, view, zoomEvent) {
        return zoomResolutions(
            coords,
            zoomEvent,
            getZoomableResolutions(view),
            this.context.animator
        );
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
 * @param {import("../../spec/channel.js").PrimaryPositionalChannel} channel
 * @param {import("../../scales/scaleResolution.js").default} resolution
 */
function getZoomableResolutionSet(channel, resolution) {
    const zoomableResolutions = {
        x: new Set(),
        y: new Set(),
    };
    zoomableResolutions[channel].add(resolution);
    return zoomableResolutions;
}

/**
 * @param {Rectangle} coords
 * @param {import("../zoom.js").ZoomEvent} zoomEvent
 * @param {ReturnType<typeof getZoomableResolutions>} zoomableResolutions
 * @param {import("../../utils/animator.js").default} animator
 */
function zoomResolutions(coords, zoomEvent, zoomableResolutions, animator) {
    let zoomable = false;
    let changed = false;

    const p = coords.normalizePoint(zoomEvent.x, zoomEvent.y);
    const tp = coords.normalizePoint(
        zoomEvent.x + zoomEvent.xDelta,
        zoomEvent.y + zoomEvent.yDelta
    );
    const delta = {
        x: tp.x - p.x,
        y: tp.y - p.y,
    };

    for (const [channel, resolutionSet] of Object.entries(
        zoomableResolutions
    )) {
        if (resolutionSet.size <= 0) {
            continue;
        }

        zoomable = true;

        for (const resolution of resolutionSet) {
            const resolutionChanged = resolution.zoom(
                2 ** zoomEvent.zDelta,
                channel == "y" ? 1 - p[channel] : p[channel],
                channel == "x" ? delta.x : -delta.y
            );
            changed = resolutionChanged || changed;
        }
    }

    if (changed) {
        animator.requestRender();
    }

    return zoomable;
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
 * @param {View} view
 * @returns {boolean}
 */
function hasZoomableResolutions(view) {
    const zoomableResolutions = getZoomableResolutions(view);
    return zoomableResolutions.x.size > 0 || zoomableResolutions.y.size > 0;
}

/**
 * @param {View} view
 * @returns {view is UnitView | LayerView}
 */
function isZoomInteractionView(view) {
    return view instanceof UnitView || view instanceof LayerView;
}

/**
 * @param {import("../../spec/view.js").AnyConcatSpec} spec
 * @returns {("horizontal" | "vertical")[]}
 */
function getSeparatorDirections(spec) {
    // vconcat = horizontal separators, hconcat = vertical separators, concat = both
    if ("vconcat" in spec) {
        return ["horizontal"];
    }

    if ("hconcat" in spec) {
        return ["vertical"];
    }

    return ["horizontal", "vertical"];
}

/**
 * Default z-index for axes. Clipped or scrollable content gets a higher
 * default to keep guides above visible edge artifacts.
 *
 * @param {number | undefined} zindex
 * @param {boolean} clipped
 * @returns {number}
 */
function defaultAxisZindex(zindex, clipped) {
    return zindex ?? (clipped ? CLIPPED_DECORATION_ZINDEX : 0);
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
