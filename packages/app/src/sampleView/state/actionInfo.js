import { format as d3format } from "d3-format";
import { html } from "lit";
import { join } from "lit/directives/join.js";
import { map } from "lit/directives/map.js";
import {
    faSortAmountDown,
    faSortAmountUp,
    faFilter,
    faMedal,
    faObjectGroup,
    faCircle,
    faTrashAlt,
    faCheck,
    faTable,
} from "@fortawesome/free-solid-svg-icons";
import { SAMPLE_SLICE_NAME } from "./sampleSlice.js";
import { formatShortAttributeName } from "../attributeFormatting.js";

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
    const joined = Array.from(
        values,
        (value, i) => html`${i > 0 ? ", " : ""}<strong>${value}</strong>`
    );
    return braces ? html`{${joined}}` : html`${joined}`;
}

/**
 * @param {string[]} columnIds
 * @returns {import("lit").TemplateResult}
 */
function formatColumnNameList(columnIds) {
    const names = columnIds.slice(0, 3).map((name) => html`<em>${name}</em>`);
    if (names.length === 1) {
        return html`${names[0]}`;
    } else if (names.length === 2) {
        return html`${names[0]} and ${names[1]}`;
    } else {
        return html`${names[0]}, ${names[1]}, and ${names[2]}`;
    }
}

/**
 * @typedef {Object} ActionHandlerContext
 * @property {any} payload
 * @property {Object} template
 * @property {string | import("lit").TemplateResult} attributeName
 * @property {string | import("lit").TemplateResult} attributeTitle
 * @property {string | import("lit").TemplateResult} conditionAttributeName
 * @property {string | import("lit").TemplateResult} conditionAttributeTitle
 */

/**
 * Map of action type to handler function.
 * Each handler receives (payload, template, attributeName, attributeTitle) and returns ActionInfo.
 * @type {Record<import("./sampleSlice.js").SampleActionType, (context: ActionHandlerContext) => import("../../state/provenance.js").ActionInfo>}
 */
