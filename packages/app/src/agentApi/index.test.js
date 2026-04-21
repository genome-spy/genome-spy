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
            appContainer: {},
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
                getPresentState: vi.fn(() => ({ present: true })),
                getCurrentIndex: vi.fn(() => 1),
                activateState: vi.fn(),
                activateInitialState: vi.fn(),
            },
            store: {
                dispatch: vi.fn(),
            },
        };
    });

    it("exposes the bound sample and provenance handles", () => {
        const agentApi = createAgentApi(app);

        expect(agentApi.getSampleHierarchy()).toEqual({
            id: "sample-hierarchy",
        });
        expect(
            agentApi.getSampleAttributeInfo({
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
        expect(agentApi.getSampleParamConfig("selection")).toEqual({
            description: "Selection",
        });
        expect(agentApi.getSearchableViews()).toEqual(["searchable-view"]);
        expect(agentApi.getViewRoot()).toEqual({ id: "root-view" });

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
        expect(agentApi.getPresentProvenanceState()).toEqual({ present: true });
        expect(agentApi.getAppContainer()).toBe(app.appContainer);
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
