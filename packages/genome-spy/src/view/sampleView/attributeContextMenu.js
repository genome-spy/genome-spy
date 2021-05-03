import * as Actions from "../../sampleHandler/sampleHandlerActions";

/**
 * @typedef {import("../../utils/ui/contextmenu").MenuItem} MenuItem
 */

/**
 * @param {string | import("lit").TemplateResult} title Menu title
 * @param {import("../../sampleHandler/sampleHandler").AttributeIdentifier} attribute
 * @param {string} attributeType
 * @param {any} attributeValue
 * @param {function(object):void} dispatch
 * @param {import("../../sampleHandler/provenance").default<any>} provenance
 */
export default function generateAttributeContextMenu(
    title,
    attribute,
    attributeType,
    attributeValue,
    dispatch,
    provenance
) {
    /** @type {MenuItem[]} */
    let items = [
        {
            label: title,
            type: "header"
        }
    ];

    /**
     * @param {import("../../sampleHandler/provenance").Action} action
     * @returns {MenuItem}
     */
    const actionToItem = action => {
        const info = provenance.getActionInfo(action);
        return {
            label: info.title,
            icon: info.icon,
            callback: () => dispatch(action)
        };
    };

    /**
     * @param {import("../../sampleHandler/provenance").Action[]} actions
     */
    const addActions = (...actions) => items.push(...actions.map(actionToItem));

    addActions(Actions.sortBy(attribute));

    if (attributeType != "quantitative") {
        addActions(
            Actions.groupByNominal(attribute),
            Actions.retainFirstOfEach(attribute),
            Actions.filterByNominal(attribute, "retain", [attributeValue]),
            Actions.filterByNominal(attribute, "remove", [attributeValue])
        );
    } else {
        addActions(Actions.groupToQuartiles(attribute));

        if (isDefined(attributeValue)) {
            addActions(
                Actions.filterByQuantitative(attribute, "gte", attributeValue),
                Actions.filterByQuantitative(attribute, "lte", attributeValue)
            );
        } else {
            addActions(Actions.removeUndefined(attribute));
        }
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
