import { format as d3format } from "d3-format";
import { html } from "lit";
import { join } from "lit/directives/join.js";
import { map } from "lit/directives/map.js";
import {
    faSortAmountDown,
    faFilter,
    faMedal,
    faObjectGroup,
    faCircle,
    faTrashAlt,
    faCheck,
} from "@fortawesome/free-solid-svg-icons";

import {
    SET_SAMPLES,
    SORT_BY,
    RETAIN_FIRST_OF_EACH,
    RETAIN_FIRST_N_CATEGORIES,
    FILTER_BY_NOMINAL,
    FILTER_BY_QUANTITATIVE,
    REMOVE_UNDEFINED,
    GROUP_CUSTOM,
    GROUP_BY_NOMINAL,
    GROUP_BY_QUARTILES,
    GROUP_BY_THRESHOLDS,
    REMOVE_GROUP,
    RETAIN_MATCHED,
    SAMPLE_SLICE_NAME,
} from "./sampleSlice.js";

const attributeNumberFormat = d3format(".4");

/** @type {Record<string, string>} */
const verboseOps = {
    lt: "<",
    lte: "\u2264",
    eq: "=",
    gte: "\u2265",
    gt: ">",
};

/**
 * @param {Iterable<any>} values
 * @param {boolean} [braces]
 * @returns {import("lit").TemplateResult}
 */
export function formatSet(values, braces = true) {
    const joined = html`${map(
        values,
        (value, i) => html`${i > 0 ? ", " : ""}<strong>${value}</strong>`
    )}`;
    return braces ? html`{${joined}}` : joined;
}

/**
 * Describes an action for displaying it in menus or provenance tracking.
 *
 * @param {import("@reduxjs/toolkit").PayloadAction<any>} action
 * @param {import("./compositeAttributeInfoSource.js").AttributeInfoSource} getAttributeInfo
 * @returns {import("../state/provenance.js").ActionInfo}
 */
export function getActionInfo(action, getAttributeInfo) {
    if (!action.type.startsWith(SAMPLE_SLICE_NAME)) {
        return;
    }

    const payload = action.payload;

    const attributeInfo =
        payload.attribute && getAttributeInfo(payload.attribute);
    const attributeName = attributeInfo?.name;
    const attributeTitle =
        attributeInfo?.title || html` <em>${attributeName}</em> `;

    const template = {
        attributeName,
    };

    const actionType = action.type.substring(SAMPLE_SLICE_NAME.length + 1);

    switch (actionType) {
        case SET_SAMPLES:
            return {
                ...template,
                title: "The initial state",
                icon: faCheck,
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
                    Retain the first sample of each
                    <em>${attributeName}</em>
                `,
                provenanceTitle: html`
                    Retain the first sample of each ${attributeTitle}
                `,
                icon: faMedal,
            };
        case RETAIN_FIRST_N_CATEGORIES:
            return {
                ...template,
                title: html`
                    Retain first <strong>n</strong> categories of
                    <em>${attributeName}</em>...
                `,
                provenanceTitle: html`
                    Retain first <strong>${payload.n}</strong> categories of
                    ${attributeTitle}
                `,
                icon: faMedal,
            };
        case FILTER_BY_NOMINAL: {
            const values = /** @type {any[]} */ (payload.values);

            /** @param {string | import("lit").TemplateResult} attr */
            const makeTitle = (attr) => html`
                ${payload.remove ? "Remove" : "Retain"} samples having
                ${values[0] === undefined || values[0] === null
                    ? html` undefined ${attr} `
                    : html`${attr}
                      ${values.length > 1
                          ? html`in ${formatSet(values)}`
                          : html`<span class="operator">=</span>
                                <strong>${values[0]}</strong>`} `}
            `;

            return {
                ...template,
                title: makeTitle(html` <em>${attributeName}</em> `),
                provenanceTitle: makeTitle(attributeTitle),
                icon: payload.remove ? faTrashAlt : faFilter,
            };
        }
        case FILTER_BY_QUANTITATIVE: {
            /** @param {string | import("lit").TemplateResult} attr */
            const makeTitle = (attr) => html`
                Retain samples having ${attr}
                <span class="operator"
                    >${verboseOps[/** @type {any} */ (payload).operator]}</span
                >
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
                icon: faTrashAlt,
            };
        case GROUP_CUSTOM: {
            const groups = /** @type {any} */ (payload.groups);
            const provenanceTitle = html`Create custom groups based on
            ${attributeTitle}.
            ${map(
                Object.entries(groups),
                ([groupName, categories], i) =>
                    html`${i > 0 ? ", " : ""}<strong>${groupName}</strong> =
                        ${formatSet(categories)}`
            )}`;

            return {
                ...template,
                title: "Group arbitrarily...",
                provenanceTitle,
                icon: faObjectGroup,
            };
        }
        case GROUP_BY_NOMINAL:
            return {
                ...template,
                title: "Group by",
                provenanceTitle: html` Group by ${attributeTitle} `,
                icon: faObjectGroup,
            };
        case GROUP_BY_QUARTILES:
            return {
                ...template,
                title: "Group by quartiles",
                provenanceTitle: html`
                    Group by quartiles on ${attributeTitle}
                `,
                icon: faObjectGroup,
            };
        case GROUP_BY_THRESHOLDS:
            return {
                ...template,
                title: "Group by thresholds",
                provenanceTitle: html`
                    Group by thresholds
                    ${formatSet(
                        /** @type {any} */ (payload).thresholds.map(
                            (/** @type {any} */ t) =>
                                `${verboseOps[t.operator]} ${t.operand}`
                        )
                    )}
                    on ${attributeTitle}
                `,
                icon: faObjectGroup,
            };
        case REMOVE_GROUP:
            return {
                title: "Remove group",
                provenanceTitle: html`
                    Remove group
                    ${join(
                        /** @type {any} */ (payload).path.map(
                            (/** @type {any} */ name) =>
                                html`<strong>${name}</strong>`
                        ),
                        " / "
                    )}
                `,
                icon: faTrashAlt,
            };
        case RETAIN_MATCHED:
            return {
                ...template,
                title: html`
                    Retain group-wise matched samples using
                    <em>${attributeName}</em>
                `,
                provenanceTitle: html`
                    Retain group-wise matched samples using ${attributeTitle}
                `,

                icon: faFilter,
            };
        default:
            return {
                ...template,
                title: JSON.stringify(action),
                icon: faCircle,
            };
    }
}
