import ContainerView from "./containerView.js";
import { shallowArrayEquals, asArray } from "../utils/arrayUtils.js";
import {
    createFacetGrid,
    getFacetCellLayouts,
    getFacetGridSize,
    isFacetHeaderVisible,
} from "./facetLayout.js";
import FacetHeaderView, { FACET_HEADER_PROPERTIES } from "./facetHeaderView.js";
import TitleView, { getTitleCoords, resolveTitleSpec } from "./titleView.js";
import Padding from "./layout/padding.js";
import Rectangle from "./layout/rectangle.js";
import clamp from "../utils/clamp.js";
import GridChild from "./gridView/gridChild.js";
import {
    createGridArrangement,
    queueGridChild,
    getOuterAxes,
    DECORATION_ORDER,
} from "./gridView/gridChildArrangement.js";
import { ZERO_FLEXDIMENSIONS } from "./layout/flexLayout.js";
import {
    clipCoords,
    normalizeClipOptions,
} from "./renderingContext/clipOptions.js";
import { isFacetFieldDef, isFacetMapping } from "./viewUtils.js";
import { propagateInteraction } from "./interactionRouting.js";
import { isLayerSpec, isUnitSpec } from "./viewSpecGuards.js";
import { isMultiscaleSpec } from "./multiscale.js";
import ViewError from "./viewError.js";

