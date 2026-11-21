import { inheritSpecOrigin } from "../utils/specOrigin.js";
import createDomain from "../utils/domainArray.js";
import { getVisibleCellRange, readRasterTile } from "../data/rasterTile.js";
import { isValueDef } from "../encoder/encoder.js";
import { hasGroupingGaps } from "../genome/indexGapMapping.js";
import {
    isGradientIntervalPredicate,
    selectionPredicateLeaves,
} from "../selection/selectionPredicateTree.js";
import clamp from "../utils/clamp.js";
import { getCachedOrCall } from "../utils/propertyCacher.js";
import ViewError from "../view/viewError.js";
import Mark from "./mark.js";
import { fixCoveragePositional } from "./markUtils.js";

/** @typedef {[lower: number, upper: number, matching: number, fallback: number]} CellOpacity */

/** @extends {Mark<import("../spec/mark.js").RasterProps>} */
export default class RasterMark extends Mark {
    /** @returns {import("../spec/channel.js").Channel[]} */
    getSupportedChannels() {
        return ["x", "y", "x2", "y2", "color", "opacity"];
    }

    isPickingParticipant() {
        return false;
    }

    /** @param {import("../spec/channel.js").Encoding} encoding */
    fixEncoding(encoding) {
        const y = encoding.y;
        const strip =
            y &&
            "field" in y &&
            (y.type === "nominal" || y.type === "ordinal") &&
            !encoding.y2;
        for (const [axis, end] of /** @type {const} */ ([
            ["x", "x2"],
            ["y", "y2"],
        ])) {
            if (axis === "y" && strip) {
                fixCoveragePositional(encoding, axis);
                continue;
            }
            const binding = encoding[axis];
            if (!binding || !("dimension" in binding) || encoding[end]) {
                throw new Error(
                    `Raster requires a grid dimension for "${axis}".`
                );
            }
            const { dimension, ...options } = binding;
            const path = "dimensions[" + JSON.stringify(dimension) + "]";
            const indexStrip = strip && binding.type === "index";
            const domainInert = binding.type !== "quantitative" && !indexStrip;
            encoding[axis] = inheritSpecOrigin(binding, {
                ...options,
                title: options.title ?? null,
                field: path + ".origin",
                band: 0,
                ...(domainInert && { domainInert: true }),
            });
            encoding[end] = {
                // Index data domains use inclusive observations. Band 1 still
                // draws the exclusive right edge of the last covered index.
                expr:
                    `datum.${path}.origin + datum.${path}.step * datum.${path}.count` +
                    (indexStrip ? " - 1" : ""),
                band: indexStrip ? 1 : 0,
                domainInert,
            };
        }
        if (
            !encoding.color ||
            !("field" in encoding.color) ||
            !["quantitative", "nominal", "ordinal"].includes(
                encoding.color.type
            ) ||
            "condition" in encoding.color
        ) {
            throw new Error(
                "Raster requires a quantitative or categorical color field."
            );
        }
        return encoding;
    }

    getColorCellBinding() {
        return getCachedOrCall(this, "colorCellBinding", () => {
            const { field, type, scale } =
                /** @type {import("../spec/channel.js").ScaleFieldDef<import("../spec/channel.js").Type>} */ (
                    this.encoding.color
                );
            const direct = scale === null;
            const { x, y } = this.unitView.getEncoding();
            // fixEncoding requires a grid dimension on x and permits a band on y.
            const column =
                /** @type {import("../spec/channel.js").RasterDimensionDef} */ (
                    x
                ).dimension;
            const row = "dimension" in y ? y.dimension : undefined;
            return {
                type,
                direct,
                strip: row === undefined,
                domainKey: "raster:" + JSON.stringify([column, row, field]),
                readTile: (/** @type {object} */ datum) =>
                    readRasterTile(datum, column, row, field, direct),
            };
        });
    }

