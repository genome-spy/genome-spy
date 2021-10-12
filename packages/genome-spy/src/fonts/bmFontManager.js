import { InternMap } from "internmap";
import { createTexture } from "twgl.js";
import { isString } from "vega-util";
import latoRegular from "../fonts/Lato-Regular.json";
import latoRegularBitmap from "../fonts/Lato-Regular.png";
import getMetrics from "./bmFontMetrics";

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
 * @typedef {import("./bmFont").BMFont} BMFont
 * @typedef {import("./bmFontMetrics").BMFontMetrics} BMFontMetrics
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
 * @prop {WebGLTexture} texture
 */
export default class BmFontManager {
    /**
     * @param {import("../gl/webGLHelper").default} webGLHelper
     */
    constructor(webGLHelper) {
        this._webGLHelper = webGLHelper;

        this.fontRepository =
            "https://raw.githubusercontent.com/etiennepinchon/aframe-fonts/master/fonts/";

        /**
         * @type {Map<FontKey, FontEntry>}
         */
        this._fonts = new InternMap([], JSON.stringify);

        /** @type {Map<string, Promise<GoogleFontMetadataEntry[]>>} */
        this._metadataPromises = new Map();

        /** @type {Map<string, Promise<BMFontMetrics>>} */
        this._fontPromises = new Map();

        /** @type {Promise<void>[]} Keep track of overall font loading state */
        this._promises = [];

        /**
         * A default/fallback font to be used when font loading fails
         * @type {FontEntry}
         */
        this._defaultFontEntry = {
            metrics: getMetrics(latoRegular),
            texture: this._createTextureNow(latoRegularBitmap),
        };
    }

    async waitUntilReady() {
        await Promise.all(this._promises);
    }

    /**
     *
     * @param {string} family For example: "Lato"
     * @param {FontStyle} style
     * @param {FontWeight | keyof WEIGHTS} weight
     * @returns {FontEntry}
     */
    getFont(family, style = "normal", weight = "regular") {
        if (isString(weight)) {
            weight =
                WEIGHTS[/** @type {keyof WEIGHTS} */ (weight.toLowerCase())];
            if (!weight) {
                throw new Error("Unknown font weight: " + weight);
            }
        }

        const key = { family, style, weight };
        let fontEntry = this._fonts.get(key);
        if (!fontEntry) {
            // Return and empty entry, load it asynchronously
            fontEntry = {
                metrics: undefined,
                texture: undefined,
            };
            this._fonts.set(key, fontEntry);

            this._promises.push(this._loadFontEntry(fontEntry, key));
        }

        return fontEntry;
    }

    /**
     *
     * @param {FontEntry} fontEntry An uninitialized font entry
     * @param {FontKey} key
     */
    async _loadFontEntry(fontEntry, key) {
        try {
            const metadataEntries = await this._loadMetadata(key.family);
            const filename = findFilename(metadataEntries, key);

            const urlBase =
                this.fontRepository +
                simplifyFamily(key.family) +
                "/" +
                filename.replace(/\.\w+/, "");

            const texturePromise = this._createTexture(urlBase + ".png");
            const metricsPromise = this._loadFont(urlBase + ".json");

            fontEntry.texture = await texturePromise;
            fontEntry.metrics = await metricsPromise;
        } catch (error) {
            console.log("Cannot load font. Using default.", error);

            fontEntry.metrics = this._defaultFontEntry.metrics;
            fontEntry.texture = this._defaultFontEntry.texture;
        }
    }

