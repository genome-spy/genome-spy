import ContainerView from "./containerView.js";
import { shallowArrayEquals, asArray } from "../utils/arrayUtils.js";
import { VISIT_SKIP } from "./view.js";
import { isChromeView } from "./viewSelectors.js";
import {
    DEFAULT_FACET_HEADER_SIZES,
    createFacetGrid,
    getFacetCellLayouts,
    getFacetGridSize,
} from "./facetLayout.js";
import FacetHeaderView from "./facetHeaderView.js";
import GridChild from "./gridView/gridChild.js";
import { translateAxisCoords } from "./gridView/gridView.js";
import { ZERO_FLEXDIMENSIONS } from "./layout/flexLayout.js";
import {
    clipCoords,
    normalizeClipOptions,
} from "./renderingContext/clipOptions.js";
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
 * @extends {ContainerView<import("../spec/view.js").FacetSpec>}
 */
export default class FacetView extends ContainerView {
    /** @type {import("./view.js").default} */
    child;

    /** @type {NormalizedFacet} */
    #facet;

    /** @type {GridChild} */
    #gridChild;

    /** @type {Map<FacetChannel, FacetHeaderView>} */
    #headerViews = new Map();

    /** @type {FacetFactors} */
    #facetFactors = { row: [], column: [] };

    /** @type {Set<import("../data/collector.js").default>} */
    #observedCollectors = new Set();

    #hasPendingCollectors = false;

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

        this.#gridChild = new FacetGridChild(this.child, this, 0);
        await this.#gridChild.syncGuideViews();

        for (const channel of /** @type {const} */ (["column", "row"])) {
            if (this.#facet[channel]) {
                this.#headerViews.set(
                    channel,
                    new FacetHeaderView(channel, this, this.child)
                );
            }
        }
    }

    /** Refreshes guides after view-level axis and legend properties are attached. */
    async syncGuideViews() {
        await this.#gridChild.syncGuideViews();
        this.invalidateSizeCache();
    }

    /**
     * @returns {IterableIterator<import("./view.js").default>}
     */
    *[Symbol.iterator]() {
        yield* this.#gridChild.getChildren();

        yield* this.#headerViews.values();
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
     * @returns {import("./layout/flexLayout.js").FlexDimensions}
     */
    getSize() {
        if (!this.isConfiguredVisible()) {
            return ZERO_FLEXDIMENSIONS;
        }

        this.#syncFacetCollectors();

        if (this.#hasPendingCollectors) {
            return this.#getFacetGridSize();
        }

        return this._cache("size/size", () => this.#getFacetGridSize());
    }

    /** @returns {import("./facetLayout.js").FacetGrid} */
    #getFacetGrid() {
        return this._cache("size/facetGrid", () =>
            createFacetGrid(this.#facet, this.#facetFactors, this.spec.columns)
        );
    }

    /**
     * @returns {import("./layout/flexLayout.js").FlexDimensions}
     */
    #getFacetGridSize() {
        return getFacetGridSize(
            this.#getFacetGrid(),
            this.child.getViewportSize(),
            this.#gridChild.getOverhangAndPadding(),
            undefined,
            this.spec.spacing ?? 10
        );
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./layout/rectangle.js").default} coords
     * @param {import("../types/rendering.js").RenderingOptions} [options]
     */
    arrange(context, coords, options = {}) {
        super.arrange(context, coords, options);

        if (!this.isConfiguredVisible()) {
            return;
        }

        this.#syncFacetCollectors();
        context.pushView(this, coords);

        const layouts = getFacetCellLayouts(
            this.#getFacetGrid(),
            coords,
            this.child.getViewportSize(),
            this.#gridChild.getOverhangAndPadding(),
            undefined,
            this.spec.spacing ?? 10,
            context.getDevicePixelRatio()
        );
        const parentClip = normalizeClipOptions(options);
        const visibleLayouts = layouts.filter((layout) => {
            const visible = clipCoords(layout.viewportCoords, parentClip);
            return (
                visible.isDefined() && visible.width > 0 && visible.height > 0
            );
        });

        for (const [index, layout] of visibleLayouts.entries()) {
            this.#renderFacetCell(context, layout, {
                ...options,
                facetId: layout.cell.facetId,
                firstFacet: index === 0,
            });
        }

        for (const [orient, header] of this.#headerViews) {
            header.updateData(
                createFacetHeaderData(
                    orient,
                    layouts,
                    coords,
                    this.#getFacetGrid(),
                    this.spec.spacing ?? 10
                )
            );
            header.arrange(context, coords, options);
        }

        context.popView(this);
    }

    #syncFacetCollectors() {
        const hadPendingCollectors = this.#hasPendingCollectors;
        this.#hasPendingCollectors = false;
        let addedCollectors = false;

        this.child.visit((view) => {
            if (isChromeView(view)) {
                return VISIT_SKIP;
            }
            if (view instanceof UnitView) {
                const collector = view.getCollector();

                if (!collector) {
                    this.#hasPendingCollectors = true;
                } else if (!this.#observedCollectors.has(collector)) {
                    this.#observedCollectors.add(collector);
                    addedCollectors = true;
                    this.registerDisposer(
                        collector.observe(() => {
                            if (this.#updateFacetFactors()) {
                                this.context.requestLayoutReflow();
                            }
                        })
                    );
                }
            }
        });

        if (hadPendingCollectors && !this.#hasPendingCollectors) {
            this.invalidateSizeCache();
        }

        if (addedCollectors) {
            this.#updateFacetFactors();
        }
    }

    /** @returns {boolean} Whether the row or column membership changed. */
    #updateFacetFactors() {
        const factors = collectFacetFactors(
            this.#facet,
            this.#observedCollectors
        );
        if (
            shallowArrayEquals(factors.row, this.#facetFactors.row) &&
            shallowArrayEquals(factors.column, this.#facetFactors.column)
        ) {
            return false;
        }

        this.#facetFactors = factors;
        this.invalidateSizeCache();
        return true;
    }

    #validateInitialLimitations() {
        if (this.child instanceof FacetView) {
            throw new Error(
                "Facet specs cannot contain an immediate facet child."
            );
        }

        this.child.visit((view) => {
            for (const channel of /** @type {const} */ (["x", "y"])) {
                for (const resolutionType of /** @type {const} */ ([
                    "scale",
                    "axis",
                ])) {
                    const behavior =
                        view.getConfiguredResolution(channel, resolutionType) ??
                        view.getConfiguredResolution("default", resolutionType);
                    if (behavior === "independent") {
                        throw new Error(
                            `FacetView currently supports only shared ${resolutionType} resolutions. Channel "${channel}" is resolved independently in child view "${view.name}".`
                        );
                    }
                }
            }
        });
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./facetLayout.js").FacetCellLayout} layout
     * @param {import("../types/rendering.js").RenderingOptions} options
     */
    #renderFacetCell(context, layout, options) {
        this.#gridChild.background?.arrange(
            context,
            layout.viewportCoords,
            options
        );

        for (const gridLineView of Object.values(this.#gridChild.gridLines)) {
            gridLineView.arrange(context, layout.childCoords, options);
        }

        this.#gridChild.view.arrange(context, layout.childCoords, options);

        for (const axisView of Object.values(this.#gridChild.axes)) {
            axisView.arrange(
                context,
                translateAxisCoords(
                    layout.childCoords,
                    axisView.axisProps.orient,
                    axisView
                ),
                options
            );
        }

        this.#gridChild.backgroundStroke?.arrange(
            context,
            layout.viewportCoords,
            options
        );
    }
}

