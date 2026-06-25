import ContainerView from "./containerView.js";
import GridChild from "./gridView/gridChild.js";
import UnitView from "./unitView.js";
import { isFacetFieldDef, isFacetMapping } from "./viewUtils.js";

/**
 * @typedef {"row" | "column"} FacetChannel
 *
 * @typedef {object} NormalizedFacet
 * @prop {import("../spec/channel.js").FieldDefWithoutScale | undefined} row
 * @prop {import("../spec/channel.js").FieldDefWithoutScale | undefined} column
 * @prop {string[]} fields Collector groupby fields in facetId tuple order.
 *
 * @typedef {object} FacetFactors
 * @prop {import("../spec/channel.js").Scalar[]} row
 * @prop {import("../spec/channel.js").Scalar[]} column
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
    /** @type {import("./view.js").default} */
    child;

    /** @type {NormalizedFacet} */
    #facet;

    /** @type {GridChild} */
    #gridChild;

    /** @type {import("../spec/channel.js").Scalar[][]} */
    #facetIds = [];

    /** @type {FacetFactors} */
    #facetFactors = { row: [], column: [] };

    /** @type {string} */
    #facetSignature = "[]";

    /** @type {Set<import("../data/collector.js").default>} */
    #observedCollectors = new Set();

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
     * @override
     */
    async initializeChildren() {
        this.child = await this.context.createOrImportView(
            this.spec.spec,
            this,
            this,
            this.getNextAutoName("facet"),
            undefined,
            { inheritEncoding: true }
        );

        this.#gridChild = new GridChild(this.child, this, 0);
        await this.#gridChild.createAxes();
    }

    /**
     * @returns {IterableIterator<import("./view.js").default>}
     */
    *[Symbol.iterator]() {
        yield* this.#gridChild.getChildren();
    }

    /**
     * Returns the fields used for grouping data into facet batches.
     *
     * @returns {string[]}
     */
    getFacetFields() {
        return this.#facet.fields;
    }

    /**
     * Returns facet ids derived from completed child collectors.
     *
     * @returns {import("../spec/channel.js").Scalar[][]}
     */
    getFacetIds() {
        this.#syncFacetCollectors();
        return this.#facetIds;
    }

    /**
     * Returns sorted row and column factor values.
     *
     * @returns {FacetFactors}
     */
    getFacetFactors() {
        this.#syncFacetCollectors();
        return this.#facetFactors;
    }

    #syncFacetCollectors() {
        this.child.visit((view) => {
            if (view instanceof UnitView) {
                const collector = view.getCollector();

                if (!this.#observedCollectors.has(collector)) {
                    this.#observedCollectors.add(collector);
                    this.registerDisposer(
                        collector.observe(() => {
                            if (this.#updateFacetStateFromCollectors()) {
                                this.invalidateSizeCache();
                                this.context.requestLayoutReflow();
                            }
                        })
                    );
                }
            }
        });

        this.#updateFacetStateFromCollectors();
    }

    /**
     * @returns {boolean} True when facet ids or factors changed.
     */
    #updateFacetStateFromCollectors() {
        const facetIds = collectFacetIds(this.child).sort(compareFacetIds);
        const signature = JSON.stringify(facetIds);

        if (signature === this.#facetSignature) {
            return false;
        } else {
            this.#facetSignature = signature;
            this.#facetIds = facetIds;
            this.#facetFactors = createFacetFactors(this.#facet, facetIds);
            return true;
        }
    }
}

/**
 * @param {import("./view.js").default} childView
 * @returns {import("../spec/channel.js").Scalar[][]}
 */
function collectFacetIds(childView) {
    /** @type {Set<string>} */
    const encoded = new Set();
    /** @type {import("../spec/channel.js").Scalar[][]} */
    const facetIds = [];

    childView.visit((view) => {
        if (view instanceof UnitView) {
            const collector = view.getCollector();

            if (collector.completed) {
                for (const key of collector.facetBatches.keys()) {
                    if (key !== undefined) {
                        const facetId = Array.isArray(key) ? key : [key];
                        const encodedKey = JSON.stringify(facetId);
                        if (!encoded.has(encodedKey)) {
                            encoded.add(encodedKey);
                            facetIds.push(facetId);
                        }
                    }
                }
            }
        }
    });

    return facetIds;
}

/**
 * @param {NormalizedFacet} facet
 * @param {import("../spec/channel.js").Scalar[][]} facetIds
 * @returns {FacetFactors}
 */
function createFacetFactors(facet, facetIds) {
    const rowValues = [];
    const columnValues = [];
    const rowKeys = new Set();
    const columnKeys = new Set();

    for (const facetId of facetIds) {
        const rowValue = facet.row ? facetId[0] : undefined;
        /** @type {import("../spec/channel.js").Scalar | undefined} */
        let columnValue;
        if (facet.row && facet.column) {
            columnValue = facetId[1];
        } else if (facet.column) {
            columnValue = facetId[0];
        }

        if (rowValue !== undefined) {
            addUniqueFactor(rowValues, rowKeys, rowValue);
        }

        if (columnValue !== undefined) {
            addUniqueFactor(columnValues, columnKeys, columnValue);
        }
    }

    rowValues.sort(compareScalars);
    columnValues.sort(compareScalars);

    return { row: rowValues, column: columnValues };
}

/**
 * @param {import("../spec/channel.js").Scalar[]} values
 * @param {Set<string>} keys
 * @param {import("../spec/channel.js").Scalar} value
 */
function addUniqueFactor(values, keys, value) {
    const key = JSON.stringify(value);
    if (!keys.has(key)) {
        keys.add(key);
        values.push(value);
    }
}

/**
 * @param {import("../spec/channel.js").Scalar[]} a
 * @param {import("../spec/channel.js").Scalar[]} b
 * @returns {number}
 */
function compareFacetIds(a, b) {
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i++) {
        const order = compareScalars(a[i], b[i]);
        if (order !== 0) {
            return order;
        }
    }

    return a.length - b.length;
}

/**
 * @param {import("../spec/channel.js").Scalar} a
 * @param {import("../spec/channel.js").Scalar} b
 * @returns {number}
 */
function compareScalars(a, b) {
    if (a < b) {
        return -1;
    } else if (a > b) {
        return 1;
    } else {
        return 0;
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
