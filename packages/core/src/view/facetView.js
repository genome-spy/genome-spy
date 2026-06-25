import ContainerView from "./containerView.js";
import {
    DEFAULT_FACET_HEADER_SIZES,
    createFacetGrid,
    getFacetCellLayouts,
    getFacetGridSize,
    isRectVisible,
} from "./facetLayout.js";
import FacetHeaderView from "./facetHeaderView.js";
import GridChild from "./gridView/gridChild.js";
import { ZERO_FLEXDIMENSIONS } from "./layout/flexLayout.js";
import { normalizeClipOptions } from "./renderingContext/clipOptions.js";
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

    /** @type {FacetHeaderView | undefined} */
    #columnHeaderView;

    /** @type {FacetHeaderView | undefined} */
    #rowHeaderView;

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

        this.#validateInitialLimitations();

        this.#gridChild = new GridChild(this.child, this, 0);
        await this.#gridChild.createAxes();

        if (this.#facet.column) {
            this.#columnHeaderView = new FacetHeaderView({
                orient: "column",
                context: this.context,
                layoutParent: this,
                dataParent: this.child,
                getName: (prefix) => this.getNextAutoName(prefix),
            });
        }

        if (this.#facet.row) {
            this.#rowHeaderView = new FacetHeaderView({
                orient: "row",
                context: this.context,
                layoutParent: this,
                dataParent: this.child,
                getName: (prefix) => this.getNextAutoName(prefix),
            });
        }
    }

    /**
     * @returns {IterableIterator<import("./view.js").default>}
     */
    *[Symbol.iterator]() {
        yield* this.#gridChild.getChildren();

        if (this.#columnHeaderView) {
            yield this.#columnHeaderView.view;
        }

        if (this.#rowHeaderView) {
            yield this.#rowHeaderView.view;
        }
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

    /**
     * @returns {import("./layout/flexLayout.js").FlexDimensions}
     */
    getSize() {
        return this._cache("size/size", () => {
            if (!this.isConfiguredVisible()) {
                return ZERO_FLEXDIMENSIONS;
            } else {
                this.#syncFacetCollectors();
                return getFacetGridSize(
                    createFacetGrid(
                        this.#facet,
                        this.#facetFactors,
                        this.spec.columns
                    ),
                    this.child.getViewportSize(),
                    this.#gridChild.getOverhangAndPadding(),
                    undefined,
                    this.spec.spacing ?? 10
                );
            }
        });
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./layout/rectangle.js").default} coords
     * @param {import("../types/rendering.js").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        super.render(context, coords, options);

        if (!this.isConfiguredVisible()) {
            return;
        }

        this.#syncFacetCollectors();
        context.pushView(this, coords);

        const layouts = getFacetCellLayouts(
            createFacetGrid(this.#facet, this.#facetFactors, this.spec.columns),
            coords,
            this.child.getViewportSize(),
            this.#gridChild.getOverhangAndPadding(),
            undefined,
            this.spec.spacing ?? 10,
            context.getDevicePixelRatio()
        );
        const parentClip = normalizeClipOptions(options);
        const visibleLayouts = layouts.filter((layout) =>
            isRectVisible(layout.viewportCoords, parentClip)
        );

        for (const [index, layout] of visibleLayouts.entries()) {
            this.#renderFacetCell(context, layout, {
                ...options,
                facetId: layout.cell.facetId,
                firstFacet: index === 0,
            });
        }

        this.#renderFacetHeaders(context, coords, layouts, options);

        context.popView(this);
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

    #validateInitialLimitations() {
        if (this.child instanceof FacetView) {
            throw new Error(
                "Facet specs cannot contain an immediate facet child."
            );
        }

        const channels = /** @type {const} */ (["x", "y"]);
        for (const channel of channels) {
            this.#validateSharedResolution(channel, "scale");
            this.#validateSharedResolution(channel, "axis");
        }
    }

    /**
     * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
     * @param {"scale" | "axis"} resolutionType
     */
    #validateSharedResolution(channel, resolutionType) {
        this.child.visit((view) => {
            if (view instanceof UnitView) {
                const behavior =
                    view.getConfiguredResolution(channel, resolutionType) ??
                    view.getConfiguredResolution("default", resolutionType);

                if (behavior === "independent") {
                    throw new Error(
                        `FacetView currently supports only shared ${resolutionType} resolutions. Channel "${channel}" is resolved independently in child view "${view.name}".`
                    );
                }
            }
        });
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./layout/rectangle.js").default} coords
     * @param {import("./facetLayout.js").FacetCellLayout[]} layouts
     * @param {import("../types/rendering.js").RenderingOptions} options
     */
    #renderFacetHeaders(context, coords, layouts, options) {
        if (this.#columnHeaderView) {
            this.#columnHeaderView.updateData(
                createColumnHeaderData(layouts, coords, this.#facet)
            );
            this.#columnHeaderView.render(context, coords, options);
        }

        if (this.#rowHeaderView) {
            this.#rowHeaderView.updateData(
                createRowHeaderData(layouts, coords)
            );
            this.#rowHeaderView.render(context, coords, options);
        }
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./facetLayout.js").FacetCellLayout} layout
     * @param {import("../types/rendering.js").RenderingOptions} options
     */
    #renderFacetCell(context, layout, options) {
        this.#gridChild.background?.render(
            context,
            layout.viewportCoords,
            options
        );

        for (const gridLineView of Object.values(this.#gridChild.gridLines)) {
            gridLineView.render(context, layout.viewportCoords, options);
        }

        this.#gridChild.view.render(context, layout.childCoords, options);

        for (const axisView of Object.values(this.#gridChild.axes)) {
            axisView.render(context, layout.viewportCoords, options);
        }

        this.#gridChild.backgroundStroke?.render(
            context,
            layout.viewportCoords,
            options
        );
    }
}

