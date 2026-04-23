// @ts-nocheck
import { describe, expect, it } from "vitest";
import templateResultToString from "../../../app/src/utils/templateResultToString.js";
import generatedActionCatalog from "./generated/generatedActionCatalog.json" with { type: "json" };
import {
    getActionCatalogEntry,
    listAgentActions,
    listAgentIntentActionSummaries,
    summarizeProvenanceActions,
    summarizeIntentBatch,
} from "./actionCatalog.js";

const paramProvenanceSlice = {
    actions: {
        paramChange: (payload) => ({
            type: "paramProvenance/paramChange",
            payload,
        }),
    },
};

function createAppStub() {
    return {
        getActionInfo(action) {
            return this.provenance.getActionInfo(action);
        },
        provenance: {
            getActionInfo: (action) => {
                if (action.type === "sampleView/sortBy") {
                    return {
                        title: "Sort by age",
                    };
                }

                if (action.type === "paramProvenance/paramChange") {
                    return {
                        title: "Set brush = 0.5 in Overview",
                    };
                }

                return undefined;
            },
        },
    };
}

describe("actionCatalog", () => {
    it("lists the generated agent actions", () => {
        const entries = listAgentActions();

        expect(entries.map((entry) => entry.actionType)).toEqual(
            generatedActionCatalog.map((entry) => entry.actionType)
        );

        expect(entries[0]).toEqual(
            expect.objectContaining({
                payloadFields: expect.any(Array),
            })
        );
    });

    it("lists compact intent action summaries for agent context", () => {
        const entries = listAgentIntentActionSummaries();

        expect(entries.map((entry) => entry.actionType)).toEqual(
            generatedActionCatalog.map((entry) => entry.actionType)
        );
        expect(entries[0]).toEqual({
            actionType: generatedActionCatalog[0].actionType,
            description: generatedActionCatalog[0].description,
        });
        expect(entries[0]).not.toHaveProperty("title");
        expect(entries[0]).not.toHaveProperty("payloadFields");
        expect(entries[0]).not.toHaveProperty("examplePayload");
    });

    it("provides action creators for supported actions", () => {
        const entry = getActionCatalogEntry("sampleView/sortBy");
        const action = entry.actionCreator({
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "age" },
        });

        expect(action.type).toBe("sampleView/sortBy");
    });

    it("provides action creators for provenance actions", () => {
        expect(
            getActionCatalogEntry("paramProvenance/paramChange").actionCreator({
                selector: { scope: [], param: "brush" },
                value: {
                    type: "value",
                    value: 0.6,
                },
            }).type
        ).toBe("paramProvenance/paramChange");
    });

    it("exposes payload field metadata for quantitative filters", () => {
        const entry = getActionCatalogEntry("sampleView/filterByQuantitative");

        expect(entry.description).toContain("quantitative value");
        expect(entry.usage).toBe(
            "Use this for numeric filters such as values greater than, less than, or equal to a chosen threshold."
        );
        expect(entry.payloadFields).toEqual([
            expect.objectContaining({
                name: "attribute",
                type: "AttributeIdentifier",
                required: true,
            }),
            expect.objectContaining({
                name: "operator",
                required: true,
            }),
            expect.objectContaining({
                name: "operand",
                required: true,
            }),
        ]);
        expect(entry.examples).toEqual([
            {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "purity",
                },
                operator: "gte",
                operand: 0.6,
            },
        ]);
    });

    it("summarizes batches using action titles", () => {
        const summaries = summarizeIntentBatch(createAppStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "sampleView/sortBy",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "age",
                        },
                    },
                },
            ],
        });

        expect(summaries).toEqual([
            expect.objectContaining({
                text: "Sort by age",
            }),
        ]);
        expect(templateResultToString(summaries[0].content)).toBe(
            "Sort by age"
        );
    });

    it("summarizes provenance actions using the provenance formatter", () => {
        const action = paramProvenanceSlice.actions.paramChange({
            selector: { scope: [], param: "brush" },
            value: {
                type: "value",
                value: 0.5,
            },
        });

        const summaries = summarizeProvenanceActions(createAppStub(), [action]);

        expect(summaries).toEqual([
            expect.objectContaining({
                text: "Set brush = 0.5 in Overview",
            }),
        ]);
    });
});
