import UnitView from "./unitView.js";
import { format as numberFormat } from "d3-format";
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
    /** @type {(value: import("../spec/channel.js").Scalar) => string} */
    formatLabel = String;

    /**
     * @param {FacetHeaderOrient} orient
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {string} [format]
     */
    constructor(orient, layoutParent, dataParent, format) {
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
        if (format !== undefined) {
            const formatter = numberFormat(format);
            this.formatLabel = (value) =>
                typeof value === "number" ? formatter(value) : String(value);
        }
    }

    /** @param {FacetHeaderDatum[]} data */
    updateData(data) {
        const source =
            /** @type {import("../data/sources/inlineSource.js").default | undefined} */ (
                this.flowHandle?.dataSource
            );
        if (source) {
            const collector = this.getCollector();
            if (collector.completed) {
                const previous = collector.getData()[Symbol.iterator]();
                const unchanged = data.every(({ x, y, text }) => {
                    const old = previous.next().value;
                    return (
                        old !== undefined &&
                        old.x === x &&
                        old.y === y &&
                        old.text === text
                    );
                });
                if (unchanged && previous.next().done) {
                    return;
                }
            }

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
