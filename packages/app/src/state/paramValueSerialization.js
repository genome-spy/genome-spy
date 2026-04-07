/**
 * Serializes a bookmarkable param value so it matches the provenance shape.
 *
 * @param {import("@genome-spy/core/view/view.js").default} view
 * @param {import("./paramProvenanceTypes.d.ts").ParamValue} value
 * @returns {import("./paramProvenanceTypes.d.ts").ParamValue}
 */
export function serializeBookmarkableParamValue(view, value) {
    if (!value || typeof value !== "object") {
        return value;
    }

    if (value.type !== "interval") {
        return value;
    }

    const intervals =
        "intervals" in value && value.intervals
            ? value.intervals
            : "value" in value && Array.isArray(value.value)
              ? { x: value.value }
              : {};

    return {
        type: "interval",
        intervals: serializeIntervals(view, intervals),
    };
}

/**
 * Copies interval endpoints and normalizes locus values to complex loci.
 *
 * @param {import("@genome-spy/core/view/view.js").default} view
 * @param {Partial<Record<string, any[] | null>>} intervals
 * @returns {Partial<Record<string, [any, any]>>}
 */
function serializeIntervals(view, intervals) {
    /** @type {Partial<Record<string, [any, any]>>} */
    const copy = {};

    for (const [channel, interval] of Object.entries(intervals)) {
        if (!interval) {
            continue;
        }

        const channelWithScale =
            /** @type {import("@genome-spy/core/spec/channel.js").ChannelWithScale} */ (
                channel
            );
        const resolution = view.getScaleResolution(channelWithScale);
        copy[channel] = [
            resolution && resolution.type === "locus"
                ? resolution.toComplex(interval[0])
                : interval[0],
            resolution && resolution.type === "locus"
                ? resolution.toComplex(interval[1])
                : interval[1],
        ];
    }

    return copy;
}
