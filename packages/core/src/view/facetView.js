import ContainerView from "./containerView.js";
import { isFacetFieldDef, isFacetMapping } from "./viewUtils.js";

/**
 * @typedef {"row" | "column"} FacetChannel
 *
 * @typedef {object} NormalizedFacet
 * @prop {import("../spec/channel.js").FieldDefWithoutScale | undefined} row
 * @prop {import("../spec/channel.js").FieldDefWithoutScale | undefined} column
 * @prop {string[]} fields Collector groupby fields in facetId tuple order.
 */

/**
 * Repeats a single child view for data-driven facet groups.
 *
 * The implementation is restored incrementally. The current shell exists so
 * facet specs can participate in view-factory registration and root wrapping.
 *
 * @extends {ContainerView<import("../spec/view.js").FacetSpec>}
 */
export default class FacetView extends ContainerView {
    /** @type {NormalizedFacet} */
    #facet;

    /**
     * @param {import("../spec/view.js").FacetSpec} spec
     * @param {import("../types/viewContext.js").default} context
     * @param {ContainerView} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {string} name
     * @param {import("./view.js").ViewOptions} [options]
     */
    constructor(spec, context, layoutParent, dataParent, name, options) {
        super(spec, context, layoutParent, dataParent, name, options);

        this.spec = spec;
        this.#facet = normalizeFacetSpec(spec);
    }

    /**
     * @returns {IterableIterator<import("./view.js").default>}
     */
    *[Symbol.iterator]() {
        // Children are added in the implementation tasks that follow factory
        // registration.
    }

    /**
     * Returns the fields used for grouping data into facet batches.
     *
     * @returns {string[]}
     */
    getFacetFields() {
        return this.#facet.fields;
    }
}

/**
 * @param {import("../spec/view.js").FacetSpec} spec
 * @returns {NormalizedFacet}
 */
function normalizeFacetSpec(spec) {
    /** @type {import("../spec/channel.js").FieldDefWithoutScale | undefined} */
    let row;
    /** @type {import("../spec/channel.js").FieldDefWithoutScale | undefined} */
    let column;

    if (isFacetFieldDef(spec.facet)) {
        column = spec.facet;
    } else if (isFacetMapping(spec.facet)) {
        row = normalizeFacetFieldDef(spec.facet.row, "row");
        column = normalizeFacetFieldDef(spec.facet.column, "column");
    } else {
        throw new Error(
            "Invalid facet specification: " + JSON.stringify(spec.facet)
        );
    }

    if (spec.columns !== undefined && row) {
        throw new Error(
            'Facet "columns" can be used only with one-dimensional column facets.'
        );
    }

    const fields = [row?.field, column?.field].filter(
        (field) => field !== undefined
    );
    if (!fields.length) {
        throw new Error("Facet specification must define at least one field.");
    }

    return { row, column, fields };
}

/**
 * @param {unknown} fieldDef
 * @param {FacetChannel} channel
 * @returns {import("../spec/channel.js").FieldDefWithoutScale | undefined}
 */
function normalizeFacetFieldDef(fieldDef, channel) {
    if (fieldDef === undefined) {
        return undefined;
    }

    if (!isFacetFieldDef(fieldDef)) {
        throw new Error(`Facet ${channel} definition must define a field.`);
    }

    return fieldDef;
}
