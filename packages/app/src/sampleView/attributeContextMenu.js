/**
 * @typedef {import("../utils/ui/contextMenu.js").MenuItem} MenuItem
 */

import {
    faFilter,
    faFont,
    faHashtag,
    faObjectGroup,
} from "@fortawesome/free-solid-svg-icons";
import { advancedAttributeFilterDialog } from "./attributeDialogs/advancedAttributeFilterDialog.js";
import { showGroupByThresholdsDialog } from "./attributeDialogs/groupByThresholdsDialog.js";
import retainFirstNCategoriesDialog from "./attributeDialogs/retainFirstNCategoriesDialog.js";
import { showRetainCategoriesByAttributeDialog } from "./attributeDialogs/retainCategoriesByAttributeDialog.js";
import { showCreateCustomGroupsDialog } from "./attributeDialogs/createCustomGroupsDialog.js";
import { sampleSlice } from "./state/sampleSlice.js";
import { extractAttributeValues } from "./attributeValues.js";
import {
    buildPathTree,
    METADATA_PATH_SEPARATOR,
} from "./metadata/metadataUtils.js";

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
                    label:
                        "Retain " +
                        attributeInfo.name +
                        " values based on another attribute",
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

    const attributeNames =
        sampleView.metadataView?.getVisibleAttributeNames() ??
        sampleView.sampleHierarchy.sampleMetadata.attributeNames;
    const candidateAttributes = attributeNames
        .filter(
            (attributeName) => attributeName !== categoryAttribute.specifier
        )
        .map((attributeName) => {
            const conditionAttributeInfo =
                sampleView.compositeAttributeInfoSource.getAttributeInfo({
                    type: SAMPLE_ATTRIBUTE,
                    specifier: attributeName,
                });
            if (!isRetainCategoriesConditionAttribute(conditionAttributeInfo)) {
                return;
            }

            return conditionAttributeInfo;
        })
        .filter((info) => info);

    return buildConditionAttributeMenuTree(
        categoryAttributeInfo,
        /** @type {import("./types.js").AttributeInfo[]} */ (
            candidateAttributes
        ),
        sampleView
    );
}

/**
 * @param {import("./types.js").AttributeInfo} categoryAttributeInfo
 * @param {import("./types.js").AttributeInfo[]} conditionAttributeInfos
 * @param {import("./sampleView.js").default} sampleView
 * @returns {MenuItem[]}
 */
function buildConditionAttributeMenuTree(
    categoryAttributeInfo,
    conditionAttributeInfos,
    sampleView
) {
    const attributeInfoByName = new Map(
        conditionAttributeInfos.map((info) => [info.name, info])
    );
    const root = buildPathTree(
        conditionAttributeInfos.map((info) => info.name),
        METADATA_PATH_SEPARATOR
    );

    return Array.from(root.children.values()).map((node) =>
        conditionAttributeNodeToMenuItem(
            categoryAttributeInfo,
            attributeInfoByName,
            node,
            sampleView
        )
    );
}

/**
 * @param {import("./types.js").AttributeInfo} categoryAttributeInfo
 * @param {Map<string, import("./types.js").AttributeInfo>} attributeInfoByName
 * @param {import("./metadata/metadataUtils.js").PathTreeNode} node
 * @param {import("./sampleView.js").default} sampleView
 * @returns {MenuItem}
 */
function conditionAttributeNodeToMenuItem(
    categoryAttributeInfo,
    attributeInfoByName,
    node,
    sampleView
) {
    if (node.children.size > 0) {
        return {
            label: node.part,
            submenu: () =>
                Array.from(node.children.values()).map((child) =>
                    conditionAttributeNodeToMenuItem(
                        categoryAttributeInfo,
                        attributeInfoByName,
                        child,
                        sampleView
                    )
                ),
        };
    }

    const conditionAttributeInfo = attributeInfoByName.get(node.path);
    if (!conditionAttributeInfo) {
        throw new Error("No attribute info for menu leaf: " + node.path);
    }

    return {
        icon: getAttributeTypeIcon(conditionAttributeInfo),
        label: node.part,
        submenu: () =>
            buildRetainCategoriesConditionSubmenu(
                categoryAttributeInfo,
                conditionAttributeInfo,
                sampleView
            ),
    };
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
    return [
        {
            label:
                "Retain " +
                categoryAttributeInfo.name +
                " values where any sample has " +
                conditionAttributeInfo.name,
            type: "header",
        },
        ...buildRetainCategoriesConditionItems(
            categoryAttributeInfo,
            conditionAttributeInfo,
            sampleView
        ),
    ];
}

