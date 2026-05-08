/**
 * @typedef {import("../utils/ui/contextMenu.js").MenuItem} MenuItem
 */

import { faFilter, faObjectGroup } from "@fortawesome/free-solid-svg-icons";
import { advancedAttributeFilterDialog } from "./attributeDialogs/advancedAttributeFilterDialog.js";
import { showGroupByThresholdsDialog } from "./attributeDialogs/groupByThresholdsDialog.js";
import retainFirstNCategoriesDialog from "./attributeDialogs/retainFirstNCategoriesDialog.js";
import { showRetainCategoriesByAttributeDialog } from "./attributeDialogs/retainCategoriesByAttributeDialog.js";
import { showCreateCustomGroupsDialog } from "./attributeDialogs/createCustomGroupsDialog.js";
import { sampleSlice } from "./state/sampleSlice.js";

const SAMPLE_ATTRIBUTE = "SAMPLE_ATTRIBUTE";

/**
 * @param {string | import("lit").TemplateResult} title Menu title
 * @param {import("./types.js").AttributeInfo} attributeInfo
 * @param {import("@genome-spy/core/spec/channel.js").Scalar} attributeValue
 * @param {import("./sampleView.js").default} sampleView TODO: Figure out a better way to pass typings
 */
export default function generateAttributeContextMenu(
    title,
    attributeInfo,
    attributeValue,
    sampleView
) {
    const actions = sampleSlice.actions;
    const attribute = attributeInfo.attribute;

    const sampleHierarchy = sampleView.sampleHierarchy;

    /** @type {MenuItem[]} */
    const items = [];

    if (title) {
        items.push({
            label: title,
            type: "header",
        });
    }

    /**
     * @param {import("@reduxjs/toolkit").PayloadAction<import("./state/payloadTypes.js").PayloadWithAttribute>} action
     * @param {boolean} [disabled]
     * @param {function} [callback]
     * @returns {MenuItem}
     */
    const actionToItem = (action, disabled, callback) => {
        const info = sampleView.provenance.getActionInfo(action);
        return {
            label: info.title,
            icon: info.icon,
            callback: disabled
                ? undefined
                : (callback ??
                  (() => sampleView.dispatchAttributeAction(action))),
        };
    };

    /**
     * @param {import("@reduxjs/toolkit").PayloadAction<import("./state/payloadTypes.js").PayloadWithAttribute>[]} actions
     */
    const addActions = (...actions) =>
        items.push(...actions.map((action) => actionToItem(action)));

    addActions(actions.sortBy({ attribute }));

    const type = attributeInfo?.type ?? "identifier";

    let isCountAggregation = false;
    const specifier = attributeInfo.attribute.specifier;
    if (
        specifier &&
        typeof specifier === "object" &&
        "aggregation" in specifier
    ) {
        isCountAggregation =
            /** @type {import("./types.js").AggregationSpec} */ (
                specifier.aggregation
            ).op === "count";
    }

    if (type != "quantitative") {
        if (type != "identifier") {
            addActions(actions.groupByNominal({ attribute }));
        }

        items.push({
            icon: faObjectGroup,
            label: "Create custom groups...",
            callback: () =>
                showCreateCustomGroupsDialog(attributeInfo, sampleView),
        });

        if (type != "identifier") {
            addActions(actions.retainFirstOfEach({ attribute }));

            items.push(
                actionToItem(
                    actions.retainFirstNCategories({
                        attribute,
                        n: undefined,
                    }),
                    false,
                    () =>
                        retainFirstNCategoriesDialog(attributeInfo, sampleView)
                )
            );

            const retainCategoriesSubmenu = buildRetainCategoriesSubmenu(
                attributeInfo,
                sampleView
            );
            if (retainCategoriesSubmenu.length) {
                items.push({
                    icon: faFilter,
                    label: "Retain categories based on...",
                    submenu: retainCategoriesSubmenu,
                });
            }
        }

        addActions(
            actions.filterByNominal({
                attribute,
                values: [attributeValue],
            }),
            actions.filterByNominal({
                attribute,
                remove: true,
                values: [attributeValue],
            })
        );

        if (type != "identifier") {
            items.push(
                actionToItem(
                    actions.retainMatched({
                        attribute,
                    }),
                    !sampleHierarchy.groupMetadata.length
                )
            );
        }
    } else {
        addActions(actions.groupToQuartiles({ attribute }));
        items.push({
            icon: faObjectGroup,
            label: "Group by thresholds...",
            callback: () =>
                showGroupByThresholdsDialog(attributeInfo, sampleView),
        });
        if (isCountAggregation) {
            addActions(
                actions.filterByQuantitative({
                    attribute,
                    operator: "gte",
                    operand: 1,
                }),
                actions.filterByQuantitative({
                    attribute,
                    operator: "eq",
                    operand: 0,
                })
            );
        } else if (isDefined(attributeValue)) {
            addActions(
                actions.filterByQuantitative({
                    attribute,
                    operator: "gte",
                    operand: +attributeValue,
                }),
                actions.filterByQuantitative({
                    attribute,
                    operator: "lte",
                    operand: +attributeValue,
                })
            );
        } else {
            addActions(actions.removeUndefined({ attribute }));
        }
    }

    items.push({
        icon: faFilter,
        label: "Advanced filter...",
        callback: () =>
            advancedAttributeFilterDialog(attributeInfo, sampleView),
    });

    return items;
}

