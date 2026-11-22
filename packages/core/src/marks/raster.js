import { inheritSpecOrigin } from "../utils/specOrigin.js";
import createDomain from "../utils/domainArray.js";
import {
    getTriangleColumnDomain,
    getTriangleViewport,
    getVisibleCellRange,
    readRasterTile,
} from "../data/rasterTile.js";
import { isValueDef } from "../encoder/encoder.js";
import { hasGroupingGaps } from "../genome/indexGapMapping.js";
import {
    getSelectionPredicateTreeParams,
    selectionPredicateLeaves,
} from "../selection/selectionPredicateTree.js";
import { getCachedOrCall } from "../utils/propertyCacher.js";
import ViewError from "../view/viewError.js";
import Mark from "./mark.js";
import { fixCoveragePositional } from "./markUtils.js";

/** @extends {Mark<import("../spec/mark.js").RasterProps>} */
export default class RasterMark extends Mark {
    /** @returns {import("../spec/channel.js").Channel[]} */
    getSupportedChannels() {
        return ["x", "y", "x2", "y2", "color", "opacity", "tooltip"];
    }

    get isTriangle() {
        return this.properties.projection === "triangle";
    }

    isPickingParticipant() {
        return this.properties.tooltip != null && super.isPickingParticipant();
    }

    /** @param {import("../spec/channel.js").Encoding} encoding */
    fixEncoding(encoding) {
        this.#fixGridPosition(encoding);
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
            const { x, y } = this.unitView.getEncoding();
            // Encoding validation requires a grid dimension on x.
            const column =
                /** @type {import("../spec/channel.js").RasterDimensionDef} */ (
                    x
                ).dimension;
            const locus = this.isTriangle;
            const row = locus
                ? "row"
                : y && "dimension" in y
                  ? y.dimension
                  : undefined;
            const options = { direct, locus };
            return {
                type,
                direct,
                column,
                row,
                strip: row === undefined,
                domainKey: "raster:" + JSON.stringify([column, row, field]),
                readTile: (/** @type {object} */ datum) =>
                    readRasterTile(datum, column, row, field, options),
            };
        });
    }

    get selectionEncoding() {
        const encoding = { ...this.encoding };
        for (const axis of /** @type {const} */ (["x", "y"])) {
            const position = encoding[axis];
            if (!position || !("field" in position)) continue;
            encoding[axis] = { ...position, field: axis };
            const secondary = /** @type {const} */ (`${axis}2`);
            if (encoding[secondary]) {
                encoding[secondary] =
                    "expr" in encoding[secondary]
                        ? { field: secondary }
                        : { field: axis };
            }
        }
        if ("field" in encoding.color) {
            encoding.color = { ...encoding.color, field: "color" };
        }
        return encoding;
    }

    getOpacityPlan() {
        return getCachedOrCall(this, "opacityPlan", () => {
            const branches = this.encoders.opacity?.branches ?? [];
            if (
                branches.some(
                    ({ accessor }) => !isValueDef(accessor.channelDef)
                )
            ) {
                throw new ViewError(
                    "Raster opacity requires value encodings.",
                    this.unitView
                );
            }
            if (branches.length < 2) return null;

            const conditions = branches.map(
                ({ accessor, predicate: { selection: tree } }) => ({
                    tree,
                    params: tree ? getSelectionPredicateTreeParams(tree) : [],
                    opacity: accessor.asNumberAccessor(),
                })
            );
            const memberships = conditions
                .values()
                .flatMap(({ tree }) =>
                    tree ? selectionPredicateLeaves(tree) : []
                )
                .filter((leaf) => "type" in leaf)
                .toArray();
            if (
                memberships.some(
                    ({ type }) => type === "single" || type === "multi"
                )
            ) {
                throw new ViewError(
                    "Point selection membership requires individual raster cell identities.",
                    this.unitView
                );
            }
            const { strip } = this.getColorCellBinding();
            return {
                conditions,
                memberships,
                params: new Set(conditions.flatMap(({ params }) => params)),
                readRow: strip
                    ? this.encoders.y?.branches[0].accessor
                    : undefined,
            };
        });
    }

    getUniformOpacity() {
        const opacity = this.encoders.opacity;
        return opacity?.constant ? Number(opacity(null)) : 1;
    }

    validateRenderingScales() {
        const { strip, type, direct } = this.getColorCellBinding();
        this.#validateGridScales(strip);
        this.getOpacityPlan();
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
        const xConstraint = constraints.find(({ channel }) => channel === "x");
        const yConstraint = constraints.find(({ channel }) => channel === "y");
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
                        domain: columnDomain,
                        mode: xConstraint.mode,
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
