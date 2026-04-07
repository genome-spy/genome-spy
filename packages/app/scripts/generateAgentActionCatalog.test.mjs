import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    createGeneratedActionCatalog,
    renderGeneratedActionCatalog,
} from "./generateAgentActionCatalog.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const outputPath = path.join(
    packageDir,
    "src",
    "agent",
    "generatedActionCatalog.json"
);

describe("generateAgentActionCatalog", () => {
    it("matches the committed generated catalog", async () => {
        const generatedActionCatalog = await createGeneratedActionCatalog();
        const expected = await renderGeneratedActionCatalog(
            generatedActionCatalog
        );
        const actual = await readFile(outputPath, "utf8");

        expect(actual).toBe(expected);
    });

    it("produces entries for the planner-facing actions", async () => {
        const generatedActionCatalog = await createGeneratedActionCatalog();

        expect(generatedActionCatalog.map((entry) => entry.actionType)).toEqual([
            "sampleView/sortBy",
            "sampleView/filterByNominal",
            "sampleView/filterByQuantitative",
            "sampleView/groupByNominal",
            "sampleView/groupToQuartiles",
            "sampleView/groupByThresholds",
            "sampleView/retainFirstNCategories",
            "paramProvenance/paramChange",
            "viewSettings/setVisibility",
            "viewSettings/restoreDefaultVisibility",
        ]);
    });
});
