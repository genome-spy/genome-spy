/* eslint-disable max-depth */
import {
    FlexDimensions,
    getLargestSize,
    mapToPixelCoords,
    ZERO_SIZEDEF,
} from "../utils/layout/flexLayout";
import Grid from "../utils/layout/grid";
import Padding from "../utils/layout/padding";
import Rectangle from "../utils/layout/rectangle";
import AxisView, { CHANNEL_ORIENTS } from "./axisView";
import ContainerView from "./containerView";
import LayerView from "./layerView";
import UnitView from "./unitView";
import interactionToZoom from "./zoom";

/**
 * @typedef {"row" | "column"} Direction
 * @typedef {import("./view").default} View
 *
 * @typedef {object} GridChild
 * @prop {View} view
 * @prop {UnitView} background
 * @prop {Partial<Record<import("../spec/axis").AxisOrient, AxisView>>} axes
 * @prop {Rectangle} coords Coordinates of the view. Recorded for mouse tracking, etc.
 */

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
 * - And later on, brushing, legend(?)
 */
export default class GridView extends ContainerView {
    #columns = Infinity;

    #spacing = 10;

    /**
     * @type { GridChild[] }
     */
    #children = [];

    #childSerial = 0;

    /**
     *
     * @param {import("./viewUtils").AnyConcatSpec} spec
     * @param {import("./viewUtils").ViewContext} context
     * @param {ContainerView} parent
     * @param {string} name
     * @param {number} columns
     */
    constructor(spec, context, parent, name, columns) {
        super(spec, context, parent, name);
        this.spec = spec;

        this.#spacing = spec.spacing ?? 10;
        this.#columns = columns;

        this.#children = [];

        this.wrappingFacet = false;

        this._createChildren();
    }

    _createChildren() {
        // Override
    }

    /**
     * @param {View} view
     */
    #appendChild(view) {
        /** @type {GridChild} */
        const gridChild = {
            view,
            background: undefined,
            axes: {},
            coords: Rectangle.ZERO,
        };

        if (view instanceof UnitView || view instanceof LayerView) {
            /** @type {import("../spec/view").ViewBackground} */
            const viewBackground = view.spec?.view;
            if (viewBackground?.fill || viewBackground?.stroke) {
                const unitView = new UnitView(
                    createBackground(viewBackground),
                    this.context,
                    this,
                    "background" + this.#childSerial
                );
                // TODO: Make configurable through spec:
                unitView.blockEncodingInheritance = true;
                gridChild.background = unitView;
            }
        }

        this.#children.push(gridChild);

