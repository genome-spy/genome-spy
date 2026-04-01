// @ts-check
import { describe, expect, it } from "vitest";
import {
    getViewWorkflowDefinition,
    listViewWorkflows,
} from "./viewWorkflowCatalog.js";

describe("viewWorkflowCatalog", () => {
    it("lists the supported view workflows", () => {
        expect(listViewWorkflows()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    workflowType: "deriveMetadataFromSelection",
                }),
                expect.objectContaining({
                    workflowType: "createBoxplotFromSelection",
                }),
            ])
        );
    });

    it("resolves workflow definitions by type", () => {
        expect(
            getViewWorkflowDefinition("deriveMetadataFromSelection")
        ).toEqual(
            expect.objectContaining({
                outputTargets: ["sample_metadata"],
            })
        );
    });
});
