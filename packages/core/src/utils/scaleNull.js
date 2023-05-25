/**
 * Like scaleIdentity but passes everything thru. Doesn't support domains or ranges or anything.
 */
export default function scaleNull() {
    /** @param {any} x */
    const scale = (x) => x;

    /** @param {any} x */
    scale.invert = (x) => x;

    scale.copy = scaleNull;

    /** Keep vega-scale happy */
    scale.invertRange = () => {
        //
    };

    scale.type = "null";

    return scale;
}
