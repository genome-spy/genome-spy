/**
 * @param {import("../view/layout/rectangle.js").default} coords
 * @param {number} value
 * @param {number} offset
 */
export function projectX(coords, value, offset) {
    return coords.x + value * coords.width + offset;
}

/**
 * @param {import("../view/layout/rectangle.js").default} coords
 * @param {number} value
 * @param {number} offset
 */
export function projectY(coords, value, offset) {
    return coords.y + (1 - value) * coords.height + offset;
}

/**
 * @param {import("../types/encoder.js").Encoder} encoder
 * @param {object} datum
 */
export function encodeNumber(encoder, datum) {
    return /** @type {number} */ (encoder(datum));
}

/**
 * Encodes a positional channel in unit coordinates, including placement within
 * a discrete scale band. D3 band scales return the start of a band, whereas
 * the WebGL scale functions also apply the channel definition's `band` value.
 *
 * @param {import("../types/encoder.js").Encoder} encoder
 * @param {object} datum
 */
export function encodePosition(encoder, datum) {
    const basePosition = encodeNumber(encoder, datum);
    const scale = encoder.scale;

    if (!scale) {
        return basePosition;
    }

    const channelDef = encoder.channelDef;
    const band =
        channelDef && "band" in channelDef ? (channelDef.band ?? 0.5) : 0.5;

    if (scale.type == "band" || scale.type == "point") {
        const discreteScale = /** @type {{ bandwidth: () => number }} */ (
            /** @type {unknown} */ (scale)
        );
        return basePosition + discreteScale.bandwidth() * band;
    } else if (scale.type == "index" || scale.type == "locus") {
        const genomicScale =
            /** @type {{ step: () => number, align: () => number }} */ (
                /** @type {unknown} */ (scale)
            );
        return (
            basePosition + genomicScale.step() * (band - genomicScale.align())
        );
    } else {
        return basePosition;
    }
}

/**
 * @param {import("../types/encoder.js").Encoder} encoder
 * @param {object} datum
 */
export function encodeString(encoder, datum) {
    const value = encoder(datum);
    return value == null ? "none" : "" + value;
}
