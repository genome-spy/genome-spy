/**
 * @typedef {import("../utils/ui/contextMenu.js").MenuItem} MenuItem
 */

import { faFilter, faObjectGroup } from "@fortawesome/free-solid-svg-icons";
import { advancedAttributeFilterDialog } from "./attributeDialogs/advancedAttributeFilterDialog.js";
import groupByThresholdsDialog from "./attributeDialogs/groupByThresholdsDialog.js";
import retainFirstNCategoriesDialog from "./attributeDialogs/retainFirstNCategoriesDialog.js";
import createCustomGroupsDialog from "./attributeDialogs/createCustomGroupsDialog.js";

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
    const actions = sampleView.actions;
    const attribute = attributeInfo.attribute;

    const sampleHierarchy = sampleView.sampleHierarchy;

    const store = sampleView.provenance.store;

    /** @type {MenuItem[]} */
    const items = [];

    if (title) {
        items.push({
            label: title,
            type: "header",
        });
    }

    /**
     * @param {import("../state/provenance.js").Action} action
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
                : (callback ?? (() => store.dispatch(action))),
        };
    };

    /**
     * @param {import("../state/provenance.js").Action[]} actions
     */
    const addActions = (...actions) =>
        items.push(...actions.map((action) => actionToItem(action)));

    addActions(actions.sortBy({ attribute }));

    const type = attributeInfo?.type ?? "identifier";

    if (type != "quantitative") {
        if (type != "identifier") {
            addActions(actions.groupByNominal({ attribute }));
        }

        items.push({
            icon: faObjectGroup,
            label: "Create custom groups...",
            callback: () => createCustomGroupsDialog(attributeInfo, sampleView),
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
            callback: () => groupByThresholdsDialog(attributeInfo, sampleView),
        });
        if (isDefined(attributeValue)) {
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
