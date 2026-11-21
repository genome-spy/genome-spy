import { inheritSpecOrigin } from "../utils/specOrigin.js";
import createDomain from "../utils/domainArray.js";
import { getVisibleCellRange, readRasterTile } from "../data/rasterTile.js";
import { findChannelDefWithScale } from "../encoder/encoder.js";
import Mark from "./mark.js";
import { fixCoveragePositional } from "./markUtils.js";

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
            encoding.color.scale === null ||
            "condition" in encoding.color
        ) {
            throw new Error(
                "Raster requires a quantitative or categorical color field with a scale."
            );
        }
        return encoding;
    }

    /** @param {"x" | "y"} axis */
    getDimensionName(axis) {
        const binding = this.unitView.getEncoding()[axis];
        if (binding && "dimension" in binding) return binding.dimension;
    }

    getColorField() {
        const binding = this.encoding.color;
        if (binding && "field" in binding) return binding.field;
        throw new Error("Raster has no color field.");
    }

    /**
     * @param {import("../data/collector.js").default} collector
     * @param {import("../data/viewportDomain.js").ViewportConstraint[]} [constraints]
     */
    getColorDomain(collector, constraints = []) {
        const type = findChannelDefWithScale(this.encoding.color).type;
        const domain = createDomain(type);
        if (type !== "quantitative" || !collector.completed) return domain;
        const x = this.getDimensionName("x");
        const y = this.getDimensionName("y");
        const field = this.getColorField();
        const colorResolution = this.unitView.getScaleResolution("color");
        const logarithmic = colorResolution?.getResolvedScaleType() === "log";
        const xConstraint = constraints.find(({ channel }) => channel === "x");
        const yConstraint = constraints.find(({ channel }) => channel === "y");
        for (const datum of collector.getData()) {
            const { horizontal, vertical, values } = readRasterTile(
                datum,
                x,
                y,
                field
            );
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
