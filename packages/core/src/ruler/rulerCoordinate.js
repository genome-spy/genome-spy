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
    const numericValue = shouldSnapRulerCoordinate(scaleType, snap)
        ? Math.round(value)
        : value;

    if (scaleType === "locus" && scaleResolution.toComplex) {
        return scaleResolution.toComplex(numericValue);
    } else {
        return numericValue;
    }
}
