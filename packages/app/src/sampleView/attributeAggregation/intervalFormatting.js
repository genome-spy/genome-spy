import { isChromosomalLocus } from "@genome-spy/core/genome/genome.js";
import { locusOrNumberToString } from "@genome-spy/core/genome/locusFormat.js";

/**
 * @param {import("@genome-spy/core/view/view.js").default} view
 * @param {import("../types.js").Interval} interval
 * @returns {string}
 */
export function formatInterval(view, interval) {
    const scaleResolution = view.getScaleResolution("x");
    const scale = scaleResolution?.getScale();
    const genome = "genome" in scale ? scale.genome() : undefined;
    if (genome) {
        const normalized = interval.every(isChromosomalLocus)
            ? genome.toContinuousInterval(
                  /** @type {import("@genome-spy/core/spec/genome.js").ChromosomalLocus[]} */ (
                      interval
                  )
              )
            : /** @type {number[]} */ (interval);
        return genome.formatInterval(normalized);
    }

    return (
        locusOrNumberToString(interval[0]) +
        " \u2013 " +
        locusOrNumberToString(interval[1])
    );
}
