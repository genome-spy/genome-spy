/**
 * @typedef {{ type: "M" | "L", x: number, y: number } |
 *   { type: "Q", x1: number, y1: number, x: number, y: number } |
 *   { type: "C", x1: number, y1: number, x2: number, y2: number, x: number, y: number } |
 *   { type: "Z" }} GlyphPathCommand
 * @typedef {{ commands: GlyphPathCommand[], bounds: { xMin: number, yMin: number, xMax: number, yMax: number } | null }} GlyphPath
 */

export {};
