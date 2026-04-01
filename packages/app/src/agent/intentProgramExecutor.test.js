// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import {
    submitIntentProgram,
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
            compositeAttributeInfoSource: {
                getAttributeInfo,
            },
        }),
        intentPipeline: {
            submit: vi.fn(() => Promise.resolve()),
        },
    };
}

describe("submitIntentProgram", () => {
    it("submits validated steps through the intent pipeline", async () => {
        const app = createAppStub();

        const result = await submitIntentProgram(app, {
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
                {
                    actionType: "groupByNominal",
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
        expect(result.executedActions).toBe(2);
        expect(summarizeExecutionResult(result)).toContain(
            "Executed 2 actions."
        );
    });
});
