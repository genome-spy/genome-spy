import { getViewClass, isFacetFieldDef, isFacetMapping } from "./viewUtils";
import ContainerView from "./containerView";
import { getCachedOrCall } from "../utils/propertyCacher";
import { range, cross } from "d3-array";
import { mapToPixelCoords } from "../utils/layout/flexLayout";
import { OrdinalDomain } from "../utils/domainArray";
import Rectangle from "../utils/layout/rectangle";
import coalesce from "../utils/coalesce";
import { field as vegaField } from "vega-util";

const DEFAULT_SPACING = 20;

/**
 * Implements (a subset of) the Vega-Lite's Facet-operator:
 * https://vega.github.io/vega-lite/docs/facet.html
 *
 * @typedef {import("./view").default} View
 * @typedef {import("./unitView").default} UnitView
 * @typedef {import("./layerView").default} LayerView
 * @typedef {import("./axisWrapperView").default} AxisWrapperView
 * @typedef {import("./viewUtils").FacetFieldDef} FacetFieldDef
 * @typedef {import("./viewUtils").FacetMapping} FacetMapping
 * @typedef {import("../utils/layout/flexLayout").LocSize} LocSize
 *
 * @typedef {object} FacetDimension Stuff for working with facet dimensions
 * @prop {function} accessor
 * @prop {boolean[] | string[] | number[]} factors
 * @prop {FacetFieldDef} facetFieldDef
 *
 */
export default class FacetView extends ContainerView {
    /**
     *
     * @param {import("./viewUtils").FacetSpec} spec
     * @param {import("./viewUtils").ViewContext} context
     * @param {ContainerView} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);

        this.spec = spec;

        const View = getViewClass(spec.spec);
        this.child = /** @type { UnitView | LayerView | AxisWrapperView } */ (new View(
            spec.spec,
            context,
            this,
            `facet`
        ));

