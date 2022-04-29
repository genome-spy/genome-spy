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
/**
 * @typedef {"row" | "column"} Direction
 * @typedef {import("./view").default} View
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

        /**
         * The child views (no axes, titles, etc.)
         * @type { View[] }
         */
        this.children = [];

        /**
         * Axes by child indices. May be sparse.
         * @type {Record<import("../spec/axis").AxisOrient, AxisView[]>}
         */
        this.axisViews = {
            top: [],
            right: [],
            bottom: [],
            left: [],
        };

        this.wrappingFacet = false;

        this._createChildren();
        this._onChildrenModified();
    }

    _createChildren() {
        // Override
    }

    _onChildrenModified() {
        this.uniqueChildren = new Set(this.children);

        /**  @type {import("./unitView").default[]} */
        this.backgroundViews = this.children.map((child, i) => {
            if (child instanceof UnitView || child instanceof LayerView) {
                const viewConfig = child.spec?.view;
                if (viewConfig?.fill || viewConfig?.stroke) {
                    const unitView = new UnitView(
                        createBackground(viewConfig),
                        this.context,
                        this,
                        "background" + i
                    );
                    // TODO: Make configurable through spec:
                    unitView.blockEncodingInheritance = true;
                    return unitView;
                }
            }
            return undefined;
        });

        this.grid = new Grid(this.children.length, this.#columns ?? Infinity);
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
        for (let i = 0; i < this.children.length; i++) {
            const child = this.children[i];

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
                        if (!this.axisViews[orient][i]) {
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

                if (this.axisViews[props.orient][i]) {
                    throw new Error(
                        `An axis with the orient "${props.orient}" already exists!`
                    );
                }

                this.axisViews[props.orient][i] = new AxisView(
                    props,
                    r.scaleResolution.type,
                    this.context,
                    // Note: Axisview has a unit/layerView as parent so that scale/axis resolutions are inherited correctly
                    axisParent
                );
            };

            // Handle shared axes
            if (child instanceof UnitView || child instanceof LayerView) {
                for (const channel of /** @type {import("../spec/channel").PrimaryPositionalChannel[]} */ ([
                    "x",
                    "y",
                ])) {
                    const r = child.resolutions.axis[channel];
                    if (!r) {
                        continue;
                    }

                    createAxis(r, channel, child);
                }
            }

            // Handle LayerView's possible independent axes
            if (child instanceof LayerView) {
                // First create axes that have an orient preference
                for (const layerChild of child.children) {
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
                for (const layerChild of child.children) {
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
        for (const backgroundView of this.backgroundViews) {
            if (backgroundView) {
                yield backgroundView;
            }
        }

        for (const axisView of Object.values(this.axisViews).flat()) {
            yield axisView;
        }

        for (const child of this.children) {
            yield child;
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
                    const axisView = this.axisViews[orients[side]][index];
                    if (axisView) {
                        return Math.max(
                            axisView.getPerpendicularSize() +
                                axisView.axisProps.offset ?? 0,
                            0
                        );
                    }

                    // For views other than unit or layer, use overhang instead
                    const overhang = this.children[index].getOverhang();
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
                col.map((rowIndex) => this.children[rowIndex].getSize()[dim])
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

        for (let i = 0; i < this.children.length; i++) {
            const view = this.children[i];

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

            this.backgroundViews[i]?.render(context, childCoords, options);

            const axisViews = Object.values(this.axisViews)
                .map((arr) => arr[i])
                .filter((v) => v !== undefined);
            for (const axisView of axisViews) {
                const props = axisView.axisProps;
                const orient = props.orient;

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

            view.render(context, childCoords, options);
        }

        context.popView(this);
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
 * @param {import("../spec/view").ViewConfig} viewConfig
 * @returns {import("../spec/view").UnitSpec}
 */
function createBackground(viewConfig) {
    return {
        configurableVisibility: false,
        data: { values: [{}] },
        mark: {
            fill: null,
            strokeWidth: 1.0,
            fillOpacity: viewConfig.fill ? 1.0 : 0, // TODO: This should be handled at lower level
            ...viewConfig,
            type: "rect",
            clip: false, // Shouldn't be needed
            tooltip: null,
        },
    };
}
