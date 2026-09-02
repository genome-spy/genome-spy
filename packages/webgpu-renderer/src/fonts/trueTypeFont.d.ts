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

/** Prototype compatibility helper; production callers use TrueTypeFont. */
export function createAsciiTrueTypeFont(
    source: ArrayBuffer | ArrayBufferView | DataView
): Readonly<{
    unitsPerEm: number;
    ascender: number;
    descender: number;
    lineGap: number;
    paths: string[];
    characters: Map<
        string,
        {
            glyphId: number;
            pathIndex: number;
            advanceWidth: number;
            bounds: TrueTypeBounds | null;
        }
    >;
    getPairAdjustment: TrueTypeFont["getPairAdjustment"];
}>;

/** Internal outline-conversion helper retained for focused tests. */
export function trueTypeGlyphToPath(glyph: unknown): string | null;
