import { Reader } from "./reader.js";
import { parsePairAdjustment } from "./positioning.js";

const ON_CURVE = 0x01;
const X_SHORT = 0x02;
const Y_SHORT = 0x04;
const REPEAT = 0x08;
const X_SAME_OR_POSITIVE = 0x10;
const Y_SAME_OR_POSITIVE = 0x20;
const ARGUMENTS_ARE_WORDS = 0x0001;
const ARGUMENTS_ARE_XY = 0x0002;
const ROUND_XY_TO_GRID = 0x0004;
const HAS_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const HAS_XY_SCALE = 0x0040;
const HAS_TRANSFORM = 0x0080;
const HAS_INSTRUCTIONS = 0x0100;
const SCALED_COMPONENT_OFFSET = 0x0800;
const UNSCALED_COMPONENT_OFFSET = 0x1000;

/** @typedef {{ x: number, y: number, onCurve: boolean }} TrueTypePoint */
/**
 * @typedef {object} TrueTypeGlyph
 * @property {number} glyphId
 * @property {number} advanceWidth
 * @property {number} leftSideBearing
 * @property {{ xMin: number, yMin: number, xMax: number, yMax: number } | null} bounds
 * @property {TrueTypePoint[][]} contours
 */

/** @param {Reader} font */
function parseTableDirectory(font) {
    const signature = font.uint32();
    if (signature === 0x4f54544f) {
        throw new Error("CFF OpenType fonts are not supported by this PoC.");
    }
    if (signature !== 0x00010000 && signature !== 0x74727565) {
        throw new Error("Expected an SFNT TrueType font.");
    }
    const tableCount = font.uint16();
    font.skip(6);
    const tables = new Map();
    for (let index = 0; index < tableCount; index++) {
        const tag = font.tag();
        font.skip(4);
        const offset = font.uint32();
        const length = font.uint32();
        tables.set(tag, { offset, length });
    }
    return tables;
}

/**
 * @param {Reader} font
 * @param {Map<string, { offset: number, length: number }>} tables
 * @param {string} tag
 */
function requiredTable(font, tables, tag) {
    const table = tables.get(tag);
    if (!table) {
        throw new Error(`TrueType font is missing the ${tag} table.`);
    }
    return font.slice(table.offset, table.length);
}

/** @param {Reader} cmap */
function parseCmap(cmap) {
    cmap.uint16();
    const tableCount = cmap.uint16();
    const records = [];
    for (let index = 0; index < tableCount; index++) {
        records.push({
            platformId: cmap.uint16(),
            encodingId: cmap.uint16(),
            offset: cmap.uint32(),
        });
    }
    const preference = new Map([
        ["3-10", 0],
        ["0-4", 1],
        ["3-1", 2],
        ["0-3", 3],
        ["0-6", 4],
    ]);
    records.sort(
        (a, b) =>
            (preference.get(`${a.platformId}-${a.encodingId}`) ?? 100) -
            (preference.get(`${b.platformId}-${b.encodingId}`) ?? 100)
    );
    for (const record of records) {
        if (record.offset + 2 > cmap.length) {
            continue;
        }
        const subtable = cmap.slice(record.offset, cmap.length - record.offset);
        const format = subtable.uint16();
        if (format === 4) {
            return parseCmapFormat4(subtable);
        }
        if (format === 12) {
            return parseCmapFormat12(subtable);
        }
    }
    throw new Error("TrueType font has no supported Unicode cmap table.");
}

