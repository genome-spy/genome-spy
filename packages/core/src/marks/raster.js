import { inheritSpecOrigin } from "../utils/specOrigin.js";
import createDomain from "../utils/domainArray.js";
import { getVisibleCellRange, readRasterTile } from "../data/rasterTile.js";
import { isValueDef } from "../encoder/encoder.js";
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
        if (
            !encoding.color ||
            !("field" in encoding.color) ||
            !["quantitative", "nominal", "ordinal"].includes(
                encoding.color.type
            )
        ) {
            throw new Error(
                "Raster requires a quantitative or categorical color field."
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

    getColorCellBinding() {
        return getCachedOrCall(this, "colorCellBinding", () => {
            const { field, type } =
                /** @type {import("../spec/channel.js").ScaleFieldDef<import("../spec/channel.js").Type>} */ (
                    this.encoding.color
                );
            const direct = this.#usesDirectColor();
            const { x, y } = this.unitView.getEncoding();
            const column = x && "dimension" in x ? x.dimension : undefined;
            const row = y && "dimension" in y ? y.dimension : undefined;
            const scaleType = this.isTriangle
                ? this.unitView.getScaleResolution("x")?.getResolvedScaleType()
                : undefined;
            const locus = scaleType === "locus" || scaleType === "index";
            const options = { direct, locus };
            return {
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
            delete encoding.color.condition;
        }
        return encoding;
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
            const color = planBranches(
                this.encoders.color.branches.slice(0, -1),
                "Raster color conditions require value encodings."
            );
            const opacityBranches = planBranches(
                this.encoders.opacity?.branches ?? [],
                "Raster opacity requires value encodings."
            );
            const opacity = opacityBranches.length > 1 ? opacityBranches : [];
            if (!color.length && !opacity.length) return null;

            const conditions = [...color, ...opacity];
            const memberships = conditions
                .values()
                .map(({ tree }) => tree)
                .filter((tree) => tree !== undefined)
                .flatMap(selectionPredicateLeaves)
                .filter((leaf) => "type" in leaf)
                .toArray();
            const { bandAxis } = this.getColorCellBinding();
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
        const { bandAxis, type, direct } = this.getColorCellBinding();
        this.#validateGridScales(bandAxis);
        this.getCellPaintPlan();
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
