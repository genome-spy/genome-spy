import {
    isActiveIntervalSelection,
    isIntervalSelection,
} from "@genome-spy/core/selection/selection.js";
import { resolveParamSelector } from "@genome-spy/core/view/viewSelectors.js";
import { isIntervalSource, isLiteralInterval } from "./sampleViewTypes.js";

/**
 * Resolves an interval reference to a concrete interval.
 *
 * Literal intervals are returned as-is. Selection-backed interval references
 * are resolved from the current param value so action replay follows the
 * current provenance state instead of stale coordinates.
 *
 * @param {import("@genome-spy/core/view/view.js").default | undefined} root
 * @param {import("./sampleViewTypes.js").IntervalReference} intervalReference
 * @returns {import("./types.js").Interval}
 */
export function resolveIntervalReference(root, intervalReference) {
    if (isLiteralInterval(intervalReference)) {
        return intervalReference;
    }

    if (!isIntervalSource(intervalReference)) {
        throw new Error("Unsupported interval reference.");
    }

    if (!root) {
        throw new Error(
            "Cannot resolve selection-backed interval because the root view is unavailable."
        );
    }

    const resolved = resolveParamSelector(root, intervalReference.selector);
    if (!resolved) {
        throw new Error(
            `Cannot resolve interval source selection "${intervalReference.selector.param}" in import scope ${JSON.stringify(intervalReference.selector.scope)}.`
        );
    }

    const value = resolved.view.paramRuntime.getValue(
        intervalReference.selector.param
    );
    if (
        !value ||
        !isIntervalSelection(value) ||
        !isActiveIntervalSelection(value)
    ) {
        throw new Error(
            `Interval source selection "${intervalReference.selector.param}" is empty. Create a brush selection before running this action.`
        );
    }

    const xInterval = value.intervals.x;
    if (
        !xInterval ||
        xInterval.length !== 2 ||
        typeof xInterval[0] !== "number" ||
        typeof xInterval[1] !== "number"
    ) {
        throw new Error(
            `Interval source selection "${intervalReference.selector.param}" must provide a numeric x interval.`
        );
    }

    return [xInterval[0], xInterval[1]];
}
