import { html } from "lit";
import { isString } from "vega-util";
import {
    faArrowPointer,
    faBrush,
    faWrench,
} from "@fortawesome/free-solid-svg-icons";
import { formatInterval } from "../sampleView/attributeAggregation/intervalFormatting.js";
import { paramProvenanceSlice } from "./paramProvenanceSlice.js";
import {
    resolveParamSelector,
    resolveViewSelector,
} from "@genome-spy/core/view/viewSelectors.js";
import { field } from "@genome-spy/core/utils/field.js";
import {
    formatScopedParamName,
    formatScopedViewLabel,
} from "../viewScopeUtils.js";
import {
    isLogicalAnd,
    isLogicalNot,
    isLogicalOr,
} from "./selectionExpansion.js";

/**
 * @typedef {import("@genome-spy/core/view/view.js").default} View
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ParamSelector} ParamSelector
 * @typedef {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} ViewSelector
 * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
 * @typedef {import("./paramProvenanceTypes.d.ts").ParamValue} ParamValue
 * @typedef {import("./paramProvenanceTypes.d.ts").ParamOrigin} ParamOrigin
 * @typedef {import("./paramProvenanceTypes.d.ts").PointExpandOrigin} PointExpandOrigin
 * @typedef {{ completed: boolean, findDatumByKey: (keyFields: string[], keyTuple: Scalar[]) => import("@genome-spy/core/data/flowNode.js").Datum | undefined }} PointExpandPreviewCollector
 */

/** @type {WeakMap<import("@reduxjs/toolkit").Action, Map<string, unknown>>} */
const pointExpandValuePreviewCache = new WeakMap();

/**
 * @param {import("@reduxjs/toolkit").Action} action
 * @param {View} root
 * @returns {import("./provenance.js").ActionInfo | undefined}
 */
export function getParamActionInfo(action, root) {
    const isParamChange =
        paramProvenanceSlice.actions.paramChange.match(action);
    const isPointExpansion =
        paramProvenanceSlice.actions.expandPointSelection.match(action);

    if (!isParamChange && !isPointExpansion) {
        return;
    }

    const payload = /** @type {any} */ (action).payload;
    const selector = /** @type {ParamSelector} */ (payload.selector);
    const value = /** @type {ParamValue} */ (
        isPointExpansion
            ? {
                  type: "pointExpand",
                  operation: payload.operation,
                  predicate: payload.predicate,
                  partitionBy: payload.partitionBy,
                  origin: payload.origin,
              }
            : payload.value
    );
    const origin = /** @type {ParamOrigin | undefined} */ (
        isPointExpansion ? payload.origin : payload.origin
    );

    const resolved = safeResolve(resolveParamSelector, root, selector);
    const view = resolved ? resolved.view : undefined;
    const viewLabel = view ? formatViewLabel(view, root) : null;
    const title = formatParamActionTitle(
        action,
        view,
        selector,
        value,
        origin,
        root
    );

    return {
        title: viewLabel ? html`${title} in ${viewLabel}` : title,
        icon: getParamActionIcon(value),
    };
}

/**
 * @param {import("@reduxjs/toolkit").Action} action
 * @param {View | undefined} view
 * @param {ParamSelector} selector
 * @param {ParamValue} value
 * @param {ParamOrigin | undefined} origin
 * @param {View | undefined} root
 * @returns {import("lit").TemplateResult}
 */