    /**
     * @param {string} url
     */
    _loadFont(url) {
        let promise = this._fontPromises.get(url);
        if (!promise) {
            promise = fetch(url)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(
                            "Could not load font: " + response.status
                        );
                    }
                    return response;
                })
                .then((response) => response.json())
                .then((json) => getMetrics(/** @type {BMFont} */ (json)));

            this._fontPromises.set(url, promise);
        }
        return promise;
    }

    /**
     *
     * @param {string} family
     */
    _loadMetadata(family) {
        const dir = simplifyFamily(family);

        let promise = this._metadataPromises.get(dir);
        if (!promise) {
            promise = fetch(this.fontRepository + dir + "/METADATA.pb")
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(
                            "Could not load font metadata: " + response.status
                        );
                    }
                    return response;
                })
                .then((response) => response.text())
                .then((text) => parseMetadataPb(text))
                .catch((error) => {
                    console.warn(error);
                    return undefined;
                });

            this._metadataPromises.set(dir, promise);
        }

        return promise;
    }

    getDefaultFont() {
        return this._defaultFontEntry;
    }

    /**
     *
     * @param {string} bitmapUrl
     * @returns {Promise<WebGLTexture>}
     */
    _createTexture(bitmapUrl) {
        const gl = this._webGLHelper.gl;

        return new Promise((resolve, reject) => {
            createTexture(
                gl,
                {
                    src: bitmapUrl,
                    min: gl.LINEAR,
                },
                (err, texture, source) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(texture);
                    }
                }
            );
        });
    }

    /**
     *
     * @param {string} bitmapUrl
     * @returns {WebGLTexture}
     */
    _createTextureNow(bitmapUrl) {
        const gl = this._webGLHelper.gl;

        /** @type {WebGLTexture} */
        let texture;
        const promise = new Promise((resolve, reject) => {
            texture = createTexture(
                gl,
                {
                    src: bitmapUrl,
                    min: gl.LINEAR,
                },
                (err, texture, source) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(texture);
                    }
                }
            );
        });

        this._promises.push(promise);
        return texture;
    }
}

/**
 *
 * @param {string} family
 */
function simplifyFamily(family) {
    return family.toLowerCase().replaceAll(/[^\w]/g, "");
}

/**
 * A super-naive method for parsing METADATA.pb.
 * It's a text-format protobuf message, but I couldn't find a lightweight parser
 * for it.
 *
 * @typedef {object} GoogleFontMetadataEntry
 * @prop {string} name "Open Sans"
 * @prop {string} style "italic"
 * @prop {number} weight 400
 * @prop {string} filename "OpenSans-Italic.ttf"
 * @prop {string} post_script_name "OpenSans-Italic"
 * @prop {string} full_name "Open Sans Italic"
 * @prop {string} copyright "Digitized data copyright  2010-2011, Google Corporation."
 *
 * @param {string} metadata
 * @returns {GoogleFontMetadataEntry[]}
 */
function parseMetadataPb(metadata) {
    const lines = metadata.split("\n");

    /** @type {GoogleFontMetadataEntry[]} */
    const entries = [];

    /** @type {GoogleFontMetadataEntry} */
    let entry;

    for (const line of lines) {
        if (line.startsWith("fonts {")) {
            /** @type {GoogleFontMetadataEntry} */
            entry = {
                name: undefined,
                style: undefined,
                weight: undefined,
                filename: undefined,
                post_script_name: undefined,
                full_name: undefined,
                copyright: undefined,
            };
        }

        if (line.startsWith("}")) {
            entries.push(entry);
            entry = undefined;
        }

        if (entry) {
            let m = line.match(/^\s*([A-Za-z_]+):[ ]?"(.*)"$/);
            if (m) {
                const key = /** @type {keyof GoogleFontMetadataEntry}*/ (m[1]);
                // @ts-ignore
                entry[key] = m[2];
            }

            m = line.match(/^\s*([A-Za-z_]+):[ ]?(\d+)$/);
            if (m) {
                const key = /** @type {keyof GoogleFontMetadataEntry}*/ (m[1]);
                // @ts-ignore
                entry[key] = +m[2];
            }
        }
    }

    return entries;
}

/**
 * @param {GoogleFontMetadataEntry[]} metadataEntries
 * @param {FontKey} key
 */
function findFilename(metadataEntries, key) {
    /** @type {GoogleFontMetadataEntry}  */
    let closest;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const e of metadataEntries) {
        if (
            key.family.localeCompare(e.name, undefined, {
                sensitivity: "accent",
            }) != 0
        ) {
            continue;
        }

        if (key.style == e.style) {
            const distance = Math.abs(key.weight - e.weight);
            if (distance < closestDistance) {
                closestDistance = distance;
                closest = e;
            }
        }
    }

    return closest?.filename;
}
