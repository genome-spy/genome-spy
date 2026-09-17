import { createTrueTypeFont } from "../../src/fonts/trueTypeFont.js";

/**
 * Adapt a TrueType font to the fixed path table used by comparison scenes.
 * Production text resolves glyphs lazily through `TrueTypeFont` instead.
 *
 * @param {ArrayBuffer | ArrayBufferView | DataView} source
 */
export function createAsciiTrueTypeFont(source) {
    const font = createTrueTypeFont(source);
    const paths = [];
    const characters = new Map();
    /** @type {Array<number | undefined>} */
    const pathIndexByGlyphId = new Array(font.glyphCount);
    for (let codePoint = 32; codePoint <= 126; codePoint++) {
        const glyph = font.getGlyph(codePoint);
        let pathIndex = -1;
        if (glyph.path !== null) {
            const cachedPathIndex = pathIndexByGlyphId[glyph.glyphId];
            if (cachedPathIndex === undefined) {
                pathIndex = paths.length;
                paths.push(glyph.path);
                pathIndexByGlyphId[glyph.glyphId] = pathIndex;
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
