/**
 * Returns the total advance adjustment contributed by a glyph pair.
 *
 * @param {import("./trueTypeFont.js").TrueTypeFont} font
 * @param {number} leftGlyphId
 * @param {number} rightGlyphId
 */
export function getPairAdvanceAdjustment(font, leftGlyphId, rightGlyphId) {
    const pair = font.getPairAdjustment(leftGlyphId, rightGlyphId);
    return pair.firstAdvance + pair.secondAdvance;
}

/**
 * Measures one logical line without constructing glyph geometry.
 *
 * @param {import("./trueTypeFont.js").TrueTypeFont} font
 * @param {string} text
 * @param {number} fontSize
 * @param {number} [letterSpacing]
 */
export function measureTrueTypeLineWidth(
    font,
    text,
    fontSize,
    letterSpacing = 0
) {
    let widthUnits = 0;
    let previousGlyph;
    let glyphCount = 0;

    for (const character of text) {
        const glyph = font.getGlyph(character);
        widthUnits += glyph.advanceWidth;
        if (previousGlyph) {
            widthUnits += getPairAdvanceAdjustment(
                font,
                previousGlyph.glyphId,
                glyph.glyphId
            );
        }
        previousGlyph = glyph;
        glyphCount++;
    }

    return (
        (widthUnits * fontSize) / font.unitsPerEm +
        Math.max(0, glyphCount - 1) * letterSpacing
    );
}