/** @param {Reader} subtable */
function parseCmapFormat4(subtable) {
    const length = subtable.uint16();
    if (length > subtable.length) {
        throw new RangeError("TrueType cmap format 4 exceeds its table.");
    }
    subtable.uint16();
    const segmentCount = subtable.uint16() / 2;
    subtable.skip(6);
    const endCodes = Array.from({ length: segmentCount }, () =>
        subtable.uint16()
    );
    subtable.uint16();
    const startCodes = Array.from({ length: segmentCount }, () =>
        subtable.uint16()
    );
    const deltas = Array.from({ length: segmentCount }, () => subtable.int16());
    const rangeOffsetsPosition = subtable.offset;
    const rangeOffsets = Array.from({ length: segmentCount }, () =>
        subtable.uint16()
    );
    /** @param {number} codePoint */
    return (codePoint) => {
        for (let index = 0; index < segmentCount; index++) {
            if (codePoint > endCodes[index]) {
                continue;
            }
            if (codePoint < startCodes[index]) {
                return 0;
            }
            if (rangeOffsets[index] === 0) {
                return (codePoint + deltas[index]) & 0xffff;
            }
            const glyphOffset =
                rangeOffsetsPosition +
                index * 2 +
                rangeOffsets[index] +
                (codePoint - startCodes[index]) * 2;
            if (glyphOffset + 2 > length) {
                throw new RangeError(
                    "TrueType cmap glyph index is out of range."
                );
            }
            const saved = subtable.offset;
            subtable.seek(glyphOffset);
            let glyphId = subtable.uint16();
            subtable.seek(saved);
            if (glyphId !== 0) {
                glyphId = (glyphId + deltas[index]) & 0xffff;
            }
            return glyphId;
        }
        return 0;
    };
}

/** @param {Reader} subtable */
function parseCmapFormat12(subtable) {
    subtable.uint16();
    const length = subtable.uint32();
    if (length > subtable.length) {
        throw new RangeError("TrueType cmap format 12 exceeds its table.");
    }
    subtable.uint32();
    const groupCount = subtable.uint32();
    const groups = Array.from({ length: groupCount }, () => ({
        start: subtable.uint32(),
        end: subtable.uint32(),
        glyphId: subtable.uint32(),
    }));
    /** @param {number} codePoint */
    return (codePoint) => {
        let low = 0;
        let high = groups.length - 1;
        while (low <= high) {
            const middle = (low + high) >>> 1;
            const group = groups[middle];
            if (codePoint < group.start) {
                high = middle - 1;
            } else if (codePoint > group.end) {
                low = middle + 1;
            } else {
                return group.glyphId + codePoint - group.start;
            }
        }
        return 0;
    };
}

/**
 * @param {Reader} glyphReader
 * @param {number} contourCount
 * @returns {TrueTypePoint[][]}
 */
function parseSimpleGlyph(glyphReader, contourCount) {
    const contourEnds = Array.from({ length: contourCount }, () =>
        glyphReader.uint16()
    );
    const pointCount = contourEnds.at(-1) + 1;
    glyphReader.skip(glyphReader.uint16());
    const flags = [];
    while (flags.length < pointCount) {
        const flag = glyphReader.uint8();
        flags.push(flag);
        if (flag & REPEAT) {
            const count = glyphReader.uint8();
            for (let index = 0; index < count; index++) {
                flags.push(flag);
            }
        }
    }
    if (flags.length !== pointCount) {
        throw new Error("TrueType glyph flag repetition exceeds point count.");
    }
    const xCoordinates = [];
    let x = 0;
    for (const flag of flags) {
        if (flag & X_SHORT) {
            const delta = glyphReader.uint8();
            x += flag & X_SAME_OR_POSITIVE ? delta : -delta;
        } else if (!(flag & X_SAME_OR_POSITIVE)) {
            x += glyphReader.int16();
        }
        xCoordinates.push(x);
    }
    const yCoordinates = [];
    let y = 0;
    for (const flag of flags) {
        if (flag & Y_SHORT) {
            const delta = glyphReader.uint8();
            y += flag & Y_SAME_OR_POSITIVE ? delta : -delta;
        } else if (!(flag & Y_SAME_OR_POSITIVE)) {
            y += glyphReader.int16();
        }
        yCoordinates.push(y);
    }
    const contours = [];
    let start = 0;
    for (const end of contourEnds) {
        const contour = [];
        for (let index = start; index <= end; index++) {
            contour.push({
                x: xCoordinates[index],
                y: yCoordinates[index],
                onCurve: Boolean(flags[index] & ON_CURVE),
            });
        }
        contours.push(contour);
        start = end + 1;
    }
    return contours;
}

/** @param {TrueTypePoint[][]} contours */
function flattenPoints(contours) {
    return contours.flatMap((contour) => contour);
}

/**
 * @param {TrueTypePoint[][]} contours
 * @param {[number, number, number, number]} transform
 * @param {number} dx
 * @param {number} dy
 */
