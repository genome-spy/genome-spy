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
    "generated",
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

    it("generates queryable type references for action payload fields", async () => {
        const catalog = await createGeneratedActionCatalog();

        const sortBy = catalog.find(
            (entry) => entry.actionType === "sampleView/sortBy"
        );
        expect(sortBy.payloadFields).toContainEqual(
            expect.objectContaining({
                name: "attribute",
                type: "AttributeIdentifier",
                typeRefs: ["AttributeIdentifier"],
            })
        );

        const deriveMetadata = catalog.find(
            (entry) => entry.actionType === "sampleView/deriveMetadata"
        );
        expect(deriveMetadata.payloadFields).toContainEqual(
            expect.objectContaining({
                name: "scale",
                type: 'SampleAttributeDef["scale"] | null',
                typeRefs: ["Scale"],
            })
        );

        const groupByThresholds = catalog.find(
            (entry) => entry.actionType === "sampleView/groupByThresholds"
        );
        expect(groupByThresholds.payloadFields).toContainEqual(
            expect.objectContaining({
                name: "thresholds",
                type: "[Threshold, ...Threshold[]]",
                typeRefs: ["Threshold"],
            })
        );
    });

    it("generates attribute kind constraints for attribute actions", async () => {
        const catalog = await createGeneratedActionCatalog();

        const groupByNominal = catalog.find(
            (entry) => entry.actionType === "sampleView/groupByNominal"
        );
        expect(groupByNominal.attributeKinds).toEqual(["nominal", "ordinal"]);

        const groupToQuartiles = catalog.find(
            (entry) => entry.actionType === "sampleView/groupToQuartiles"
        );
        expect(groupToQuartiles.attributeKinds).toEqual(["quantitative"]);
    });
});
