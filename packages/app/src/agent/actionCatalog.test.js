// @ts-check
import { describe, expect, it } from "vitest";
import {
    getActionCatalogEntry,
    listAgentActions,
    summarizeIntentProgram,
} from "./actionCatalog.js";

function createAppStub() {
    const getAttributeInfo = (attribute) => ({
        name: String(attribute.specifier),
        attribute,
        title: String(attribute.specifier),
        emphasizedName: String(attribute.specifier),
        accessor: () => undefined,
        valuesProvider: () => [],
        type: "nominal",
    });

    return {
        getSampleView: () => ({
            compositeAttributeInfoSource: {
                getAttributeInfo,
            },
        }),
    };
}

describe("actionCatalog", () => {
    it("lists the supported agent actions", () => {
        const entries = listAgentActions();

        expect(entries.map((entry) => entry.actionType)).toEqual([
            "sortBy",
            "filterByNominal",
            "filterByQuantitative",
            "groupByNominal",
            "groupToQuartiles",
            "groupByThresholds",
            "retainFirstNCategories",
        ]);

        expect(entries[0]).toEqual(
            expect.objectContaining({
                payloadDescription: expect.any(String),
                payloadFields: expect.any(Array),
            })
        );
    });

    it("provides action creators for supported actions", () => {
        const entry = getActionCatalogEntry("sortBy");
        const action = entry.actionCreator({
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "age" },
        });

        expect(action.type).toBe("sampleView/sortBy");
    });

    it("exposes payload field metadata for quantitative filters", () => {
        const entry = getActionCatalogEntry("filterByQuantitative");

        expect(entry.payloadDescription).toContain("quantitative attribute");
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
    });

    it("summarizes programs using action titles", () => {
        const summaries = summarizeIntentProgram(createAppStub(), {
            schemaVersion: 1,
            steps: [
                {
                    actionType: "sortBy",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "age",
                        },
                    },
                },
            ],
        });

        expect(summaries).toEqual(["Sort by age"]);
    });
});