/**
 * @param {import("./facetLayout.js").FacetCellLayout[]} layouts
 * @param {import("./layout/rectangle.js").default} coords
 * @param {NormalizedFacet} facet
 * @returns {{ x: number, y: number, text: string }[]}
 */
function createColumnHeaderData(layouts, coords, facet) {
    /** @type {{ x: number, y: number, text: string }[]} */
    const data = [];
    /** @type {Set<number>} */
    const columns = new Set();

    for (const layout of layouts) {
        if (facet.row && columns.has(layout.cell.column)) {
            continue;
        }

        columns.add(layout.cell.column);
        data.push({
            x:
                layout.viewportCoords.x -
                coords.x +
                layout.viewportCoords.width / 2,
            y: DEFAULT_FACET_HEADER_SIZES.column / 2,
            text: String(layout.cell.columnValue),
        });
    }

    return data;
}

/**
 * @param {import("./facetLayout.js").FacetCellLayout[]} layouts
 * @param {import("./layout/rectangle.js").default} coords
 * @returns {{ x: number, y: number, text: string }[]}
 */
function createRowHeaderData(layouts, coords) {
    /** @type {{ x: number, y: number, text: string }[]} */
    const data = [];
    /** @type {Set<number>} */
    const rows = new Set();

    for (const layout of layouts) {
        if (rows.has(layout.cell.row)) {
            continue;
        }

        rows.add(layout.cell.row);
        data.push({
            x: DEFAULT_FACET_HEADER_SIZES.row / 2,
            y:
                layout.viewportCoords.y -
                coords.y +
                layout.viewportCoords.height / 2,
            text: String(layout.cell.rowValue),
        });
    }

    return data;
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
    /** @type {import("../spec/channel.js").Scalar[]} */
    const rowValues = [];
    /** @type {import("../spec/channel.js").Scalar[]} */
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
    const facet = spec.facet;

    if (isFacetFieldDef(facet)) {
        column = facet;
    } else if (isFacetMapping(facet)) {
        row = normalizeFacetFieldDef(facet.row, "row");
        column = normalizeFacetFieldDef(facet.column, "column");
    } else {
        throw new Error(
            "Invalid facet specification: " + JSON.stringify(facet)
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
