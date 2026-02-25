import { paramProvenanceSlice } from "./paramProvenanceSlice.js";
import { createSelectionExpansionFieldOptions } from "./selectionExpansionContext.js";
import { DIVIDER } from "../utils/ui/contextMenu.js";

/**
 * @typedef {import("./selectionExpansionContext.js").SelectionExpansionContext} SelectionExpansionContext
 * @typedef {import("../utils/ui/contextMenu.js").MenuItem} MenuItem
 */

/**
 * @param {SelectionExpansionContext} context
 * @param {(action: import("@reduxjs/toolkit").Action) => void} dispatchAction
 * @returns {MenuItem}
 */
export function createSelectionExpansionMenuItem(context, dispatchAction) {
    return {
        label: "Expand point selection",
        submenu: () => createSelectionExpansionSubmenu(context, dispatchAction),
    };
}

/**
 * @param {SelectionExpansionContext} context
 * @param {(action: import("@reduxjs/toolkit").Action) => void} dispatchAction
 * @returns {MenuItem[]}
 */
export function createSelectionExpansionSubmenu(context, dispatchAction) {
    const fieldOptions = createSelectionExpansionFieldOptions(context);
    if (fieldOptions.length === 0) {
        return [{ label: "No expansion fields available." }];
    }

    /** @type {MenuItem[]} */
    const submenu = [
        {
            type: "header",
            label: "Choose a field",
        },
        DIVIDER,
    ];

    for (const fieldOption of fieldOptions) {
        submenu.push({
            label: fieldOption.fieldName,
            submenu: () => {
                /** @type {MenuItem[]} */
                const operationSubmenu = [
                    {
                        type: "header",
                        label: "Value: " + fieldOption.valueLabel,
                    },
                    DIVIDER,
                ];

                for (const operationOption of fieldOption.operations) {
                    operationSubmenu.push({
                        label: operationOption.label,
                        callback: () =>
                            dispatchAction(
                                paramProvenanceSlice.actions.expandPointSelection(
                                    operationOption.payload
                                )
                            ),
                    });
                }

                return operationSubmenu;
            },
        });
    }

    return submenu;
}
