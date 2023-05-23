// @ts-nocheck
// TODO: Enable when this is taken to use again

import { isFacetFieldDef, isFacetMapping } from "./viewUtils";
import ContainerView from "./containerView";
import UnitView from "./unitView";
import { cross } from "d3-array";
import { mapToPixelCoords } from "../utils/layout/flexLayout";
import { OrdinalDomain } from "../utils/domainArray";
import Rectangle from "../utils/layout/rectangle";
import coalesce from "../utils/coalesce";
import { field as vegaField } from "vega-util";
import DecoratorView from "./decoratorView";
import Padding from "../utils/layout/padding";

const DEFAULT_SPACING = 20;

/**
 * @typedef {"column" | "row"} FacetChannel
 * @type {FacetChannel[]}
 */
const FACET_CHANNELS = ["column", "row"];

/**
 * @type {Record<FacetChannel, FacetChannel>}
 */
// eslint-disable-next-line no-unused-vars
const PERPENDICULAR_FACET_CHANNELS = {
    column: "row",
    row: "column",
};

// https://vega.github.io/vega-lite/docs/header.html#labels
// TODO: Configurable
const headerConfig = {
    labelFontSize: 12,
    labelColor: "black",
};

/** @type {Record<FacetChannel, any>} */
const headerConfigs = {
    column: {
        ...headerConfig,
        labelAngle: 0,
    },
    row: {
        ...headerConfig,
        labelAngle: -90,
    },
};

