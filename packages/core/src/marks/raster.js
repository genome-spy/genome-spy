import { inheritSpecOrigin } from "../utils/specOrigin.js";
import createDomain from "../utils/domainArray.js";
import { getVisibleCellRange, readRasterTile } from "../data/rasterTile.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import { isFieldDef, isValueDef } from "../encoder/encoder.js";
import { supportsGridCoordinates } from "../scales/scaleRules.js";
import { getSelectionPredicateParams } from "../selection/selection.js";
import { selectionPredicateLeaves } from "../selection/selectionPredicateTree.js";
import { getCachedOrCall } from "../utils/propertyCacher.js";
import ViewError from "../view/viewError.js";
import {
    getResolvedTriangleDirection,
    validateTriangleScale,
} from "../view/triangleProjection.js";
import Mark from "./mark.js";
import { fixCoveragePositional } from "./markUtils.js";

/** @extends {Mark<import("../spec/mark.js").RasterProps>} */
export default class RasterMark extends Mark {
    /** @returns {import("../spec/channel.js").Channel[]} */
    getSupportedChannels() {
        return ["x", "y", "x2", "y2", "color", "opacity", "tooltip"];
    }

    triangleDirection = getResolvedTriangleDirection(this.unitView);

    isTriangle = this.triangleDirection !== undefined;

    isPickingParticipant() {
        const { tooltip } = this.properties;
        return (
            tooltip !== null &&
            (tooltip !== undefined || !this.#usesDirectColor()) &&
            super.isPickingParticipant()
        );
    }

    #usesDirectColor() {
        // Reading the normalized mark encoding would recurse through picking.
        return getCachedOrCall(this, "directColor", () => {
            const color = this.unitView.getEncoding().color;
            return !!color && "scale" in color && color.scale === null;
        });
    }

    /** @param {import("../spec/channel.js").Encoding} encoding */
    fixEncoding(encoding) {
        this.#fixGridPosition(encoding);
        const { color, opacity } = encoding;
        if (isFieldDef(opacity)) {
            // TODO: Allow fields on both channels once WebGL support is removed.
            if (!isValueDef(color)) {
                throw new ViewError(
                    "A raster with an opacity field requires a color value.",
                    this.unitView
                );
            }
            if (opacity.type !== "quantitative") {
                throw new ViewError(
                    "Raster opacity fields must be quantitative.",
                    this.unitView
                );
            }
        } else if (
            !isFieldDef(color) ||
            !["quantitative", "nominal", "ordinal"].includes(color.type)
        ) {
            throw new ViewError(
                "Raster requires a quantitative or categorical color field, or an opacity field with a color value.",
                this.unitView
            );
        }
        return encoding;
    }

