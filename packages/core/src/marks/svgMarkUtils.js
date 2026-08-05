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
 * @param {import("../types/encoder.js").Encoder} encoder
 * @param {object} datum
 */
export function encodeString(encoder, datum) {
    return /** @type {string} */ (encoder(datum));
}