/**
 * Implements (a subset of) the Vega-Lite's Facet-operator:
 * https://vega.github.io/vega-lite/docs/facet.html
 *
 * TODO:
 *  - Facet channel titles
 *  - Suppress redundant axes
 *  - Make this thing configurable
 *
 * @typedef {import("./view").default} View
 * @typedef {import("./layerView").default} LayerView
 * @typedef {import("./viewUtils").FacetFieldDef} FacetFieldDef
 * @typedef {import("./viewUtils").FacetMapping} FacetMapping
 * @typedef {import("../utils/layout/flexLayout").LocSize} LocSize
 * @typedef {import("../utils/layout/flexLayout").SizeDef} SizeDef
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

        this.child = /** @type { UnitView | LayerView | DecoratorView } */ (
            context.createView(spec.spec, this, `facet`)
        );

        /**
         * Faceted views for displaying the facet labels
         *
         * @type {Record<FacetChannel, UnitView>}
         */
        this._labelViews = Object.fromEntries(
            FACET_CHANNELS.map((channel) => [
                channel,
                new UnitView(
                    createLabelViewSpec(headerConfigs[channel]),
                    this.context,
                    this,
                    `facetLabel-${channel}`
                ),
            ])
        );

        /**  @type {Record<FacetChannel, FacetDimension>} */
        this._facetDimensions = { column: undefined, row: undefined };
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        yield this.child;
        for (const view of Object.values(this._labelViews)) {
            yield view;
        }
    }

    /**
     * @param {import("./view").default} child
     * @param {import("./view").default} replacement
     */
    replaceChild(child, replacement) {
        if (child !== this.child) {
            throw new Error("Not my child!");
        }

        this.child = /** @type {UnitView | LayerView | DecoratorView} */ (
            replacement
        );
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
                column: this.spec.facet,
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
                column: this.spec.facet,
            };
        } else {
            throw new Error(
                "Invalid facet specification: " +
                    JSON.stringify(this.spec.facet)
            );
        }

        for (const channel of FACET_CHANNELS) {
            const facetFieldDef = facetMapping[channel];
            if (!facetFieldDef) {
                continue;
            }

            const accessor = this.context.accessorFactory.createAccessor(
                facetMapping[channel]
            );

            const factors = new OrdinalDomain().extendAllWithAccessor(
                this.getData(),
                accessor
            );

            // TODO: Configurable sorting
            factors.sort();

            this._facetDimensions[channel] = {
                accessor,
                factors,
                facetFieldDef,
            };
        }
    }

    updateLabels() {
        for (const channel of FACET_CHANNELS) {
            const facetDimension = this._facetDimensions[channel];
            this._labelViews[channel].updateData(
                facetDimension
                    ? facetDimension.factors.map((d) => ({ data: d }))
                    : []
            );
        }
    }

    /**
     * Returns an accessor that returns a (composite) key for partitioning the data
     *
     * @param {View} [whoIsAsking] Passed to the immediate parent. Allows for
     *      selectively breaking the inheritance.
     * @return {function(object):any}
     */
    getFacetAccessor(whoIsAsking) {
        const { column, row } = this._facetDimensions;

        if (Object.values(this._labelViews).includes(whoIsAsking)) {
            // Label views are faceted by the facet labels
            return vegaField("data");
        } else if (column && row) {
            const columnField = vegaField(column.facetFieldDef.field);
            const rowField = vegaField(row.facetFieldDef.field);
            return /** @param {object} d */ (d) =>
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

    getSize() {
        // TODO: IMPLEMENT!
        return super.getSize();
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext").default} context
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("./view").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        if (!this.isConfiguredVisible()) {
            return;
        }

        coords = coords.shrink(this.getPadding());
        context.pushView(this, coords);

        // Size of the view that is being repeated for all the facets
        const childSize = this.child.getSize();

        // Fugly hack. TODO: Figure out a systematic phase for doing this
        if (!this._labelsUpdated) {
            this.updateLabels();
            this._labelsUpdated = true;
        }

        // TODO: Validate. Columns is not compatible with row channel
        const wrap = this.spec.columns && this._facetDimensions.column;

        // We use two flexLayouts to create a grid for the facets.
        // Stride and offset control how the cells in the grid are allocated
        // for the facets and the intervening facet labels.
        const xStride = 1;
        const xOffset = wrap ? 0 : this._facetDimensions.row ? 1 : 0;
        const yStride = wrap ? 2 : 1;
        const yOffset = this._facetDimensions.column ? 1 : 0;

        /**
         * @param {SizeDef} childSize
         * @param {number} count
         * @param {number} stride
         * @param {number} offset
         */
        const calculateCellSizes = (childSize, count, stride, offset) => {
            // TODO: take the channel into account
            const labelSize = { px: headerConfig.labelFontSize };

            /** @type {SizeDef[]} */
            const cellSizes = [];

            for (let i = 0; i < offset; i++) {
                cellSizes.push(labelSize);
            }

            for (let i = 0; i < count; i++) {
                for (let j = 1; j < stride; j++) {
                    cellSizes.push(labelSize);
                }
                cellSizes.push(childSize);
            }

            return cellSizes;
        };

        /**
         *
         * @param {FacetChannel} channel
         * @param {number} count Number of factors
         */
        const computeFlexCoords = (channel, count) => {
            const dimension = this._facetDimensions[channel];

            const spacing = coalesce(
                dimension ? dimension.facetFieldDef.spacing : undefined,
                this.spec.spacing,
                DEFAULT_SPACING
            );

            const cellSizes =
                channel == "column"
                    ? calculateCellSizes(
                          childSize.width,
                          count,
                          xStride,
                          xOffset
                      )
                    : calculateCellSizes(
                          childSize.height,
                          count,
                          yStride,
                          wrap ? 0 : yOffset
                      );

            return mapToPixelCoords(
                cellSizes,
                coords[channel == "column" ? "width" : "height"],
                {
                    spacing,
                    devicePixelRatio: window.devicePixelRatio,
                }
            );
        };

        let nCols = 0;
        let nRows = 0;
        let n = 0;

        if (wrap) {
            // Wrapping layout
            n = this._facetDimensions.column.factors.length;
            nCols = this.spec.columns;
            nRows = Math.ceil(n / nCols);
        } else {
            /** @param {FacetDimension} facetDimension */
            const getCount = (facetDimension) =>
                facetDimension ? facetDimension.factors.length : 1;

            nCols = getCount(this._facetDimensions.column);
            nRows = getCount(this._facetDimensions.row);
            n = nCols * nRows;
        }

        const columnFlexCoords = computeFlexCoords("column", nCols);
        const rowFlexCoords = computeFlexCoords("row", nRows);

        const axisSizes =
            this.child instanceof DecoratorView
                ? this.child.getAxisSizes()
                : Padding.createUniformPadding(0);

        const facetIds = this.getFacetGroups();

        // Render column labels
        if (this._facetDimensions.column) {
            const factors = this._facetDimensions.column.factors;
            for (let x = 0; x < factors.length; x++) {
                // Take wrapping labels into account
                const xCell = columnFlexCoords[(x % nCols) * xStride + xOffset];
                const yCell = rowFlexCoords[Math.floor(x / nCols) * yStride];
                this._labelViews.column.render(
                    context,
                    Rectangle.create(
                        xCell.location + axisSizes.left,
                        yCell.location,
                        xCell.size - axisSizes.width,
                        yCell.size
                    ).translateBy(coords),
                    { ...options, facetId: factors[x] }
                );
            }
        }

        // Render row labels
        if (this._facetDimensions.row) {
            const factors = this._facetDimensions.row.factors;
            for (let y = 0; y < factors.length; y++) {
                const xCell = columnFlexCoords[0];
                const yCell = rowFlexCoords[y * yStride + yOffset];
                this._labelViews.row.render(
                    context,
                    Rectangle.create(
                        xCell.location,
                        yCell.location + axisSizes.top,
                        xCell.size,
                        yCell.size - axisSizes.height
                    ).translateBy(coords),
                    { ...options, facetId: factors[y] }
                );
            }
        }

        // Render facets
        let i = 0;
        for (let x = 0; x < nCols; x++) {
            for (let y = 0; y < nRows; y++) {
                if (i >= n) break;

                const xCell = columnFlexCoords[x * xStride + xOffset];
                const yCell = rowFlexCoords[y * yStride + yOffset];
                this.child.render(
                    context,
                    new Rectangle(
                        xCell.location,
                        yCell.location,
                        xCell.size,
                        yCell.size
                    ).translateBy(coords),
                    { ...options, facetId: facetIds[i] }
                );
                i++;
            }
        }

        context.popView(this);
    }
}

/**
 *
 */
function createLabelViewSpec(headerConfig) {
    // TODO: Support styling: https://vega.github.io/vega-lite/docs/header.html#labels

    /** @type {import("./viewUtils").UnitSpec} */
    const titleView = {
        data: {
            values: [],
        },
        mark: {
            type: "text",
            clip: false,
            angle: headerConfig.labelAngle,
        },
        encoding: {
            text: { field: "data", type: "nominal" },
            size: { value: headerConfig.labelFontSize },
            color: { value: headerConfig.labelColor },
        },
    };

    return titleView;
}
