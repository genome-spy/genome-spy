import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    createGeneratedActionSummaries,
    renderGeneratedActionSummaries,
} from "./generateAgentActionSummaries.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const outputPath = path.join(
    packageDir,
    "src",
    "agent",
    "generated",
    "generatedActionSummaries.json"
);

describe("generateAgentActionSummaries", () => {
    it("matches the committed generated action summaries", async () => {
        const generatedActionSummaries = await createGeneratedActionSummaries();
        const expected = await renderGeneratedActionSummaries(
            generatedActionSummaries
        );
        const actual = await readFile(outputPath, "utf8");

        expect(actual).toBe(expected);
    });

    it("produces one summary per planner-facing action", async () => {
        const generatedActionSummaries = await createGeneratedActionSummaries();

        expect(
            generatedActionSummaries.map((entry) => entry.actionType)
        ).toEqual([
            "sampleView/addMetadata",
            "sampleView/deriveMetadata",
            "sampleView/addMetadataFromSource",
            "sampleView/sortBy",
            "sampleView/retainFirstOfEach",
            "sampleView/retainFirstNCategories",
            "sampleView/filterByQuantitative",
            "sampleView/filterByNominal",
            "sampleView/removeUndefined",
            "sampleView/groupCustomCategories",
            "sampleView/groupByNominal",
            "sampleView/groupToQuartiles",
            "sampleView/groupByThresholds",
            "sampleView/removeGroup",
            "sampleView/retainMatched",
            "paramProvenance/paramChange",
        ]);
    });
});
