import UnitView from "./unitView.js";
import { format as numberFormat } from "d3-format";
import { markViewAsChrome, markViewAsNonAddressable } from "./viewSelectors.js";
import { mergeConfigScopes } from "../config/mergeConfig.js";
import Padding from "./layout/padding.js";
import { FACET_HEADER_SIZE } from "./facetLayout.js";
import {
    createTitleTextMark,
    getTitleCoords,
    getTitleOffsets,
    getTitleOrientMetadata,
    getTitleOverhang,
    resolveTitleSpec,
} from "./titleView.js";

/** @typedef {"row" | "column"} FacetHeaderOrient */
/** @typedef {{ x: number, y: number, text: string }} FacetHeaderDatum */

export const FACET_HEADER_PROPERTIES = new Set([
    "labels",
    "format",
    "style",
    "orient",
    "anchor",
    "frame",
    "offset",
    "reserve",
    "zindex",
    "align",
    "angle",
    "baseline",
    "dx",
    "dy",
    "color",
    "font",
    "fontSize",
    "fontStyle",
    "fontWeight",
]);

/** Dynamic, batched category labels using the view-title styling contract. */
export default class FacetHeaderView extends UnitView {
    /** @type {import("../spec/title.js").Title & {orient: "left" | "right" | "top" | "bottom"}} */
    titleSpec;

    /** @type {(value: import("../spec/channel.js").Scalar) => string} */
    formatLabel = String;

    /**
     * @param {FacetHeaderOrient} orient
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {import("../spec/channel.js").FacetHeader} [header]
     */
    static create(orient, layoutParent, dataParent, header = {}) {
        const scopes = layoutParent.getConfigScopes();
        const config = mergeConfigScopes([
            ...scopes.map((scope) => scope.header),
            ...scopes.map((scope) =>
                orient === "row" ? scope.headerRow : scope.headerColumn
            ),
        ]);
        if ((header.labels ?? config.labels) === false) {
            return;
        }
        // Batched data supplies the text; the placeholder only enables title-style resolution.
        const titleSpec = resolveTitleSpec(
            { text: " ", style: config.style ?? [], ...header },
            scopes,
            {
                orient: orient === "row" ? "left" : "top",
                anchor: "middle",
                align: "center",
                baseline: "middle",
                offset: 9,
                fontSize: 12,
                color: "black",
                reserve: true,
                zindex: 1,
                ...config,
            }
        );
        if (
            titleSpec &&
            !["left", "right", "top", "bottom"].includes(titleSpec.orient)
        ) {
            throw new Error(
                "Facet header orient must be left, right, top, bottom, or none."
            );
        }
        return titleSpec
            ? new FacetHeaderView(
                  orient,
                  layoutParent,
                  dataParent,
                  /** @type {FacetHeaderView["titleSpec"]} */ (titleSpec),
                  header.format ?? config.format
              )
            : undefined;
    }

    /**
     * @param {FacetHeaderOrient} orient
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {FacetHeaderView["titleSpec"]} titleSpec
     * @param {string} [format]
     */
    constructor(orient, layoutParent, dataParent, titleSpec, format) {
        super(
            createHeaderSpec(titleSpec),
            layoutParent.context,
            layoutParent,
            dataParent,
            layoutParent.getNextAutoName(
                orient === "column" ? "facetHeaderColumn" : "facetHeaderRow"
            )
        );
        this.titleSpec = titleSpec;
        markViewAsNonAddressable(this, { skipSubtree: true });
        markViewAsChrome(this, { skipSubtree: true });
        if (format !== undefined) {
            const formatter = numberFormat(format);
            this.formatLabel = (value) =>
                typeof value === "number" ? formatter(value) : String(value);
        }
    }

    /**
     * @param {import("../spec/channel.js").Scalar[]} values
     * @returns {Padding}
     */
    getLabelOverhang(values) {
        const spec = this.titleSpec;
        if (spec.reserve === false || spec.offset < 0) {
            return Padding.zero();
        }
        const fraction =
            spec.align === "center" && spec.baseline === "middle" ? 0.5 : 1;
        const overhang = values.reduce(
            (padding, value) =>
                padding.union(
                    getTitleOverhang(
                        { ...spec, text: this.formatLabel(value) },
                        this.context,
                        fraction
                    )
                ),
            Padding.zero()
        );
        // Retain the existing default bands, growing them only when labels need it.
        return Padding.createFromRecord({
            [spec.orient]: Math.max(FACET_HEADER_SIZE, overhang[spec.orient]),
        });
    }

    /**
     * @param {FacetHeaderOrient} orient
     * @param {import("./facetLayout.js").FacetCellLayout[]} layouts
     * @param {import("./facetLayout.js").FacetGrid} grid
     * @param {import("./layout/rectangle.js").default} coords
     * @param {import("../spec/view.js").FacetSpacing & {row: number, column: number}} spacing
     */
    updateLayout(orient, layouts, grid, coords, spacing) {
        const groups =
            orient === "row"
                ? grid.rowIndices
                : grid.hasRowFacet
                  ? grid.colIndices
                  : layouts.map((_, index) => [index]);
        const { xy } = getTitleOrientMetadata(this.titleSpec);
        const offsets = getTitleOffsets(this.titleSpec, this.context);
        const side = this.titleSpec.orient;
        const gap =
            this.titleSpec.reserve !== false && this.titleSpec.offset >= 0
                ? Padding.createFromRecord({
                      [side]:
                          side === "left" || side === "right"
                              ? spacing.column
                              : spacing.row,
                  })
                : Padding.zero();
        this.updateData(
            groups.map((indices) => {
                const plots = indices
                    .map((index) => layouts[index].childCoords)
                    .reduce((a, b) => a.union(b));
                const bounds = indices
                    .map((index) => layouts[index].viewportCoords)
                    .reduce((a, b) => a.union(b));
                const frame = getTitleCoords(
                    plots,
                    bounds.expand(gap),
                    this.titleSpec
                );
                const cell = layouts[indices[0]].cell;
                return {
                    x:
                        (frame.x +
                            xy.x * frame.width +
                            offsets.xOffset -
                            coords.x) /
                        coords.width,
                    y:
                        1 -
                        (frame.y +
                            (1 - xy.y) * frame.height +
                            offsets.yOffset -
                            coords.y) /
                            coords.height,
                    text: this.formatLabel(
                        orient === "row" ? cell.facetId[0] : cell.facetId.at(-1)
                    ),
                };
            })
        );
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
 * @param {import("../spec/title.js").Title} titleSpec
 * @returns {import("../spec/view.js").UnitSpec}
 */
function createHeaderSpec(titleSpec) {
    return {
        domainInert: true,
        data: { values: [] },
        resolve: {
            scale: { x: "excluded", y: "excluded" },
            axis: { x: "excluded", y: "excluded" },
        },
        mark: createTitleTextMark(
            titleSpec,
            { x: 0, y: 0 },
            { xOffset: 0, yOffset: 0 },
            false
        ),
        encoding: {
            x: { field: "x", type: "quantitative", scale: null },
            y: { field: "y", type: "quantitative", scale: null },
            text: { field: "text", type: "nominal" },
        },
    };
}
