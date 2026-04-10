// @ts-nocheck
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveParamSelectorMock } = vi.hoisted(() => ({
    resolveParamSelectorMock: vi.fn(),
}));
const { showHierarchyBoxplotDialog } = vi.hoisted(() => ({
    showHierarchyBoxplotDialog: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock("@genome-spy/core/view/viewSelectors.js", () => ({
    getParamSelector: (...args) => resolveParamSelectorMock(...args),
    getViewSelector: (view) => ({
        scope: [],
        view: view.explicitName ?? view.name,
    }),
    resolveParamSelector: (root, selector) =>
        resolveParamSelectorMock(root, selector),
    isChromeView: () => false,
    visitAddressableViews: (root, visitor) => root.visit(visitor),
}));

vi.mock("../charts/hierarchyBoxplotDialog.js", () => ({
    __esModule: true,
    default: showHierarchyBoxplotDialog,
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
    setDialogSelectValue,
    waitForDialog,
} from "./agentBrowserTestUtils.js";
import { createFieldId } from "./selectionAggregationContext.js";

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
                    selections: expect.any(Array),
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
        expect(
            planner.requests[0].body.context.selectionAggregation
        ).toHaveProperty("selections");
    });

    it("runs a structured selection aggregation and clarifies the missing field using the real choice dialog", async () => {
        const fixture = createVisualizationFixture({
            intervalFields: [
                {
                    view: "trackOne",
                    title: "Track One",
                    field: "signalA",
                    dataType: "quantitative",
                },
                {
                    view: "trackOne",
                    title: "Track One",
                    field: "signalB",
                    dataType: "quantitative",
                },
            ],
        });
        const app = createAgentBrowserApp({ fixture });
        resolveParamSelectorMock.mockImplementation((root) => ({
            view: root.__resolvedParamView,
        }));

        window.prompt.mockReturnValueOnce(
            "Create derived metadata from the active selection."
        );
        const planner = installPlannerMock([
            {
                type: "selection_aggregation",
                workflow: {
                    workflowType: "deriveMetadataFromSelection",
                    aggregation: "weightedMean",
                },
            },
        ]);

        const adapter = createAgentAdapter(app);
        const runPromise = adapter.runLocalPrompt();

        const choiceDialog = await waitForDialog("gs-agent-choice-dialog");
        expect(getDialogText(choiceDialog)).toContain("signalA (Track One)");
        expect(getDialogText(choiceDialog)).toContain("signalB (Track One)");

        await setDialogSelectValue(
            choiceDialog,
            createFieldId(
                JSON.stringify({ scope: [], param: "brush" }),
                "trackOne",
                "signalA"
            )
        );
        await clickDialogButton(choiceDialog, "OK");

        const confirmationDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(confirmationDialog)).toContain("weightedMean");
        await clickDialogButton(confirmationDialog, "OK");

        const executionDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(executionDialog)).toContain("Executed 1 action");
        await clickDialogButton(executionDialog, "Close");

        await runPromise;

        expect(planner.fetchMock).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit.mock.calls[0][0]).toEqual([
            expect.objectContaining({
                type: "sampleView/deriveMetadata",
                payload: expect.objectContaining({
                    attribute: expect.objectContaining({
                        specifier: expect.objectContaining({
                            field: "signalA",
                            aggregation: { op: "weightedMean" },
                        }),
                    }),
                }),
            }),
        ]);
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

    it("upgrades vague planner field clarifications into a grounded local workflow continuation", async () => {
        const fixture = createVisualizationFixture({
            intervalFields: [
                {
                    view: "trackOne",
                    title: "Track One",
                    field: "signalA",
                    dataType: "quantitative",
                },
                {
                    view: "trackOne",
                    title: "Track One",
                    field: "signalB",
                    dataType: "quantitative",
                },
            ],
        });
        const app = createAgentBrowserApp({ fixture });
        resolveParamSelectorMock.mockImplementation((root) => ({
            view: root.__resolvedParamView,
        }));

        window.prompt.mockReturnValueOnce(
            "Compute an aggregate over the current selection and store it in metadata."
        );
        const planner = installPlannerMock([
            {
                type: "clarify",
                message:
                    "Please specify the visible quantitative field you'd like to derive a sample metadata attribute from.",
            },
        ]);

        const adapter = createAgentAdapter(app);
        const runPromise = adapter.runLocalPrompt();

        const choiceDialog = await waitForDialog("gs-agent-choice-dialog");
        expect(getDialogText(choiceDialog)).toContain(
            "Available options: signalA (Track One), signalB (Track One)."
        );
        await setDialogSelectValue(
            choiceDialog,
            createFieldId(
                JSON.stringify({ scope: [], param: "brush" }),
                "trackOne",
                "signalA"
            )
        );
        await clickDialogButton(choiceDialog, "OK");

        const aggregationDialog = await waitForDialog("gs-agent-choice-dialog");
        expect(getDialogText(aggregationDialog)).toContain(
            "Available options: count, min, max, weightedMean, variance."
        );
        await setDialogSelectValue(aggregationDialog, "weightedMean");
        await clickDialogButton(aggregationDialog, "OK");

        const confirmationDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(confirmationDialog)).toContain("weightedMean");
        await clickDialogButton(confirmationDialog, "OK");

        const executionDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(executionDialog)).toContain("Executed 1 action");
        await clickDialogButton(executionDialog, "Close");

        await runPromise;

        expect(planner.fetchMock).toHaveBeenCalledTimes(1);
    });

    it("continues locally after a vague aggregation clarification instead of re-asking the planner", async () => {
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
            "Use the current selection to create derived sample metadata from a visible quantitative field using weightedMean"
        );
        const planner = installPlannerMock([
            {
                type: "clarify",
                message:
                    "Please specify the aggregation you'd like to use for the derived sample metadata attribute.",
            },
        ]);

        const adapter = createAgentAdapter(app);
        const runPromise = adapter.runLocalPrompt();

        const aggregationDialog = await waitForDialog("gs-agent-choice-dialog");
        expect(getDialogText(aggregationDialog)).toContain(
            "Available options: count, min, max, weightedMean, variance."
        );
        await setDialogSelectValue(aggregationDialog, "weightedMean");
        await clickDialogButton(aggregationDialog, "OK");

        const confirmationDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(confirmationDialog)).toContain("weightedMean");
        await clickDialogButton(confirmationDialog, "OK");

        const executionDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(executionDialog)).toContain("Executed 1 action");
        await clickDialogButton(executionDialog, "Close");

        await runPromise;

        expect(planner.fetchMock).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit).toHaveBeenCalledTimes(1);
    });

    it("shows a deterministic error dialog when a selection aggregation needs a missing selection", async () => {
        const fixture = createVisualizationFixture({
            hasActiveSelection: false,
        });
        const app = createAgentBrowserApp({ fixture });
        resolveParamSelectorMock.mockImplementation((root) => ({
            view: root.__resolvedParamView,
        }));

        window.prompt.mockReturnValueOnce(
            "Create derived metadata from the current selection."
        );
        installPlannerMock([
            {
                type: "selection_aggregation",
                workflow: {
                    workflowType: "deriveMetadataFromSelection",
                    aggregation: "count",
                },
            },
        ]);

        const adapter = createAgentAdapter(app);
        const runPromise = adapter.runLocalPrompt();

        const errorDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(errorDialog)).toContain(
            "No active interval selection is available"
        );
        await clickDialogButton(errorDialog, "Close");

        await runPromise;

        expect(app.intentPipeline.submit).not.toHaveBeenCalled();
    });

    it("opens a boxplot dialog for a structured plot workflow", async () => {
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
            "Create a boxplot from the current selection."
        );
        const planner = installPlannerMock([
            {
                type: "selection_aggregation",
                workflow: {
                    workflowType: "createBoxplotFromSelection",
                    aggregation: "variance",
                },
            },
        ]);

        const adapter = createAgentAdapter(app);
        const runPromise = adapter.runLocalPrompt();

        const confirmationDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(confirmationDialog)).toContain(
            "Create a boxplot from variance(signalA)"
        );
        await clickDialogButton(confirmationDialog, "OK");

        await runPromise;

        expect(planner.fetchMock).toHaveBeenCalledTimes(1);
        expect(showHierarchyBoxplotDialog).toHaveBeenCalledTimes(1);
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
            "sort by age, group by cohort and create a boxplot over the selected interval"
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
                        {
                            type: "selection_aggregation",
                            workflow: {
                                workflowType: "createBoxplotFromSelection",
                                aggregation: "variance",
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
        expect(getDialogText(confirmationDialog)).toContain(
            "Create a boxplot from variance(signalA)"
        );
        await clickDialogButton(confirmationDialog, "OK");

        const executionDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(executionDialog)).toContain("Executed 2 steps.");
        await clickDialogButton(executionDialog, "Close");

        await runPromise;

        expect(planner.fetchMock).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit).toHaveBeenCalledTimes(1);
        expect(showHierarchyBoxplotDialog).toHaveBeenCalledTimes(1);
        expect(
            app.intentPipeline.submit.mock.invocationCallOrder[0]
        ).toBeLessThan(showHierarchyBoxplotDialog.mock.invocationCallOrder[0]);
    });

    it("continues a grounded planner clarification into the local boxplot workflow", async () => {
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
            "Create a boxplot from the active interval selection using a visible quantitative field and aggregation variance"
        );
        const planner = installPlannerMock([
            {
                type: "clarify",
                message:
                    "Please specify the visible quantitative field you'd like to use for the boxplot.",
            },
        ]);

        const adapter = createAgentAdapter(app);
        const runPromise = adapter.runLocalPrompt();

        const fieldDialog = await waitForDialog("gs-agent-choice-dialog");
        expect(getDialogText(fieldDialog)).toContain("signalA (Track One)");
        await setDialogSelectValue(
            fieldDialog,
            createFieldId(
                JSON.stringify({ scope: [], param: "brush" }),
                "trackOne",
                "signalA"
            )
        );
        await clickDialogButton(fieldDialog, "OK");

        const confirmationDialog = await waitForDialog("gs-message-dialog");
        expect(getDialogText(confirmationDialog)).toContain(
            "Create a boxplot from variance(signalA)"
        );
        await clickDialogButton(confirmationDialog, "OK");

        await runPromise;

        expect(planner.fetchMock).toHaveBeenCalledTimes(1);
        expect(showHierarchyBoxplotDialog).toHaveBeenCalledTimes(1);
        expect(app.intentPipeline.submit).not.toHaveBeenCalled();
    });
});
