/**
 * Browser-side ML scoring plugin for GenomeSpy.
 *
 * Adds ML scoring actions to the SampleView context menu so users can score
 * brushed SNVs with AlphaGenome or Evo2. Results are injected as new per-sample
 * metadata columns visible in the sample attribute sidebar.
 *
 * Usage:
 *   import { mlPlugin } from "@genome-spy/app-agent";
 *
 *   embed(spec, {
 *     plugins: [
 *       mlPlugin({
 *         baseUrl: "http://localhost:8000",
 *         fastaUrl: "/private/website-examples/TCGA_BRCA/hg19.fa",
 *       }),
 *     ],
 *   });
 *
 * @param {{ baseUrl: string; fastaUrl: string }} options
 */

import { installMlContextMenu } from "./mlContextMenu.js";
import { setMlConfig } from "./mlConfig.js";

/**
 * @param {{ baseUrl: string; fastaUrl: string }} options
 */
export function mlPlugin(options) {
    if (!options.baseUrl) {
        throw new Error("mlPlugin requires a baseUrl");
    }
    if (!options.fastaUrl) {
        throw new Error("mlPlugin requires a fastaUrl");
    }

    return {
        name: "@genome-spy/ml-scoring",

        async install(/** @type {any} */ app) {
            setMlConfig({
                baseUrl: options.baseUrl,
                fastaUrl: options.fastaUrl,
            });
            const agentApi = await app.getAgentApi();
            /** @type {() => void} */
            let removeContextMenu = () => undefined;
            const removeAfterLaunch = app.onAfterLaunch(() => {
                const sampleView = app.getSampleView();
                if (!sampleView) {
                    throw new Error(
                        "mlPlugin requires a SampleView to register ML scoring actions."
                    );
                }
                removeContextMenu = installMlContextMenu(
                    sampleView,
                    agentApi,
                    options
                );
            });
            return () => {
                removeAfterLaunch();
                removeContextMenu();
            };
        },
    };
}
