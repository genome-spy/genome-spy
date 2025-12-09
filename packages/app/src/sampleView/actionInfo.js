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
    SET_METADATA,
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
 * @typedef {Object} ActionHandlerContext
 * @property {any} payload
 * @property {Object} template
 * @property {string} attributeName
 * @property {string | import("lit").TemplateResult} attributeTitle
 */

/**
 * Map of action type to handler function.
 * Each handler receives (payload, template, attributeName, attributeTitle) and returns ActionInfo.
 * @type {Record<string, (context: ActionHandlerContext) => import("../state/provenance.js").ActionInfo>}
 */
const actionHandlers = {
    [SET_SAMPLES]: ({ template }) => ({
        ...template,
        title: "The initial state",
        icon: faCheck,
    }),

    [SET_METADATA]: ({ template }) => ({
        ...template,
        title: "Set metadata",
        icon: faCheck,
    }),

    [SORT_BY]: ({ template, attributeTitle }) => ({
        ...template,
        title: "Sort by",
        provenanceTitle: html` Sort by ${attributeTitle} `,
        icon: faSortAmountDown,
    }),

    [RETAIN_FIRST_OF_EACH]: ({ template, attributeName, attributeTitle }) => ({
        ...template,
        title: html`
            Retain the first sample of each
            <em>${attributeName}</em>
        `,
        provenanceTitle: html`
            Retain the first sample of each ${attributeTitle}
        `,
        icon: faMedal,
    }),

    [RETAIN_FIRST_N_CATEGORIES]: ({
        payload,
        template,
        attributeName,
        attributeTitle,
    }) => ({
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
    }),

    [FILTER_BY_NOMINAL]: ({
        payload,
        template,
        attributeName,
        attributeTitle,
    }) => {
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
    },

    [FILTER_BY_QUANTITATIVE]: ({
        payload,
        template,
        attributeName,
        attributeTitle,
    }) => {
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
    },

    [REMOVE_UNDEFINED]: ({ template, attributeTitle }) => ({
        ...template,
        title: "Remove samples having missing attribute",
        provenanceTitle: html`
            Remove samples having missing ${attributeTitle}
        `,
        icon: faTrashAlt,
    }),

    [GROUP_CUSTOM]: ({ payload, template, attributeTitle }) => {
        const groups = /** @type {Record<string, any[]>} */ (payload.groups);
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
    },

    [GROUP_BY_NOMINAL]: ({ template, attributeTitle }) => ({
        ...template,
        title: "Group by",
        provenanceTitle: html` Group by ${attributeTitle} `,
        icon: faObjectGroup,
    }),

    [GROUP_BY_QUARTILES]: ({ template, attributeTitle }) => ({
        ...template,
        title: "Group by quartiles",
        provenanceTitle: html` Group by quartiles on ${attributeTitle} `,
        icon: faObjectGroup,
    }),

    [GROUP_BY_THRESHOLDS]: ({ payload, template, attributeTitle }) => ({
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
    }),

    [REMOVE_GROUP]: ({ payload }) => ({
        title: "Remove group",
        provenanceTitle: html`
            Remove group
            ${join(
                /** @type {any} */ (payload).path.map(
                    (/** @type {any} */ name) => html`<strong>${name}</strong>`
                ),
                " / "
            )}
        `,
        icon: faTrashAlt,
    }),

    [RETAIN_MATCHED]: ({ template, attributeName, attributeTitle }) => ({
        ...template,
        title: html`
            Retain group-wise matched samples using
            <em>${attributeName}</em>
        `,
        provenanceTitle: html`
            Retain group-wise matched samples using ${attributeTitle}
        `,
        icon: faFilter,
    }),
};

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

    const handler = actionHandlers[actionType];
    if (handler) {
        return handler({ payload, template, attributeName, attributeTitle });
    }

    return {
        ...template,
        title: JSON.stringify(action),
        icon: faCircle,
    };
}
