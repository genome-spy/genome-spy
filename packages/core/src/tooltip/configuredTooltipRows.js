import { format as d3format } from "d3-format";
import { field } from "../utils/field.js";

/**
 * @typedef {import("./tooltipHandler.js").TooltipRow} TooltipRow
 */

const accessorCache = new WeakMap();

/**
 * @param {Record<string, any>} datum
 * @param {import("../marks/mark.js").default} mark
 * @returns {TooltipRow[] | undefined}
 */
export function getConfiguredTooltipRows(datum, mark) {
    const tooltipDef = mark.encoding.tooltip;
    if (tooltipDef === undefined) {
        return undefined;
    } else if (tooltipDef === null) {
        return [];
    }

    const definitions = Array.isArray(tooltipDef) ? tooltipDef : [tooltipDef];

    if (definitions.length === 0) {
        throw new Error("The tooltip channel array must not be empty.");
    }

    return definitions.map((definition) =>
        resolveTooltipRow(datum, mark, definition)
    );
}

/**
 * @param {Record<string, any>} datum
 * @param {import("../marks/mark.js").default} mark
 * @param {import("../spec/channel.js").TextDef} definition
 * @returns {TooltipRow}
 */
function resolveTooltipRow(datum, mark, definition) {
    const accessor = getTooltipAccessor(mark, definition);
    const rawValue = accessor(datum);
    const formattedValue =
        "format" in definition && definition.format
            ? d3format(definition.format)(rawValue)
            : rawValue;

    return {
        key: getTooltipTitle(definition),
        value: formattedValue,
        ...(accessor.sourceField ? { sourceField: accessor.sourceField } : {}),
        ...(formattedValue !== rawValue ? { formatted: true } : {}),
    };
}

/**
 * @param {import("../marks/mark.js").default} mark
 * @param {import("../spec/channel.js").TextDef} definition
 * @returns {((datum: Record<string, any>) => any) & { sourceField?: string }}
 */
function getTooltipAccessor(mark, definition) {
    let cache = accessorCache.get(mark);
    if (!cache) {
        cache = new WeakMap();
        accessorCache.set(mark, cache);
    }

    const cached = cache.get(definition);
    if (cached) {
        return cached;
    }

    /** @type {((datum: Record<string, any>) => any) & { sourceField?: string }} */
    let accessor;
    if ("field" in definition) {
        accessor = field(definition.field);
        accessor.sourceField = definition.field;
    } else if ("expr" in definition) {
        accessor = mark.unitView.paramRuntime.createExpression(definition.expr);
    } else if ("datum" in definition) {
        accessor = () => definition.datum;
    } else if ("value" in definition) {
        accessor = () => definition.value;
    } else {
        throw new Error(
            "Invalid tooltip channel definition: " + JSON.stringify(definition)
        );
    }

    cache.set(definition, accessor);
    return accessor;
}

/**
 * @param {import("../spec/channel.js").TextDef} definition
 * @returns {string}
 */
function getTooltipTitle(definition) {
    if ("title" in definition && definition.title !== undefined) {
        return definition.title === null ? "" : definition.title;
    } else if ("field" in definition) {
        return definition.field;
    } else if ("expr" in definition) {
        return definition.expr;
    } else if ("datum" in definition) {
        return "datum";
    } else if ("value" in definition) {
        return "value";
    } else {
        throw new Error(
            "Invalid tooltip channel definition: " + JSON.stringify(definition)
        );
    }
}
