/**
 * @typedef {"auto" | "integer" | false} RulerSnap
 */

/**
 * @param {string} scaleType
 * @param {RulerSnap} snap
 */
export function shouldSnapRulerCoordinate(scaleType, snap) {
    if (snap === "integer") {
        return true;
    } else if (snap === "auto") {
        return scaleType === "index" || scaleType === "locus";
    } else {
        return false;
    }
}

/**
 * Normalizes a ruler coordinate before storing it in the parameter value.
 *
 * @param {number | null} value
 * @param {{
 *     getResolvedScaleType: () => string,
 *     toComplex?: (value: number) => any,
 * }} scaleResolution
 * @param {RulerSnap} [snap]
 * @returns {any}
 */
export function normalizeRulerCoordinate(
    value,
    scaleResolution,
    snap = "auto"
) {
    if (value == null) {
        return null;
    }

    const scaleType = scaleResolution.getResolvedScaleType();
    let numericValue = value;
    if (shouldSnapRulerCoordinate(scaleType, snap)) {
        // Index-like inversion returns a position within a band. Select that
        // band's index rather than rounding toward the next band.
        numericValue =
            scaleType === "index" || scaleType === "locus"
                ? Math.floor(value)
                : Math.round(value);
    }

    if (scaleType === "locus" && scaleResolution.toComplex) {
        return scaleResolution.toComplex(numericValue);
    } else {
        return numericValue;
    }
}