/**
 * @param {import("./types.js").AttributeInfo} categoryAttributeInfo
 * @param {import("./types.js").AttributeInfo} conditionAttributeInfo
 * @param {import("./sampleView.js").default} sampleView
 * @returns {MenuItem[]}
 */
function buildRetainCategoriesConditionItems(
    categoryAttributeInfo,
    conditionAttributeInfo,
    sampleView
) {
    const items = getRetainCategoriesConditionSpecs(
        conditionAttributeInfo,
        sampleView
    ).map(({ label, condition }) =>
        createRetainCategoriesConditionItem(
            categoryAttributeInfo,
            sampleView,
            label,
            condition
        )
    );

    if (conditionAttributeInfo.type === "quantitative") {
        items.push({
            icon: faFilter,
            label: "Choose custom threshold...",
            callback: () =>
                showRetainCategoriesByAttributeDialog(
                    categoryAttributeInfo,
                    conditionAttributeInfo,
                    sampleView
                ),
        });
    } else {
        items.push({
            icon: faFilter,
            label: "Choose values...",
            callback: () =>
                showRetainCategoriesByAttributeDialog(
                    categoryAttributeInfo,
                    conditionAttributeInfo,
                    sampleView
                ),
        });
    }

    return items;
}

/**
 * @param {import("./types.js").AttributeInfo} conditionAttributeInfo
 * @param {import("./sampleView.js").default} sampleView
 * @returns {{ label: string, condition: import("./state/payloadTypes.js").AttributeCondition }[]}
 */
function getRetainCategoriesConditionSpecs(conditionAttributeInfo, sampleView) {
    if (conditionAttributeInfo.type === "quantitative") {
        return [
            {
                label: "> 0",
                condition: {
                    attribute: conditionAttributeInfo.attribute,
                    operator: "gt",
                    operand: 0,
                },
            },
            {
                label: ">= 1",
                condition: {
                    attribute: conditionAttributeInfo.attribute,
                    operator: "gte",
                    operand: 1,
                },
            },
            {
                label: "= 0",
                condition: {
                    attribute: conditionAttributeInfo.attribute,
                    operator: "eq",
                    operand: 0,
                },
            },
        ];
    }

    return getAttributeCategories(conditionAttributeInfo, sampleView).map(
        (value) => ({
            label: "= " + String(value),
            condition: {
                attribute: conditionAttributeInfo.attribute,
                operator: "in",
                values: [value],
            },
        })
    );
}

/**
 * @param {import("./types.js").AttributeInfo} categoryAttributeInfo
 * @param {import("./sampleView.js").default} sampleView
 * @param {string} label
 * @param {import("./state/payloadTypes.js").AttributeCondition} condition
 * @returns {MenuItem}
 */
function createRetainCategoriesConditionItem(
    categoryAttributeInfo,
    sampleView,
    label,
    condition
) {
    return {
        label,
        callback: () =>
            sampleView.dispatchAttributeAction(
                sampleView.actions.retainCategoriesByAttribute({
                    attribute: categoryAttributeInfo.attribute,
                    condition,
                })
            ),
    };
}

/**
 * @param {import("./types.js").AttributeInfo} attributeInfo
 * @returns {import("@fortawesome/free-solid-svg-icons").IconDefinition}
 */
function getAttributeTypeIcon(attributeInfo) {
    return attributeInfo.type === "quantitative" ? faHashtag : faFont;
}

/**
 * @param {import("./types.js").AttributeInfo} attributeInfo
 * @returns {boolean}
 */
function isRetainCategoriesConditionAttribute(attributeInfo) {
    return (
        attributeInfo.type === "quantitative" ||
        attributeInfo.type === "nominal" ||
        attributeInfo.type === "ordinal"
    );
}

/**
 * @param {import("./types.js").AttributeInfo} attributeInfo
 * @param {import("./sampleView.js").default} sampleView
 * @returns {any[]}
 */
function getAttributeCategories(attributeInfo, sampleView) {
    const domain = attributeInfo.scale?.domain?.();
    if (Array.isArray(domain)) {
        return domain;
    }

    return Array.from(
        new Set(
            extractAttributeValues(
                attributeInfo,
                sampleView.leafSamples,
                sampleView.sampleHierarchy
            )
        )
    );
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
