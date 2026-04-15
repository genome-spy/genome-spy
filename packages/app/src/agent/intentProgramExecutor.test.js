// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import {
    submitIntentActions,
    summarizeExecutionResult,
} from "./intentProgramExecutor.js";

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
            sampleHierarchy: {
                groupMetadata: [
                    {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "diagnosis",
                        },
                    },
                ],
                rootGroup: {
                    name: "ROOT",
                    title: "Root",
                    samples: ["sampleA", "sampleB"],
                    groups: [
                        {
                            name: "group",
                            title: "Group",
                            samples: ["sampleA", "sampleB"],
                        },
                    ],
                },
            },
            compositeAttributeInfoSource: {
                getAttributeInfo,
            },
        }),
        provenance: {
            getActionHistory: vi.fn(() => []),
            getActionInfo: vi.fn((action) => ({
                title:
                    action.type === "sampleView/sortBy"
                        ? "Sort by age"
                        : action.type === "sampleView/groupByNominal"
                          ? "Group by diagnosis"
                          : "Test action",
                provenanceTitle:
                    action.type === "sampleView/sortBy"
                        ? "Sort by age"
                        : action.type === "sampleView/groupByNominal"
                          ? "Group by diagnosis"
                          : "Test action",
            })),
        },
        intentPipeline: {
            submit: vi.fn(() => Promise.resolve()),
        },
    };
}

describe("submitIntentActions", () => {
    it("submits validated steps through the intent pipeline", async () => {
        const app = createAppStub();

        const result = await submitIntentActions(app, {
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
                {
                    actionType: "sampleView/groupByNominal",
                    payload: {
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "diagnosis",
                        },
                    },
                },
            ],
        });

        expect(app.intentPipeline.submit).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({
                getAttributeInfo: expect.any(Function),
                submissionKind: "agent",
            })
        );
        expect(result.executedActions).toBe(2);
        expect(result.content).toEqual(
            expect.objectContaining({
                kind: "intent_batch_result",
                provenanceIds: [],
                batch: expect.objectContaining({
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
                        {
                            actionType: "sampleView/groupByNominal",
                            payload: {
                                attribute: {
                                    type: "SAMPLE_ATTRIBUTE",
                                    specifier: "diagnosis",
                                },
                            },
                        },
                    ],
                }),
                sampleView: {
                    visibleSamplesBefore: 2,
                    visibleSamplesAfter: 2,
                    groupLevelsBefore: 1,
                    groupLevelsAfter: 1,
                },
            })
        );
        expect(result.summaries).toEqual([
            expect.objectContaining({
                text: "Sort by age",
            }),
            expect.objectContaining({
                text: "Group by diagnosis",
            }),
            expect.objectContaining({
                text: "Visible samples before: 2",
            }),
            expect.objectContaining({
                text: "Visible samples after: 2",
            }),
            expect.objectContaining({
                text: "Group levels before: 1",
            }),
            expect.objectContaining({
                text: "Group levels after: 1",
            }),
        ]);
        expect(summarizeExecutionResult(result)).toContain(
            "Executed 2 actions."
        );
        expect(summarizeExecutionResult(result)).toContain(
            "Visible samples before: 2"
        );
        expect(summarizeExecutionResult(result)).toContain(
            "Visible samples after: 2"
        );
        expect(summarizeExecutionResult(result)).toContain(
            "Group levels before: 1"
        );
        expect(summarizeExecutionResult(result)).toContain(
            "Group levels after: 1"
        );
    });
});
