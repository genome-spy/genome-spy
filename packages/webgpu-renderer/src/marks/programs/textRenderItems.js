export const TEXT_LAYER_SHADOW = 0;
export const TEXT_LAYER_OUTLINE = 1;
export const TEXT_LAYER_FILL = 2;

/**
 * Build an exclusive prefix sum from logical strings to glyph instances.
 *
 * @param {import("../../index.js").TextLayout} textLayout
 * @returns {Uint32Array}
 */
export function buildGlyphOffsets(textLayout) {
    const offsets = new Uint32Array(textLayout.textWidth.length + 1);
    for (const stringIndex of textLayout.stringIndex) {
        offsets[stringIndex + 1]++;
    }
    for (let i = 1; i < offsets.length; i++) {
        offsets[i] += offsets[i - 1];
    }
    return offsets;
}

/**
 * Build label-major glyph-layer items. Each pair contains a glyph index and a
 * layer code. The returned offsets translate logical-string draw ranges to the
 * flattened item stream.
 *
 * @param {import("../../index.js").TextLayout} textLayout
 * @param {{ shadow: boolean, outline: boolean }} effects
 * @returns {{ data: Uint32Array, offsets: Uint32Array }}
 */
export function buildTextRenderItems(textLayout, effects) {
    const glyphOffsets = buildGlyphOffsets(textLayout);
    const layerCount = 1 + +effects.shadow + +effects.outline;
    const data = new Uint32Array(textLayout.glyphIds.length * layerCount * 2);
    const offsets = new Uint32Array(textLayout.textWidth.length + 1);
    let itemIndex = 0;

    /**
     * @param {number} glyphStart
     * @param {number} glyphEnd
     * @param {number} layer
     */
    const appendLayer = (glyphStart, glyphEnd, layer) => {
        for (let glyphIndex = glyphStart; glyphIndex < glyphEnd; glyphIndex++) {
            const offset = itemIndex * 2;
            data[offset] = glyphIndex;
            data[offset + 1] = layer;
            itemIndex++;
        }
    };

    for (
        let stringIndex = 0;
        stringIndex < textLayout.textWidth.length;
        stringIndex++
    ) {
        const glyphStart = glyphOffsets[stringIndex];
        const glyphEnd = glyphOffsets[stringIndex + 1];
        if (effects.shadow) {
            appendLayer(glyphStart, glyphEnd, TEXT_LAYER_SHADOW);
        }
        if (effects.outline) {
            appendLayer(glyphStart, glyphEnd, TEXT_LAYER_OUTLINE);
        }
        appendLayer(glyphStart, glyphEnd, TEXT_LAYER_FILL);
        offsets[stringIndex + 1] = itemIndex;
    }

    return { data, offsets };
}
