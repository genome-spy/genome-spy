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
    /** @type {Map<number, ReturnType<typeof createGlyph>>} */
    const glyphByCodePoint = new Map();
    /** @type {Map<number, string | null>} */
    const pathByGlyphId = new Map();

    /** @param {number} codePoint */
    function createGlyph(codePoint) {
        const glyph = font.getGlyph(codePoint);
        let path = pathByGlyphId.get(glyph.glyphId);
        if (path === undefined) {
            path = trueTypeGlyphToPath(glyph);
            pathByGlyphId.set(glyph.glyphId, path);
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
        let glyph = glyphByCodePoint.get(codePoint);
        if (!glyph) {
            glyph = createGlyph(codePoint);
            glyphByCodePoint.set(codePoint, glyph);
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

/**
 * Parse printable ASCII outlines and metrics from a TrueType font.
 *
 * @param {ArrayBuffer | ArrayBufferView | DataView} source
 */
export function createAsciiTrueTypeFont(source) {
    const font = createTrueTypeFont(source);
    const paths = [];
    const characters = new Map();
    const pathIndexByGlyphId = new Map();
    for (let codePoint = 32; codePoint <= 126; codePoint++) {
        const glyph = font.getGlyph(codePoint);
        let pathIndex = -1;
        if (glyph.path !== null) {
            const cachedPathIndex = pathIndexByGlyphId.get(glyph.glyphId);
            if (cachedPathIndex === undefined) {
                pathIndex = paths.length;
                paths.push(glyph.path);
                pathIndexByGlyphId.set(glyph.glyphId, pathIndex);
            } else {
                pathIndex = cachedPathIndex;
            }
        }
        characters.set(String.fromCodePoint(codePoint), {
            glyphId: glyph.glyphId,
            pathIndex,
            advanceWidth: glyph.advanceWidth,
            bounds: glyph.bounds,
        });
    }
    return {
        unitsPerEm: font.unitsPerEm,
        ascender: font.ascender,
        descender: font.descender,
        lineGap: font.lineGap,
        paths,
        characters,
        getPairAdjustment: font.getPairAdjustment,
    };
}
