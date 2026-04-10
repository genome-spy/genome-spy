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
        const actionTypes = generatedActionCatalog.map((entry) => entry.actionType);

        expect(new Set(actionTypes).size).toBe(actionTypes.length);
        expect(actionTypes.every((actionType) => actionType.includes("/"))).toBe(
            true
        );
        expect(actionTypes).toContain("sampleView/sortBy");
        expect(actionTypes).toContain("paramProvenance/paramChange");
        expect(actionTypes).not.toContain("sampleView/setSamples");
    });
});
