import { format as d3format } from "d3-format";
import { html } from "lit-html";

import {
    faSortAmountDown,
    faFilter,
    faMedal,
    faObjectGroup,
    faCircle
} from "@fortawesome/free-solid-svg-icons";

/**
 * @typedef {import("./sampleHandler").AttributeIdentifier} AttributeIdentifier
 *
 * @typedef {import("./provenance").Action} Action
 * @typedef {import("./provenance").ActionInfo} ActionInfo
 */

// Redux/flux-style actions
export const UNDO = "undo";
export const REDO = "redo";
export const SORT_BY_NAME = "sortByName";
export const SORT_BY = "sortBy";
export const RETAIN_FIRST_OF_EACH = "retainFirstOfEach";
export const FILTER_BY_NOMINAL = "filterByNominal";
export const FILTER_BY_QUANTITATIVE = "filterByQuantitative";
export const REMOVE_UNDEFINED = "removeUndefined";
export const REMOVE_BY_ID = "removeById";
export const GROUP_BY_NOMINAL = "groupByNominal";
export const GROUP_TO_QUARTILES = "groupToQuartiles";

const attributeNumberFormat = d3format(".4");

/** @type {Record<string, string>} */
const verboseOps = {
    lt: "less than",
    lte: "less than or equal to",
    eq: "equal to",
    gte: "greater than or equal to",
    gt: "greater than"
};

/**
 * Describes an action for displaying it in menus or provenance tracking.
 *
 * @param {Action} action
 * @param {import("./sampleHandler").default} sampleHandler
 * @returns {ActionInfo}
 */
export function getActionInfo(action, sampleHandler) {
    if (!action) {
        return { title: "No action!" };
    }

    const payload = action.payload;
    const attributeInfo = sampleHandler.getAttributeInfo(payload.attribute);
    const attributeName = attributeInfo?.name;
    const attributeTitle =
        attributeInfo?.title ||
        html`
            <em>${attributeName}</em>
        `;

    const template = {
        attributeName // TODO: This may actually be unnecessary
    };

    switch (action.type) {
        case SORT_BY_NAME:
            return {
                ...template,
                title: "Sort by sample name",
                icon: faSortAmountDown
            };
        case SORT_BY:
            return {
                ...template,
                title: "Sort by",
                provenanceTitle: html`
                    Sort by ${attributeTitle}
                `,
                icon: faSortAmountDown
            };
        case RETAIN_FIRST_OF_EACH:
            return {
                ...template,
                title: html`
                    Retain first sample of each unique
                    <em>${attributeName}</em>
                `,
                provenanceTitle: html`
                    Retain first sample of each unique ${attributeTitle}
                `,

                icon: faMedal
            };
        case FILTER_BY_NOMINAL: {
            /** @param {string | import("lit-html").TemplateResult} attr */
            const makeTitle = attr => html`
                ${payload.action == "remove" ? "Remove" : "Retain"} samples
                having
                ${payload.values[0] === undefined || payload.values[0] === null
                    ? html`
                          undefined ${attr}
                      `
                    : html`
                          ${attr} =
                          <strong>${payload.values[0]}</strong>
                      `}
            `;

            return {
                ...template,
                title: makeTitle(
                    html`
                        <em>${attributeName}</em>
                    `
                ),
                provenanceTitle: makeTitle(attributeTitle),
                icon: faFilter
            };
        }
        case FILTER_BY_QUANTITATIVE: {
            /** @param {string | import("lit-html").TemplateResult} attr */
            const makeTitle = attr => html`
                Retain samples having ${attr} ${verboseOps[payload.operator]}
                <strong>${attributeNumberFormat(payload.operand)}</strong>
            `;

            return {
                ...template,
                title: makeTitle(
                    html`
                        <em>${attributeName}</em>
                    `
                ),
                provenanceTitle: makeTitle(attributeTitle),
                icon: faFilter
            };
        }
        case REMOVE_UNDEFINED:
            return {
                ...template,
                title: "Remove samples having missing attribute",
                provenanceTitle: html`
                    Remove samples having missing ${attributeTitle}
                `,
                icon: faFilter
            };
        case GROUP_BY_NOMINAL:
            return {
                ...template,
                title: "Group by",
                provenanceTitle: html`
                    Group by ${attributeTitle}
                `,
                icon: faObjectGroup
            };
        case GROUP_TO_QUARTILES:
            return {
                ...template,
                title: "Group to quartiles",
                provenanceTitle: html`
                    Group to quartiles by ${attributeTitle}
                `,
                icon: faObjectGroup
            };
        default:
            return {
                ...template,
                title: JSON.stringify(action),
                icon: faCircle
            };
    }
}

export function undo() {
    return { type: UNDO };
}

export function redo() {
    return { type: REDO };
}

export function sortByName() {
    return { type: SORT_BY_NAME };
}

/**
 * @param {AttributeIdentifier} attribute
 */
export function sortBy(attribute) {
    return { type: SORT_BY, payload: { attribute } };
}

/**
 * @param {AttributeIdentifier} attribute
 */
export function retainFirstOfEach(attribute) {
    return { type: RETAIN_FIRST_OF_EACH, payload: { attribute } };
}

/**
 *
 * @param {AttributeIdentifier} attribute
 * @param {"lt" | "lte" | "eq" | "gte" | "gt"} operator The comparison operator
 * @param {number} operand
 */

export function filterByQuantitative(attribute, operator, operand) {
    return {
        type: FILTER_BY_QUANTITATIVE,
        payload: {
            attribute,
            operator,
            operand
        }
    };
}

/**
 * @param {AttributeIdentifier} attribute
 * @param {"retain" | "remove"} action
 * @param {any[]} values
 */
export function filterByNominal(attribute, action, values) {
    return {
        type: FILTER_BY_NOMINAL,
        payload: {
            attribute,
            action,
            values
        }
    };
}

/**
 * @param {AttributeIdentifier} attribute
 */
export function removeUndefined(attribute) {
    return {
        type: REMOVE_UNDEFINED,
        payload: { attribute }
    };
}

/**
 * @param {AttributeIdentifier} attribute
 */
export function groupByNominal(attribute) {
    return {
        type: GROUP_BY_NOMINAL,
        payload: { attribute }
    };
}

/**
 * @param {AttributeIdentifier} attribute
 */
export function groupToQuartiles(attribute) {
    return {
        type: GROUP_TO_QUARTILES,
        payload: { attribute }
    };
}
