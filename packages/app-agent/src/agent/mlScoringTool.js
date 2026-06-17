import { ToolCallRejectionError } from "./agentToolErrors.js";
import { getMlConfig } from "../ml/mlConfig.js";
import { collectBrushVariants } from "../ml/mlVariantCollector.js";
import { runAlphaGenomeFlow, runEvo2Flow } from "../ml/mlScoring.js";

const DEFAULT_HEADS = ["atac", "dnase", "cage"];

/**
 * @param {import("./agentTools.js").AgentToolRuntime} runtime
 * @param {import("./agentToolInputs.d.ts").ScoreVariantsWithMlToolInput} input
 * @returns {Promise<import("./agentTools.js").AgentToolExecutionResult>}
 */
export async function scoreVariantsWithMlTool(runtime, input) {
    const config = getMlConfig();
    if (!config) {
        throw new ToolCallRejectionError(
            "ML scoring is not configured. The mlPlugin must be active with a baseUrl and fastaUrl."
        );
    }

    const collection = collectBrushVariants(runtime.agentApi);
    if (!collection) {
        throw new ToolCallRejectionError(
            "No active genomic brush with SNVs found. Set a brush on the genomic view first."
        );
    }

    if (input.model === "alphagenome") {
        const heads = input.heads ?? DEFAULT_HEADS;
        const result = await runAlphaGenomeFlow(
            runtime.agentApi,
            config,
            collection,
            heads,
            {
                submissionKind: "agent",
            }
        );
        const n = result.n;
        const colNames = result.colNames.join(", ");
        return {
            text: `Scored ${n} SNV${n !== 1 ? "s" : ""} with AlphaGenome. Added ${heads.length} column${heads.length !== 1 ? "s" : ""}: ${colNames}.`,
        };
    } else if (input.model === "evo2") {
        const result = await runEvo2Flow(runtime.agentApi, config, collection, {
            submissionKind: "agent",
        });
        const n = result.n;
        return {
            text: `Scored ${n} SNV${n !== 1 ? "s" : ""} with Evo2. Added ev2_delta_max column.`,
        };
    } else {
        throw new ToolCallRejectionError(
            `Unknown model "${input.model}". Valid values: "alphagenome", "evo2".`
        );
    }
}
