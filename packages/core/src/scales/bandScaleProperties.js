import clamp from "../utils/clamp.js";

/** @typedef {"band" | "index"} BandScaleKind */
const BAND_PROPERTIES = /** @type {const} */ ([
    "paddingInner",
    "paddingOuter",
    "align",
]);

/**
 * @param {BandScaleKind} kind
 * @param {(typeof BAND_PROPERTIES)[number]} key
 * @param {number} value
 */
export function normalizeBandScaleProperty(kind, key, value) {
    if (kind === "band" || key === "align") return clamp(value);
    return key === "paddingInner" ? Math.min(1, value) : value;
}

/** Install the physical padding and alignment accessors common to band scales.
 * @param {object} scale
 * @param {BandScaleKind} kind
 * @param {() => void} invalidate
 */
export function installBandScaleProperties(scale, kind, invalidate) {
    const state = { paddingInner: 0, paddingOuter: 0, align: 0.5 };
    const accessors = /** @type {Record<string, unknown>} */ (scale);
    /** @param {(typeof BAND_PROPERTIES)[number]} key @param {number} value */
    const set = (key, value) => {
        state[key] = normalizeBandScaleProperty(kind, key, value);
    };
    for (const key of BAND_PROPERTIES) {
        accessors[key] = function (/** @type {number} */ value) {
            if (!arguments.length) return state[key];
            set(key, value);
            invalidate();
            return scale;
        };
    }
    accessors.padding = function (/** @type {number} */ value) {
        if (!arguments.length) return state.paddingInner;
        set("paddingInner", value);
        set("paddingOuter", value);
        invalidate();
        return scale;
    };
    return state;
}
