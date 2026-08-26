/**
 * @typedef {import("./bmFontMetrics.js").BMFontMetrics} BMFontMetrics
 *
 * @typedef {object} FontEntry
 * @prop {BMFontMetrics} metrics
 * @prop {string | ImageBitmap} bitmap
 *
 * @typedef {"normal" | "italic"} FontStyle
 * @typedef {number | "thin" | "light" | "regular" | "normal" | "medium" | "bold" | "black"} FontWeight
 */

const WEIGHTS = Object.freeze({
    thin: 100,
    light: 300,
    regular: 400,
    normal: 400,
    medium: 500,
    bold: 700,
    black: 900,
});

/** @type {Map<string, FontEntry>} */
const registeredFonts = new Map();

/** @type {string | undefined} */
let defaultFontKey;

/**
 * @param {FontWeight} weight
 * @returns {number}
 */
function resolveFontWeight(weight) {
    if (typeof weight === "number") {
        return weight;
    }
    const weightName = /** @type {keyof typeof WEIGHTS} */ (
        weight.toLowerCase()
    );
    const resolved = WEIGHTS[weightName];
    if (!resolved) {
        throw new Error("Unknown font weight: " + weight);
    }
    return resolved;
}

/**
 * @param {string} family
 * @param {FontStyle} [style]
 * @param {FontWeight} [weight]
 * @returns {string}
 */
export function getFontKey(family, style = "normal", weight = "regular") {
    return `${family}\u0000${style}\u0000${resolveFontWeight(weight)}`;
}

/**
 * Register a font preset for subsequently created font managers.
 *
 * @param {object} params
 * @param {string} params.family
 * @param {FontStyle} [params.style]
 * @param {FontWeight} [params.weight]
 * @param {BMFontMetrics} params.metrics
 * @param {string | ImageBitmap} params.bitmap
 * @param {boolean} [params.defaultFont]
 * @returns {void}
 */
export function registerFont({
    family,
    style = "normal",
    weight = "regular",
    metrics,
    bitmap,
    defaultFont = false,
}) {
    const key = getFontKey(family, style, weight);
    registeredFonts.set(key, { metrics, bitmap });
    if (defaultFont) {
        defaultFontKey = key;
    }
}

/**
 * @returns {Map<string, FontEntry>}
 */
export function getRegisteredFonts() {
    return registeredFonts;
}

/**
 * @returns {FontEntry | undefined}
 */
export function getRegisteredDefaultFont() {
    return defaultFontKey === undefined
        ? undefined
        : registeredFonts.get(defaultFontKey);
}