function formatParamActionTitle(action, view, selector, value, origin, root) {
    const paramLabel = formatScopedParamName(root, selector);

    if (value.type === "value") {
        return html`Set <strong>${paramLabel}</strong> =
            <strong>${formatScalar(value.value)}</strong>${formatOriginSuffix(
                origin,
                root
            )}`;
    }

    if (value.type === "point") {
        if (value.keys.length === 0) {
            return html`Clear selection
                <strong>${paramLabel}</strong> ${formatOriginSuffix(
                    origin,
                    root
                )}`;
        }
        if (value.keys.length === 1) {
            return html`Select <strong>${paramLabel}</strong> =
                ${formatStrong(
                    formatPointKeyTuple(value.keys[0])
                )}${formatOriginSuffix(origin, root)}`;
        }
        return html`Select <strong>${paramLabel}</strong> (${formatStrong(
                value.keys.length
            )}
            points)${formatOriginSuffix(origin, root)}`;
    }

    if (value.type === "pointExpand") {
        const operationLabel = formatPointExpandOperation(value.operation);
        const predicateLabel = formatPointExpandPredicate(value.predicate, {
            action,
            root,
            origin: value.origin,
        });
        const scopeSuffix = formatPointExpandScope(value.partitionBy);
        return html`${operationLabel}
            <strong>${paramLabel}</strong>
            ${scopeSuffix} by ${predicateLabel}`;
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
                <strong>${paramLabel}</strong> ${formatOriginSuffix(
                    origin,
                    root
                )}`;
        }

        return html`Brush
            <strong>${paramLabel}</strong>
            ${intervalLabel}${formatOriginSuffix(origin, root)}`;
    }

    return html`Update <strong>${paramLabel}</strong>`;
}

/**
 * @param {(ParamOrigin | PointExpandOrigin) | undefined} origin
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

    return html` from ${formatViewLabel(originView, root)}`;
}

/**
 * @param {View} view
 * @param {View | undefined} root
 * @returns {import("lit").TemplateResult}
 */
function formatViewLabel(view, root) {
    const title = view.getTitleText ? view.getTitleText() : undefined;
    const rawLabel =
        title ||
        view.explicitName ||
        (view.spec && view.spec.name) ||
        view.name ||
        "view";
    const label = formatScopedViewLabel(root, view, String(rawLabel));
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
    switch (value.type) {
        case "point":
        case "pointExpand":
            return faArrowPointer;
        case "interval":
            return faBrush;
        case "value":
            return faWrench;
        default:
            return undefined;
    }
}

/**
 * Resolves values and returns undefined when resolution fails.
 *
 * Intentionally swallows resolver exceptions so provenance labels can still be
 * rendered even when view/selector lookups fail during replay or refactors.
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

/**
 * @param {"replace" | "add" | "remove" | "toggle"} operation
 * @returns {string}
 */
function formatPointExpandOperation(operation) {
    switch (operation) {
        case "replace":
            return "Replace";
        case "add":
            return "Add expanded";
        case "remove":
            return "Remove expanded";
        case "toggle":
            return "Toggle expanded";
        default:
            return "Replace";
    }
}

/**
 * Formats logical/leaf expansion predicates for provenance labels.
 *
 * For `valueFromField` leaves, this tries to enrich the label with a concrete
 * preview value resolved from the origin datum (for example
 * "clusterId = C42 (from clicked item)"). The preview is optional and never
 * affects execution semantics.
 *
 * @param {import("./selectionExpansion.js").SelectionExpansionPredicate} predicate
 * @param {{ action: import("@reduxjs/toolkit").Action, root: View | undefined, origin: PointExpandOrigin }} context
 * @returns {import("lit").TemplateResult}
 */
function formatPointExpandPredicate(predicate, context) {
    if (isLogicalNot(predicate)) {
        return html`not (${formatPointExpandPredicate(predicate.not, context)})`;
    }

    if (isLogicalAnd(predicate)) {
        return joinTemplateParts(
            predicate.and.map((part) =>
                formatPointExpandPredicate(part, context)
            ),
            " and "
        );
    }

    if (isLogicalOr(predicate)) {
        return joinTemplateParts(
            predicate.or.map((part) =>
                formatPointExpandPredicate(part, context)
            ),
            " or "
        );
    }

    if (predicate.op === "eq") {
        if ("value" in predicate) {
            return html`${formatPredicateField(predicate.field)}
                <span class="operator">=</span>
                <strong>${formatScalar(predicate.value)}</strong>`;
        }

        if ("valueFromField" in predicate) {
            const preview = resolvePointExpandValuePreview(
                context.action,
                context.root,
                context.origin,
                predicate.valueFromField
            );
            if (preview !== undefined) {
                return html`${formatPredicateField(predicate.field)}
                    <span class="operator">=</span>
                    <strong>${formatScalar(preview)}</strong>
                    (from clicked item)`;
            } else {
                const sourceLabel =
                    predicate.valueFromField === predicate.field
                        ? "same as clicked item"
                        : "same as clicked " + predicate.valueFromField;
                return html`${formatPredicateField(predicate.field)}
                    <span class="operator">=</span>
                    <strong>${sourceLabel}</strong>`;
            }
        }
    } else if (predicate.op === "in") {
        return html`${formatPredicateField(predicate.field)}
            <span class="operator">in</span>
            ${formatScalarSet(predicate.values)}`;
    }

    return html`predicate`;
}

/**
 * @param {string} fieldName
 * @returns {import("lit").TemplateResult}
 */
function formatPredicateField(fieldName) {
    return html`<em>${fieldName}</em>`;
}

/**
 * @param {unknown[]} values
 * @returns {import("lit").TemplateResult}
 */
function formatScalarSet(values) {
    return html`{${values.map(
        (value, i) =>
            html`${i > 0 ? ", " : ""}<strong>${formatScalar(value)}</strong>`
    )}}`;
}

/**
 * Joins template parts without flattening them into plain strings.
 *
 * Keeping parts as templates preserves markup in predicate clauses.
 *
 * @param {import("lit").TemplateResult[]} parts
 * @param {string} separator
 * @returns {import("lit").TemplateResult}
 */
function joinTemplateParts(parts, separator) {
    return html`${parts.map(
        (part, i) => html`${i > 0 ? separator : ""}${part}`
    )}`;
}

/**
 * Resolves a display-only preview value for a `valueFromField` predicate leaf.
 *
 * The preview is derived from the origin datum referenced by expansion origin
 * selectors/keys. Successful resolutions are cached per action to avoid
 * repeated collector lookups while rendering provenance menus.
 *
 * This function does not modify payloads and does not affect selection replay;
 * failures simply return `undefined` and callers fall back to generic wording.
 *
 * @param {import("@reduxjs/toolkit").Action} action
 * @param {View | undefined} root
 * @param {PointExpandOrigin} origin
 * @param {string} fieldName
 * @returns {unknown}
 */
function resolvePointExpandValuePreview(action, root, origin, fieldName) {
    let byField = pointExpandValuePreviewCache.get(action);
    if (byField?.has(fieldName)) {
        return byField.get(fieldName);
    }

    if (!root) {
        return undefined;
    }

    const originView = safeResolve(resolveViewSelector, root, origin.view);
    if (!originView) {
        return undefined;
    }

    const originViewWithCollector =
        /** @type {{ getCollector?: () => PointExpandPreviewCollector | undefined }} */ (
            originView
        );
    const collector = originViewWithCollector.getCollector?.() ?? undefined;
    if (!collector || !collector.completed) {
        return undefined;
    }

    let originDatum;
    try {
        originDatum = collector.findDatumByKey(
            origin.keyFields,
            origin.keyTuple
        );
    } catch (_error) {
        return undefined;
    }

    if (!originDatum) {
        return undefined;
    }

    const accessor = field(fieldName);
    const value = accessor(originDatum);
    if (value === undefined) {
        return undefined;
    }

    if (!byField) {
        byField = new Map();
        pointExpandValuePreviewCache.set(action, byField);
    }
    byField.set(fieldName, value);
    return value;
}

/**
 * @param {string[] | undefined} partitionBy
 * @returns {import("lit").TemplateResult}
 */
function formatPointExpandScope(partitionBy) {
    if (!partitionBy?.length) {
        return html` across all`;
    }

    const lowered = partitionBy.map((fieldName) => fieldName.toLowerCase());
    if (lowered.some((fieldName) => fieldName.includes("sample"))) {
        return html` in current sample`;
    }

    if (lowered.some((fieldName) => fieldName.includes("patient"))) {
        return html` in current patient`;
    }

    return html` in current scope`;
}
