import { format as d3format } from "d3-format";
import * as Actions from "../../sampleHandler/sampleHandlerActions";

/**
 * @param {string} title Menu title
 * @param {string} attributeName Short, descriptive name for the attribute
 * @param {import("../../sampleHandler/sampleHandler").AttributeIdentifier} attribute
 * @param {string} attributeType
 * @param {any} attributeValue
 * @param {function(object):void} dispatch
 */
export default function generateAttributeContextMenu(
    title,
    attributeName,
    attribute,
    attributeType,
    attributeValue,
    dispatch
) {
    const name = attributeName;

    /** @type {import("../../contextMenu").MenuItem[]} */
    let items = [
        {
            label: title,
            type: "header"
        },
        {
            label: "Sort by",
            callback: () => dispatch(Actions.sortBy(attribute))
        }
    ];

    const nominal = attributeType != "quantitative";

    if (nominal) {
        items.push({
            label: "Group by",
            callback: () => dispatch(Actions.groupByNominal(attribute))
        });

        items.push({
            label: "Retain first sample of each",
            callback: () => dispatch(Actions.retainFirstOfEach(attribute))
        });
    }

    if (nominal) {
        //items.push({ type: "divider" });

        items.push({
            label:
                attributeValue === null
                    ? `Samples with undefined *${name}*`
                    : `Samples with *${name}* = **${attributeValue}**`,
            type: "header"
        });

        items.push({
            label: "Retain",
            callback: () =>
                dispatch(
                    Actions.filterByNominal(attribute, "retain", [
                        attributeValue
                    ])
                )
        });

        items.push({
            label: "Remove",
            callback: () =>
                dispatch(
                    Actions.filterByNominal(attribute, "remove", [
                        attributeValue
                    ])
                )
        });
    } else {
        const numberFormat = d3format(".4");

        items.push({
            label: "Group to quartiles",
            callback: () => dispatch(Actions.groupToQuartiles(attribute))
        });

        //items.push({ type: "divider" });

        if (isDefined(attributeValue)) {
            items.push({
                label: `Remove *${name}* less than **${numberFormat(
                    attributeValue
                )}**`,
                callback: () =>
                    dispatch(
                        Actions.filterByQuantitative(
                            attribute,
                            "gte",
                            attributeValue
                        )
                    )
            });

            items.push({
                label: `Remove *${name}* greater than **${numberFormat(
                    attributeValue
                )}**`,
                callback: () =>
                    dispatch(
                        Actions.filterByQuantitative(
                            attribute,
                            "lte",
                            attributeValue
                        )
                    )
            });
        } else {
            items.push({
                label: `Remove undefined *${name}*`,
                callback: () => dispatch(Actions.removeUndefined(attribute))
            });
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