/**
 * @typedef {"row" | "column"} FacetChannel
 *
 * @typedef {object} NormalizedFacet
 * @prop {import("../spec/channel.js").FacetFieldDef | undefined} row
 * @prop {import("../spec/channel.js").FacetFieldDef | undefined} column
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

    /** @type {Required<import("../spec/view.js").FacetSpacing>} */
    #spacing;

    /** @type {GridChild} */
    #gridChild;

    /** @type {Map<FacetChannel, FacetHeaderView>} */
    #headerViews = new Map();

    /** @type {TitleView[]} */
    #fieldTitles = [];

    /** @type {FacetFactors} */
    #facetFactors = { row: [], column: [] };

    /** @type {import("./facetLayout.js").FacetCellLayout[]} */
    #interactionCells = [];

    #zoomBounds = Rectangle.ZERO;

    /** @type {import("../data/collector.js").default | undefined} */
    #observedCollector;

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

        this.#facet = normalizeFacetSpec(spec);
        this.#spacing = normalizeFacetSpacing(spec.spacing);
    }

    /**
     * @override
     */
    async initializeChildren() {
        this.#validateResolutions(this);
        this.child = await this.context.createOrImportView(
            this.spec.spec,
            this,
            this,
            this.getNextAutoName("facet"),
            (importedSpec) => {
                if (
                    !isUnitSpec(importedSpec) &&
                    !isLayerSpec(importedSpec) &&
                    !isMultiscaleSpec(importedSpec)
                ) {
                    throw new ViewError(
                        "Facet children must import unit, layer, or multiscale specs.",
                        this
                    );
                }
            },
            {
                inheritEncoding: true,
                // Both axis directions move with cells inside the outer viewport.
                axisLabelClipPolicy: { x: "pixel", y: "pixel" },
            }
        );

        if (this.child instanceof FacetView) {
            throw new Error(
                "Facet specs cannot contain an immediate facet child."
            );
        }
        this.child.visit((view) => {
            if (
                view.spec.viewportWidth !== undefined ||
                view.spec.viewportHeight !== undefined
            ) {
                throw new Error(
                    "Facet children do not support viewportWidth or viewportHeight. Set the viewport on the facet instead."
                );
            }
            this.#validateResolutions(view);
        });

        this.#gridChild = new FacetGridChild(this.child, this, 0);
        await this.#gridChild.syncGuideViews();

        for (const channel of /** @type {const} */ (["column", "row"])) {
            const field = this.#facet[channel];
            if (isFacetHeaderVisible(field)) {
                const header = FacetHeaderView.create(
                    channel,
                    this,
                    this.child,
                    field.header
                );
                if (header) {
                    this.#headerViews.set(channel, header);
                }
            }
            if (field && field.header !== null) {
                const titleSpec = resolveTitleSpec(
                    field.title === undefined ? field.field : field.title,
                    this.getConfigScopes(),
                    { orient: channel === "row" ? "left" : "top" }
                );
                if (titleSpec) {
                    this.#fieldTitles.push(
                        new TitleView(
                            titleSpec,
                            this.context,
                            this,
                            this.child,
                            this.getNextAutoName(
                                channel === "row"
                                    ? "facetTitleRow"
                                    : "facetTitleColumn"
                            )
                        )
                    );
                }
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
        yield* this.#fieldTitles;
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

        this.#syncFacetCollector();

        if (!this.#observedCollector?.completed) {
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

    /** @returns {Padding} */
    #getFieldTitlePadding() {
        return this.#fieldTitles.reduce(
            (padding, title) => padding.add(title.getOverhang()),
            Padding.zero()
        );
    }

    /**
     * @returns {import("./layout/flexLayout.js").FlexDimensions}
     */
    #getFacetGridSize() {
        return getFacetGridSize(
            this.#getFacetGrid(),
            this.child.getViewportSize(),
            (cell) => this.#getCellOverhang(cell),
            this.#getHeaderPadding(),
            this.#spacing
        ).addPadding(this.#getFieldTitlePadding());
    }

    /** @returns {import("./facetLayout.js").FacetHeaderPadding} */
    #getHeaderPadding() {
        return {
            row:
                this.#headerViews
                    .get("row")
                    ?.getLabelOverhang(this.#facetFactors.row) ??
                Padding.zero(),
            column:
                this.#headerViews
                    .get("column")
                    ?.getLabelOverhang(this.#facetFactors.column) ??
                Padding.zero(),
        };
    }

    /** @param {import("./facetLayout.js").FacetCell} cell */
    #getCellAxes(cell) {
        return getOuterAxes(
            Object.values(this.#gridChild.axes),
            cell.column,
            cell.row,
            this.#getFacetGrid()
        );
    }

    /** @param {import("./facetLayout.js").FacetCell} cell */
    #getCellOverhang(cell) {
        return this.#gridChild.getOverhangAndPadding(this.#getCellAxes(cell));
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./layout/rectangle.js").default} coords
     * @param {import("../types/rendering.js").RenderingOptions} [options]
     */
    arrange(context, coords, options = {}) {
        super.arrange(context, coords, options);
        this.#interactionCells = [];
        this.#zoomBounds = Rectangle.ZERO;

        if (!this.isConfiguredVisible()) {
            return;
        }

        // Outer axes need not occur in the first cell.
        for (const axis of Object.values(this.#gridChild.axes)) {
            axis.visit((view) => view.facetCoords.clear());
        }

        this.#syncFacetCollector();
        context.pushView(this, coords);

        // Keep geometry local; live parent coordinates supply scrolling, as in concat.
        let gridCoords = Rectangle.create(0, 0, coords.width, coords.height);
        const titleFrames = this.#fieldTitles.map((title) => {
            gridCoords = gridCoords.shrink(title.getOverhang());
            return { title, frame: gridCoords };
        });
        const layouts = getFacetCellLayouts(
            this.#getFacetGrid(),
            gridCoords,
            this.child.getViewportSize(),
            (cell) => this.#getCellOverhang(cell),
            this.#getHeaderPadding(),
            this.#spacing,
            context.getDevicePixelRatio()
        );
        const parentClip = normalizeClipOptions(options);
        const plotBounds =
            Rectangle.unionAll(layouts.map((layout) => layout.childCoords)) ??
            Rectangle.ZERO;
        this.#zoomBounds = clipCoords(
            plotBounds.translateBy(coords),
            parentClip
        );
        const arrangement = createGridArrangement();
        for (const layout of layouts) {
            const viewportCoords = clipCoords(
                layout.viewportCoords.translateBy(coords),
                parentClip
            );
            const childCoords = layout.childCoords.translateBy(coords);
            this.#interactionCells.push({
                ...layout,
                viewportCoords,
                childCoords,
            });

            queueGridChild(
                context,
                {
                    gridChild: this.#gridChild,
                    containerCoords: coords,
                    viewportCoords: childCoords,
                    viewCoords: childCoords,
                    axes: this.#getCellAxes(layout.cell),
                },
                {
                    ...options,
                    facetId: layout.cell.facetId,
                    firstFacet: this.#interactionCells.length === 1,
                },
                arrangement
            );
        }
        for (const [orient, header] of this.#headerViews) {
            header.updateLayout(
                orient,
                layouts,
                this.#getFacetGrid(),
                gridCoords,
                this.#spacing
            );
            arrangement.queueDecoration(
                header.titleSpec.zindex,
                DECORATION_ORDER.title,
                () =>
                    header.arrange(
                        context,
                        gridCoords.translateBy(coords),
                        options
                    )
            );
        }
        if (titleFrames.length && layouts.length) {
            for (const { title, frame } of titleFrames) {
                arrangement.queueDecoration(
                    title.titleSpec.zindex,
                    DECORATION_ORDER.title,
                    () =>
                        title.arrange(
                            context,
                            getTitleCoords(
                                plotBounds,
                                frame,
                                title.titleSpec
                            ).translateBy(coords),
                            options
                        )
                );
            }
        }
        arrangement.arrange();

        context.popView(this);
    }

    /**
     * Returns visible hit bounds and the full plot bounds used for projection.
     * Headers and spacing belong to the facet container rather than a cell.
     *
     * @param {{ x: number, y: number }} point
     */
    getInteractionCell(point) {
        return this.#interactionCells.find((layout) =>
            layout.viewportCoords.containsPoint(point.x, point.y)
        );
    }

    /**
     * Gaps navigate the nearest plot, with the zoom anchor clamped to its edge.
     * Cell hit testing stays separate so gaps cannot select marks or show tooltips.
     *
     * @param {{ x: number, y: number }} point
     */
    getZoomCoords(point) {
        const cell = this.getInteractionCell(point);
        if (cell) {
            return cell.childCoords;
        }
        if (!this.#zoomBounds.containsPoint(point.x, point.y)) {
            return;
        }

        /** @type {Rectangle | undefined} */
        let nearest;
        let distance = Infinity;
        for (const { childCoords: coords, viewportCoords } of this
            .#interactionCells) {
            if (viewportCoords.width <= 0 || viewportCoords.height <= 0) {
                continue;
            }

            const dx = point.x - clamp(point.x, coords.x, coords.x2);
            const dy = point.y - clamp(point.y, coords.y, coords.y2);
            const d = dx * dx + dy * dy;
            if (d < distance) {
                nearest = coords;
                distance = d;
            }
        }

        if (!nearest) {
            return;
        }

        return nearest.translate(
            point.x - clamp(point.x, nearest.x, nearest.x2),
            point.y - clamp(point.y, nearest.y, nearest.y2)
        );
    }

    /** @param {import("../utils/interaction.js").default} event */
    propagateInteraction(event) {
        propagateInteraction(this, event, () => {
            const layout = this.getInteractionCell(event.point);
            if (layout) {
                event.facetId = layout.cell.facetId;
                this.child.propagateInteraction(event);
            }
        });
    }

    #syncFacetCollector() {
        const collector = this.flowHandle?.collector;
        if (!collector || collector === this.#observedCollector) {
            return;
        }

        this.#observedCollector = collector;
        this.registerDisposer(
            collector.observe(() => {
                if (this.#updateFacetFactors()) {
                    this.context.requestLayoutReflow();
                }
            })
        );
        this.#updateFacetFactors();
        this.invalidateSizeCache();
    }

    /** @returns {boolean} Whether the row or column membership changed. */
    #updateFacetFactors() {
        if (!this.#observedCollector.completed) {
            return false;
        }
        const factors = collectFacetFactors(
            this.#facet,
            this.#observedCollector
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

    /** @param {import("./view.js").default} view */
    #validateResolutions(view) {
        // Layers may separate non-positional scales between marks, while the
        // facet cannot create separate scale/guide instances for its cells.
        for (const type of /** @type {const} */ (["scale", "axis", "legend"])) {
            if (view !== this && type === "legend") {
                continue;
            }
            const configured = view.spec.resolve?.[type] ?? {};
            const resolutions =
                view === this
                    ? configured
                    : {
                          x: configured.x ?? configured.default,
                          y: configured.y ?? configured.default,
                      };
            for (const [channel, behavior] of Object.entries(resolutions)) {
                if (behavior === "independent") {
                    throw new Error(
                        `FacetView currently supports only shared ${type} resolutions. Channel "${channel}" is resolved independently in view "${view.name}".`
                    );
                }
            }
        }
    }
}

