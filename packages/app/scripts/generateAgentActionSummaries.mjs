import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sampleSlice } from "../src/sampleView/state/sampleSlice.js";
import { getActionInfo } from "../src/sampleView/state/actionInfo.js";
import templateResultToString from "../src/utils/templateResultToString.js";
import { createGeneratedActionCatalog } from "./generateAgentActionCatalog.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageDir, "..");

const outputPath = path.join(
    packageDir,
    "src",
    "agent",
    "generatedActionSummaries.json"
);

/**
 * @param {any} attribute
 * @returns {import("../src/sampleView/types.js").AttributeInfo}
 */
function createAttributeInfo(attribute) {
    const name =
        typeof attribute?.specifier === "string"
            ? attribute.specifier
            : "attribute";

    return {
        name,
        title: name,
        emphasizedName: name,
        attribute,
        accessor: () => undefined,
        valuesProvider: () => [],
        type: "nominal",
    };
}

/**
 * @returns {Promise<import("../src/agent/types.js").AgentActionSummary[]>}
 */
export async function createGeneratedActionSummaries() {
    const generatedActionCatalog = await createGeneratedActionCatalog();

    return generatedActionCatalog.map((entry) => {
        const action =
            sampleSlice.actions[
                /** @type {import("../src/agent/types.js").AgentActionType} */ (
                    entry.actionType
                )
            ](entry.examplePayload);
        const info = getActionInfo(action, createAttributeInfo);

        return {
            actionType: entry.actionType,
            title: templateResultToString(info?.title ?? entry.description),
            description: entry.description,
        };
    });
}

/**
 * @param {import("../src/agent/types.js").AgentActionSummary[]} generatedActionSummaries
 * @returns {string}
 */
export async function renderGeneratedActionSummaries(generatedActionSummaries) {
    return JSON.stringify(generatedActionSummaries, null, 2) + "\n";
}

/**
 * @returns {Promise<void>}
 */
export async function writeGeneratedActionSummaries() {
    const generatedActionSummaries = await createGeneratedActionSummaries();
    const output = await renderGeneratedActionSummaries(
        generatedActionSummaries
    );

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output);

    console.log("Wrote " + path.relative(repoRoot, outputPath));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
    await writeGeneratedActionSummaries();
}
