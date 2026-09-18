export type TrueTypeBounds = Readonly<{
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
}>;

export type TrueTypeGlyph = Readonly<{
    codePoint: number;
    glyphId: number;
    advanceWidth: number;
    leftSideBearing: number;
    bounds: TrueTypeBounds | null;
    path: string | null;
}>;

export type PairAdjustment = Readonly<{
    firstPlacement: number;
    firstAdvance: number;
    secondPlacement: number;
    secondAdvance: number;
}>;

export type TrueTypeFont = Readonly<{
    unitsPerEm: number;
    ascender: number;
    descender: number;
    lineGap: number;
    capHeight: number;
    glyphCount: number;
    getGlyph(value: number | string): TrueTypeGlyph;
    getPairAdjustment(
        leftGlyphId: number,
        rightGlyphId: number
    ): PairAdjustment;
}>;

export function createTrueTypeFont(
    source: ArrayBuffer | ArrayBufferView | DataView
): TrueTypeFont;

export function loadTrueTypeFont(url: string | URL): Promise<TrueTypeFont>;

/** Measures advance width using the renderer's pair-adjustment rules. */
export function measureTrueTypeTextWidth(
    font: TrueTypeFont,
    text: string,
    fontSize: number
): number;

/** Internal outline-conversion helper retained for focused tests. */
export function trueTypeGlyphToPath(glyph: unknown): string | null;
