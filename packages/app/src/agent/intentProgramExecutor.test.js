// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import {
    submitIntentActions,
    summarizeExecutionResult,
} from "./intentProgramExecutor.js";

function createAgentApiStub() {
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
        getSampleHierarchy: () => ({
            sampleData: {
                ids: ["sampleA", "sampleB"],
            },
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
            sampleMetadata: {
                entities: {
                    sampleA: { diagnosis: "A" },
                    sampleB: { diagnosis: "B" },
                },
            },
        }),
        getAttributeInfo,
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
        submitIntentActions: vi.fn(() => Promise.resolve()),
        getPresentProvenanceState: () => ({}),
    };
}

describe("submitIntentActions", () => {
    it("submits validated steps through the intent pipeline", async () => {
        const agentApi = createAgentApiStub();

        const result = await submitIntentActions(agentApi, {
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

        expect(agentApi.submitIntentActions).toHaveBeenCalledTimes(1);
        expect(agentApi.submitIntentActions).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({
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
