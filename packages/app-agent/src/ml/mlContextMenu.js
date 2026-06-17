/**
 * Registers ML scoring actions into the default SampleView context menu when a
 * genomic brush with SNVs is active.
 *
 * @param {import("@genome-spy/app/sampleView/sampleView.js").default} sampleView
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @param {{ baseUrl: string; fastaUrl: string }} options
 * @returns {() => void} cleanup handle
 */

import { collectBrushVariants } from "./mlVariantCollector.js";
import { showMlScoringDialog } from "./mlScoringDialog.js";

/**
 * @param {import("@genome-spy/app/sampleView/sampleView.js").default} sampleView
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @param {{ baseUrl: string; fastaUrl: string }} options
 * @returns {() => void}
 */
export function installMlContextMenu(sampleView, agentApi, options) {
    return sampleView.registerContextMenuAugmenter((context) => {
        if (!context.selectionInterval) {
            return [];
        }

        const collection = collectBrushVariants(agentApi);
        if (!collection) {
            return [];
        }

        return [
            {
                label: "Score variants in selected region",
                submenu: [
                    {
                        label: "with Evo2",
                        callback: () => {
                            void showMlScoringDialog(
                                agentApi,
                                collection,
                                options,
                                { initialModel: "evo2" }
                            );
                        },
                    },
                    {
                        label: "with AlphaGenome",
                        callback: () => {
                            void showMlScoringDialog(
                                agentApi,
                                collection,
                                options,
                                { initialModel: "alphagenome" }
                            );
                        },
                    },
                ],
            },
        ];
    });
}
