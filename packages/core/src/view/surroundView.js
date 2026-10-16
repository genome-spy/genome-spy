import GridView from "./gridView/gridView.js";
import Grid from "./layout/grid.js";
import Padding, { applyOverhangConfig } from "./layout/padding.js";
import { getSizeDefMinPx } from "./layout/flexLayout.js";
import UnitView from "./unitView.js";
import ViewError from "./viewError.js";
import { VISIT_SKIP } from "./view.js";
import { isInChromeSubtree } from "./viewChrome.js";
import { markViewAsNonAddressable } from "./viewSelectors.js";
import {
    isImportSpec,
    isLayerableSpec,
    isSurroundSpec,
} from "./viewSpecGuards.js";
import { cloneWithSpecOrigin, inheritSpecOrigin } from "../utils/specOrigin.js";
import {
    findChannelDefWithScale,
    getPrimaryChannel,
    isChannelWithScale,
} from "../encoder/encoder.js";
import {
    isRulerParameter,
    isSelectionParameter,
} from "../paramRuntime/paramUtils.js";
import { asSelectionConfig } from "../selection/selection.js";

/**
 * @typedef {import("../spec/view.js").Side} Side
 * @typedef {Side | "center"} Region
 * @typedef {import("../spec/channel.js").PrimaryPositionalChannel} Channel
 * @typedef {import("./view.js").default} View
 */

const SIDES = /** @type {const} */ (["top", "right", "bottom", "left"]);

/**
 * Aligns marginal plots by their central plotting intervals.
 * @extends {GridView<import("../spec/view.js").SurroundSpec>}
 */
export default class SurroundView extends GridView {
    /** @type {View} */
    #center;

    /** @type {Map<View, Side>} */
    #sides = new Map();

