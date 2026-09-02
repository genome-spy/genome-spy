const FIRST_CODE_POINT = 0x100;

/**
 * Create a deterministic outline font with enough distinct glyphs to exercise
 * atlas growth without making a large binary font fixture part of the tests.
 *
 * @param {number} glyphCount
 */
export function createSyntheticOutlineFont(glyphCount) {
    if (!Number.isInteger(glyphCount) || glyphCount < 1) {
        throw new Error("glyphCount must be a positive integer.");
    }

    const glyphs = Array.from({ length: glyphCount }, (_, index) => {
        const codePoint = FIRST_CODE_POINT + index;
        const width = 420 + (index % 37) * 3;
        const height = 560 + Math.floor(index / 37) * 7;
        return Object.freeze({
            codePoint,
            glyphId: index + 1,
            advanceWidth: width + 80,
            leftSideBearing: 0,
            bounds: Object.freeze({
                xMin: 0,
                yMin: 0,
                xMax: width,
                yMax: height,
            }),
            // The varying dimensions make every path distinct while keeping
            // generation cost intentionally simple and predictable.
            path: `M0 0L${width} 0L${width} -${height}L0 -${height}Z`,
        });
    });

    return Object.freeze({
        unitsPerEm: 1000,
        ascender: 800,
        descender: -200,
        lineGap: 0,
        capHeight: 700,
        glyphCount,
        getGlyph(value) {
            const codePoint =
                typeof value === "number" ? value : value.codePointAt(0);
            const glyph = glyphs[codePoint - FIRST_CODE_POINT];
            if (!glyph) {
                throw new Error(`Synthetic font has no glyph for ${value}.`);
            }
            return glyph;
        },
        getPairAdjustment() {
            return {
                firstPlacement: 0,
                firstAdvance: 0,
                secondPlacement: 0,
                secondAdvance: 0,
            };
        },
    });
}

/**
 * Build labels that deterministically cover the requested glyph prefix.
 *
 * @param {number} labelCount
 * @param {number} uniqueGlyphs
 * @param {number} [labelLength]
 * @param {number} [phase]
 */
export function createSyntheticLabels(
    labelCount,
    uniqueGlyphs,
    labelLength = 4,
    phase = 0
) {
    if (labelCount < uniqueGlyphs) {
        throw new Error("labelCount must cover every requested glyph.");
    }
    return Array.from({ length: labelCount }, (_, labelIndex) =>
        Array.from({ length: labelLength }, (_unused, characterIndex) =>
            String.fromCodePoint(
                FIRST_CODE_POINT +
                    ((labelIndex * 17 + characterIndex * 43 + phase) %
                        uniqueGlyphs)
            )
        ).join("")
    );
}

/** @param {number} labelCount @param {number} width @param {number} height */
export function createLabelPositions(labelCount, width, height) {
    const x = new Float32Array(labelCount);
    const y = new Float32Array(labelCount);
    const columns = Math.ceil(Math.sqrt(labelCount * (width / height)));
    const rows = Math.ceil(labelCount / columns);
    for (let index = 0; index < labelCount; index++) {
        x[index] = ((index % columns) + 0.5) * (width / columns);
        y[index] = (Math.floor(index / columns) + 0.5) * (height / rows);
    }
    return { x, y };
}
