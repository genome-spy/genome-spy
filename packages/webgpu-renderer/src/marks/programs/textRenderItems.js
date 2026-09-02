export const TEXT_LAYER_SHADOW = 0;
export const TEXT_LAYER_OUTLINE = 1;
export const TEXT_LAYER_FILL = 2;

/**
 * @param {import("../../index.js").ChannelConfigInput | import("../../index.js").ConditionalChannelConfigInput | undefined} channel
 * @param {number | number[]} fallback
 * @param {(value: number | number[]) => boolean} predicate
 * @returns {boolean}
 */
function channelMayMatch(channel, fallback, predicate) {
    if (!channel) {
        return predicate(fallback);
    }
    if (
        channel.data !== undefined ||
        ("dynamic" in channel && channel.dynamic)
    ) {
        return true;
    }
    const value =
        channel.value ??
        ("default" in channel ? channel.default : undefined) ??
        fallback;
    if (predicate(value)) {
        return true;
    }
    const conditions = "conditions" in channel ? channel.conditions : [];
    for (const condition of conditions ?? []) {
        if (condition.value !== undefined) {
            if (predicate(condition.value)) {
                return true;
            }
        } else if (channelMayMatch(condition.channel, fallback, predicate)) {
            return true;
        }
    }
    return false;
}

/** @param {number | number[]} value */
function isPositive(value) {
    return typeof value !== "number" || value > 0;
}

/** @param {number | number[]} value */
function hasPositiveAlpha(value) {
    return !Array.isArray(value) || value.length < 4 || value[3] > 0;
}

/**
 * Resolve which effect layers can become visible without scanning current
 * series values. Series, conditional, and dynamic channels remain provisioned
 * for retained updates even when their initial values are zero.
 *
 * @param {import("../../index.js").TextChannels | undefined} channels
 * @returns {{ shadow: boolean, outline: boolean, enabled: boolean }}
 */
export function resolveTextEffectLayers(channels = {}) {
    const outline =
        channelMayMatch(channels.strokeWidth, 0, isPositive) &&
        channelMayMatch(channels.strokeOpacity, 1, isPositive) &&
        channelMayMatch(channels.stroke, [0, 0, 0, 1], hasPositiveAlpha);
    const shadow =
        channelMayMatch(channels.shadowOpacity, 0, isPositive) &&
        channelMayMatch(channels.shadowColor, [0, 0, 0, 1], hasPositiveAlpha);
    return { shadow, outline, enabled: shadow || outline };
}

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
