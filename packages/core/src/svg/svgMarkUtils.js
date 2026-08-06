import { formatSvgNumber } from "./svgNumber.js";

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
    return toSvgString(encoder(datum));
}

/** @param {import("../spec/channel.js").Scalar} value */
export function toSvgString(value) {
    return value == null ? "none" : "" + value;
}

/**
 * Moves constant presentation attributes to the mark group and returns an
 * encoder for the remaining data-dependent attributes. SVG presentation
 * attributes inherit without relying on CSS.
 *
 * @param {SVGGElement} group
 * @param {Record<string, {
 *     encoder: import("../types/encoder.js").Encoder,
 *     transform?: (value: import("../spec/channel.js").Scalar) => string | number
 * }>} definitions
 */
export function createSvgAttributeEncoder(group, definitions) {
    const variableDefinitions = Object.entries(definitions).filter(
        ([name, definition]) => {
            if (definition.encoder.constant) {
                group.setAttribute(
                    name,
                    "" + encodeAttributeValue(definition, {})
                );
                return false;
            } else {
                return true;
            }
        }
    );

    return (/** @type {object} */ datum) =>
        Object.fromEntries(
            variableDefinitions.map(([name, definition]) => [
                name,
                encodeAttributeValue(definition, datum),
            ])
        );
}

/**
 * @param {{
 *     encoder: import("../types/encoder.js").Encoder,
 *     transform?: (value: import("../spec/channel.js").Scalar) => string | number
 * }} definition
 * @param {object} datum
 */
function encodeAttributeValue(definition, datum) {
    const value = definition.encoder(datum);
    return definition.transform ? definition.transform(value) : "" + value;
}

export { formatSvgNumber };
