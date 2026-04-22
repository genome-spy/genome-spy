import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGeneratedActionCatalog } from "./generateAgentActionCatalog.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageDir, "..");

const outputPath = path.join(
    packageDir,
    "src",
    "agent",
    "generated",
    "generatedActionTypes.ts"
);

/**
 * @param {import("../src/agent/types.js").AgentActionCatalogEntry[]} catalog
 * @returns {string}
 */
export function renderGeneratedActionTypes(catalog) {
    const imports = [
        "import type {",
        "    AddMetadataFromSource,",
        "    DeriveMetadata,",
        "    FilterByNominal,",
        "    FilterByQuantitative,",
        "    GroupByNominal,",
        "    GroupByThresholds,",
        "    GroupCustom,",
        "    GroupToQuartiles,",
        "    ParamProvenanceEntry,",
        "    RemoveGroup,",
        "    RemoveUndefined,",
        "    RetainFirstNCategories,",
        "    RetainFirstOfEach,",
        "    RetainMatched,",
        "    SetMetadata,",
        "    SortBy,",
        '} from "@genome-spy/app";',
    ];

    const stepVariants = catalog
        .map((entry) => {
            return [
                "    | {",
                `          actionType: "${entry.actionType}";`,
                `          payload: ${entry.payloadType};`,
                "      }",
            ].join("\n");
        })
        .join("\n");

    return [
        "/**",
        " * This file is generated. Do not edit.",
        " */",
        ...imports,
        "",
        "export type AgentIntentBatchStep =",
        stepVariants + ";",
        "",
        "export type AgentActionType = AgentIntentBatchStep[\"actionType\"];",
        "",
    ].join("\n");
}

/**
 * @returns {Promise<void>}
 */
export async function writeGeneratedActionTypes() {
    const catalog = await createGeneratedActionCatalog();
    const output = renderGeneratedActionTypes(catalog);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output);

    console.log("Wrote " + path.relative(repoRoot, outputPath));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
    await writeGeneratedActionTypes();
}