class FacetGridChild extends GridChild {
    /**
     * @protected
     * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
     */
    getAxisResolutionForAxis(channel) {
        return this.view.getAxisResolution(channel);
    }
}

/**
 * @param {FacetChannel} orient
 * @param {import("./facetLayout.js").FacetCellLayout[]} layouts
 * @param {import("./layout/rectangle.js").default} coords
 * @param {import("./facetLayout.js").FacetGrid} grid
 * @param {number} spacing
 * @returns {import("./facetHeaderView.js").FacetHeaderDatum[]}
 */
function createFacetHeaderData(orient, layouts, coords, grid, spacing) {
    const isRow = orient === "row";
    const count = isRow
        ? grid.nRows
        : grid.hasRowHeaders
          ? grid.nCols
          : layouts.length;

    return Array.from({ length: count }, (_, index) => {
        const { cell, childCoords, viewportCoords } =
            layouts[isRow ? index * grid.nCols : index];
        const x = isRow
            ? DEFAULT_FACET_HEADER_SIZES.row / 2
            : childCoords.x - coords.x + childCoords.width / 2;
        const y = isRow
            ? childCoords.y - coords.y + childCoords.height / 2
            : grid.hasRowHeaders
              ? DEFAULT_FACET_HEADER_SIZES.column / 2
              : viewportCoords.y -
                coords.y -
                spacing -
                DEFAULT_FACET_HEADER_SIZES.column / 2;

        return {
            x: x / coords.width,
            y: 1 - y / coords.height,
            text: String(isRow ? cell.facetId[0] : cell.facetId.at(-1)),
        };
    });
}

/**
 * @param {NormalizedFacet} facet
 * @param {Iterable<import("../data/collector.js").default>} collectors
 * @returns {FacetFactors}
 */
function collectFacetFactors(facet, collectors) {
    /** @type {Set<import("../spec/channel.js").Scalar>} */
    const row = new Set();
    /** @type {Set<import("../spec/channel.js").Scalar>} */
    const column = new Set();

    for (const collector of collectors) {
        if (!collector.completed) {
            continue;
        }
        for (const key of collector.facetBatches.keys()) {
            if (key === undefined) {
                continue;
            }
            const facetId = asArray(key);
            if (facet.row) {
                row.add(facetId[0]);
            }
            if (facet.column) {
                column.add(facetId.at(-1));
            }
        }
    }

    return {
        row: Array.from(row).sort(compareScalars),
        column: Array.from(column).sort(compareScalars),
    };
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
