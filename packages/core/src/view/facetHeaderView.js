import UnitView from "./unitView.js";
import { markViewAsChrome, markViewAsNonAddressable } from "./viewSelectors.js";

/**
 * @typedef {"row" | "column"} FacetHeaderOrient
 *
 * @typedef {object} FacetHeaderDatum
 * @prop {number} x
 * @prop {number} y
 * @prop {string} text
 */

/**
 * Dynamic text labels for facet row or column headers.
 */
export default class FacetHeaderView extends UnitView {
    /**
     * @param {FacetHeaderOrient} orient
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     */
    constructor(orient, layoutParent, dataParent) {
        super(
            createHeaderSpec(orient),
            layoutParent.context,
            layoutParent,
            dataParent,
            layoutParent.getNextAutoName(
                orient === "column" ? "facetHeaderColumn" : "facetHeaderRow"
            )
        );
        markViewAsNonAddressable(this, { skipSubtree: true });
        markViewAsChrome(this, { skipSubtree: true });
    }

    /** @param {FacetHeaderDatum[]} data */
    updateData(data) {
        const source =
            /** @type {import("../data/sources/inlineSource.js").default | undefined} */ (
                this.flowHandle?.dataSource
            );
        if (source) {
            source.updateDynamicData(data);
        }
    }
}

/**
 * @param {FacetHeaderOrient} orient
 * @returns {import("../spec/view.js").UnitSpec}
 */
function createHeaderSpec(orient) {
    return {
        domainInert: true,
        data: { values: [] },
        resolve: {
            scale: { x: "excluded", y: "excluded" },
            axis: { x: "excluded", y: "excluded" },
        },
        mark: {
            type: "text",
            clip: false,
            tooltip: null,
            align: "center",
            baseline: "middle",
            angle: orient === "row" ? -90 : 0,
        },
        encoding: {
            x: { field: "x", type: "quantitative", scale: null },
            y: { field: "y", type: "quantitative", scale: null },
            text: { field: "text", type: "nominal" },
            size: { value: 12 },
            color: { value: "black" },
        },
    };
}
