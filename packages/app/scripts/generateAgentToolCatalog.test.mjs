import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    createGeneratedToolCatalog,
    renderGeneratedToolCatalog,
} from "./generateAgentToolCatalog.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const outputPath = path.join(
    packageDir,
    "src",
    "agent",
    "generatedToolCatalog.json"
);

describe("generateAgentToolCatalog", () => {
    it("matches the committed generated catalog", async () => {
        const generatedToolCatalog = await createGeneratedToolCatalog();
        const expected = await renderGeneratedToolCatalog(generatedToolCatalog);
        const actual = await readFile(outputPath, "utf8");

        expect(actual).toBe(expected);
    });

    it("produces the planner-facing tool set", async () => {
        const generatedToolCatalog = await createGeneratedToolCatalog();
        const toolNames = generatedToolCatalog.map((entry) => entry.toolName);

        expect(toolNames).toEqual([
            "expandViewNode",
            "collapseViewNode",
            "setViewVisibility",
            "clearViewVisibility",
            "jumpToProvenanceState",
            "jumpToInitialProvenanceState",
            "resolveSelectionAggregationCandidate",
            "submitIntentProgram",
        ]);
        expect(new Set(toolNames).size).toBe(toolNames.length);
    });
});
