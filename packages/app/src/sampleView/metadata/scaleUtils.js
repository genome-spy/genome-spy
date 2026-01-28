/**
 * @param {import("@genome-spy/core/spec/sampleView.js").SampleAttributeType} dataType
 * @param {any[]} values
 * @returns {(string | number)[]}
 */
export function computeObservedDomain(dataType, values) {
    if (dataType === "quantitative") {
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        for (const value of values) {
            const num = Number(value);
            if (Number.isFinite(num)) {
                if (num < min) {
                    min = num;
                }
                if (num > max) {
                    max = num;
                }
            }
        }
        if (min === Number.POSITIVE_INFINITY) {
            return [];
        }
        return [min, max];
    }

    const unique = new Set();
    for (const value of values) {
        if (value != null) {
            unique.add(String(value));
        }
    }
    return Array.from(unique);
}