/**
 * @param {import("./types.js").AttributeInfo} categoryAttributeInfo
 * @param {import("./sampleView.js").default} sampleView
 * @returns {MenuItem[]}
 */
function buildRetainCategoriesSubmenu(categoryAttributeInfo, sampleView) {
    const categoryAttribute = categoryAttributeInfo.attribute;
    if (
        categoryAttribute.type !== SAMPLE_ATTRIBUTE ||
        typeof categoryAttribute.specifier !== "string"
    ) {
        return [];
    }

    return sampleView.sampleHierarchy.sampleMetadata.attributeNames
        .filter(
            (attributeName) => attributeName !== categoryAttribute.specifier
        )
        .flatMap((attributeName) => {
            const conditionAttributeInfo =
                sampleView.compositeAttributeInfoSource.getAttributeInfo({
                    type: SAMPLE_ATTRIBUTE,
                    specifier: attributeName,
                });
            if (conditionAttributeInfo.type !== "quantitative") {
                return [];
            }

            return [
                {
                    label: conditionAttributeInfo.title,
                    submenu: () =>
                        buildRetainCategoriesConditionSubmenu(
                            categoryAttributeInfo,
                            conditionAttributeInfo,
                            sampleView
                        ),
                },
            ];
        });
}

/**
 * @param {import("./types.js").AttributeInfo} categoryAttributeInfo
 * @param {import("./types.js").AttributeInfo} conditionAttributeInfo
 * @param {import("./sampleView.js").default} sampleView
 * @returns {MenuItem[]}
 */
function buildRetainCategoriesConditionSubmenu(
    categoryAttributeInfo,
    conditionAttributeInfo,
    sampleView
) {
    const dispatchAction = (
        /** @type {import("./state/payloadTypes.js").ComparisonOperatorType} */ operator,
        /** @type {number} */ operand
    ) =>
        sampleView.dispatchAttributeAction(
            sampleView.actions.retainCategoriesByAttribute({
                attribute: categoryAttributeInfo.attribute,
                condition: {
                    attribute: conditionAttributeInfo.attribute,
                    operator,
                    operand,
                },
            })
        );

    return [
        {
            icon: faFilter,
            label: "> 0",
            callback: () => dispatchAction("gt", 0),
        },
        {
            icon: faFilter,
            label: ">= 1",
            callback: () => dispatchAction("gte", 1),
        },
        {
            icon: faFilter,
            label: "Choose custom threshold...",
            callback: () =>
                showRetainCategoriesByAttributeDialog(
                    categoryAttributeInfo,
                    conditionAttributeInfo,
                    sampleView
                ),
        },
    ];
}

/**
 *
 * @param {any} value
 */
function isDefined(value) {
    return (
        value !== undefined &&
        value !== null &&
        value !== "" &&
        !(typeof value == "number" && isNaN(value))
    );
}
