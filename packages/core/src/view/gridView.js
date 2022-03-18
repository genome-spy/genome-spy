import {
    FlexDimensions,
    getLargestSize,
    mapToPixelCoords,
    ZERO_SIZEDEF,
} from "../utils/layout/flexLayout";
import Grid from "../utils/layout/grid";
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
    /**
     *
     * @param {import("../spec/view").GridSpec} spec
     * @param {import("./viewUtils").ViewContext} context
     * @param {ContainerView} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);
        this.spec = spec;

        /**
         * The child views (no axes, titles, etc.)
         * @type { View[] }
         */
        this.children = [];

        /** @type { View[] } */
        this.children = spec.grid.map((childSpec, i) =>
            context.createView(childSpec, this, "grid" + i)
        );

        this.uniqueChildren = new Set(this.children);

        /** @type {import("./unitView").default[]} */
        this.backgroundViews = this.children.map((child, i) => {
            if (child instanceof UnitView || child instanceof LayerView) {
                const viewConfig = child.spec?.view;
                if (viewConfig?.fill || viewConfig?.stroke) {
                    return new UnitView(
                        createBackground(viewConfig),
                        this.context,
                        this,
                        "background" + i
                    );
                }
            }
            return undefined;
        });

        this.wrappingFacet = false;

        this.grid = new Grid(this.children.length, this.spec.columns);

        /**
         * @type {Record<import("../spec/axis").AxisOrient, AxisView[]>}
         */
        this.axisViews = {
            top: [],
            right: [],
            bottom: [],
            left: [],
        };
    }

    onScalesResolved() {
        for (let i = 0; i < this.children.length; i++) {
            const child = this.children[i];
            if (child instanceof UnitView) {
                const r = child.getAxisResolution("x");

                this.axisViews.left[i] = new AxisView(
                    {
                        orient: "left",
                        title: r.getTitle(),
                    },
                    r.scaleResolution.type,
                    this.context,
                    this
                );
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

        for (const axisView of this.axisViews.left) {
            if (axisView) {
                yield axisView;
            }
        }

        for (const child of this.children) {
            yield child;
        }
    }

    /**
     * @param {View} [whoIsAsking] Passed to the immediate parent. Allows for
     *      selectively breaking the inheritance.
     */
    getEncoding(whoIsAsking) {
        return this.uniqueChildren.has(whoIsAsking) ? super.getEncoding() : {};
    }

    /**
     * @param {Direction} direction
     */
    getSizes(direction) {
        const orients = CHANNEL_ORIENTS[direction == "column" ? "y" : "x"];
        const dim = direction == "column" ? "width" : "height";

        /** @type {(indices: number[], side: 0 | 1) => number} */
        const getMaxAxisSize = (indices, side) =>
            indices
                .map(
                    (index) =>
                        this.axisViews[orients[side]][
                            index
                        ]?.getPerpendicularSize() ?? 0
                )
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
        const sizes = this.getSizes(direction);

        /** @type {import("../utils/layout/flexLayout").SizeDef[]} */
        const items = [];

        // Title
        items.push(ZERO_SIZEDEF);

        for (const [i, size] of sizes.entries()) {
            if (i > 0) {
                // Spacing
                items.push({ px: 10, grow: 0 });
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
            items.push(ZERO_SIZEDEF);

            if (i == sizes.length - 1 || this.wrappingFacet) {
                //Footer
                items.push(ZERO_SIZEDEF);
            }
        }

        return items;
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
     * @returns {FlexDimensions}
     */
    getSize() {
        return new FlexDimensions({ px: 0, grow: 1 }, { px: 0, grow: 1 });
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

        console.log("Grid - " + coords);

        coords = coords.shrink(this.getPadding());
        context.pushView(this, coords);

        // This method produces piles of garbage when used with sample faceting.
        // TODO: Figure out something. Perhaps the rectangles could be cached because
        // they are identical for each sample facet.

        /*
        const visibleChildren = this.children.filter((view) =>
            view.isVisible()
        );
        */
        //const visibleChildren = this.children;

        const columnFlexCoords = mapToPixelCoords(
            this.#makeFlexItems("column"),
            coords.width,
            {
                devicePixelRatio: this.context.glHelper.dpr,
            }
        );

        const rowFlexCoords = mapToPixelCoords(
            this.#makeFlexItems("row"),
            coords.height,
            {
                devicePixelRatio: this.context.glHelper.dpr,
            }
        );

        for (let i = 0; i < this.children.length; i++) {
            const view = this.children[i];

            const [col, row] = this.grid.getCellCoords(i);
            const colLocSize =
                columnFlexCoords[this.#getViewSlot("column", col)];
            const rowLocSize = rowFlexCoords[this.#getViewSlot("row", row)];

            const childCoords = new Rectangle(
                () => coords.x + colLocSize.location,
                () => coords.y + rowLocSize.location,
                () => colLocSize.size,
                () => rowLocSize.size
            );

            const backgroundView = this.backgroundViews[i];
            if (backgroundView) {
                backgroundView.render(context, childCoords, options);
            }

            const axisView = this.axisViews.left[i];
            if (axisView) {
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

            console.log(`Render ${i} - ${childCoords}`);
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
            ...viewConfig,
            type: "rect",
            clip: false, // Shouldn't be needed
            tooltip: null,
        },
    };
}
