/**
 * @typedef {import("../../utils/ui/contextmenu").MenuItem} MenuItem
 */

/**
 * @param {string | import("lit").TemplateResult} title Menu title
 * @param {import("./types").AttributeIdentifier} attribute
 * @param {string} attributeType
 * @param {any} attributeValue
 * @param {function(object):void} dispatch
 * @param {import("./sampleView").default} sampleView TODO: Figure out a better way to pass typings
 */
export default function generateAttributeContextMenu(
    title,
    attribute,
    attributeType,
    attributeValue,
    dispatch,
    sampleView
) {
    const actions = sampleView.actions;

    /** @type {MenuItem[]} */
    let items = [
        {
            label: title,
            type: "header",
        },
    ];

    /**
     * @param {import("../provenance").Action} action
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
     * @param {import("../provenance").Action[]} actions
     */
    const addActions = (...actions) => items.push(...actions.map(actionToItem));

    addActions(actions.sortBy({ attribute }));

    if (attributeType != "quantitative") {
        addActions(
            actions.groupByNominal({ attribute }),
            actions.retainFirstOfEach({ attribute }),
            actions.filterByNominal({
                attribute,
                action: "retain",
                values: [attributeValue],
            }),
            actions.filterByNominal({
                attribute,
                action: "remove",
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
                    operand: attributeValue,
                }),
                actions.filterByQuantitative({
                    attribute,
                    operator: "lte",
                    operand: attributeValue,
                })
            );
        } else {
            addActions(actions.removeUndefined({ attribute }));
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