        /**
         * @type {Record<"column" | "row", FacetDimension>} */
        this._facetDimensions = { column: undefined, row: undefined };
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        yield this.child;
    }

    /**
     * @param {import("./view").default} child
     * @param {import("./view").default} replacement
     */
    replaceChild(child, replacement) {
        if (child !== this.child) {
            throw new Error("Not my child!");
        }

        this.child = /** @type {UnitView | LayerView | AxisWrapperView} */ (replacement);
    }

    transformData() {
        super.transformData();
        // A hacky solution for updating facets. TODO: Something more robust.
        this.updateFacets();
    }

    /**
     *
     * @param {"row" | "column"} channel
     */
    getAccessor(channel) {
        /** @type {import("./viewUtils").FacetMapping} */
        let facetMapping;
        if (isFacetMapping(this.spec.facet)) {
            facetMapping = this.spec.facet; // Mark provides encodings with defaults and possible modifications
        } else if (isFacetFieldDef(this.spec.facet)) {
            // TODO: Check "columns"
            facetMapping = {
                column: this.spec.facet
            };
        } else {
            throw new Error(
                "Invalid facet specification: " +
                    JSON.stringify(this.spec.facet)
            );
        }

        if (facetMapping[channel]) {
            return this.context.accessorFactory.createAccessor(
                facetMapping[channel]
            );
        }
    }

    updateFacets() {
        /** @type {import("./viewUtils").FacetMapping} */
        let facetMapping;
        if (isFacetMapping(this.spec.facet)) {
            facetMapping = this.spec.facet; // Mark provides encodings with defaults and possible modifications
        } else if (isFacetFieldDef(this.spec.facet)) {
            // TODO: Check "columns"
            facetMapping = {
                column: this.spec.facet
            };
        } else {
            throw new Error(
                "Invalid facet specification: " +
                    JSON.stringify(this.spec.facet)
            );
        }

        for (const channel of /** @type {("column" | "row")[]} */ ([
            "column",
            "row"
        ])) {
            const facetFieldDef = facetMapping[channel];
            if (!facetFieldDef) {
                continue;
            }

            const accessor = this.context.accessorFactory.createAccessor(
                facetMapping[channel]
            );

            const factors = new OrdinalDomain().extendAllWithAccessor(
                this.getData().flatData(),
                accessor
            );

            this._facetDimensions[channel] = {
                accessor,
                factors,
                facetFieldDef
            };
        }
    }

    /**
     * Returns an accessor that returns a (composite) key for partitioning the data
     */
    getFacetAccessor() {
        const { column, row } = this._facetDimensions;

        if (column && row) {
            const columnField = vegaField(column.facetFieldDef.field);
            const rowField = vegaField(row.facetFieldDef.field);
            return /** @param {object} d */ d =>
                columnField(d) + "," + rowField(d);
        } else if (column) {
            return vegaField(column.facetFieldDef.field);
        } else if (row) {
            return vegaField(row.facetFieldDef.field);
        } else {
            throw new Error("updateFacets() must be called first!");
        }
    }

    getFacetGroups() {
        const { column, row } = this._facetDimensions;

        if (column && row) {
            return cross(
                column.factors,
                row.factors,
                (col, row) => col + "," + row
            );
        } else if (column) {
            return column.factors;
        } else if (row) {
            return row.factors;
        } else {
            throw new Error("updateFacets() must be called first!");
        }
    }

    /**
     * @param {import("../utils/layout/rectangle").default} coords
     */
    render(coords) {
        coords = coords.shrink(this.getPadding());

        const childSize = this.child.getSize();

        /**
         * @param {FacetDimension} dimension
         * @param {"column" | "row"} direction
         * @param {number} [explicitItemCount]
         */
        const computeFlexCoords = (dimension, direction, explicitItemCount) => {
            const orient = direction == "column" ? "width" : "height";
            return mapToPixelCoords(
                range(
                    0,
                    explicitItemCount ||
                        (dimension ? dimension.factors.length : 1)
                ).map(i => childSize[orient]),
                coords[orient],
                {
                    spacing: coalesce(
                        dimension ? dimension.facetFieldDef.spacing : undefined,
                        this.spec.spacing,
                        DEFAULT_SPACING
                    )
                }
            );
        };

        /** @type {LocSize[]} */ let columnFlexCoords;
        /** @type {LocSize[]} */ let rowFlexCoords;
        let n = 0;

        if (this.spec.columns && this._facetDimensions.column) {
            // Wrapping layout
            n = this._facetDimensions.column.factors.length;
            const columns = this.spec.columns;

            columnFlexCoords = computeFlexCoords(
                this._facetDimensions.column,
                "column",
                columns
            );
            rowFlexCoords = computeFlexCoords(
                this._facetDimensions.row,
                "row",
                Math.ceil(n / columns)
            );
        } else {
            n =
                (this._facetDimensions.column.factors.length || 1) *
                (this._facetDimensions.row.factors.length || 1);

            columnFlexCoords = computeFlexCoords(
                this._facetDimensions.column,
                "column"
            );
            rowFlexCoords = computeFlexCoords(this._facetDimensions.row, "row");
        }

        const nRows = rowFlexCoords.length;
        const nCols = columnFlexCoords.length;

        // TODO: Minimize the number of WebGL state changes by optimizing rendering
        // order: Instead of drawing one facet view at a time, draw all instances
        // of a specific mark at a time.

        for (let y = 0; y < nRows; y++) {
            for (let x = 0; x < nCols; x++) {
                const i = x + y * nCols;
                if (i >= n) break;

                this.child.render(
                    new Rectangle(
                        columnFlexCoords[x].location,
                        rowFlexCoords[y].location,
                        columnFlexCoords[x].size,
                        rowFlexCoords[y].size
                    ).translate(this.getPadding().left, this.getPadding().top)
                );
            }
        }
    }
}
