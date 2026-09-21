/**
 * Returns the unit-coordinate adjustment for placement within a discrete scale
 * band. Continuous scales need no adjustment.
 *
 * @param {import("../types/encoder.js").VegaScale} scale
 * @param {number} [band]
 */
export function getScalePositionAdjustment(scale, band = 0.5) {
    if (scale.type == "band" || scale.type == "point") {
        const discreteScale = /** @type {{ bandwidth: () => number }} */ (
            /** @type {unknown} */ (scale)
        );
        return discreteScale.bandwidth() * band;
    } else if (scale.type == "index" || scale.type == "locus") {
        const genomicScale =
            /** @type {{ step: () => number, bandwidth: () => number, align: () => number }} */ (
                /** @type {unknown} */ (scale)
            );
        const signedBandwidth =
            Math.sign(genomicScale.step()) * genomicScale.bandwidth();
        return signedBandwidth * (band - genomicScale.align());
    } else {
        return 0;
    }
}
