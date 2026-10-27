import { createSelectionPredicate } from "../encoder/encoder.js";
import { isSelectionActive, normalizeSelectionPredicate } from "./selection.js";
import { getSelectionPredicateTreeParams } from "./selectionPredicateTree.js";

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
 * @param {(channel: "x" | "x2" | "y" | "y2") => import("../spec/channel.js").Type | undefined} [getType]
 * @param {(channel: import("../spec/channel.js").ChannelWithScale) => import("../types/encoder.js").VegaScale} [getScale]
 * @returns {ConditionalOrder | undefined}
 */
export function normalizeOrderDefinition(
    definition,
    encoding,
    paramRuntime,
    hitTestMode,
    getType,
    getScale
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
    const predicate = createSelectionPredicate(
        selectionInfo,
        encoding,
        paramRuntime,
        hitTestMode,
        getType,
        getScale
    );
    const params = getSelectionPredicateTreeParams(predicate.selection);

    /** @type {[OrderPass, OrderPass]} */
    const passes =
        condition.value < value
            ? ["matching", "nonmatching"]
            : ["nonmatching", "matching"];

    return {
        predicate,
        params,
        passes,
        isActive: () =>
            params.some((param) =>
                isSelectionActive(paramRuntime.findValue(param))
            ),
    };
}