function transformContours(contours, transform, dx, dy) {
    const [a, b, c, d] = transform;
    return contours.map((contour) =>
        contour.map((point) => ({
            x: Math.round(a * point.x + c * point.y + dx),
            y: Math.round(b * point.x + d * point.y + dy),
            onCurve: point.onCurve,
        }))
    );
}

/**
 * Parse the minimal TrueType subset required by the ASCII outline PoC.
 * Adapted from text-shaper; see ../NOTICE.md.
 *
 * @param {ArrayBuffer | ArrayBufferView | DataView} source
 */
export function parseTrueTypeFont(source) {
    const font = new Reader(source);
    const tables = parseTableDirectory(font);

    const head = requiredTable(font, tables, "head");
    head.skip(18);
    const unitsPerEm = head.uint16();
    head.skip(30);
    const indexToLocFormat = head.int16();
    if (unitsPerEm < 16 || unitsPerEm > 16384) {
        throw new Error("TrueType unitsPerEm is outside the valid range.");
    }
    if (indexToLocFormat !== 0 && indexToLocFormat !== 1) {
        throw new Error("Unsupported TrueType loca offset format.");
    }

    const maxp = requiredTable(font, tables, "maxp");
    maxp.skip(4);
    const glyphCount = maxp.uint16();

    const hhea = requiredTable(font, tables, "hhea");
    hhea.skip(4);
    const ascender = hhea.int16();
    const descender = hhea.int16();
    const lineGap = hhea.int16();
    hhea.skip(24);
    const horizontalMetricCount = hhea.uint16();
    if (horizontalMetricCount < 1 || horizontalMetricCount > glyphCount) {
        throw new Error("Invalid TrueType horizontal metric count.");
    }

    const hmtx = requiredTable(font, tables, "hmtx");
    const advanceWidths = new Uint16Array(glyphCount);
    const leftSideBearings = new Int16Array(glyphCount);
    let lastAdvance = 0;
    for (let glyphId = 0; glyphId < horizontalMetricCount; glyphId++) {
        lastAdvance = hmtx.uint16();
        advanceWidths[glyphId] = lastAdvance;
        leftSideBearings[glyphId] = hmtx.int16();
    }
    for (let glyphId = horizontalMetricCount; glyphId < glyphCount; glyphId++) {
        advanceWidths[glyphId] = lastAdvance;
        leftSideBearings[glyphId] = hmtx.int16();
    }

    const loca = requiredTable(font, tables, "loca");
    const glyphOffsets = new Uint32Array(glyphCount + 1);
    for (let index = 0; index <= glyphCount; index++) {
        glyphOffsets[index] =
            indexToLocFormat === 0 ? loca.uint16() * 2 : loca.uint32();
    }
    const glyf = requiredTable(font, tables, "glyf");
    if (glyphOffsets[glyphCount] > glyf.length) {
        throw new RangeError("TrueType glyph locations exceed the glyf table.");
    }
    const glyphIdForCodePoint = parseCmap(requiredTable(font, tables, "cmap"));
    const getPairAdjustment = parsePairAdjustment(font, tables);
    const cache = new Map();

    /**
     * @param {number} glyphId
     * @param {number} [depth]
     * @returns {TrueTypeGlyph}
     */
    function getGlyphById(glyphId, depth = 0) {
        if (glyphId >= glyphCount) {
            throw new RangeError("TrueType cmap refers to a missing glyph.");
        }
        if (depth > 32) {
            throw new Error("TrueType composite glyph nesting is too deep.");
        }
        const cached = cache.get(glyphId);
        if (cached) {
            return cached;
        }
        const offset = glyphOffsets[glyphId];
        const length = glyphOffsets[glyphId + 1] - offset;
        /** @type {TrueTypeGlyph} */
        let glyph;
        if (length === 0) {
            glyph = {
                glyphId,
                advanceWidth: advanceWidths[glyphId],
                leftSideBearing: leftSideBearings[glyphId],
                bounds: null,
                contours: [],
            };
        } else {
            const glyphReader = glyf.slice(offset, length);
            const contourCount = glyphReader.int16();
            const bounds = {
                xMin: glyphReader.int16(),
                yMin: glyphReader.int16(),
                xMax: glyphReader.int16(),
                yMax: glyphReader.int16(),
            };
            let contours;
            if (contourCount >= 0) {
                contours =
                    contourCount === 0
                        ? []
                        : parseSimpleGlyph(glyphReader, contourCount);
            } else {
                contours = [];
                const parentPoints = [];
                let flags;
                do {
                    flags = glyphReader.uint16();
                    const componentGlyphId = glyphReader.uint16();
                    let argument1;
                    let argument2;
                    if (flags & ARGUMENTS_ARE_WORDS) {
                        if (flags & ARGUMENTS_ARE_XY) {
                            argument1 = glyphReader.int16();
                            argument2 = glyphReader.int16();
                        } else {
                            argument1 = glyphReader.uint16();
                            argument2 = glyphReader.uint16();
                        }
                    } else if (flags & ARGUMENTS_ARE_XY) {
                        argument1 = glyphReader.int8();
                        argument2 = glyphReader.int8();
                    } else {
                        argument1 = glyphReader.uint8();
                        argument2 = glyphReader.uint8();
                    }
                    /** @type {[number, number, number, number]} */
                    const transform = [1, 0, 0, 1];
                    if (flags & HAS_SCALE) {
                        transform[0] = glyphReader.int16() / 16384;
                        transform[3] = transform[0];
                    } else if (flags & HAS_XY_SCALE) {
                        transform[0] = glyphReader.int16() / 16384;
                        transform[3] = glyphReader.int16() / 16384;
                    } else if (flags & HAS_TRANSFORM) {
                        transform[0] = glyphReader.int16() / 16384;
                        transform[1] = glyphReader.int16() / 16384;
                        transform[2] = glyphReader.int16() / 16384;
                        transform[3] = glyphReader.int16() / 16384;
                    }
                    const component = getGlyphById(componentGlyphId, depth + 1);
                    const componentPoints = flattenPoints(component.contours);
                    /** @type {number} */
                    let dx;
                    /** @type {number} */
                    let dy;
                    if (flags & ARGUMENTS_ARE_XY) {
                        const scalesOffset =
                            !(flags & UNSCALED_COMPONENT_OFFSET) &&
                            (flags & SCALED_COMPONENT_OFFSET ||
                                transform[0] !== 1 ||
                                transform[1] !== 0 ||
                                transform[2] !== 0 ||
                                transform[3] !== 1);
                        if (scalesOffset) {
                            dx =
                                transform[0] * argument1 +
                                transform[2] * argument2;
                            dy =
                                transform[1] * argument1 +
                                transform[3] * argument2;
                        } else {
                            dx = argument1;
                            dy = argument2;
                        }
                        if (flags & ROUND_XY_TO_GRID) {
                            dx = Math.round(dx);
                            dy = Math.round(dy);
                        }
                    } else {
                        const parentPoint = parentPoints[argument1];
                        const componentPoint = componentPoints[argument2];
                        if (!parentPoint || !componentPoint) {
                            throw new Error(
                                "TrueType composite point attachment is invalid."
                            );
                        }
                        const componentX =
                            transform[0] * componentPoint.x +
                            transform[2] * componentPoint.y;
                        const componentY =
                            transform[1] * componentPoint.x +
                            transform[3] * componentPoint.y;
                        dx = parentPoint.x - componentX;
                        dy = parentPoint.y - componentY;
                    }
                    const transformed = transformContours(
                        component.contours,
                        transform,
                        dx,
                        dy
                    );
                    contours.push(...transformed);
                    parentPoints.push(...flattenPoints(transformed));
                } while (flags & MORE_COMPONENTS);
                if (flags & HAS_INSTRUCTIONS) {
                    glyphReader.skip(glyphReader.uint16());
                }
            }
            glyph = {
                glyphId,
                advanceWidth: advanceWidths[glyphId],
                leftSideBearing: leftSideBearings[glyphId],
                bounds,
                contours,
            };
        }
        cache.set(glyphId, glyph);
        return glyph;
    }

    /** @param {number} codePoint @returns {TrueTypeGlyph} */
    function getGlyph(codePoint) {
        return getGlyphById(glyphIdForCodePoint(codePoint));
    }

    return {
        unitsPerEm,
        ascender,
        descender,
        lineGap,
        glyphCount,
        getGlyph,
        getPairAdjustment,
    };
}
