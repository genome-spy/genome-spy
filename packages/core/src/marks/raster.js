import { inheritSpecOrigin } from "../utils/specOrigin.js";
import createDomain from "../utils/domainArray.js";
import {
    getTriangleColumnDomain,
    getTriangleViewport,
    getVisibleCellRange,
    readRasterTile,
} from "../data/rasterTile.js";
import {
    matchesViewport,
    normalizeViewportConstraint,
} from "../data/viewportDomain.js";
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

/** @extends {Mark<import("../spec/mark.js").RasterProps | import("../spec/mark.js").IconProps>} */
export default class RasterMark extends Mark {
    /** @returns {import("../spec/channel.js").Channel[]} */
    getSupportedChannels() {
        return this.isIcon
            ? ["x", "y", "color", "opacity", "size"]
            : ["x", "y", "x2", "y2", "color", "opacity"];
    }

    get isIcon() {
        return this.getType() === "icon";
    }

    get isTriangle() {
        return (
            this.getType() === "raster" &&
            /** @type {import("../spec/mark.js").RasterProps} */ (
                this.properties
            ).projection === "triangle"
        );
    }

    isPickingParticipant() {
        return false;
    }

    /** @param {import("../spec/channel.js").Encoding} encoding */
    fixEncoding(encoding) {
        if (this.isIcon) {
            if (
                [encoding.x, encoding.y].some(
                    (def) => def && "dimension" in def
                )
            ) {
                throw new Error(
                    "Raster icons require point positions on x and y."
                );
            }
            if (
                [encoding.x, encoding.y, encoding.size].some(
                    (def) => def && "condition" in def
                )
            ) {
                throw new Error(
                    "Raster icon positions and size require unconditional encodings."
                );
            }
            encoding.x ??= { value: 0.5 };
            encoding.y ??= { value: 0.5 };
            encoding.size ??= { value: 1 };
        } else {
            this.#fixGridPosition(encoding);
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

    /** @param {import("../spec/channel.js").Encoding} encoding */
    #fixGridPosition(encoding) {
        const y = encoding.y;
        const triangle = this.isTriangle;
        if (triangle && (y || encoding.y2)) {
            throw new Error("Triangle rasters use only the x locus axis.");
        }
        const strip =
            y &&
            "field" in y &&
            (y.type === "nominal" || y.type === "ordinal") &&
            !encoding.y2;
        for (const [axis, end] of /** @type {const} */ ([
            ["x", "x2"],
            ["y", "y2"],
        ])) {
            if (axis === "y" && triangle) break;
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
                ...(triangle && { buildIndex: false }),
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
    }

    getColorCellBinding() {
        return getCachedOrCall(this, "colorCellBinding", () => {
            const { field, type, scale } =
                /** @type {import("../spec/channel.js").ScaleFieldDef<import("../spec/channel.js").Type>} */ (
                    this.encoding.color
                );
            const direct = scale === null;
            const icon = this.isIcon;
            const { x, y } = this.unitView.getEncoding();
            const { columnDimension = "column", rowDimension = "row" } =
                /** @type {import("../spec/mark.js").IconProps} */ (
                    this.properties
                );
            // Grid placement binds a dimension on x and permits a band on y.
            const column =
                x && "dimension" in x ? x.dimension : columnDimension;
            const row =
                y && "dimension" in y
                    ? y.dimension
                    : icon || this.isTriangle
                      ? rowDimension
                      : undefined;
            const options = {
                direct,
                grid: this.isTriangle ? /** @type {const} */ ("locus") : !icon,
            };
            return {
                type,
                direct,
                column,
                row,
                strip: row === undefined,
                domainKey:
                    "raster:" + JSON.stringify([column, row, field, icon]),
                readTile: (/** @type {object} */ datum) =>
                    readRasterTile(datum, column, row, field, options),
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
        if (!this.isIcon) this.#validateGridScales(strip);
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

    /** @param {boolean} strip */
    #validateGridScales(strip) {
        const x = this.encoders.x.scale;
        const y = this.encoders.y?.scale;
        const triangle = this.isTriangle;
        if (triangle && x?.type !== "locus") {
            throw new ViewError(
                "Triangle rasters need a locus scale on x.",
                this.unitView
            );
        }
        if (strip && y?.type !== "band") {
            throw new ViewError(
                "Raster strips need a band scale on y.",
                this.unitView
            );
        }
        for (const scale of strip || triangle ? [x] : [x, y]) {
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
        const icon = this.isIcon;
        const anchors = icon && constraints.map(normalizeViewportConstraint);
        const grid = icon ? [] : constraints;
        const xConstraint = grid.find(({ channel }) => channel === "x");
        const yConstraint = grid.find(({ channel }) => channel === "y");
        const coords = this.unitView.layoutCoords;
        const triangle =
            this.isTriangle && xConstraint && coords?.width > 0
                ? getTriangleViewport(
                      xConstraint.domain,
                      coords.width,
                      coords.height
                  )
                : undefined;
        for (const datum of collector.getData()) {
            if (
                anchors &&
                !anchors.every((constraint) =>
                    matchesViewport(datum, constraint)
                )
            )
                continue;
            const { horizontal, vertical, values } = readTile(datum);
            const columns = getVisibleCellRange(
                horizontal,
                triangle ? undefined : xConstraint
            );
            const [top, bottom] = vertical
                ? getVisibleCellRange(vertical, yConstraint)
                : [0, 1];
            for (let row = top; row < bottom; row++) {
                let [left, right] = columns;
                if (triangle) {
                    const rowStart = vertical.origin + row * vertical.step;
                    const columnDomain = getTriangleColumnDomain(
                        triangle,
                        rowStart,
                        rowStart + vertical.step,
                        xConstraint.mode === "contain"
                    );
                    if (columnDomain[0] >= columnDomain[1]) continue;
                    [left, right] = getVisibleCellRange(horizontal, {
                        ...xConstraint,
                        domain: columnDomain,
                    });
                }
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
