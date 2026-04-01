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
    "generatedActionSummaries.js"
);

describe("generateAgentActionSummaries", () => {
    it("matches the committed generated action summaries", async () => {
        const generatedActionSummaries = await createGeneratedActionSummaries();
        const expected = renderGeneratedActionSummaries(
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
            "sortBy",
            "filterByNominal",
            "filterByQuantitative",
            "groupByNominal",
            "groupToQuartiles",
            "groupByThresholds",
            "retainFirstNCategories",
        ]);
    });
});
