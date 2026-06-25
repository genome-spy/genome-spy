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
export default class FacetHeaderView {
    /** @type {FacetHeaderOrient} */
    #orient;

    /** @type {UnitView} */
    #view;

    /** @type {FacetHeaderDatum[]} */
    #data = [];

    /**
     * @param {{
     *   orient: FacetHeaderOrient,
     *   context: import("../types/viewContext.js").default,
     *   layoutParent: import("./containerView.js").default,
     *   dataParent: import("./view.js").default,
     *   getName: (prefix: string) => string
     * }} options
     */
    constructor({ orient, context, layoutParent, dataParent, getName }) {
        this.#orient = orient;
        this.#view = this.#createView(
            context,
            layoutParent,
            dataParent,
            getName
        );
    }

    /**
     * @returns {UnitView}
     */
    get view() {
        return this.#view;
    }

    /**
     * @param {FacetHeaderDatum[]} data
     */
    updateData(data) {
        this.#data.length = data.length;

        for (let i = 0; i < data.length; i++) {
            const source = data[i];
            const target = /** @type {FacetHeaderDatum} */ (
                this.#data[i] ?? {}
            );
            target.x = source.x;
            target.y = source.y;
            target.text = source.text;
            this.#data[i] = target;
        }

        const dataSource =
            /** @type {import("../data/sources/inlineSource.js").default | undefined} */ (
                this.#view.flowHandle?.dataSource
            );

        if (dataSource) {
            dataSource.updateDynamicData(this.#data);
        }
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./layout/rectangle.js").default} coords
     * @param {import("../types/rendering.js").RenderingOptions} options
     */
    render(context, coords, options) {
        this.#view.render(context, coords, options);
    }

    /**
     * @param {import("../types/viewContext.js").default} context
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {(prefix: string) => string} getName
     * @returns {UnitView}
     */
    #createView(context, layoutParent, dataParent, getName) {
        const view = new UnitView(
            createHeaderSpec(this.#orient),
            context,
            layoutParent,
            dataParent,
            getName(
                this.#orient === "column"
                    ? "facetHeaderColumn"
                    : "facetHeaderRow"
            )
        );

        markViewAsNonAddressable(view, { skipSubtree: true });
        markViewAsChrome(view, { skipSubtree: true });

        return view;
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
