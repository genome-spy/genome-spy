import { inheritSpecOrigin } from "../utils/specOrigin.js";
import createDomain from "../utils/domainArray.js";
import { getVisibleCellRange, readRasterTile } from "../data/rasterTile.js";
import Mark from "./mark.js";

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
        for (const [axis, end] of /** @type {const} */ ([
            ["x", "x2"],
            ["y", "y2"],
        ])) {
            const binding = encoding[axis];
            if (!binding || !("dimension" in binding) || encoding[end]) {
                throw new Error(
                    `Raster requires a grid dimension for "${axis}".`
                );
            }
            const { dimension, ...options } = binding;
            const path = "dimensions[" + JSON.stringify(dimension) + "]";
            encoding[axis] = inheritSpecOrigin(binding, {
                ...options,
                field: path + ".origin",
                band: 0,
            });
            encoding[end] = {
                expr: `datum.${path}.origin + datum.${path}.step * datum.${path}.count`,
                band: 0,
                // Index and locus contributions are inclusive observations.
                // Their native scale extent is independent of loaded tiles.
                domainInert: binding.type !== "quantitative",
            };
            if (binding.type !== "quantitative") {
                encoding[axis].domainInert = true;
            }
        }
        if (
            !encoding.color ||
            !("field" in encoding.color) ||
            encoding.color.type !== "quantitative" ||
            encoding.color.scale === null ||
            "condition" in encoding.color
        ) {
            throw new Error(
                "Raster requires a quantitative color field with a scale."
            );
        }
        return encoding;
    }

    /** @param {"x" | "y"} axis */
    getDimensionName(axis) {
        const binding = this.unitView.getEncoding()[axis];
        if (binding && "dimension" in binding) return binding.dimension;
        throw new Error(`Raster has no dimension for "${axis}".`);
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
        const domain = createDomain("quantitative");
        if (!collector.completed) return domain;
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
            const [top, bottom] = getVisibleCellRange(vertical, yConstraint);
            for (let row = top; row < bottom; row++) {
                const start = row * horizontal.count;
                for (let column = left; column < right; column++) {
                    const value = values[start + column];
                    if (
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
