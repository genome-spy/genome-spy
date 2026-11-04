import { OUTLINE_ATLAS_OPTIONS } from "../../fonts/outlineTextLayout.js";
import { buildGlyphOffsets } from "./textRenderItems.js";

/**
 * Index complete padded glyph rectangles in layout coordinates. Retained size,
 * fitting and rotation changes query the same bins through the inverse transform;
 * atlas relocation changes texture coordinates, not these rectangles.
 *
 * @param {ReturnType<typeof import("../../fonts/outlineTextLayout.js").buildOutlineTextLayout>} layout
 */
export function buildTextGlyphLookup(layout) {
    const ranges = buildGlyphOffsets(layout);
    const metrics = new Float32Array(layout.textWidth.length * 8);
    const words = new Uint32Array(metrics.buffer);
    /** @type {number[]} */
    const data = [];
    const atlasToLayout =
        layout.fontSize /
        (OUTLINE_ATLAS_OPTIONS.tileSize -
            OUTLINE_ATLAS_OPTIONS.shapePadding * 2);
    const width = (/** @type {number} */ glyph) =>
        layout.outlineGlyphs[layout.glyphIds[glyph]].tileWidth * atlasToLayout;

    for (let i = 0; i < layout.textWidth.length; i++) {
        const base = i * 8;
        metrics[base] = layout.textWidth[i];
        metrics[base + 1] = layout.textHeight[i];
        words[base + 2] = ranges[i];
        words[base + 3] = ranges[i + 1];
        if (ranges[i] === ranges[i + 1]) continue;

        let minX = Infinity,
            maxX = -Infinity,
            maxWidth = 0;
        for (let glyph = ranges[i]; glyph < ranges[i + 1]; glyph++) {
            const glyphWidth = width(glyph);
            minX = Math.min(minX, layout.xOffset[glyph]);
            maxX = Math.max(maxX, layout.xOffset[glyph] + glyphWidth);
            maxWidth = Math.max(maxWidth, glyphWidth);
        }
        // O(glyph count) memberships and headers even
        // when a label contains very large gaps or unusually wide outlines.
        const binWidth = Math.fround(
            Math.max(
                layout.fontSize,
                maxWidth,
                (maxX - minX) / ((ranges[i + 1] - ranges[i]) * 2)
            )
        );
        const first = Math.floor(minX / binWidth);
        const bins = Array.from(
            { length: Math.floor(maxX / binWidth) - first + 1 },
            () => /** @type {number[]} */ ([])
        );
        for (let glyph = ranges[i]; glyph < ranges[i + 1]; glyph++) {
            const left = layout.xOffset[glyph];
            for (
                let bin = Math.floor(left / binWidth);
                bin <= Math.floor((left + width(glyph)) / binWidth);
                bin++
            ) {
                bins[bin - first].push(glyph);
            }
        }
        const start = data.length;
        data.length += bins.length + 1;
        for (let bin = 0; bin < bins.length; bin++) {
            data[start + bin] = data.length;
            for (const glyph of bins[bin]) data.push(glyph);
        }
        data[start + bins.length] = data.length;
        words[base + 4] = start;
        words[base + 5] = bins.length;
        metrics[base + 6] = first * binWidth;
        metrics[base + 7] = binWidth;
    }
    return { metrics, data: Uint32Array.from(data) };
}
