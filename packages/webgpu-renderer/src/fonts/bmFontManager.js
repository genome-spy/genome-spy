import { InternMap } from "internmap";
import latoRegular from "../fonts/Lato-Regular.json" with { type: "json" };
import latoRegularBitmap from "../fonts/Lato-Regular.png";
import getMetrics from "./bmFontMetrics.js";

const WEIGHTS = {
    thin: 100,
    light: 300,
    regular: 400,
    normal: 400,
    medium: 500,
    bold: 700,
    black: 900,
};

/**
 * Loader for A-Frame fonts.
 *
 * See:
 * https://github.com/mattdesl/bmfont2json
 * https://github.com/etiennepinchon/aframe-fonts
 *
 *
 * @typedef {import("./bmFont.js").BMFont} BMFont
 * @typedef {import("./bmFontMetrics.js").BMFontMetrics} BMFontMetrics
 *
 * @typedef {"normal" | "italic"} FontStyle
 * @typedef {number} FontWeight
 *
 * @typedef {object} FontKey
 * @prop {string} family
 * @prop {FontStyle} style
 * @prop {FontWeight} weight
 *
 * @typedef {object} FontEntry
 * @prop {BMFontMetrics} metrics
 * @prop {string | ImageBitmap} bitmap
 */
export default class BmFontManager {
    constructor() {
        /**
         * @type {Map<FontKey, FontEntry>}
         */
        this._fonts = new InternMap([], JSON.stringify);

        /**
         * A default/fallback font to be used when font loading fails
         * @type {FontEntry}
         */
        this._defaultFontEntry = {
            metrics: getMetrics(latoRegular),
            bitmap: latoRegularBitmap,
        };

        this.registerFont({
            family: "Lato",
            style: "normal",
            weight: 400,
            metrics: this._defaultFontEntry.metrics,
            bitmap: latoRegularBitmap,
        });
    }

    /**
     * @param {string} family
     * @param {FontStyle} style
     * @param {FontWeight | keyof WEIGHTS} weight
     * @returns {FontKey}
     */
    _getKey(family, style, weight) {
        const resolvedWeight =
            typeof weight === "string"
                ? WEIGHTS[/** @type {keyof WEIGHTS} */ (weight.toLowerCase())]
                : weight;
        if (!resolvedWeight) {
            throw new Error("Unknown font weight: " + weight);
        }
        return { family, style, weight: resolvedWeight };
    }

    /**
     * Registers a font for lookup by family/style/weight.
     *
     * @param {object} params
     * @param {string} params.family
     * @param {FontStyle} [params.style]
     * @param {FontWeight | keyof WEIGHTS} [params.weight]
     * @param {BMFontMetrics} params.metrics
     * @param {string | ImageBitmap} params.bitmap
     * @returns {void}
     */
    registerFont({
        family,
        style = "normal",
        weight = "regular",
        metrics,
        bitmap,
    }) {
        const key = this._getKey(family, style, weight);
        this._fonts.set(key, { metrics, bitmap });
    }

    /**
     * @param {string} family For example: "Lato"
     * @param {FontStyle} style
     * @param {FontWeight | keyof WEIGHTS} weight
     * @returns {FontEntry}
     */
    getFont(family, style = "normal", weight = "regular") {
        const key = this._getKey(family, style, weight);
        const fontEntry = this._fonts.get(key);
        if (!fontEntry) {
            console.warn(
                `Cannot find font: "${key.family}". Using the embedded default font.`
            );
            return this._defaultFontEntry;
        }
        return fontEntry;
    }

    getDefaultFont() {
        return this._defaultFontEntry;
    }
}

/**
 * Utility: fetch a BMFont JSON file and return parsed metrics.
 *
 * @param {string} url
 * @returns {Promise<BMFontMetrics>}
 */
export async function fetchBmFontMetrics(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Could not load BMFont JSON: ${response.status}`);
    }
    const json = await response.json();
    return getMetrics(/** @type {BMFont} */ (json));
}

/**
 * Utility: fetch a bitmap and return an ImageBitmap.
 *
 * @param {string} url
 * @returns {Promise<ImageBitmap>}
 */
export async function fetchBmFontBitmap(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Could not load BMFont bitmap: ${response.status}`);
    }
    const blob = await response.blob();
    return createImageBitmap(blob);
}
