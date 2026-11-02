import { zoomLinear, zoomLog, zoomPow, zoomSymlog } from "vega-util";

/**
 * @typedef {import("../types/encoder.js").VegaScale} VegaScale
 */

/**
 * Zooms a numeric two-point domain according to scale type.
 *
 * @param {VegaScale} scale
 * @param {[number, number]} domain
 * @param {number} anchor
 * @param {number} scaleFactor
 * @param {{ onUnsupported?: "throw" | "identity" }} [options]
 * @returns {[number, number]}
 */
export function zoomDomainByScaleType(
    scale,
    domain,
    anchor,
    scaleFactor,
    options = {}
) {
    const onUnsupported = options.onUnsupported ?? "throw";

    // Continuous color scales use the same transforms with a Vega type prefix.
    switch (scale.type.replace(/^(sequential|diverging)-/, "")) {
        case "linear":
        case "index":
        case "locus":
            return /** @type {[number, number]} */ (
                zoomLinear(domain, anchor, scaleFactor)
            );

        case "log":
            return /** @type {[number, number]} */ (
                zoomLog(domain, anchor, scaleFactor)
            );

        case "pow":
        case "sqrt": {
            const powScale =
                /** @type {import("d3-scale").ScalePower<number, number>} */ (
                    /** @type {any} */ (scale)
                );
            return /** @type {[number, number]} */ (
                zoomPow(domain, anchor, scaleFactor, powScale.exponent())
            );
        }

        case "symlog": {
            const symlogScale =
                /** @type {import("d3-scale").ScaleSymLog<number, number>} */ (
                    /** @type {any} */ (scale)
                );
            return /** @type {[number, number]} */ (
                zoomSymlog(domain, anchor, scaleFactor, symlogScale.constant())
            );
        }

        default:
            if (onUnsupported === "identity") {
                return domain;
            } else {
                throw new Error(
                    "Zooming is not implemented for: " + scale.type
                );
            }
    }
}