class FacetGridChild extends GridChild {
    /** @param {import("./layout/point.js").default} point */
    getInteractionCoords(point) {
        const cell = /** @type {FacetView} */ (
            this.layoutParent
        ).getInteractionCell(point);
        return cell?.childCoords;
    }

    /**
     * @param {import("../spec/channel.js").PrimaryPositionalChannel} _channel
     * @param {import("./layout/point.js").default} point
     */
    getProjectionCoords(_channel, point) {
        return this.getInteractionCoords(point);
    }

    /**
     * @protected
     * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
     */
    getAxisResolutionForAxis(channel) {
        return this.view.getAxisResolution(channel);
    }
}

/**
 * @param {NormalizedFacet} facet
 * @param {import("../data/collector.js").default} collector
 * @returns {FacetFactors}
 */
function collectFacetFactors(facet, collector) {
    /** @type {Set<import("../spec/channel.js").Scalar>} */
    const row = new Set();
    /** @type {Set<import("../spec/channel.js").Scalar>} */
    const column = new Set();

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

    return {
        row: sortFacetFactors(row, facet.row?.sort),
        column: sortFacetFactors(column, facet.column?.sort),
    };
}

/**
 * @param {Set<import("../spec/channel.js").Scalar>} values
 * @param {import("../spec/channel.js").FacetFieldDef["sort"]} sort
 */
