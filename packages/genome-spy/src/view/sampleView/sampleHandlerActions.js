import { format as d3format } from "d3-format";
import { html } from "lit";

import {
    faSortAmountDown,
    faFilter,
    faMedal,
    faObjectGroup,
    faCircle,
    faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";

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
    gt: "greater than",
};

/**
 * Describes an action for displaying it in menus or provenance tracking.
 *
 * @param {import("@reduxjs/toolkit").PayloadAction<any>} action
 * @param {import("./compositeAttributeInfoSource").AttributeInfoSource} getAttributeInfo
 * @returns {import("../../app/provenance").ActionInfo}
 */
export function getActionInfo(action, getAttributeInfo) {
    if (!action) {
        return { title: "No action!" };
    }

    const payload = action.payload;
    const attributeInfo = getAttributeInfo(payload.attribute);
    const attributeName = attributeInfo?.name;
    const attributeTitle =
        attributeInfo?.title || html` <em>${attributeName}</em> `;

    const template = {
        attributeName, // TODO: This may actually be unnecessary
    };

    switch (action.type) {
        case SORT_BY_NAME:
            return {
                ...template,
                title: "Sort by sample name",
                icon: faSortAmountDown,
            };
        case SORT_BY:
            return {
                ...template,
                title: "Sort by",
                provenanceTitle: html` Sort by ${attributeTitle} `,
                icon: faSortAmountDown,
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

                icon: faMedal,
            };
        case FILTER_BY_NOMINAL: {
            /** @param {string | import("lit").TemplateResult} attr */
            const makeTitle = (attr) => html`
                ${payload.action == "remove" ? "Remove" : "Retain"} samples
                having
                ${payload.values[0] === undefined || payload.values[0] === null
                    ? html` undefined ${attr} `
                    : html`
                          ${attr} =
                          <strong>${payload.values[0]}</strong>
                      `}
            `;

            return {
                ...template,
                title: makeTitle(html` <em>${attributeName}</em> `),
                provenanceTitle: makeTitle(attributeTitle),
                icon: payload.action == "remove" ? faTrashAlt : faFilter,
            };
        }
        case FILTER_BY_QUANTITATIVE: {
            /** @param {string | import("lit").TemplateResult} attr */
            const makeTitle = (attr) => html`
                Retain samples having ${attr} ${verboseOps[payload.operator]}
                <strong>${attributeNumberFormat(payload.operand)}</strong>
            `;

            return {
                ...template,
                title: makeTitle(html` <em>${attributeName}</em> `),
                provenanceTitle: makeTitle(attributeTitle),
                icon: faFilter,
            };
        }
        case REMOVE_UNDEFINED:
            return {
                ...template,
                title: "Remove samples having missing attribute",
                provenanceTitle: html`
                    Remove samples having missing ${attributeTitle}
                `,
                icon: faFilter,
            };
        case GROUP_BY_NOMINAL:
            return {
                ...template,
                title: "Group by",
                provenanceTitle: html` Group by ${attributeTitle} `,
                icon: faObjectGroup,
            };
        case GROUP_TO_QUARTILES:
            return {
                ...template,
                title: "Group to quartiles",
                provenanceTitle: html`
                    Group to quartiles by ${attributeTitle}
                `,
                icon: faObjectGroup,
            };
        default:
            return {
                ...template,
                title: JSON.stringify(action),
                icon: faCircle,
            };
    }
}
