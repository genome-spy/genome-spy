/**
 * @typedef {import("../../utils/ui/contextmenu").MenuItem} MenuItem
 */

import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { discreteAttributeFilterDialog } from "./advancedAttributeFilterDialog";

/**
 * @param {string | import("lit").TemplateResult} title Menu title
 * @param {import("./types").AttributeInfo} attributeInfo
 * @param {import("../../spec/channel").Scalar} attributeValue
 * @param {import("./sampleView").default} sampleView TODO: Figure out a better way to pass typings
 */
export default function generateAttributeContextMenu(
    title,
    attributeInfo,
    attributeValue,
    sampleView
) {
    const actions = sampleView.actions;
    const attribute = attributeInfo.attribute;

    const dispatch = sampleView.provenance.storeHelper.getDispatcher();

    /** @type {MenuItem[]} */
    let items = [
        {
            label: title,
            type: "header",
        },
    ];

    /**
     * @param {import("../state/provenance").Action} action
     * @returns {MenuItem}
     */
    const actionToItem = (action) => {
        const info = sampleView.provenance.getActionInfo(action);
        return {
            label: info.title,
            icon: info.icon,
            callback: () => dispatch(action),
        };
    };

    /**
     * @param {import("../state/provenance").Action[]} actions
     */
    const addActions = (...actions) => items.push(...actions.map(actionToItem));

    addActions(actions.sortBy({ attribute }));

    const type = attributeInfo?.type ?? "identifier";

    if (type != "quantitative") {
        if (type != "identifier") {
            addActions(
                actions.groupByNominal({ attribute }),
                actions.retainFirstOfEach({ attribute })
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
    } else {
        addActions(actions.groupToQuartiles({ attribute }));

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

    if (type == "nominal" || type == "ordinal") {
        items.push({
            icon: faFilter,
            label: "Advanced filter...",
            callback: () =>
                discreteAttributeFilterDialog(attributeInfo, sampleView),
        });
    }

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
