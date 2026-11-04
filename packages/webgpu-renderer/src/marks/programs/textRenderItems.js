export const TEXT_LAYER_SHADOW = 0;
export const TEXT_LAYER_FOREGROUND = 1;

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
 * Provision shadow resources for series, conditional and dynamic channels even
 * when their initial values are invisible. Foreground paint needs no variant.
 * @param {import("../../index.js").TextChannels} [channels]
 */
export function hasTextShadow(channels) {
    return (
        channelMayMatch(channels?.shadowOpacity, 0, isPositive) &&
        channelMayMatch(channels?.shadowColor, [0, 0, 0, 1], hasPositiveAlpha)
    );
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
 * Schedule each label's existing glyph shadows before one combined foreground.
 * Offsets address logical strings, including empty strings, for draw subranges.
 * @param {import("../../index.js").TextLayout} textLayout
 * @param {boolean} shadow
 */
export function buildTextRenderItems(textLayout, shadow) {
    const glyphOffsets = buildGlyphOffsets(textLayout);
    let labelCount = 0;
    for (let i = 1; i < glyphOffsets.length; i++) {
        if (glyphOffsets[i] > glyphOffsets[i - 1]) labelCount++;
    }
    const data = new Uint32Array(
        (labelCount + (shadow ? textLayout.glyphIds.length : 0)) * 2
    );
    const offsets = new Uint32Array(textLayout.textWidth.length + 1);
    let item = 0;
    for (let i = 0; i < textLayout.textWidth.length; i++) {
        const start = glyphOffsets[i],
            end = glyphOffsets[i + 1];
        if (shadow) {
            for (let glyph = start; glyph < end; glyph++) {
                data[item * 2] = glyph;
                data[item * 2 + 1] = TEXT_LAYER_SHADOW;
                item++;
            }
        }
        if (start < end) {
            data[item * 2] = start;
            data[item * 2 + 1] = TEXT_LAYER_FOREGROUND;
            item++;
        }
        offsets[i + 1] = item;
    }
    return { data, offsets };
}
