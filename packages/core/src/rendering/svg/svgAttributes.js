/**
 * Moves constant presentation attributes to the mark group and returns an
 * encoder for the remaining data-dependent attributes. SVG presentation
 * attributes inherit without relying on CSS.
 *
 * @param {SVGGElement} group
 * @param {Record<string, {
 *     encoder: import("../../types/encoder.js").Encoder,
 *     transform?: (value: import("../../spec/channel.js").Scalar) => string | number
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
 *     encoder: import("../../types/encoder.js").Encoder,
 *     transform?: (value: import("../../spec/channel.js").Scalar) => string | number
 * }} definition
 * @param {object} datum
 */
function encodeAttributeValue(definition, datum) {
    const value = definition.encoder(datum);
    return definition.transform ? definition.transform(value) : "" + value;
}
