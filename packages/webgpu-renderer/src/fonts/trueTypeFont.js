import { parseTrueTypeFont } from "../vendor/textShaper/font/trueType.js";

/** @typedef {{ x: number, y: number, onCurve: boolean }} TrueTypePoint */

/** @param {TrueTypePoint} a @param {TrueTypePoint} b */
function midpoint(a, b) {
    return {
        x: (a.x + b.x) * 0.5,
        y: (a.y + b.y) * 0.5,
        onCurve: true,
    };
}

/** @param {number} value */
function coordinate(value) {
    return Object.is(value, -0) ? "0" : String(value);
}

/** @param {TrueTypePoint} point */
function pointString(point) {
    return `${coordinate(point.x)} ${coordinate(-point.y)}`;
}

/**
 * Convert one TrueType contour into SVG path commands. Implied on-curve
 * midpoints are inserted between consecutive off-curve points.
 *
 * @param {TrueTypePoint[]} contour
 */
function contourToPath(contour) {
    if (contour.length === 0) {
        throw new Error("TrueType contours must contain points.");
    }
    const expanded = [];
    for (let index = 0; index < contour.length; index++) {
        const point = contour[index];
        const next = contour[(index + 1) % contour.length];
        expanded.push(point);
        if (!point.onCurve && !next.onCurve) {
            expanded.push(midpoint(point, next));
        }
    }
    const startIndex = expanded.findIndex((point) => point.onCurve);
    if (startIndex < 0) {
        throw new Error("TrueType contour has no implied on-curve point.");
    }
    const commands = [`M${pointString(expanded[startIndex])}`];
    let offset = 1;
    while (offset < expanded.length) {
        const point = expanded[(startIndex + offset) % expanded.length];
        if (point.onCurve) {
            commands.push(`L${pointString(point)}`);
            offset++;
        } else {
            const end = expanded[(startIndex + offset + 1) % expanded.length];
            if (!end.onCurve) {
                throw new Error("TrueType off-curve point lacks an endpoint.");
            }
            commands.push(`Q${pointString(point)} ${pointString(end)}`);
            offset += 2;
        }
    }
    commands.push("Z");
    return commands.join("");
}

/**
 * @param {import("../vendor/textShaper/font/trueType.js").TrueTypeGlyph | any} glyph
 */
export function trueTypeGlyphToPath(glyph) {
    if (glyph.contours.length === 0) {
        return null;
    }
    return glyph.contours.map(contourToPath).join("");
}

/**
 * Parse a static TrueType font and expose outlines lazily by Unicode code point.
 *
 * @param {ArrayBuffer | ArrayBufferView | DataView} source
 */
export function createTrueTypeFont(source) {
    const font = parseTrueTypeFont(source);
    /** @type {Array<ReturnType<typeof createGlyph> | undefined>} */
    const asciiGlyphByCodePoint = new Array(128);
    /** @type {Map<number, ReturnType<typeof createGlyph>>} */
    const unicodeGlyphByCodePoint = new Map();
    /** @type {Array<string | null | undefined>} */
    const pathByGlyphId = new Array(font.glyphCount);

    /** @param {number} codePoint */
    function createGlyph(codePoint) {
        const glyph = font.getGlyph(codePoint);
        let path = pathByGlyphId[glyph.glyphId];
        if (path === undefined) {
            path = trueTypeGlyphToPath(glyph);
            pathByGlyphId[glyph.glyphId] = path;
        }
        return Object.freeze({
            codePoint,
            glyphId: glyph.glyphId,
            advanceWidth: glyph.advanceWidth,
            leftSideBearing: glyph.leftSideBearing,
            bounds: glyph.bounds ? Object.freeze({ ...glyph.bounds }) : null,
            path,
        });
    }

    /** @param {number | string} value */
    function getGlyph(value) {
        const codePoint =
            typeof value === "number" ? value : value.codePointAt(0);
        if (codePoint === undefined || !Number.isInteger(codePoint)) {
            throw new TypeError(
                "A glyph requires a Unicode character or code point."
            );
        }
        const ascii = codePoint >= 0 && codePoint < 128;
        let glyph = ascii
            ? asciiGlyphByCodePoint[codePoint]
            : unicodeGlyphByCodePoint.get(codePoint);
        if (glyph === undefined) {
            glyph = createGlyph(codePoint);
            if (ascii) {
                asciiGlyphByCodePoint[codePoint] = glyph;
            } else {
                unicodeGlyphByCodePoint.set(codePoint, glyph);
            }
        }
        return glyph;
    }

    const capHeight =
        font.getGlyph("H".codePointAt(0)).bounds?.yMax ?? font.ascender;
    return Object.freeze({
        unitsPerEm: font.unitsPerEm,
        ascender: font.ascender,
        descender: font.descender,
        lineGap: font.lineGap,
        capHeight,
        glyphCount: font.glyphCount,
        getGlyph,
        getPairAdjustment: font.getPairAdjustment,
    });
}

/** @type {Map<string, Promise<ReturnType<typeof createTrueTypeFont>>>} */
const loadCache = new Map();

/**
 * Fetch and parse one exact static TrueType font URL. Calls for the same URL
 * share loading and parsing; authenticated callers can fetch bytes themselves
 * and pass them to `createTrueTypeFont`.
 *
 * @param {string | URL} url
 */
export function loadTrueTypeFont(url) {
    const key = String(url);
    let loading = loadCache.get(key);
    if (!loading) {
        loading = fetch(url).then(async (response) => {
            if (!response.ok) {
                throw new Error(
                    `Could not load TrueType font ${key}: ${response.status}.`
                );
            }
            return createTrueTypeFont(await response.arrayBuffer());
        });
        loadCache.set(key, loading);
        void loading.catch(() => loadCache.delete(key));
    }
    return loading;
}
