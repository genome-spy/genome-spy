import { html } from "lit";
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
    // TODO(app): Route this through IntentPipeline when expansion gets
    // async ensures/augment hooks, mirroring metadata intent flow.
    return {
        label: "Select related items",
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
        return [{ label: "No suitable fields available." }];
    }

    /** @type {MenuItem[]} */
    const submenu = [
        {
            type: "header",
            label: "Match values from clicked item",
        },
        DIVIDER,
    ];

    for (const fieldOption of fieldOptions) {
        const ruleLabel = formatRuleLabel(
            fieldOption.fieldName,
            fieldOption.valueLabel
        );
        if (fieldOption.operations.length === 1) {
            const operationOption = fieldOption.operations[0];
            submenu.push({
                label: ruleLabel,
                callback: () =>
                    dispatchAction(
                        paramProvenanceSlice.actions.expandPointSelection(
                            operationOption.payload
                        )
                    ),
            });
            continue;
        }

        submenu.push({
            label: ruleLabel,
            submenu: () => {
                /** @type {MenuItem[]} */
                const operationSubmenu = [
                    {
                        type: "header",
                        label: ruleLabel,
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

/**
 * @param {string} fieldName
 * @param {string} valueLabel
 * @returns {import("lit").TemplateResult}
 */
function formatRuleLabel(fieldName, valueLabel) {
    return html`<em>${fieldName}</em>
        <span class="operator">=</span>
        <strong>${valueLabel}</strong>`;
}
