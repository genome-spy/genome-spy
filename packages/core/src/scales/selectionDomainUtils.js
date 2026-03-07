import { isIntervalSelection } from "../selection/selection.js";

/**
 * @param {{ findRuntimeForParam: (name: string) => any }} paramRuntime
 * @param {string} paramName
 */
export function requireParamRuntime(paramRuntime, paramName) {
    const runtime = paramRuntime.findRuntimeForParam(paramName);
    if (!runtime) {
        throw new Error(
            `Selection domain parameter "${paramName}" was not found.`
        );
    }
    return runtime;
}

/**
 * @param {any} selection
 * @param {string} paramName
 */
export function requireIntervalSelection(selection, paramName) {
    if (!selection) {
        throw new Error(
            `Selection domain parameter "${paramName}" was not found.`
        );
    }

    if (!isIntervalSelection(selection)) {
        throw new Error(
            `Selection domain parameter "${paramName}" must be an interval selection.`
        );
    }

    return selection;
}

/**
 * @param {number[]} interval
 * @param {number[]} zoomExtent
 * @param {{ roundToIntegers?: boolean }} [options]
 * @returns {[number, number] | undefined}
 */
export function normalizeIntervalForSelection(
    interval,
    zoomExtent,
    options = {}
) {
    if (!interval || interval.length !== 2) {
        return;
    }

    const a = Number(interval[0]);
    const b = Number(interval[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return;
    }

    let min = Math.min(a, b);
    let max = Math.max(a, b);

    min = Math.max(zoomExtent[0], min);
    max = Math.min(zoomExtent[1], max);

    if (min > max) {
        return;
    }

    if (options.roundToIntegers) {
        min = Math.ceil(min);
        max = Math.ceil(max);
        min = Math.max(zoomExtent[0], min);
        max = Math.min(zoomExtent[1], max);
        if (min > max) {
            return;
        }
    }

    return [min, max];
}
