import getMetrics from "./bmFontMetrics.js";
import {
    getFontKey,
    getRegisteredDefaultFont,
    getRegisteredFonts,
} from "./fontRegistry.js";

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
 * @typedef {import("./fontRegistry.js").FontWeight} FontWeight
 *
 * @typedef {import("./fontRegistry.js").FontEntry} FontEntry
 */
export default class BmFontManager {
    constructor() {
        /** @type {Map<string, FontEntry>} */
        this._fonts = new Map(getRegisteredFonts());

        /**
         * A default/fallback font to be used when font loading fails
         * @type {FontEntry | undefined}
         */
        this._defaultFontEntry = getRegisteredDefaultFont();
    }

    /**
     * @param {string} family
     * @param {FontStyle} style
     * @param {FontWeight} weight
     * @returns {string}
     */
    _getKey(family, style, weight) {
        return getFontKey(family, style, weight);
    }

    /**
     * Registers a font for lookup by family/style/weight.
     *
     * @param {object} params
     * @param {string} params.family
     * @param {FontStyle} [params.style]
     * @param {FontWeight} [params.weight]
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
     * @param {FontWeight} weight
     * @returns {FontEntry}
     */
    getFont(family, style = "normal", weight = "regular") {
        const key = this._getKey(family, style, weight);
        const fontEntry = this._fonts.get(key);
        if (!fontEntry) {
            if (!this._defaultFontEntry) {
                throw new Error(
                    `Cannot find font: "${family}". Import a font preset or provide a font resource.`
                );
            }
            console.warn(
                `Cannot find font: "${family}". Using the registered default font.`
            );
            return this._defaultFontEntry;
        }
        return fontEntry;
    }

    getDefaultFont() {
        if (!this._defaultFontEntry) {
            throw new Error(
                "No default font is registered. Import a font preset before using the default font."
            );
        }
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
