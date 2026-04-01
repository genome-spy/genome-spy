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
    "generatedActionCatalog.js"
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