    /** @param {import("../spec/channel.js").Encoding} encoding */
    #fixGridPosition(encoding) {
        const triangle = this.isTriangle;
        const axes = /** @type {const} */ ([
            ["x", "x2"],
            ["y", "y2"],
        ]);
        const bandAxis =
            !triangle &&
            axes.find(([axis, end]) => {
                const def = encoding[axis];
                return (
                    def &&
                    "field" in def &&
                    (def.type === "nominal" || def.type === "ordinal") &&
                    !encoding[end]
                );
            })?.[0];
        for (const [axis, end] of axes) {
            if (axis === "y" && triangle) break;
            if (axis === bandAxis) {
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
            const indexGrid = !triangle && binding.type === "index";
            const domainInert = binding.type !== "quantitative" && !indexGrid;
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
                    (indexGrid ? " - 1" : ""),
                band: indexGrid ? 1 : 0,
                domainInert,
            };
        }
        if (triangle) {
            const { x, y, y2 } = encoding;
            const validRow =
                y && "dimension" in y && "type" in x && y.type === x.type;
            if (y2 || !validRow) {
                throw new ViewError(
                    "A triangle raster's y input must bind a grid dimension of the same type as x.",
                    this.unitView
                );
            }
            // Keep the authored row binding and resolve only the display x scale.
            delete encoding.y;
        }
    }

    /** @returns {"color" | "opacity"} */
    #fieldChannel() {
        return isFieldDef(this.unitView.getEncoding().opacity)
            ? "opacity"
            : "color";
    }

    getCellBinding() {
        return getCachedOrCall(this, "cellBinding", () => {
            const channel = this.#fieldChannel();
            const { field, type } =
                /** @type {import("../spec/channel.js").ScaleFieldDef<import("../spec/channel.js").Type>} */ (
                    this.encoding[channel]
                );
            const direct = channel === "color" && this.#usesDirectColor();
            const { x, y } = this.unitView.getEncoding();
            const column = x && "dimension" in x ? x.dimension : undefined;
            const row = y && "dimension" in y ? y.dimension : undefined;
            const scaleType = this.isTriangle
                ? this.unitView.getScaleResolution("x")?.getResolvedScaleType()
                : undefined;
            const locus = scaleType === "locus" || scaleType === "index";
            const options = { direct, locus };
            return {
                channel,
                type,
                direct,
                column,
                row,
                bandAxis:
                    column === undefined
                        ? /** @type {const} */ ("x")
                        : row === undefined
                          ? /** @type {const} */ ("y")
                          : undefined,
                // Keep tile domains distinct from scalar fields on the same collector.
                domainKey:
                    "raster:" +
                    JSON.stringify([column, row, field, type, direct, locus]),
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
        if (isFieldDef(encoding.color)) {
            encoding.color = { ...encoding.color, field: "color" };
            delete encoding.color.condition;
        }
        return encoding;
    }

    /**
     * @param {object} tile
     * @param {number} index
     * @returns {import("./mark.js").CellTooltipData}
     */
    getCellTooltipData(tile, index) {
        const { column: columnDimension, row: rowDimension } =
            this.getCellBinding();
        const { fields, dimensions, ...attributes } =
            /** @type {import("../data/rasterTile.js").RasterTile & Record<string, any>} */ (
                tile
            );
        delete attributes[UNIQUE_ID_KEY];
        const horizontal =
            columnDimension === undefined
                ? undefined
                : dimensions[columnDimension];
        const vertical =
            rowDimension === undefined ? undefined : dimensions[rowDimension];
        const columns = horizontal?.count ?? 1;
        const column = index % columns;
        const row = Math.floor(index / columns);
        const axes = [];
        for (const [axis, dimension, cell] of /** @type {const} */ ([
            ["x", horizontal, column],
            ["y", vertical, row],
        ])) {
            if (!dimension) continue;
            const start = dimension.origin + cell * dimension.step;
            axes.push({ axis, start, end: start + dimension.step });
        }

        return {
            datum: {
                ...attributes,
                ...Object.fromEntries(
                    Object.entries(fields).map(([name, values]) => [
                        name,
                        values[index],
                    ])
                ),
            },
            cell: { column, row },
            axes,
            scaleAxis: (axis) => (this.isTriangle ? "x" : axis),
        };
    }

    getCellPaintPlan() {
        return getCachedOrCall(this, "cellPaintPlan", () => {
            /**
             * @param {import("../types/encoder.js").EncodingBranch[]} branches
             * @param {string} errorMessage
             */
            const planBranches = (branches, errorMessage) =>
                branches.map(({ accessor, predicate }) => {
                    if (!isValueDef(accessor.channelDef)) {
                        throw new ViewError(errorMessage, this.unitView);
                    }
                    return {
                        accessor,
                        tree: predicate.selection,
                        params: getSelectionPredicateParams(predicate),
                    };
                });
            const { channel, bandAxis } = this.getCellBinding();
            const opacityField = channel === "opacity";
            const colorBranches = this.encoders.color.branches;
            const color = planBranches(
                opacityField ? colorBranches : colorBranches.slice(0, -1),
                "Raster color conditions require value encodings."
            );
            const opacityBranches = this.encoders.opacity?.branches ?? [];
            const opacity = planBranches(
                opacityField ? opacityBranches.slice(0, -1) : opacityBranches,
                "Raster opacity requires value encodings."
            );
            if (opacityBranches.length === 1) opacity.length = 0;
            if (!color.length && !opacity.length) return null;

            const conditions = [...color, ...opacity];
            const memberships = conditions
                .values()
                .map(({ tree }) => tree)
                .filter((tree) => tree !== undefined)
                .flatMap(selectionPredicateLeaves)
                .filter((leaf) => "type" in leaf)
                .toArray();
            for (const { type, projections } of memberships) {
                if (type === "single" || type === "multi") {
                    throw new ViewError(
                        "Point selection membership requires individual raster cell identities.",
                        this.unitView
                    );
                }
                if (type !== "interval") continue;
                for (const { input, secondaryInput } of projections) {
                    if (this.isTriangle && input !== "color") {
                        throw new ViewError(
                            "Triangle rasters only support interval conditions on color.",
                            this.unitView
                        );
                    }
                    if (input[0] === bandAxis) {
                        throw new ViewError(
                            `Raster band axis "${bandAxis}" requires a categorical selection.`,
                            this.unitView
                        );
                    }
                    if (input !== "color" && !secondaryInput) {
                        throw new ViewError(
                            `Raster position brushes use cell overlap. Remove the explicit projection on "${input}".`,
                            this.unitView
                        );
                    }
                }
            }
            return {
                color,
                opacity,
                memberships,
                params: new Set(conditions.flatMap(({ params }) => params)),
                bandAxis,
                readBand:
                    bandAxis && this.encoders[bandAxis].branches[0].accessor,
            };
        });
    }

    getUniformOpacity() {
        const opacity = this.encoders.opacity;
        return opacity?.constant ? Number(opacity(null)) : 1;
    }

    validateRenderingScales() {
        const { channel, bandAxis, type, direct } = this.getCellBinding();
        this.#validateGridScales(bandAxis);
        this.getCellPaintPlan();
        if (direct) return undefined;

        const resolution = this.unitView.getScaleResolution(channel);
        const scale = resolution?.getScale();
        if (!scale || scale.type === "null") return;

        if (channel === "opacity") {
            const stops = scale.domain().length;
            if (
                !["linear", "log", "pow", "sqrt", "symlog"].includes(
                    scale.type
                ) ||
                stops < 2 ||
                scale.range().length !== stops ||
                (scale.type !== "linear" && stops !== 2)
            ) {
                throw new ViewError(
                    "Raster opacity requires a linear scale with matching domain and range stops, a two-stop log, pow, sqrt, or symlog scale, or scale: null.",
                    this.unitView
                );
            }
        } else if (
            type !== "quantitative" &&
            (scale.type !== "ordinal" ||
                !scale.domain().length ||
                !resolution.isDomainDefinedExplicitly())
        ) {
            throw new ViewError(
                "Categorical raster colors need an ordinal scale with an explicit domain.",
                this.unitView
            );
        }
        return resolution;
    }

    /** @param {"x" | "y" | undefined} bandAxis */
    #validateGridScales(bandAxis) {
        if (this.isTriangle) {
            validateTriangleScale(this.encoders.x.scale, this.unitView);
            return;
        }
        if (bandAxis && this.encoders[bandAxis].scale?.type !== "band") {
            throw new ViewError(
                `Raster strips need a band scale on ${bandAxis}.`,
                this.unitView
            );
        }
        for (const axis of /** @type {const} */ (["x", "y"])) {
            if (
                axis !== bandAxis &&
                !supportsGridCoordinates(this.encoders[axis].scale)
            ) {
                throw new ViewError(
                    "Raster grid scales require a two-point domain and unclamped, unrounded linear or unpadded index/locus scales without gaps.",
                    this.unitView
                );
            }
        }
    }

    /** @type {import("./mark.js").MarkDomainBinding} */
    #cellDomainBinding = {
        getKey: () =>
            this.getCellBinding().domainKey +
            (this.#usesLogCellScale() ? ":log" : ""),
        read: (collector, constraints) =>
            this.#getCellDomain(collector, constraints),
        // Exact triangle visibility requires the arranged height.
        viewportError: this.isTriangle
            ? "Triangle rasters cannot use a viewport-derived paint domain. Omit the domain to scale from loaded data."
            : undefined,
    };

    /** @param {import("../spec/channel.js").ChannelWithScale} channel */
    getDomainBinding = (channel) =>
        channel === this.#fieldChannel() ? this.#cellDomainBinding : undefined;

    #usesLogCellScale() {
        return (
            this.unitView
                .getScaleResolution(this.#fieldChannel())
                ?.getResolvedScaleType() === "log"
        );
    }

    /**
     * @param {import("../data/collector.js").default} collector
     * @param {import("../data/viewportDomain.js").ViewportConstraint[]} [constraints]
     */
    #getCellDomain(collector, constraints = []) {
        const { type, direct, readTile } = this.getCellBinding();
        const domain = createDomain(type);
        if (direct || type !== "quantitative" || !collector.completed)
            return domain;
        const logarithmic = this.#usesLogCellScale();
        const xConstraint = constraints.find(({ channel }) => channel === "x");
        const yConstraint = constraints.find(({ channel }) => channel === "y");
        for (const datum of collector.getData()) {
            const { horizontal, vertical, values } = readTile(datum);
            const [left, right] = getVisibleCellRange(horizontal, xConstraint);
            const [top, bottom] = getVisibleCellRange(vertical, yConstraint);
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