function sortFacetFactors(values, sort = "ascending") {
    if (Array.isArray(sort)) {
        const order = new Set(sort);
        return Array.from(order)
            .filter((value) => values.has(value))
            .concat(Array.from(values).filter((value) => !order.has(value)));
    }
    return Array.from(values).sort(
        sort === "descending" ? (a, b) => compareScalars(b, a) : compareScalars
    );
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
    /** @type {import("../spec/channel.js").FacetFieldDef | undefined} */
    let row;
    /** @type {import("../spec/channel.js").FacetFieldDef | undefined} */
    let column;
    const facet = spec.facet;

    if (isFacetFieldDef(facet)) {
        column = normalizeFacetFieldDef(facet, "column");
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

    if (
        spec.columns !== undefined &&
        (!Number.isInteger(spec.columns) || spec.columns < 1)
    ) {
        throw new Error('Facet "columns" must be a positive integer.');
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
 * @returns {import("../spec/channel.js").FacetFieldDef | undefined}
 */
function normalizeFacetFieldDef(fieldDef, channel) {
    if (fieldDef === undefined) {
        return undefined;
    }

    if (!isFacetFieldDef(fieldDef)) {
        throw new Error(`Facet ${channel} definition must define a field.`);
    }

    const sort = fieldDef.sort;
    if (
        sort !== undefined &&
        sort !== "ascending" &&
        sort !== "descending" &&
        !(
            Array.isArray(sort) &&
            sort.every(
                (value) =>
                    typeof value === "string" ||
                    typeof value === "boolean" ||
                    (typeof value === "number" && Number.isFinite(value))
            )
        )
    ) {
        throw new Error(
            'Facet sort must be "ascending", "descending", or an array of scalar values.'
        );
    }

    const header = fieldDef.header;
    if (
        header !== undefined &&
        header !== null &&
        (typeof header !== "object" ||
            Array.isArray(header) ||
            Object.keys(header).some(
                (key) => !FACET_HEADER_PROPERTIES.has(key)
            ) ||
            (header.labels !== undefined &&
                typeof header.labels !== "boolean") ||
            (header.format !== undefined && typeof header.format !== "string"))
    ) {
        throw new Error(
            'Facet header must be null or an object with supported title properties, boolean "labels", and string "format".'
        );
    }

    return fieldDef;
}

/**
 * @param {import("../spec/view.js").FacetSpec["spacing"]} spacing
 * @returns {Required<import("../spec/view.js").FacetSpacing>}
 */
function normalizeFacetSpacing(spacing = 10) {
    if (
        typeof spacing !== "number" &&
        (typeof spacing !== "object" ||
            spacing === null ||
            Array.isArray(spacing) ||
            Object.keys(spacing).some(
                (key) => key !== "row" && key !== "column"
            ))
    ) {
        throw new Error(
            'Facet spacing must be a number or an object with "row" and "column" gaps.'
        );
    }
    const { row = 10, column = 10 } =
        typeof spacing === "number"
            ? { row: spacing, column: spacing }
            : spacing;
    if (![row, column].every((value) => Number.isFinite(value) && value >= 0)) {
        throw new Error("Facet spacing must use finite nonnegative numbers.");
    }
    return { row, column };
}
