import { createSelectionPredicate } from "../encoder/encoder.js";
import {
    isIntervalSelection,
    isMultiPointSelection,
    isSinglePointSelection,
    isActiveIntervalSelection,
    normalizeSelectionPredicate,
} from "./selection.js";

/**
 * @typedef {"matching" | "nonmatching"} OrderPass
 * @typedef {object} ConditionalOrder
 * @property {import("../types/encoder.js").Predicate} predicate
 * @property {string[]} params
 * @property {[OrderPass, OrderPass]} passes
 * @property {() => boolean} isActive
 */

/**
 * Resolves the supported conditional order definition. Constant and equal
 * levels intentionally return undefined so callers retain their fast path.
 *
 * @param {import("../spec/channel.js").OrderDef | undefined} definition
 * @param {import("../spec/channel.js").Encoding} encoding
 * @param {{ findValue: (param: string) => any, createExpression: (expr: string) => import("../paramRuntime/types.js").ExprRefFunction }} paramRuntime
 * @param {"intersects" | "encloses" | "endpoints"} hitTestMode
 * @returns {ConditionalOrder | undefined}
 */
export function normalizeOrderDefinition(
    definition,
    encoding,
    paramRuntime,
    hitTestMode
) {
    if (definition === undefined) {
        return undefined;
    }
    const { condition, value } = definition;
    if (
        !Number.isFinite(value) ||
        (condition && !Number.isFinite(condition.value))
    ) {
        throw new Error("Order levels must be finite numbers.");
    }
    if (!condition || value === condition.value) {
        return undefined;
    }

    const selectionInfo = normalizeSelectionPredicate(condition);
    if (!selectionInfo) {
        throw new Error("Order condition must be a selection predicate.");
    }

    const predicate = createSelectionPredicate(
        selectionInfo,
        encoding,
        paramRuntime,
        hitTestMode
    );

    /** @type {[OrderPass, OrderPass]} */
    const passes =
        condition.value < value
            ? ["matching", "nonmatching"]
            : ["nonmatching", "matching"];

    return {
        predicate,
        params: selectionInfo.params,
        passes,
        isActive: () =>
            selectionInfo.params.some((param) =>
                isSelectionActive(paramRuntime.findValue(param))
            ),
    };
}

/**
 * Returns whether a selection contributes membership to a union. This is
 * deliberately based on selection state, avoiding a row scan when all members
 * are empty.
 *
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @returns {boolean}
 */
export function isSelectionActive(selection) {
    if (isSinglePointSelection(selection)) {
        return selection.uniqueId != null;
    }
    if (isMultiPointSelection(selection)) {
        return selection.data.size > 0;
    }
    if (isIntervalSelection(selection)) {
        return isActiveIntervalSelection(selection);
    }
    throw new Error(`Unsupported selection type: ${selection.type}`);
}
