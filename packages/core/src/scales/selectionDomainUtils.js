import { isSelectionParameter } from "../paramRuntime/paramUtils.js";
import {
    asSelectionConfig,
    isIntervalSelection,
    isIntervalSelectionConfig,
} from "../selection/selection.js";

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
 * Returns an interval selection when the value exists and is of the correct
 * type. Missing values are treated as empty so selection-linked domains can
 * initialize before a pushed outer selection has been seeded.
 *
 * @param {any} selection
 * @param {string} paramName
 * @returns {import("../types/selectionTypes.js").IntervalSelection | undefined}
 */
export function getIntervalSelection(selection, paramName) {
    if (!selection) {
        return;
    }

    if (!isIntervalSelection(selection)) {
        throw new Error(
            `Selection domain parameter "${paramName}" must be an interval selection.`
        );
    }

    return selection;
}

/**
 * Resolves the runtime-backed interval selection binding used by a linked
 * domain. Matching is based on the actual resolved runtime slot instead of
 * parameter name alone, so scoped params with the same name remain distinct.
 *
 * @param {import("../view/view.js").default} view
 * @param {string} paramName
 * @param {"x" | "y"} encoding
 */
export function resolveIntervalSelectionBinding(view, paramName, encoding) {
    const runtime = view.paramRuntime.findRuntimeForParam
        ? requireParamRuntime(view.paramRuntime, paramName)
        : view.paramRuntime;
    const selection = getIntervalSelection(
        runtime.getValue
            ? runtime.getValue(paramName)
            : view.paramRuntime.findValue(paramName),
        paramName
    );

    return {
        runtime,
        selection,
    };
}

/**
 * @param {import("../view/view.js").default} root
 * @param {any} runtime
 * @param {string} paramName
 * @param {"x" | "y"} encoding
 */
export function findIntervalSelectionBindingOwners(
    root,
    runtime,
    paramName,
    encoding
) {
    /** @type {{ view: import("../view/view.js").default, param: import("../spec/parameter.js").SelectionParameter }[]} */
    const owners = [];

    root.visit((view) => {
        const param = view.paramRuntime?.paramConfigs?.get(paramName);
        if (!param || !isSelectionParameter(param)) {
            return;
        }

        const select = asSelectionConfig(param.select);
        if (
            !isIntervalSelectionConfig(select) ||
            !select.encodings?.includes(encoding)
        ) {
            return;
        }

        if (view.paramRuntime.findRuntimeForParam(paramName) === runtime) {
            owners.push({ view, param });
        }
    });

    return owners;
}

/**
 * @param {import("../view/view.js").default} view
 * @param {any} runtime
 * @param {string} paramName
 * @param {"x" | "y"} encoding
 */
export function hasIntervalSelectionBindingInScope(
    view,
    runtime,
    paramName,
    encoding
) {
    const seen = new Set();
    const ancestorGroups = [
        view.getLayoutAncestors?.(),
        view.getDataAncestors?.(),
        [view],
    ];

    for (const views of ancestorGroups) {
        for (const candidateView of views ?? []) {
            if (!candidateView || seen.has(candidateView)) {
                continue;
            }

            seen.add(candidateView);

            const param =
                candidateView.paramRuntime?.paramConfigs?.get(paramName);
            if (!param || !isSelectionParameter(param)) {
                continue;
            }

            const select = asSelectionConfig(param.select);
            if (
                !isIntervalSelectionConfig(select) ||
                !select.encodings?.includes(encoding)
            ) {
                continue;
            }

            if (
                candidateView.paramRuntime.findRuntimeForParam?.(paramName) ===
                runtime
            ) {
                return true;
            }
        }
    }

    return false;
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
