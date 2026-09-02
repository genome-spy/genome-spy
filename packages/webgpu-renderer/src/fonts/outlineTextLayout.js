export const OUTLINE_ATLAS_OPTIONS = Object.freeze({
    tileSize: 128,
    shapePadding: 24,
    spread: 24,
    gutter: 1,
    tightPacking: true,
});

/**
 * @param {unknown} value
 * @returns {value is import("./trueTypeFont.js").TrueTypeFont}
 */
export function isTrueTypeFont(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const candidate = /** @type {Record<string, unknown>} */ (value);
    return (
        typeof candidate.getGlyph === "function" &&
        typeof candidate.getPairAdjustment === "function" &&
        typeof candidate.unitsPerEm === "number"
    );
}

/**
 * @typedef {object} OutlineGlyph
 * @property {string} path
 * @property {import("./trueTypeFont.js").TrueTypeBounds} bounds
 * @property {number} tileWidth
 * @property {number} tileHeight
 */

/**
 * Build renderer-local glyph instances while preserving logical-string
 * cardinality. Empty-outline glyphs still advance the pen but emit no quad.
 *
 * @param {string[]} strings
 * @param {import("./trueTypeFont.js").TrueTypeFont} font
 * @param {{ fontSize?: number, lineHeight?: number, letterSpacing?: number }} [options]
 */
export function buildOutlineTextLayout(strings, font, options = {}) {
    const fontSize = options.fontSize ?? 12;
    const lineHeight = options.lineHeight ?? 1;
    const letterSpacing = options.letterSpacing ?? 0;
    const unitsPerEm = font.unitsPerEm;
    const scale = fontSize / unitsPerEm;
    const letterSpacingUnits = letterSpacing / scale;
    const lineAdvance =
        (font.ascender - font.descender + font.lineGap) * scale * lineHeight;
    const glyphIds = [];
    const stringIndex = [];
    const xOffset = [];
    const yOffset = [];
    const textWidth = new Float32Array(strings.length);
    const textHeight = new Float32Array(strings.length);
    /** @type {OutlineGlyph[]} */
    const outlineGlyphs = [];
    const pathIndexByGlyphId = new Map();
    const shapePixels =
        OUTLINE_ATLAS_OPTIONS.tileSize - OUTLINE_ATLAS_OPTIONS.shapePadding * 2;
    const atlasScale = shapePixels / unitsPerEm;

    for (let textIndex = 0; textIndex < strings.length; textIndex++) {
        const lines = strings[textIndex].split("\n");
        let maxWidth = 0;
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const glyphs = Array.from(lines[lineIndex], (character) =>
                font.getGlyph(character)
            );
            const adjustments = glyphs.map(() => ({
                placement: 0,
                advance: 0,
            }));
            for (let index = 0; index + 1 < glyphs.length; index++) {
                const pair = font.getPairAdjustment(
                    glyphs[index].glyphId,
                    glyphs[index + 1].glyphId
                );
                adjustments[index].placement += pair.firstPlacement;
                adjustments[index].advance += pair.firstAdvance;
                adjustments[index + 1].placement += pair.secondPlacement;
                adjustments[index + 1].advance += pair.secondAdvance;
            }

            let pen = 0;
            for (let index = 0; index < glyphs.length; index++) {
                const glyph = glyphs[index];
                const adjustment = adjustments[index];
                if (glyph.path !== null && glyph.bounds !== null) {
                    let pathIndex = pathIndexByGlyphId.get(glyph.glyphId);
                    if (pathIndex === undefined) {
                        const width = glyph.bounds.xMax - glyph.bounds.xMin;
                        const height = glyph.bounds.yMax - glyph.bounds.yMin;
                        const tileWidth = Math.max(
                            1,
                            Math.ceil(
                                width * atlasScale +
                                    OUTLINE_ATLAS_OPTIONS.shapePadding * 2
                            )
                        );
                        const tileHeight = Math.max(
                            1,
                            Math.ceil(
                                height * atlasScale +
                                    OUTLINE_ATLAS_OPTIONS.shapePadding * 2
                            )
                        );
                        pathIndex = outlineGlyphs.length;
                        outlineGlyphs.push({
                            path: glyph.path,
                            bounds: glyph.bounds,
                            tileWidth,
                            tileHeight,
                        });
                        pathIndexByGlyphId.set(glyph.glyphId, pathIndex);
                    }
                    const outline = outlineGlyphs[pathIndex];
                    const centerX =
                        (glyph.bounds.xMin + glyph.bounds.xMax) * 0.5;
                    const tileLeft =
                        centerX - (outline.tileWidth / atlasScale) * 0.5;
                    glyphIds.push(pathIndex);
                    stringIndex.push(textIndex);
                    xOffset.push(
                        (pen + adjustment.placement + tileLeft) * scale
                    );
                    yOffset.push(-lineIndex * lineAdvance);
                }
                pen +=
                    glyph.advanceWidth +
                    adjustment.advance +
                    letterSpacingUnits;
            }
            const lineWidth =
                glyphs.length > 0 ? pen * scale - letterSpacing : 0;
            maxWidth = Math.max(maxWidth, lineWidth);
        }
        textWidth[textIndex] = maxWidth;
        textHeight[textIndex] = Math.max(1, lines.length) * lineAdvance;
    }

    return {
        glyphIds: Uint32Array.from(glyphIds),
        stringIndex: Uint32Array.from(stringIndex),
        xOffset: Float32Array.from(xOffset),
        yOffset: Float32Array.from(yOffset),
        textWidth,
        textHeight,
        fontSize,
        lineAdvance,
        ascent: font.ascender * scale,
        // TrueType descenders are signed, while layout descent is a positive
        // distance below the alphabetic baseline.
        descent: -font.descender * scale,
        outlineGlyphs,
        paths: outlineGlyphs.map((glyph) => glyph.path),
    };
}
