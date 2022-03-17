import {
    FlexDimensions,
    getLargestSize,
    mapToPixelCoords,
    ZERO_SIZEDEF,
} from "../utils/layout/flexLayout";
import Grid from "../utils/layout/grid";
import Rectangle from "../utils/layout/rectangle";
import ContainerView from "./containerView";
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

        /**
         * Axes for the scales
         *
         * @type {Map<import("./view").ScaleResolution, import("./axisView")>}
         */
        this.axisViews = new Map();

        /** @type { View[] } */
        this.children = spec.grid.map((childSpec, i) =>
            context.createView(childSpec, this, "grid" + i)
        );

        this.wrappingFacet = false;

        this.grid = new Grid(this.children.length, this.spec.columns);
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        for (const child of this.children) {
            yield child;
        }
    }

    get colSizes() {
        return this.grid.colIndices.map((col) =>
            getLargestSize(
                col.map((rowIndex) => this.children[rowIndex].getSize().width)
            )
        );
    }

    get rowSizes() {
        return this.grid.rowIndices.map((row) =>
            getLargestSize(
                row.map(
                    (columnIndex) => this.children[columnIndex].getSize().height
                )
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
        const sizes = direction == "column" ? this.colSizes : this.rowSizes;

        /** @type {import("../utils/layout/flexLayout").SizeDef[]} */
        const items = [];

        // Title
        items.push(ZERO_SIZEDEF);

        for (const [i, size] of sizes.entries()) {
            if (i > 0) {
                // Spacing
                items.push({ px: 5, grow: 0 });
            }

            if (i == 0 || this.wrappingFacet) {
                // Header
                items.push(ZERO_SIZEDEF);
            }

            // Axis/padding
            items.push(ZERO_SIZEDEF);

            // View
            items.push(size);

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