    /**
     * @param {import("../spec/view.js").SurroundSpec} spec
     * @param {import("../types/viewContext.js").default} context
     * @param {import("./containerView.js").default} layoutParent
     * @param {View} dataParent
     * @param {string} name
     * @param {import("./view.js").ViewOptions} [options]
     */
    constructor(spec, context, layoutParent, dataParent, name, options) {
        super(spec, context, layoutParent, dataParent, name, 3, options);
        this.spec = spec;

        for (const side of Object.keys(spec.surround)) {
            if (!SIDES.includes(/** @type {Side} */ (side))) {
                throw this.#error(`Unknown surround side "${side}".`, spec, [
                    "surround",
                    side,
                ]);
            }
        }
        if (
            "axes" in spec ||
            "viewportWidth" in spec ||
            "viewportHeight" in spec
        ) {
            throw this.#error(
                "Surround axes and viewports must be configured on its plots.",
                spec
            );
        }
        validateInputHost(spec, this);
        for (const channel of /** @type {const} */ (["x", "y"])) {
            if (
                this.getConfiguredOrDefaultResolution(channel, "axis") !==
                "independent"
            ) {
                throw this.#error(
                    "Surround does not support cross-region shared axes.",
                    spec,
                    ["resolve", "axis", channel]
                );
            }
        }
    }

    /** @override */
    async initializeChildren() {
        this.#center = await this.context.createOrImportView(
            this.#preparePlot(this.spec.spec),
            this,
            this,
            "center",
            (spec) => this.#validatePlot(spec),
            { inheritEncoding: true }
        );

        const sides = await Promise.all(
            SIDES.flatMap((side) => {
                const spec = this.spec.surround[side];
                return spec === undefined ? [] : [this.#createSide(side, spec)];
            })
        );
        this.setChildren([this.#center, ...sides]);
        await this.syncGuideViews();
    }

    /**
     * @param {Side} side
     * @param {import("../spec/view.js").SurroundSide} authored
     */
    async #createSide(side, authored) {
        const aligned = getAlignedChannel(side);
        const perpendicular = aligned === "x" ? "y" : "x";
        const dimension = aligned === "x" ? "width" : "height";
        const source = Array.isArray(authored) ? this.spec : authored;
        const originPath = Array.isArray(authored)
            ? ["surround", side]
            : undefined;
        const group = Array.isArray(authored) ? { views: authored } : authored;
        if (!Array.isArray(group.views)) {
            throw this.#error(
                `Surround ${side} requires a views array.`,
                source,
                originPath ?? ["views"]
            );
        }
        const invalidSize = [
            "width",
            "height",
            "viewportWidth",
            "viewportHeight",
        ].find((property) => property in group);
        if (invalidSize) {
            throw this.#error(
                `Surround ${side} groups inherit their aligned size from the center; specify thickness on their plots.`,
                source,
                [invalidSize]
            );
        }
        validateInputHost(group, this);

        const { views, ...groupProps } = group;
        const props = cloneWithSpecOrigin(groupProps);
        // Group overhang controls the surround's reservation, not the nested
        // concat's geometry: it must still compensate for its own decorations.
        delete props.overhang;
        const childSpecs = views.map((spec) => this.#preparePlot(spec, side));
        const concatSpec = inheritSpecOrigin(
            source,
            {
                ...props,
                [dimension]: "container",
                ...(aligned === "x"
                    ? { vconcat: childSpecs }
                    : { hconcat: childSpecs }),
            },
            originPath
        );
        const tracks = /** @type {import("./concatView.js").default} */ (
            await this.context.createOrImportView(
                concatSpec,
                this,
                this,
                side,
                undefined,
                {
                    inheritEncoding: true,
                    collapseWhenEmpty: true,
                    alignedChannel: aligned,
                    resolutionBoundaryChannels: [perpendicular],
                    childSpecValidator: (spec) =>
                        this.#validatePlot(spec, side),
                }
            )
        );
        if (Array.isArray(authored)) {
            markViewAsNonAddressable(tracks);
        }
        this.#sides.set(tracks, side);
        return tracks;
    }

    /**
     * @param {import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec} spec
     * @param {Side} [side]
     */
    #preparePlot(spec, side) {
        const copy = cloneWithSpecOrigin(spec);
        if (!isImportSpec(copy)) {
            this.#validatePlot(copy, side);
        }
        return copy;
    }

    /**
     * Validates imported specs before construction and overrides implicit theme
     * sizing only on the aligned dimension. Authored input is never mutated.
     * @param {import("../spec/view.js").ViewSpec} spec
     * @param {Side} [side]
     */
    #validatePlot(spec, side) {
        const nested = side && isSurroundSpec(spec);
        if (!isLayerableSpec(spec) && !nested) {
            throw this.#error(
                `Surround ${side ?? "center"} accepts unit or layer plots${side ? " and nested surrounds" : ""}.`,
                spec
            );
        }
        const channel = side
            ? getAlignedChannel(side)
            : this.options.imposedAlignmentChannel;
        if (channel) {
            const dimension = channel === "x" ? "width" : "height";
            if (spec[dimension] !== undefined) {
                throw this.#error(
                    `Surround ${side ?? "center"} plots inherit ${dimension} from the center; specify only their thickness.`,
                    spec,
                    [dimension]
                );
            }
            if (!nested) {
                spec[dimension] = "container";
            }
        }
        // Future: viewportWidth/viewportHeight on the center define scrolling;
        // aligned tracks inherit its content/viewport spans and scroll offsets.
        if ("viewportWidth" in spec || "viewportHeight" in spec) {
            throw this.#error(
                "Surround plots do not support scrollable viewports.",
                spec
            );
        }
    }

    /**
     * @param {string} message
     * @param {object} source
     * @param {(string | number)[]} [path]
     */
    #error(message, source, path = []) {
        return new ViewError(message, this).withSpecLocation(source, path);
    }

    /** @override */
    isConfiguredVisible() {
        return (
            super.isConfiguredVisible() &&
            (this.#center?.isConfiguredVisible() ?? false)
        );
    }

    /**
     * @override
     * @param {import("../spec/channel.js").Channel} channel
     * @param {import("../spec/view.js").ResolutionTarget} type
     */
    getDefaultResolution(channel, type) {
        return type === "scale" && (channel === "x" || channel === "y")
            ? "shared"
            : "independent";
    }

    /** @override */
    get visibleChildren() {
        return this.isConfiguredVisible() ? super.visibleChildren : [];
    }

    /** @override */
    get layoutGrid() {
        return new SurroundGrid(
            this.visibleChildren.map(({ view }) =>
                view === this.#center ? "center" : this.#sides.get(view)
            )
        );
    }

    /**
     * @override
     * @param {"row" | "column"} direction
     * @param {import("./gridView/gridChild.js").default[]} children
     */
    getPlotSizeChildren(direction, children) {
        const center = children.find(({ view }) => view === this.#center);
        return center ? [center] : children;
    }

    /** @override @param {View} view @param {Channel} channel */
    alignsChild(view, channel) {
        const side = this.#sides.get(view);
        return (
            view === this.#center ||
            (side !== undefined && getAlignedChannel(side) === channel)
        );
    }

    /** @override @param {Channel} _channel */
    getAlignmentAnchor(_channel) {
        return this.#center;
    }

    /**
     * @override
     * @param {Channel} channel
     * @param {import("./gridView/gridChild.js").default[]} children
     * @param {import("./layout/flexLayout.js").SizeDef} size
     * @param {{ before: number, after: number }} insets
     */
    getTrackSizeAndInsets(channel, children, size, insets) {
        const reserved = { ...insets };
        const dimension = channel === "x" ? "width" : "height";

        if (children.some((child) => child.view === this.#center)) {
            const sides =
                channel === "x" ? ["left", "right"] : ["top", "bottom"];
            for (const [i, side] of sides.entries()) {
                if (
                    this.visibleChildren.some(
                        (child) => this.#sides.get(child.view) === side
                    )
                ) {
                    reserved[i === 0 ? "before" : "after"] = 0;
                }
            }
        } else {
            // Every other row or column holds one perpendicular arm.
            const arm = children[0];
            const side = this.#sides.get(arm.view);
            const edge = side === "left" || side === "top" ? "before" : "after";
            const decoration =
                this.getChildOverhangAndPadding(arm)[dimension] +
                (this.spec.spacing ?? 10);
            const required = this.#getRequiredInset(channel, edge);

            if (size.grow) {
                // Flexible arms absorb headroom inside their existing flex slot.
                const minimum = Math.min(
                    size.maxPx ?? Infinity,
                    required - decoration
                );
                if (minimum > getSizeDefMinPx(size)) {
                    size = { ...size, minPx: minimum };
                }
            }

            reserved[edge] = Math.max(
                0,
                required - getSizeDefMinPx(size) - decoration
            );
        }

        return { size, ...reserved };
    }

    /** @param {Channel} channel @param {"before" | "after"} edge */
    #getRequiredInset(channel, edge) {
        return Math.max(
            0,
            ...this.visibleChildren
                .filter((child) => this.alignsChild(child.view, channel))
                .map((child) => child.view.getAlignment(channel)[edge])
        );
    }

    /**
     * Side chrome can use the empty corners, up to the neighboring arm's
     * guaranteed footprint. Keep full geometry for the normal arrangement path.
     * @override
     * @param {import("./gridView/gridChild.js").default} child
     */
    getChildOverhangAndPadding(child) {
        const side = this.#sides.get(child.view);
        if (!side) {
            return child.getOverhangAndPadding();
        }

        const authored = this.spec.surround[side];
        const policy = Array.isArray(authored) ? undefined : authored.overhang;
        const measured = applyOverhangConfig(
            child.getOverhangAndPadding(),
            policy
        );

        const horizontal = getAlignedChannel(side) === "x";
        const edges = horizontal
            ? /** @type {const} */ (["left", "right"])
            : /** @type {const} */ (["top", "bottom"]);
        const reserved = { ...measured };
        for (const edge of edges) {
            const neighbor = this.visibleChildren.find(
                ({ view }) => this.#sides.get(view) === edge
            );
            if (
                !neighbor ||
                neighbor.view.getAlignment(getAlignedChannel(edge))[
                    side === "top" || side === "left" ? "before" : "after"
                ] > 0 ||
                policy?.[edge] === true ||
                this.#preservesOverhang(child.view, edge) ||
                // When two axes compete, top/bottom borrow horizontally and
                // left/right retain their vertical reservation.
                (!horizontal && neighbor.getOverhangAndPadding()[side] > 0)
            ) {
                continue;
            }

            const dimension = horizontal ? "width" : "height";
            const budget =
                getSizeDefMinPx(neighbor.view.getViewportSize()[dimension]) +
                (this.spec.spacing ?? 10);
            reserved[edge] = Math.max(0, reserved[edge] - budget);
        }
        return Padding.createFromRecord(reserved);
    }

    /** @param {View} group @param {Side} edge */
    #preservesOverhang(group, edge) {
        const tracks = /** @type {import("./concatView.js").default} */ (group);
        return [group, ...tracks.children].some(
            (view) =>
                view.isConfiguredVisible() &&
                (view.spec.overhang?.[edge] === true ||
                    view.getPadding()[edge] > 0)
        );
    }

    /**
     * The central plot is the alignment anchor; this view's own bounds include
     * all side tracks and decorations. Nested surrounds export this interval to their parent.
     * @override
     */
    getTrackPlotGeometry() {
        const coords = this.#center.coords;
        // Future scrolling must separate the center's content and viewport
        // intervals, translating aligned content while keeping headers fixed.
        return coords ? { content: coords, viewport: coords } : undefined;
    }

    /**
     * @override
     * @param {Parameters<GridView["syncGuideViews"]>[0]} [options]
     */
    async syncGuideViews(options) {
        this.#validateResolutions();
        await super.syncGuideViews(options);
    }

    #validateResolutions() {
        if (this.resolutions.axis.x || this.resolutions.axis.y) {
            throw this.#error(
                "Surround does not support axes hoisted from its plots.",
                this.spec
            );
        }

        const exported = new Set(
            Array.from(this.#sides.values(), getAlignedChannel)
        );
        for (const channel of exported) {
            this.#validateAlignedScale(this.#center, channel, "center");
        }
        for (const [boundary, side] of this.#sides) {
            this.#validateAlignedScale(boundary, getAlignedChannel(side), side);
        }
        for (const view of this.getDescendants()) {
            if (!(view instanceof UnitView) || isInChromeSubtree(view))
                continue;
            for (const channel of /** @type {const} */ (["x", "y"])) {
                const axis = view.getAxisResolution(channel);
                if (axis && this.getDataAncestors().includes(axis.hostView)) {
                    throw new ViewError(
                        "Surround does not support axes hoisted from its plots.",
                        view
                    );
                }
            }
        }
    }

    /** @param {View} root @param {Channel} channel @param {Region} region */
    #validateAlignedScale(root, channel, region) {
        root.visit((view) => {
            if (view instanceof SurroundView) {
                this.#validateAlignedScale(view.#center, channel, region);
                return VISIT_SKIP;
            }
            if (!(view instanceof UnitView) || isInChromeSubtree(view)) {
                return;
            }
            for (const encoded of /** @type {const} */ ([
                channel,
                channel === "x" ? "x2" : "y2",
            ])) {
                const def = findChannelDefWithScale(
                    view.mark.encoding[encoded]
                );
                if (!def || def.scale === null) {
                    continue;
                }
                const target = getPrimaryChannel(
                    def.resolutionChannel ?? encoded
                );
                if (
                    !isChannelWithScale(target) ||
                    view.getScaleResolution(target) !==
                        this.#center.getScaleResolution(channel)
                ) {
                    throw new ViewError(
                        `Surround ${region} plot "${view.name}" must share the center's ${channel} scale.`,
                        view
                    ).withSpecLocation(view.spec, ["encoding", encoded]);
                }
            }
        });
    }

    /**
     * @override
     * @param {import("./renderingContext/viewRenderingContext.js").default} context
     * @param {import("./layout/rectangle.js").default} coords
     * @param {import("../types/rendering.js").RenderingOptions} [options]
     */
    arrange(context, coords, options = {}) {
        super.arrange(context, coords, options);
        if (!this.isConfiguredVisible()) {
            return;
        }

        this.#validateResolutions();
        const center = this.#center.coords;
        const tolerance = 0.5 / context.getDevicePixelRatio();
        for (const [boundary, side] of this.#sides) {
            const channel = getAlignedChannel(side);
            const dimension = channel === "x" ? "width" : "height";
            boundary.visit((view) => {
                if (!view.isConfiguredVisible() || isInChromeSubtree(view)) {
                    return VISIT_SKIP;
                }
                if (view instanceof UnitView || view instanceof SurroundView) {
                    const plot = view.getAlignmentCoords(channel);
                    if (
                        Math.abs(plot[channel] - center[channel]) > tolerance ||
                        Math.abs(plot[dimension] - center[dimension]) >
                            tolerance
                    ) {
                        throw new ViewError(
                            `Surround ${side} plot "${view.name}" has an incompatible ${channel} plotting span.`,
                            view
                        );
                    }
                    if (view instanceof SurroundView) return VISIT_SKIP;
                }
            });
        }
        if (
            this.children.some(
                (view) =>
                    view instanceof GridView &&
                    view.children.some((child) => child instanceof SurroundView)
            )
        ) {
            const regions = this.visibleChildren.map((child) =>
                child.view.getLayoutFootprints()
            );
            for (let i = 0; i < regions.length; i++) {
                for (let j = i + 1; j < regions.length; j++) {
                    for (const one of regions[i]) {
                        for (const two of regions[j]) {
                            if (one.chrome && two.chrome) continue;
                            const a = one.coords;
                            const b = two.coords;
                            if (
                                Math.min(a.x2, b.x2) - Math.max(a.x, b.x) >
                                    tolerance &&
                                Math.min(a.y2, b.y2) - Math.max(a.y, b.y) >
                                    tolerance
                            ) {
                                throw new ViewError(
                                    `Surround panels "${one.view.name}" and "${two.view.name}" overlap.`,
                                    two.view
                                ).withSpecLocation();
                            }
                        }
                    }
                }
            }
        }
    }
}