const actionHandlers = {
    setSamples: ({ template }) => ({
        ...template,
        title: "Set samples",
        icon: faCheck,
    }),

    addMetadata: ({ template, payload }) => ({
        ...template,
        title: payload.replace ? "Set metadata" : "Add metadata",
        icon: faTable,
    }),

    deriveMetadata: ({ template, payload, attributeTitle }) => {
        const name = payload.groupPath
            ? payload.groupPath + "/" + payload.name
            : payload.name;
        const source = attributeTitle ?? "attribute";
        return {
            ...template,
            title: "Add derived metadata",
            provenanceTitle: html`Add derived metadata
                <strong>${name}</strong> from ${source}`,
            icon: faTable,
        };
    },

    addMetadataFromSource: ({ template, payload }) => {
        const columnIds = Array.isArray(payload.columnIds)
            ? payload.columnIds
            : [];
        const sourceLabel = payload.sourceId
            ? html` from <strong>${payload.sourceId}</strong> source`
            : "";
        const noun = columnIds.length === 1 ? "attribute" : "attributes";
        const listNames = columnIds.length > 0 && columnIds.length <= 3;
        const attributeLabel = listNames
            ? formatColumnNameList(columnIds)
            : html`<strong>${columnIds.length}</strong> ${noun}`;

        return {
            ...template,
            title: "Import metadata from source",
            provenanceTitle: html`Import ${attributeLabel}${sourceLabel}`,
            icon: faTable,
        };
    },

    sortBy: ({ payload, template, attributeTitle }) => {
        const order = payload.order ?? "descending";
        return {
            ...template,
            title: "Sort " + order,
            provenanceTitle: html` Sort by ${attributeTitle}, ${order} `,
            icon: order === "ascending" ? faSortAmountUp : faSortAmountDown,
        };
    },

    retainFirstOfEach: ({ template, attributeName, attributeTitle }) => ({
        ...template,
        title: html` Retain the first sample of each ${attributeName} `,
        provenanceTitle: html`
            Retain the first sample of each ${attributeTitle}
        `,
        icon: faMedal,
    }),

    retainFirstNCategories: ({
        payload,
        template,
        attributeName,
        attributeTitle,
    }) => ({
        ...template,
        title: html`
            Retain first <strong>n</strong> categories of ${attributeName}...
        `,
        provenanceTitle: html`
            Retain first <strong>${payload.n}</strong> categories of
            ${attributeTitle}
        `,
        icon: faMedal,
    }),

    filterByNominal: ({ payload, template, attributeName, attributeTitle }) => {
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
            title: makeTitle(attributeName),
            provenanceTitle: makeTitle(attributeTitle),
            icon: payload.remove ? faTrashAlt : faFilter,
        };
    },

    filterByQuantitative: ({
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
            title: makeTitle(attributeName),
            provenanceTitle: makeTitle(attributeTitle),
            icon: faFilter,
        };
    },

    retainCategoriesByAttribute: ({
        payload,
        template,
        attributeName,
        attributeTitle,
        conditionAttributeName,
        conditionAttributeTitle,
    }) => {
        const condition =
            /** @type {import("./payloadTypes.js").AttributeCondition} */ (
                payload.condition
            );

        /** @type {(attr: string | import("lit").TemplateResult, conditionAttr: string | import("lit").TemplateResult) => import("lit").TemplateResult} */
        let makeTitle;
        if (condition.operator === "in" && condition.required === "all") {
            makeTitle = (attr, conditionAttr) => html`
                Retain ${attr} values where samples include all ${conditionAttr}
                values in ${formatSet(condition.values)}
            `;
        } else {
            makeTitle = (attr, conditionAttr) => html`
                Retain ${attr} values where any sample has ${conditionAttr}
                ${formatConditionPredicate(condition)}
            `;
        }

        return {
            ...template,
            title: makeTitle(attributeName, conditionAttributeName),
            provenanceTitle: makeTitle(attributeTitle, conditionAttributeTitle),
            icon: faFilter,
        };
    },

    removeUndefined: ({ template, attributeTitle }) => ({
        ...template,
        title: "Remove samples having missing attribute",
        provenanceTitle: html`
            Remove samples having missing ${attributeTitle}
        `,
        icon: faTrashAlt,
    }),

    groupCustomCategories: ({ payload, template, attributeTitle }) => {
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

    groupByNominal: ({ template, attributeTitle }) => ({
        ...template,
        title: "Group by",
        provenanceTitle: html` Group by ${attributeTitle} `,
        icon: faObjectGroup,
    }),

    groupToQuartiles: ({ template, attributeTitle }) => ({
        ...template,
        title: "Group by quartiles",
        provenanceTitle: html` Group by quartiles on ${attributeTitle} `,
        icon: faObjectGroup,
    }),

    groupByThresholds: ({ payload, template, attributeTitle }) => ({
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
            ${
                /** @type {any} */ (payload).groupTitles
                    ? html` as
                      ${formatSet(/** @type {any} */ (payload).groupTitles)}`
                    : ""
            }
            on ${attributeTitle}
        `,
        icon: faObjectGroup,
    }),

    removeGroup: ({ payload }) => ({
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

    retainGroupsByRank: ({ payload }) => {
        const orderLabel =
            payload.order === "descending" ? "largest" : "smallest";
        return {
            title: "Retain top/bottom-k groups by size",
            provenanceTitle: html`
                Retain the
                <strong>${payload.limit}</strong>
                <strong>${orderLabel}</strong>
                groups by size at level
                <strong>${payload.level}</strong>
            `,
            icon: faFilter,
        };
    },

    retainGroupsBySize: ({ payload }) => ({
        title: "Retain groups by size threshold",
        provenanceTitle: html`
            Retain groups at level
            <strong>${payload.level}</strong>
            where size
            <span class="operator"
                >${verboseOps[/** @type {any} */ (payload).operator]}</span
            >
            <strong>${attributeNumberFormat(payload.operand)}</strong>
        `,
        icon: faFilter,
    }),

    ungroup: ({ payload }) => ({
        title: "Ungroup",
        provenanceTitle: html`
            Ungroup from level
            <strong>${payload.level}</strong>
        `,
        icon: faObjectGroup,
    }),

    retainMatched: ({ template, attributeName, attributeTitle }) => ({
        ...template,
        title: html` Retain group-wise matched samples using ${attributeName} `,
        provenanceTitle: html`
            Retain group-wise matched samples using ${attributeTitle}
        `,
        icon: faFilter,
    }),
};

/**
 * @param {import("./payloadTypes.js").AttributeCondition} condition
 * @returns {import("lit").TemplateResult}
 */
function formatConditionPredicate(condition) {
    if (condition.operator === "in") {
        return html`in ${formatSet(condition.values)}`;
    } else {
        return html`
            <span class="operator">${verboseOps[condition.operator]}</span>
            <strong>${attributeNumberFormat(condition.operand)}</strong>
        `;
    }
}

/**
 * Describes an action for displaying it in menus or provenance tracking.
 *
 * @param {import("@reduxjs/toolkit").PayloadAction<any>} action
 * @param {import("../compositeAttributeInfoSource.js").AttributeInfoSource} getAttributeInfo
 * @returns {import("../../state/provenance.js").ActionInfo}
 */
export function getActionInfo(action, getAttributeInfo) {
    if (!action.type.startsWith(SAMPLE_SLICE_NAME)) {
        return;
    }

    const payload =
        action.payload && typeof action.payload === "object"
            ? action.payload
            : {};

    /** @param {import("../types.js").AttributeIdentifier | null} attribute */
    const resolveAttributeInfo = (attribute) => {
        if (!attribute) {
            return {};
        }

        try {
            const attributeInfo = getAttributeInfo(attribute);
            const fallbackAttributeName =
                attribute &&
                typeof attribute === "object" &&
                "specifier" in attribute &&
                typeof attribute.specifier === "string"
                    ? html` <em>${attribute.specifier}</em> `
                    : undefined;
            const attributeName = attributeInfo
                ? formatShortAttributeName(attributeInfo)
                : fallbackAttributeName;
            const attributeTitle = attributeInfo?.title ?? attributeName;

            return { attributeInfo, attributeName, attributeTitle };
        } catch {
            const fallbackAttributeName =
                attribute &&
                typeof attribute === "object" &&
                "specifier" in attribute &&
                typeof attribute.specifier === "string"
                    ? html` <em>${attribute.specifier}</em> `
                    : undefined;

            return {
                attributeInfo: undefined,
                attributeName: fallbackAttributeName,
                attributeTitle: fallbackAttributeName,
            };
        }
    };

    const attribute =
        "attribute" in payload && payload.attribute ? payload.attribute : null;
    const { attributeName, attributeTitle } = resolveAttributeInfo(attribute);
    const {
        attributeName: conditionAttributeName,
        attributeTitle: conditionAttributeTitle,
    } = resolveAttributeInfo(
        "condition" in payload &&
            payload.condition &&
            typeof payload.condition === "object" &&
            "attribute" in payload.condition
            ? payload.condition.attribute
            : null
    );

    const template = {
        attributeName,
    };

    const actionType =
        /** @type {import("./sampleSlice.js").SampleActionType} */ (
            action.type.substring(SAMPLE_SLICE_NAME.length + 1)
        );

    const handler = actionHandlers[actionType];
    if (handler) {
        return handler({
            payload,
            template,
            attributeName,
            attributeTitle,
            conditionAttributeName,
            conditionAttributeTitle,
        });
    }

    // Unknown actions should still be renderable in provenance menus. Avoid
    // JSON-stringifying whole actions because payloads can be large or cyclic.
    return {
        ...template,
        title: actionType,
        provenanceTitle: actionType,
        icon: faCircle,
    };
}
