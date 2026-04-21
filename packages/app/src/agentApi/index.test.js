import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentApi } from "./index.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";
import { makeViewSelectorKey } from "../viewSettingsUtils.js";

describe("createAgentApi", () => {
    let app;

    beforeEach(() => {
        const sampleAttributeInfo = {
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "age",
            },
            title: "Age",
            description: "Age in years",
            type: "quantitative",
        };

        app = {
            rootSpec: {
                genomes: {
                    hg38: {},
                },
                assembly: "hg38",
            },
            genomeSpy: {
                viewRoot: { id: "root-view" },
                getSearchableViews: vi.fn(() => ["searchable-view"]),
            },
            getSampleView: vi.fn(() => ({
                sampleHierarchy: { id: "sample-hierarchy" },
                compositeAttributeInfoSource: {
                    getAttributeInfo: vi.fn(() => sampleAttributeInfo),
                },
                paramRuntime: {
                    paramConfigs: new Map([
                        ["selection", { description: "Selection" }],
                    ]),
                },
            })),
            provenance: {
                getActionHistory: vi.fn(() => [{ provenanceId: "p1" }]),
                getActionInfo: vi.fn(() => ({
                    provenanceTitle: "Provenance label",
                    title: "Fallback label",
                })),
                getPresentState: vi.fn(() => ({ present: true })),
                getCurrentIndex: vi.fn(() => 1),
                activateState: vi.fn(),
                activateInitialState: vi.fn(),
            },
            intentPipeline: {
                submit: vi.fn(async () => undefined),
            },
            store: {
                dispatch: vi.fn(),
            },
        };
    });

    it("exposes the bound sample and provenance handles", async () => {
        const agentApi = createAgentApi(app);

        expect(agentApi.getSampleHierarchy()).toEqual({
            id: "sample-hierarchy",
        });
        expect(
            agentApi.getAttributeInfo({
                type: "SAMPLE_ATTRIBUTE",
                specifier: "age",
            })
        ).toEqual(
            expect.objectContaining({
                title: "Age",
                description: "Age in years",
                type: "quantitative",
            })
        );
        expect(agentApi.getSampleViewScopedParamConfig("selection")).toEqual({
            description: "Selection",
        });
        expect(agentApi.getSearchableViews()).toEqual(["searchable-view"]);
        expect(agentApi.getViewRoot()).toEqual({ id: "root-view" });
        expect(agentApi.getFocusedView()).toEqual(
            expect.objectContaining({
                sampleHierarchy: { id: "sample-hierarchy" },
                compositeAttributeInfoSource: expect.objectContaining({
                    getAttributeInfo: expect.any(Function),
                }),
                paramRuntime: expect.objectContaining({
                    paramConfigs: new Map([
                        ["selection", { description: "Selection" }],
                    ]),
                }),
            })
        );
        expect(agentApi.getRootSpec()).toEqual({
            genomes: {
                hg38: {},
            },
            assembly: "hg38",
        });

        const agentApiWithoutRoot = createAgentApi({
            ...app,
            genomeSpy: {
                ...app.genomeSpy,
                viewRoot: undefined,
            },
        });
        expect(
            agentApiWithoutRoot.resolveViewSelector({
                type: "unit",
                view: [],
            })
        ).toBeUndefined();
        expect(agentApi.getActionHistory()).toEqual([{ provenanceId: "p1" }]);
        expect(
            agentApi.getActionInfo({ provenanceId: "p1", type: "sample/x" })
        ).toEqual({
            provenanceTitle: "Provenance label",
            title: "Fallback label",
        });
        await expect(
            agentApi.submitIntentActions([], {
                submissionKind: "agent",
            })
        ).resolves.toBeUndefined();
        expect(app.intentPipeline.submit).toHaveBeenCalledWith([], {
            submissionKind: "agent",
        });
        expect(agentApi.getPresentProvenanceState()).toEqual({ present: true });
    });

    it("forwards mutation and UI hooks to the app shell", () => {
        const agentApi = createAgentApi(app);
        const selector = { view: ["root"], type: "unit" };

        agentApi.setViewVisibility(selector, true);
        expect(app.store.dispatch).toHaveBeenCalledWith(
            viewSettingsSlice.actions.setVisibility({
                key: makeViewSelectorKey(selector),
                visibility: true,
            })
        );

        expect(agentApi.jumpToProvenanceState("p2")).toBe(false);
        expect(app.provenance.activateState).toHaveBeenCalledWith("p2");
        expect(agentApi.jumpToInitialProvenanceState()).toBe(false);
        expect(app.provenance.activateInitialState).toHaveBeenCalledTimes(1);
    });
});
