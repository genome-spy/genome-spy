import { html } from "lit";
import { isString } from "vega-util";
import { faArrowPointer, faBrush } from "@fortawesome/free-solid-svg-icons";
import { formatInterval } from "../sampleView/attributeAggregation/intervalFormatting.js";
import { paramProvenanceSlice } from "./paramProvenanceSlice.js";
import {
    resolveParamSelector,
    resolveViewSelector,
} from "@genome-spy/core/view/viewSelectors.js";

/**
 * @typedef {import("@genome-spy/core/view/view.js").default} View
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ParamSelector} ParamSelector
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} ViewSelector
 * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
 * @typedef {import("@genome-spy/core/spec/genome.js").ChromosomalLocus} ChromosomalLocus
 * @typedef {{ type: "value", value: any }} ParamValueLiteral
 * @typedef {{ type: "interval", intervals: Partial<Record<"x" | "y", [number, number] | [ChromosomalLocus, ChromosomalLocus] | null>> }} ParamValueInterval
 * @typedef {{ type: "point", keyFields: string[], keys: Scalar[][] }} ParamValuePoint
 * @typedef {ParamValueLiteral | ParamValueInterval | ParamValuePoint} ParamValue
 * @typedef {{ type: "datum", view: ViewSelector, keyField: string, key: Scalar, intervalSources?: Record<string, { start?: string, end?: string }> }} ParamOrigin
 */

/**
 * @param {import("@reduxjs/toolkit").Action} action
 * @param {View} root
 * @returns {import("./provenance.js").ActionInfo | undefined}
 */
export function getParamActionInfo(action, root) {
    if (!paramProvenanceSlice.actions.paramChange.match(action)) {
        return;
    }

    const payload = /** @type {any} */ (action).payload;
    const selector = /** @type {ParamSelector} */ (payload.selector);
    const value = /** @type {ParamValue} */ (payload.value);
    const origin = /** @type {ParamOrigin | undefined} */ (payload.origin);

    const resolved = safeResolve(resolveParamSelector, root, selector);
    const view = resolved ? resolved.view : undefined;
    const viewLabel = view ? formatViewLabel(view) : null;
    const title = formatParamActionTitle(view, selector, value, origin, root);

    return {
        title: viewLabel ? html`${title} in ${viewLabel}` : title,
        icon: getParamActionIcon(value),
    };
}

/**
 * @param {View | undefined} view
 * @param {ParamSelector} selector
 * @param {ParamValue} value
 * @param {ParamOrigin | undefined} origin
 * @param {View | undefined} root
 * @returns {import("lit").TemplateResult}
 */
function formatParamActionTitle(view, selector, value, origin, root) {
    if (value.type === "value") {
        return html`Set <strong>${selector.param}</strong> =
            <strong>${formatScalar(value.value)}</strong>${formatOriginSuffix(
                origin,
                root
            )}`;
    }

    if (value.type === "point") {
        if (value.keys.length === 0) {
            return html`Clear selection
                <strong>${selector.param}</strong> ${formatOriginSuffix(
                    origin,
                    root
                )}`;
        }
        if (value.keys.length === 1) {
            return html`Select <strong>${selector.param}</strong> =
                ${formatStrong(
                    formatPointKeyTuple(value.keys[0])
                )}${formatOriginSuffix(origin, root)}`;
        }
        return html`Select <strong>${selector.param}</strong> (${formatStrong(
                value.keys.length
            )}
            points)${formatOriginSuffix(origin, root)}`;
    }

    if (value.type === "interval") {
        const intervals = value.intervals ?? {};
        const x = intervals.x;
        const y = intervals.y;
        const xLabel = x && view ? formatInterval(view, x) : formatRange(x);
        const yLabel = y ? formatRange(y) : null;
        const intervalLabel = formatIntervalSummary(xLabel, yLabel);

        if (!intervalLabel) {
            return html`Clear selection
                <strong>${selector.param}</strong> ${formatOriginSuffix(
                    origin,
                    root
                )}`;
        }

        return html`Brush
            <strong>${selector.param}</strong>
            ${intervalLabel}${formatOriginSuffix(origin, root)}`;
    }

    return html`Update <strong>${selector.param}</strong>`;
}

/**
 * @param {ParamOrigin | undefined} origin
 * @param {View | undefined} root
 * @returns {import("lit").TemplateResult}
 */
function formatOriginSuffix(origin, root) {
    if (!origin || origin.type !== "datum") {
        return html``;
    }

    const originView = root
        ? safeResolve(resolveViewSelector, root, origin.view)
        : null;
    if (!originView) {
        return html``;
    }

    return html` from ${formatViewLabel(originView)}`;
}

/**
 * @param {View} view
 * @returns {import("lit").TemplateResult}
 */
function formatViewLabel(view) {
    const title = view.getTitleText ? view.getTitleText() : undefined;
    const label =
        title ||
        view.explicitName ||
        (view.spec && view.spec.name) ||
        view.name ||
        "view";
    return html`<strong>${label}</strong>`;
}

/**
 * @param {any} value
 * @returns {string}
 */
function formatScalar(value) {
    if (
        isString(value) ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return String(value);
    }
    return JSON.stringify(value);
}

/**
 * @param {any} value
 * @returns {import("lit").TemplateResult}
 */
function formatStrong(value) {
    return html`<strong>${value}</strong>`;
}

/**
 * @param {Scalar[]} tuple
 * @returns {string}
 */
function formatPointKeyTuple(tuple) {
    if (tuple.length === 1) {
        return formatScalar(tuple[0]);
    }

    return "(" + tuple.map((value) => formatScalar(value)).join(", ") + ")";
}

/**
 * @param {[any, any] | undefined | null} interval
 * @returns {string | null}
 */
function formatRange(interval) {
    if (!interval) {
        return null;
    }
    return `${interval[0]} \u2013 ${interval[1]}`;
}

/**
 * @param {string | null} xLabel
 * @param {string | null} yLabel
 * @returns {string | null}
 */
function formatIntervalSummary(xLabel, yLabel) {
    if (xLabel && yLabel) {
        return "(x: " + xLabel + ", y: " + yLabel + ")";
    }

    if (xLabel) {
        return "(" + xLabel + ")";
    }

    if (yLabel) {
        return "(y: " + yLabel + ")";
    }

    return null;
}

/**
 * @param {ParamValue} value
 * @returns {import("@fortawesome/free-solid-svg-icons").IconDefinition | undefined}
 */
function getParamActionIcon(value) {
    if (value.type === "point") {
        return faArrowPointer;
    }

    if (value.type === "interval") {
        return faBrush;
    }

    return undefined;
}

/**
 * Resolves values and returns undefined when resolution fails.
 *
 * @template T
 * @param {(...args: any[]) => T} resolver
 * @param {...any} args
 * @returns {T | undefined}
 */
function safeResolve(resolver, ...args) {
    try {
        return resolver(...args);
    } catch (error) {
        return undefined;
    }
}
