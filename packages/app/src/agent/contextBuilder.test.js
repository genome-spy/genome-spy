// @ts-check
import { describe, expect, it } from "vitest";
import { getAgentContext } from "./contextBuilder.js";

function createAppStub() {
    const getAttributeInfo = (attribute) => ({
        name: String(attribute.specifier),
        attribute,
        title: "Title " + String(attribute.specifier),
        emphasizedName: String(attribute.specifier),
        accessor: () => undefined,
        valuesProvider: () => [],
        type: attribute.specifier === "purity" ? "quantitative" : "nominal",
    });

    const sampleView = {
        name: "samples",
        getTitleText: () => "Patient Cohort",
        compositeAttributeInfoSource: {
            getAttributeInfo,
        },
    };

    return {
        getSampleView: () => sampleView,
        store: {
            getState: () => ({
                lifecycle: {
                    appInitialized: true,
                },
            }),
        },
        provenance: {
            getPresentState: () => ({
                sampleView: {
                    sampleData: {
                        ids: ["s1", "s2"],
                    },
                    sampleMetadata: {
                        attributeNames: ["diagnosis", "purity"],
                        attributeDefs: {
                            diagnosis: { visible: true },
                            purity: { visible: false },
                        },
                    },
                    rootGroup: {
                        name: "ROOT",
                        groups: [{ name: "A", samples: ["s1", "s2"] }],
                    },
                },
                paramProvenance: {
                    entries: {
                        brush: {
                            selector: { param: "brush", scope: ["samples"] },
                            value: { type: "interval", value: [0, 1] },
                        },
                    },
                },
            }),
            getBookmarkableActionHistory: () => [],
            getActionInfo: () => undefined,
        },
    };
}

describe("getAgentContext", () => {
    it("keeps the planner context wire shape stable", () => {
        const context = getAgentContext(createAppStub());

        expect(Object.keys(context).sort()).toEqual([
            "actionCatalog",
            "actionSummaries",
            "attributes",
            "lifecycle",
            "params",
            "provenance",
            "schemaVersion",
            "view",
            "viewWorkflows",
        ]);

        expect(() => JSON.stringify(context)).not.toThrow();
        expect(
            context.actionSummaries.map((entry) => entry.actionType)
        ).toEqual(context.actionCatalog.map((entry) => entry.actionType));
    });

    it("builds a compact agent context from app state", () => {
        const context = getAgentContext(createAppStub());

        expect(context.schemaVersion).toBe(1);
        expect(context.view.sampleCount).toBe(2);
        expect(context.attributes).toHaveLength(2);
        expect(context.attributes[0].id).toEqual({
            type: "SAMPLE_ATTRIBUTE",
            specifier: "diagnosis",
        });
        expect(context.actionSummaries).toHaveLength(7);
        expect(context.params).toHaveLength(1);
        expect(context.actionCatalog.length).toBeGreaterThan(0);
        expect(context.viewWorkflows.workflows).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    workflowType: "deriveMetadataFromSelection",
                }),
                expect.objectContaining({
                    workflowType: "createBoxplotFromSelection",
                }),
            ])
        );
        expect(context.viewWorkflows.selections).toHaveLength(1);
    });
});