/** @param {Side} side @returns {Channel} */
function getAlignedChannel(side) {
    return side === "top" || side === "bottom" ? "x" : "y";
}

/**
 * @param {Pick<import("../spec/view.js").ViewSpecBase, "params">} spec
 * @param {View} owner
 */
function validateInputHost(spec, owner) {
    if (
        spec.params?.some(
            (param) =>
                isRulerParameter(param) ||
                (isSelectionParameter(param) &&
                    asSelectionConfig(param.select).type === "interval")
        )
    ) {
        throw new ViewError(
            "Surround input controllers must be configured on its plots.",
            owner
        );
    }
}

/** Fixed cross cells, with absent rows/columns removed and no placeholder views. */
class SurroundGrid extends Grid {
    /** @type {[number, number][]} */
    #cells;

    /** @param {Region[]} regions */
    constructor(regions) {
        super(regions.length, 3);
        const column = Number(regions.includes("left"));
        const row = Number(regions.includes("top"));

        /** @type {Record<Region, [number, number]>} */
        const positions = {
            center: [column, row],
            top: [column, 0],
            right: [column + 1, row],
            bottom: [column, row + 1],
            left: [0, row],
        };

        this.#cells = regions.map((region) => {
            if (!Object.hasOwn(positions, region)) {
                throw new Error(`Unknown surround region: ${region}`);
            }
            return positions[region];
        });
    }

    get nCols() {
        return Math.max(-1, ...this.#cells.map(([column]) => column)) + 1;
    }

    get nRows() {
        return Math.max(-1, ...this.#cells.map(([, row]) => row)) + 1;
    }

    get colIndices() {
        return this.#getIndices(0, this.nCols);
    }

    get rowIndices() {
        return this.#getIndices(1, this.nRows);
    }

    /** @param {0 | 1} dimension @param {number} count */
    #getIndices(dimension, count) {
        return Array.from({ length: count }, (_, index) =>
            this.#cells.flatMap((cell, i) =>
                cell[dimension] === index ? [i] : []
            )
        );
    }

    /** @param {number} index @returns {[number, number]} */
    getCellCoords(index) {
        return this.#cells[index];
    }

    /** @param {number} column @param {number} row */
    getCellIndex(column, row) {
        const index = this.#cells.findIndex(
            ([col, r]) => col === column && r === row
        );
        return index < 0 ? undefined : index;
    }
}