        this.#childSerial++;
    }

    /**
     * @param {View} view
     */
    appendChild(view) {
        this.#appendChild(view);
        this.grid = new Grid(this.#children.length, this.#columns ?? Infinity);
    }

    /**
     * @param {View[]} views
     */
    setChildren(views) {
        for (const view of views) {
            this.#appendChild(view);
        }

        this.grid = new Grid(this.#children.length, this.#columns ?? Infinity);
    }

    onScalesResolved() {
        super.onScalesResolved();

        this.#createAxes();
    }

    #createAxes() {
        if (Object.keys(this.resolutions.axis).length) {
            throw new Error(
                "ConcatView does not (currently) support shared axes!"
            );
        }

        // Create axes
        for (const gridChild of this.#children) {
            const { view, axes } = gridChild;

            /**
             * @param {import("./view").AxisResolution} r
             * @param {import("../spec/channel").PrimaryPositionalChannel} channel
             * @param {UnitView | LayerView} axisParent
             */
            const createAxis = (r, channel, axisParent) => {
                const props = r.getAxisProps();
                if (props === null) {
                    return;
                }

                // Pick a default orient based on what is available
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

                if (axes[props.orient]) {
                    throw new Error(
                        `An axis with the orient "${props.orient}" already exists!`
                    );
                }

                axes[props.orient] = new AxisView(
                    props,
                    r.scaleResolution.type,
                    this.context,
                    // Note: Axisview has a unit/layerView as parent so that scale/axis resolutions are inherited correctly
                    axisParent
                );
            };

            // Handle shared axes
            if (view instanceof UnitView || view instanceof LayerView) {
                for (const channel of /** @type {import("../spec/channel").PrimaryPositionalChannel[]} */ ([
                    "x",
                    "y",
                ])) {
                    const r = view.resolutions.axis[channel];
                    if (!r) {
                        continue;
                    }

                    createAxis(r, channel, view);
                }
            }

            // Handle LayerView's possible independent axes
            if (view instanceof LayerView) {
                // First create axes that have an orient preference
                for (const layerChild of view.children) {
                    for (const [channel, r] of Object.entries(
                        layerChild.resolutions.axis
                    )) {
                        const props = r.getAxisProps();
                        if (props && props.orient) {
                            createAxis(r, channel, layerChild);
                        }
                    }
                }

                // Then create axes in a priority order
                for (const layerChild of view.children) {
                    for (const [channel, r] of Object.entries(
                        layerChild.resolutions.axis
                    )) {
                        const props = r.getAxisProps();
                        if (props && !props.orient) {
                            createAxis(r, channel, layerChild);
                        }
                    }
                }
            }
        }
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        for (const gridChild of this.#children) {
            if (gridChild.background) {
                yield gridChild.background;
            }
        }

        for (const gridChild of this.#children) {
            for (const axisView of Object.values(gridChild.axes)) {
                if (axisView) {
                    yield axisView;
                }
            }
        }

        for (const gridChild of this.#children) {
            yield gridChild.view;
        }
    }

    /**
     * @param {Direction} direction
     */
    #getSizes(direction) {
        /** @type {import("../spec/axis").AxisOrient[]} */
        const orients =
            direction == "column" ? ["left", "right"] : ["top", "bottom"];

        const dim = direction == "column" ? "width" : "height";

        /**
         * @type {(indices: number[], side: 0 | 1) => number}
         */
        const getMaxAxisSize = (indices, side) =>
            indices
                .map((index) => {
                    // Axis view is only present for unit and layer views
                    const axisView = this.#children[index].axes[orients[side]];
                    if (axisView) {
                        return Math.max(
                            axisView.getPerpendicularSize() +
                                axisView.axisProps.offset ?? 0,
                            0
                        );
                    }

                    // For views other than unit or layer, use overhang instead
                    const overhang = this.#children[index].view.getOverhang();
                    if (direction == "column") {
                        return side ? overhang.right : overhang.left;
                    } else {
                        return side ? overhang.bottom : overhang.top;
                    }
                })
                .reduce((a, b) => Math.max(a, b), 0);

        return this.grid[
            direction == "column" ? "colIndices" : "rowIndices"
        ].map((col) => ({
            axisBefore: getMaxAxisSize(col, 0),
            axisAfter: getMaxAxisSize(col, 1),
            view: getLargestSize(
                col.map(
                    (rowIndex) => this.#children[rowIndex].view.getSize()[dim]
                )
            ),
        }));
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

        /** @type {import("../utils/layout/flexLayout").SizeDef[]} */
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
     * @return {import("../utils/layout/flexLayout").SizeDef}
     */
    #getFlexSize(direction) {
        let grow = 0;
        let px = 0;

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
        const cols = this.#getSizes("column");
        const rows = this.#getSizes("row");

        const p = new Padding(
            rows.at(0).axisBefore,
            cols.at(-1).axisAfter,
            rows.at(-1).axisAfter,
            cols.at(0).axisBefore
        );
        return p;
    }

    /**
     * @returns {FlexDimensions}
     */
    getSize() {
        return new FlexDimensions(
            this.#getFlexSize("column"),
            this.#getFlexSize("row")
        )
            .subtractPadding(this.getOverhang())
            .addPadding(this.getPadding());
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext").default} context
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("./view").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        if (!this.isVisible()) {
            return;
        }

        coords = coords.shrink(this.getPadding()); // TODO: Only applicable at view root
        context.pushView(this, coords);

        const flexOpts = {
            devicePixelRatio: this.context.glHelper.dpr,
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

        for (const [i, gridChild] of this.#children.entries()) {
            const { view, axes, background } = gridChild;

            const [col, row] = this.grid.getCellCoords(i);
            const colLocSize =
                columnFlexCoords[this.#getViewSlot("column", col)];
            const rowLocSize = rowFlexCoords[this.#getViewSlot("row", row)];

            const viewSize = view.getSize();
            const viewPadding = view.getPadding().subtract(view.getOverhang());

            const x = colLocSize.location + viewPadding.left;
            const y = rowLocSize.location + viewPadding.top;

            const width =
                (viewSize.width.grow ? colLocSize.size : viewSize.width.px) -
                viewPadding.width;
            const height =
                (viewSize.height.grow ? rowLocSize.size : viewSize.height.px) -
                viewPadding.height;

            const childCoords = new Rectangle(
                () => coords.x + x,
                () => coords.y + y,
                () => width,
                () => height
            );

            gridChild.coords = childCoords;

            background?.render(context, childCoords, options);

            // If clipped, the axes should be drawn on top of the marks (because clipping may not be pixel-perfect)
            const clipped = isClippedChildren(view);
            if (clipped) {
                view.render(context, childCoords, options);
            }

            for (const [orient, axisView] of Object.entries(axes)) {
                const props = axisView.axisProps;

                /** @type {import("../utils/layout/rectangle").default} */
                let axisCoords;

                const ps = axisView.getPerpendicularSize();

                if (orient == "bottom") {
                    axisCoords = childCoords
                        .translate(0, childCoords.height + props.offset)
                        .modify({ height: ps });
                } else if (orient == "top") {
                    axisCoords = childCoords
                        .translate(0, -ps - props.offset)
                        .modify({ height: ps });
                } else if (orient == "left") {
                    axisCoords = childCoords
                        .translate(-ps - props.offset, 0)
                        .modify({ width: ps });
                } else if (orient == "right") {
                    axisCoords = childCoords
                        .translate(childCoords.width + props.offset, 0)
                        .modify({ width: ps });
                }

                // Axes have no faceted data, thus, pass undefined facetId
                axisView.render(context, axisCoords);
            }

            if (!clipped) {
                view.render(context, childCoords, options);
            }
        }

        context.popView(this);
    }

    /**
     * @param {import("../utils/interactionEvent").default} event
     */
    propagateInteractionEvent(event) {
        this.handleInteractionEvent(undefined, event, true);

        if (event.stopped) {
            return;
        }

        const pointedChild = this.#children.find((gridChild) =>
            gridChild.coords.containsPoint(event.point.x, event.point.y)
        );
        const pointedView = pointedChild?.view;
        if (pointedView) {
            pointedView.propagateInteractionEvent(event);

            if (
                pointedView instanceof UnitView ||
                pointedView instanceof LayerView
            ) {
                this.#handleChildInteractionEvent(event, pointedChild);
            }
        }

        if (event.stopped) {
            return;
        }

        this.handleInteractionEvent(undefined, event, false);
    }

    /**
     * @param {import("../utils/interactionEvent").default} event
     * @param {GridChild} gridChild
     */
    #handleChildInteractionEvent(event, gridChild) {
        interactionToZoom(event, gridChild.coords, (zoomEvent) =>
            this.#handleZoom(gridChild.coords, gridChild.view, zoomEvent)
        );
    }

    /**
     *
     * @param {import("../utils/layout/rectangle").default} coords Coordinates
     * @param {View} view
     * @param {import("./zoom").ZoomEvent} zoomEvent
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
     * @param {string} channel
     * @param {import("./containerView").ResolutionTarget} resolutionType
     * @returns {import("../spec/view").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        // TODO: Default to shared when working with genomic coordinates
        return "independent";
    }
}

/**
 * @param {import("../spec/view").ViewBackground} viewBackground
 * @returns {import("../spec/view").UnitSpec}
 */
function createBackground(viewBackground) {
    return {
        configurableVisibility: false,
        data: { values: [{}] },
        mark: {
            fill: null,
            strokeWidth: 1.0,
            fillOpacity: viewBackground.fill ? 1.0 : 0, // TODO: This should be handled at lower level
            ...viewBackground,
            type: "rect",
            clip: false, // Shouldn't be needed
            tooltip: null,
        },
    };
}

/**
 *
 * @param {View} view
 * @returns
 */
function getZoomableResolutions(view) {
    /** @type {Record<import("../spec/channel").PrimaryPositionalChannel, Set<import("./scaleResolution").default>>} */
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
            clipped &&= v.mark.properties.clip;
        }
    });

    return clipped;
}
