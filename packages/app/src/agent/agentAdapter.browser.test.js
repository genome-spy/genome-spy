// @ts-nocheck
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveParamSelectorMock } = vi.hoisted(() => ({
    resolveParamSelectorMock: vi.fn(),
}));

vi.mock("@genome-spy/core/view/viewSelectors.js", () => ({
    getParamSelector: (...args) => resolveParamSelectorMock(...args),
    getViewSelector: (view) => ({
        scope: [],
        view: view.explicitName ?? view.name,
    }),
    makeParamSelectorKey: (selector) => JSON.stringify(selector),
    resolveParamSelector: (root, selector) =>
        resolveParamSelectorMock(root, selector),
    isChromeView: () => false,
    visitAddressableViews: (root, visitor) => root.visit(visitor),
}));

import "../components/generic/messageDialog.js";
import "../components/dialogs/agentChoiceDialog.js";
import { createAgentAdapter } from "./agentAdapter.js";
import {
    clickDialogButton,
    createAgentBrowserApp,
    createVisualizationFixture,
    getDialogText,
    installDialogTestEnvironment,
    installPlannerMock,
    waitForDialog,
} from "./agentBrowserTestUtils.js";

describe("agentAdapter browser integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
        installDialogTestEnvironment();
        globalThis.window = /** @type {any} */ ({
            ...window,
            prompt: vi.fn(),
            __genomeSpyApp: {
                recordAgentTrace: vi.fn(),
            },
        });
    });

    it("executes an intent program through the real confirmation dialog flow", async () => {
        const fixture = createVisualizationFixture();
        const app = createAgentBrowserApp({ fixture });
        resolveParamSelectorMock.mockImplementation((root) => ({
            view: root.__resolvedParamView,
        }));

        const prompt = "Organize samples using a metadata workflow.";
        window.prompt.mockReturnValueOnce(prompt);
        const planner = installPlannerMock([
            {
                type: "intent_program",
                program: {
                    schemaVersion: 1,
                    steps: [
                        {
                            actionType: "sampleView/sortBy",
                            payload: {
                                attribute: {
                                    type: "SAMPLE_ATTRIBUTE",
                                    specifier: "groupLabel",
                                },
                            },
                        },
                    ],
                },
            },
        ]);

        const adapter = createAgentAdapter(app);
        const runPromise = adapter.runLocalPrompt();

        const confirmationDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(confirmationDialog)).toContain(
            "Sort by groupLabel"
        );
        await clickDialogButton(confirmationDialog, "OK");

        const executionDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(executionDialog)).toContain("Executed 1 action");
        await clickDialogButton(executionDialog, "Close");

        await runPromise;

        expect(planner.fetchMock).toHaveBeenCalledTimes(1);
        expect(planner.requests[0].body.message).toBe(prompt);
        expect(
            planner.requests[0].body.context.selectionAggregation.fields
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    field: "signalValue",
                }),
            ])
        );
        expect(app.intentPipeline.submit).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit.mock.calls[0][0]).toEqual([
            expect.objectContaining({
                type: "sampleView/sortBy",
            }),
        ]);
    });

    it("posts a stable planner request body shape to /v1/plan", async () => {
        const fixture = createVisualizationFixture();
        const app = createAgentBrowserApp({ fixture });
        resolveParamSelectorMock.mockImplementation((root) => ({
            view: root.__resolvedParamView,
        }));

        const prompt = "Show the available actions.";
        window.prompt.mockReturnValueOnce(prompt);
        const planner = installPlannerMock([
            {
                type: "answer",
                message: "OK",
            },
        ]);

        const adapter = createAgentAdapter(app);
        const runPromise = adapter.runLocalPrompt();

        const responseDialog = await waitForDialog("gs-message-dialog");
        await clickDialogButton(responseDialog, "Close");

        await runPromise;

        expect(planner.requests).toHaveLength(1);
        expect(planner.requests[0].url).toBe("http://127.0.0.1:8000/v1/plan");
        expect(planner.requests[0].body).toMatchObject({
            message: prompt,
            history: [],
            context: expect.objectContaining({
                schemaVersion: 1,
                sampleSummary: expect.objectContaining({
                    sampleCount: expect.any(Number),
                    groupCount: expect.any(Number),
                }),
                sampleGroupLevels: expect.any(Array),
                viewRoot: expect.objectContaining({
                    selector: expect.objectContaining({
                        scope: expect.any(Array),
                        view: expect.any(String),
                    }),
                }),
                attributes: expect.any(Array),
                actionCatalog: expect.any(Array),
                selectionAggregation: expect.objectContaining({
                    fields: expect.any(Array),
                }),
                provenance: expect.any(Array),
                lifecycle: expect.objectContaining({
                    appInitialized: true,
                }),
            }),
        });
        expect(planner.requests[0].body.context).not.toHaveProperty("view");
        expect(planner.requests[0].body.context).not.toHaveProperty("viewTree");
        expect(planner.requests[0].body.context).not.toHaveProperty("params");
    });

    it("shows planner clarifications in the real message dialog without executing actions", async () => {
        const app = createAgentBrowserApp();
        resolveParamSelectorMock.mockImplementation((root) => ({
            view: root.__resolvedParamView,
        }));

        window.prompt.mockReturnValueOnce("Help me with the current view.");
        const planner = installPlannerMock([
            {
                type: "clarify",
                message: "Please choose a more specific workflow.",
            },
        ]);

        const adapter = createAgentAdapter(app);
        const runPromise = adapter.runLocalPrompt();

        const clarificationDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(clarificationDialog)).toContain(
            "Please choose a more specific workflow."
        );
        await clickDialogButton(clarificationDialog, "Close");

        await runPromise;

        expect(planner.fetchMock).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit).not.toHaveBeenCalled();
    });

    it("executes a mixed agent_program in order through the real browser flow", async () => {
        const fixture = createVisualizationFixture({
            intervalFields: [
                {
                    view: "trackOne",
                    title: "Track One",
                    field: "signalA",
                    dataType: "quantitative",
                },
            ],
        });
        const app = createAgentBrowserApp({ fixture });
        resolveParamSelectorMock.mockImplementation((root) => ({
            view: root.__resolvedParamView,
        }));

        window.prompt.mockReturnValueOnce(
            "sort by age, group by cohort and derive metadata from the selected interval"
        );
        const planner = installPlannerMock([
            {
                type: "agent_program",
                program: {
                    schemaVersion: 1,
                    steps: [
                        {
                            type: "intent_program",
                            program: {
                                schemaVersion: 1,
                                steps: [
                                    {
                                        actionType: "sampleView/sortBy",
                                        payload: {
                                            attribute: {
                                                type: "SAMPLE_ATTRIBUTE",
                                                specifier: "groupLabel",
                                            },
                                        },
                                    },
                                    {
                                        actionType: "sampleView/groupByNominal",
                                        payload: {
                                            attribute: {
                                                type: "SAMPLE_ATTRIBUTE",
                                                specifier: "categoryLabel",
                                            },
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
        ]);

        const adapter = createAgentAdapter(app);
        const runPromise = adapter.runLocalPrompt();

        const confirmationDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(confirmationDialog)).toContain(
            "Sort by groupLabel"
        );
        expect(getDialogText(confirmationDialog)).toContain(
            "Group by categoryLabel"
        );
        await clickDialogButton(confirmationDialog, "OK");

        const executionDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(executionDialog)).toContain("Executed 2 actions.");
        await clickDialogButton(executionDialog, "Close");

        await runPromise;

        expect(planner.fetchMock).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit).toHaveBeenCalledTimes(1);
    });
});
