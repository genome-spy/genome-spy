// @ts-nocheck
import { describe, expect, it } from "vitest";
import templateResultToString from "../utils/templateResultToString.js";
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

        expect(entries[0]).toEqual(
            expect.objectContaining({
                payloadDescription: expect.any(String),
                payloadFields: expect.any(Array),
            })
        );
    });

    it("provides action creators for supported actions", () => {
        const entry = getActionCatalogEntry("sampleView/sortBy");
        const action = entry.actionCreator({
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "age" },
        });

        expect(action.type).toBe("sampleView/sortBy");
    });

    it("provides action creators for supplemental actions", () => {
        expect(
            getActionCatalogEntry("paramProvenance/paramChange").actionCreator({
                selector: { scope: [], param: "brush" },
                value: {
                    type: "value",
                    value: 0.6,
                },
            }).type
        ).toBe("paramProvenance/paramChange");

        expect(
            getActionCatalogEntry("viewSettings/setVisibility").actionCreator({
                key: "cCREs",
                visibility: false,
            }).type
        ).toBe("viewSettings/setVisibility");

        expect(
            getActionCatalogEntry(
                "viewSettings/restoreDefaultVisibility"
            ).actionCreator("cCREs").type
        ).toBe("viewSettings/restoreDefaultVisibility");
    });

    it("exposes payload field metadata for quantitative filters", () => {
        const entry = getActionCatalogEntry("sampleView/filterByQuantitative");

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
});