    /** Resolves opacity driven by a gradient legend to the raw color cell. */
    getCellOpacityReader() {
        return getCachedOrCall(this, "cellOpacityBinding", () => {
            const branches = this.encoders.opacity?.branches;
            const test = branches?.[0].predicate.selection;
            if (
                !branches?.some(
                    ({ predicate }) =>
                        predicate.selection &&
                        selectionPredicateLeaves(predicate.selection).some(
                            isGradientIntervalPredicate
                        )
                )
            ) {
                return null;
            }
            const { type, direct } = this.getColorCellBinding();
            if (
                type !== "quantitative" ||
                direct ||
                branches.length !== 2 ||
                !test ||
                !("param" in test) ||
                test.type !== "interval" ||
                test.projections.length !== 1 ||
                test.projections[0].input !== "color" ||
                !branches.every(
                    ({ accessor }) =>
                        accessor.constant && isValueDef(accessor.channelDef)
                )
            ) {
                throw new ViewError(
                    "Raster cell opacity requires a single interval condition on a quantitative color gradient and value definitions for both branches.",
                    this.unitView
                );
            }
            const { param, empty } = test;
            const component =
                /** @type {import("../spec/parameter.js").GradientSelectionChannel} */ (
                    test.projections[0].component
                );
            const [matched, fallback] = branches.map(({ accessor }) =>
                accessor.asNumberAccessor()
            );
            const runtime = this.unitView.paramRuntime;
            /** @returns {CellOpacity} */
            return () => {
                const selection =
                    /** @type {import("../types/selectionTypes.js").IntervalSelection} */ (
                        runtime.findValue(param)
                    );
                const bounds = selection.intervals[component];
                const outside = bounds || !empty ? fallback : matched;
                return [
                    bounds?.[0] ?? 0,
                    bounds?.[1] ?? 0,
                    bounds ? clamp(matched(null)) : 0,
                    clamp(outside(null)),
                ];
            };
        });
    }

    validateRenderingScales() {
        const { strip, type, direct } = this.getColorCellBinding();
        const x = this.encoders.x.scale;
        const y = this.encoders.y.scale;
        if (strip && y?.type !== "band") {
            throw new ViewError(
                "Raster strips need a band scale on y.",
                this.unitView
            );
        }
        for (const scale of strip ? [x] : [x, y]) {
            if (
                !scale ||
                !["linear", "index", "locus"].includes(scale.type) ||
                hasGroupingGaps(scale.props) ||
                ("paddingInner" in scale && scale.paddingInner()) ||
                ("paddingOuter" in scale && scale.paddingOuter())
            ) {
                throw new ViewError(
                    "Raster axes need linear or unpadded index/locus scales without gaps.",
                    this.unitView
                );
            }
        }
        if (
            this.encoders.opacity &&
            !isValueDef(this.encoders.opacity.channelDef)
        ) {
            throw new ViewError(
                "Raster opacity requires a value encoding.",
                this.unitView
            );
        }
        if (direct) return undefined;

        const resolution = this.unitView.getScaleResolution("color");
        const colorScale = resolution.getScale();
        if (
            type !== "quantitative" &&
            (colorScale.type !== "ordinal" ||
                !colorScale.domain().length ||
                !resolution.isDomainDefinedExplicitly())
        ) {
            throw new ViewError(
                "Categorical raster colors need an ordinal scale with an explicit domain.",
                this.unitView
            );
        }
        return resolution;
    }

    /**
     * @param {import("../data/collector.js").default} collector
     * @param {import("../data/viewportDomain.js").ViewportConstraint[]} [constraints]
     */
    getColorDomain(collector, constraints = []) {
        const { type, direct, readTile } = this.getColorCellBinding();
        const domain = createDomain(type);
        if (direct || type !== "quantitative" || !collector.completed)
            return domain;
        const colorResolution = this.unitView.getScaleResolution("color");
        const logarithmic = colorResolution?.getResolvedScaleType() === "log";
        const xConstraint = constraints.find(({ channel }) => channel === "x");
        const yConstraint = constraints.find(({ channel }) => channel === "y");
        for (const datum of collector.getData()) {
            const { horizontal, vertical, values } = readTile(datum);
            const [left, right] = getVisibleCellRange(horizontal, xConstraint);
            const [top, bottom] = vertical
                ? getVisibleCellRange(vertical, yConstraint)
                : [0, 1];
            for (let row = top; row < bottom; row++) {
                const start = row * horizontal.count;
                for (let column = left; column < right; column++) {
                    const value = values[start + column];
                    if (
                        typeof value === "number" &&
                        Number.isFinite(value) &&
                        (!logarithmic || value !== 0)
                    ) {
                        domain.extend(value);
                    }
                }
            }
        }
        return domain;
    }
}
