// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest";
import { viewSettingsSlice } from "../viewSettingsSlice.js";
import { makeViewSelectorKey } from "../viewSettingsUtils.js";

const { getAgentContext, getAgentVolatileContext } = vi.hoisted(() => ({
    getAgentContext: vi.fn(() => ({ schemaVersion: 1 })),
    getAgentVolatileContext: vi.fn(() => ({
        selectionAggregation: {
            fields: [{ candidateId: "candidate-1" }],
        },
    })),
}));
const { resolveParamSelectorMock } = vi.hoisted(() => ({
    resolveParamSelectorMock: vi.fn(),
}));
const { resolveViewSelectorMock } = vi.hoisted(() => ({
    resolveViewSelectorMock: vi.fn(),
}));
const { getViewSelectorMock } = vi.hoisted(() => ({
    getViewSelectorMock: vi.fn((view) => ({
        scope: [],
        view: view.explicitName,
    })),
}));
const { visitAddressableViewsMock } = vi.hoisted(() => ({
    visitAddressableViewsMock: vi.fn((root, visitor) => {
        root.visit(visitor);
    }),
}));

vi.mock("./contextBuilder.js", () => ({
    getAgentContext,
}));

vi.mock("./volatileContextBuilder.js", () => ({
    getAgentVolatileContext,
}));

vi.mock("@genome-spy/core/view/viewSelectors.js", () => ({
    resolveParamSelector: resolveParamSelectorMock,
    resolveViewSelector: resolveViewSelectorMock,
    getViewSelector: getViewSelectorMock,
    makeParamSelectorKey: (selector) => JSON.stringify(selector),
    visitAddressableViews: visitAddressableViewsMock,
}));

import { createAgentAdapter } from "./agentAdapter.js";
import { getAgentState } from "./agentState.js";

function createResponse(body) {
    return {
        ok: true,
        headers: {
            get: () => null,
        },
        json: async () => body,
    };
}

function createStreamResponse(bodyText) {
    const encoder = new TextEncoder();
    let read = false;
    const streamText = bodyText.endsWith("\n\n") ? bodyText : bodyText + "\n\n";

    return {
        ok: true,
        headers: {
            get: (name) =>
                name === "content-type" ? "text/event-stream" : null,
        },
        body: {
            getReader: () => ({
                read: async () => {
                    if (read) {
                        return { done: true, value: undefined };
                    }

                    read = true;
                    return { done: false, value: encoder.encode(streamText) };
                },
            }),
        },
    };
}

function createAppStub(encoding = undefined) {
    const betaView = {
        explicitName: "betaTrack",
        getTitleText: () => "Beta Track",
        getEncoding: () =>
            encoding ?? {
                x: { field: "pos", type: "locus" },
                y: { field: "beta", type: "quantitative" },
            },
    };
    const sampleView = {
        sampleHierarchy: {
            sampleData: {
                ids: ["sampleA", "sampleB"],
                entities: {
                    sampleA: { id: "sampleA" },
                    sampleB: { id: "sampleB" },
                },
            },
            sampleMetadata: {
                attributeNames: [],
                attributeDefs: {},
                entities: {
                    sampleA: { sex: "F", age: 42 },
                    sampleB: { sex: "M", age: 36 },
                    sampleC: { sex: "F", age: 61 },
                },
            },
            groupMetadata: [],
            rootGroup: {
                name: "ROOT",
                groups: [
                    {
                        name: "group",
                        title: "group",
                        samples: ["sampleA", "sampleB"],
                    },
                ],
            },
        },
        visit: (visitor) => visitor(betaView),
        actions: {
            sortBy: (payload) => ({
                type: "sampleView/sortBy",
                payload,
            }),
            groupByNominal: (payload) => ({
                type: "sampleView/groupByNominal",
                payload,
            }),
            deriveMetadata: (payload) => ({
                type: "sampleView/deriveMetadata",
                payload,
            }),
        },
        compositeAttributeInfoSource: {
            getAttributeInfo: (attribute) => ({
                accessor: () => undefined,
                valuesProvider: () => [],
                type:
                    attribute?.specifier === "sex" ||
                    attribute?.specifier === "diagnosis"
                        ? "nominal"
                        : "quantitative",
                title: attribute?.specifier ?? "",
                description: undefined,
            }),
        },
    };

    resolveParamSelectorMock.mockReturnValue({ view: betaView });

    return {
        options: {},
        store: {
            dispatch: vi.fn(),
        },
        getSampleView: () => sampleView,
        genomeSpy: {
            viewRoot: {
                explicitName: "root",
            },
        },
        intentPipeline: {
            submit: vi.fn(() => Promise.resolve()),
        },
        provenance: {
            getPresentState: () => ({
                paramProvenance: {
                    entries: {
                        brush: {
                            selector: { scope: [], param: "brush" },
                            value: { type: "interval", value: [0, 1] },
                        },
                    },
                },
            }),
            getActionHistory: () => [],
            getActionInfo: () => undefined,
        },
    };
}

function createAgentApiStub(app) {
    return {
        getSampleHierarchy: () => app.getSampleView().sampleHierarchy,
        getAttributeInfo: (attribute) =>
            app
                .getSampleView()
                .compositeAttributeInfoSource.getAttributeInfo(attribute),
        getSampleParamConfig: (paramName) =>
            app.getSampleView().paramRuntime?.paramConfigs?.get(paramName),
        getSearchableViews: () => app.genomeSpy.getSearchableViews(),
        getViewRoot: () => app.getSampleView(),
        getFocusedView: () => app.getSampleView(),
        resolveViewSelector: (selector) =>
            resolveViewSelectorMock.mock.results.at(-1)?.value ??
            app.genomeSpy.viewRoot,
        getActionHistory: () => app.provenance.getActionHistory(),
        getActionInfo: (action) => app.provenance.getActionInfo(action),
        getPresentProvenanceState: () => app.provenance.getPresentState(),
        submitIntentActions: (actions, options) =>
            app.intentPipeline.submit(actions, options),
        setViewVisibility: (selector, visibility) =>
            app.store.dispatch(
                viewSettingsSlice.actions.setVisibility({
                    key: makeViewSelectorKey(selector),
                    visibility,
                })
            ),
        jumpToProvenanceState: (provenanceId) => {
            const currentIndex = app.provenance.getCurrentIndex();
            app.provenance.activateState(provenanceId);
            return app.provenance.getCurrentIndex() !== currentIndex;
        },
        jumpToInitialProvenanceState: () => {
            const currentIndex = app.provenance.getCurrentIndex();
            app.provenance.activateInitialState();
            return app.provenance.getCurrentIndex() !== currentIndex;
        },
    };
}

/**
 * @returns {Record<string, any>}
 */
function createMockPlannerContext() {
    return {
        schemaVersion: 1,
        sampleSummary: {
            sampleCount: 61,
            groupCount: 1,
            visibleSampleCount: 61,
        },
        viewRoot: {
            type: "vconcat",
            title: "viewRoot",
            description: "Functional Segmentation (FUSE) of ENCODE WGBS data",
            children: [
                {
                    type: "layer",
                    title: "Data Tracks",
                    children: [],
                },
            ],
        },
        attributes: [
            {
                title: "Age",
            },
            {
                title: "Diagnosis",
            },
        ],
        intentActionSummaries: [],
        provenance: [],
    };
}

describe("agentAdapter", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        globalThis.fetch = vi.fn();
        globalThis.window = /** @type {any} */ ({
            prompt: vi.fn(),
        });
    });

    it("uses the agent session controller expansion state for agent context snapshots", () => {
        const app = createAppStub();
        getAgentState(app).agentSessionController = {
            getSnapshot: () => ({
                expandedViewNodeKeys: [
                    JSON.stringify({ scope: [], view: "reference-sequence" }),
                ],
            }),
        };
        getAgentContext.mockReturnValue(createMockPlannerContext());

        const adapter = createAgentAdapter(app, createAgentApiStub(app));
        adapter.getAgentContext();

        expect(getAgentContext).toHaveBeenCalledWith(
            expect.objectContaining({
                getSampleHierarchy: expect.any(Function),
                getActionHistory: expect.any(Function),
            }),
            expect.objectContaining({
                expandedViewNodeKeys: [
                    JSON.stringify({ scope: [], view: "reference-sequence" }),
                ],
            })
        );
    });

    it("builds metadata summaries from the current visible hierarchy", () => {
        const app = createAppStub();
        const adapter = createAgentAdapter(app, createAgentApiStub(app));

        const source = adapter.getMetadataAttributeSummarySource({
            type: "SAMPLE_ATTRIBUTE",
            specifier: "sex",
        });

        expect(source).toEqual({
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "sex",
            },
            title: "sex",
            description: undefined,
            dataType: "nominal",
            scope: "visible_samples",
            sampleIds: ["sampleA", "sampleB"],
            values: ["F", "M"],
        });
    });

    it("builds grouped metadata summaries from the visible hierarchy", () => {
        const app = createAppStub();
        app.getSampleView().sampleHierarchy.groupMetadata = [
            {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "diagnosis",
                },
            },
        ];
        app.getSampleView().sampleHierarchy.rootGroup = {
            name: "ROOT",
            title: "ROOT",
            groups: [
                {
                    name: "A",
                    title: "A",
                    samples: ["sampleA"],
                },
                {
                    name: "B",
                    title: "B",
                    samples: ["sampleB"],
                },
            ],
        };

        const adapter = createAgentAdapter(app, createAgentApiStub(app));

        const source = adapter.getGroupedMetadataAttributeSummarySource({
            type: "SAMPLE_ATTRIBUTE",
            specifier: "sex",
        });

        expect(source).toEqual({
            attribute: {
                type: "SAMPLE_ATTRIBUTE",
                specifier: "sex",
            },
            title: "sex",
            description: undefined,
            dataType: "nominal",
            scope: "visible_groups",
            groupLevels: [
                {
                    level: 0,
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "diagnosis",
                    },
                    title: "diagnosis",
                },
            ],
            groups: [
                {
                    path: ["A"],
                    titles: ["A"],
                    title: "A",
                    sampleIds: ["sampleA"],
                },
                {
                    path: ["B"],
                    titles: ["B"],
                    title: "B",
                    sampleIds: ["sampleB"],
                },
            ],
            valuesBySampleId: {
                sampleA: "F",
                sampleB: "M",
                sampleC: "F",
            },
        });
    });

    it("posts structured conversation history to the agent-turn endpoint", async () => {
        const app = createAppStub();
        const adapter = createAgentAdapter(app, createAgentApiStub(app));
        globalThis.fetch.mockResolvedValueOnce(
            createResponse({
                type: "answer",
                message: "OK",
            })
        );

        const history = [
            {
                id: "msg_001",
                role: "user",
                text: "What is in this visualization?",
            },
            {
                id: "msg_002",
                role: "assistant",
                text: "It is a cohort view.",
            },
            {
                id: "msg_003",
                role: "assistant",
                text: "Do you want the structure or the encodings?",
                kind: "clarification",
            },
        ];

        await adapter.requestAgentTurn(
            "How are methylation levels encoded?",
            history
        );

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(globalThis.fetch.mock.calls[0][1].body).toContain(
            '"message":"How are methylation levels encoded?"'
        );
        expect(globalThis.fetch.mock.calls[0][1].body).toContain(
            '"history":[{"id":"msg_001","role":"user","text":"What is in this visualization?"},{"id":"msg_002","role":"assistant","text":"It is a cohort view."},{"id":"msg_003","role":"assistant","text":"Do you want the structure or the encodings?","kind":"clarification"}]'
        );
        const requestBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
        expect(
            requestBody.volatileContext.selectionAggregation.fields
        ).not.toEqual([]);
    });

    it("consumes streamed agent-turn events when callbacks are provided", async () => {
        const app = createAppStub();
        globalThis.fetch.mockResolvedValueOnce(
            createStreamResponse(
                [
                    "event: start",
                    'data: {"status":"working"}',
                    "",
                    "event: delta",
                    'data: {"delta":"This view summarizes the cohort."}',
                    "",
                    "event: reasoning_delta",
                    'data: {"delta":"Checking the response shape."}',
                    "",
                    "event: final",
                    'data: {"response":{"type":"answer","message":"This view summarizes the cohort."},"trace":{"totalMs":21}}',
                    "",
                ].join("\n")
            )
        );

        const onDelta = vi.fn();
        const onReasoning = vi.fn();
        const onHeartbeat = vi.fn();

        const adapter = createAgentAdapter(app, createAgentApiStub(app));
        const result = await adapter.requestAgentTurn(
            "What can I do here?",
            [],
            {
                onDelta,
                onReasoning,
                onHeartbeat,
            }
        );

        expect(onDelta).toHaveBeenCalledWith(
            "This view summarizes the cohort."
        );
        expect(onReasoning).toHaveBeenCalledWith(
            "Checking the response shape."
        );
        expect(onHeartbeat).not.toHaveBeenCalled();
        expect(result.response).toEqual({
            type: "answer",
            message: "This view summarizes the cohort.",
        });
        expect(globalThis.fetch.mock.calls[0][0]).toBe(
            "http://127.0.0.1:8000/v1/agent-turn"
        );
        expect(globalThis.fetch.mock.calls[0][1].headers.accept).toBe(
            "text/event-stream"
        );
    });

    it("uses the configured base URL for agent turns", async () => {
        const app = createAppStub();
        getAgentState(app).agentBaseUrl = "http://example.test";
        getAgentContext.mockReturnValue(createMockPlannerContext());
        const adapter = createAgentAdapter(app, createAgentApiStub(app));
        globalThis.fetch.mockResolvedValueOnce(
            createResponse({
                type: "answer",
                message: "OK",
            })
        );

        const result = await adapter.requestAgentTurn(
            "What is in this visualization?",
            []
        );

        expect(globalThis.fetch).toHaveBeenCalledWith(
            "http://example.test/v1/agent-turn",
            expect.objectContaining({
                method: "POST",
            })
        );
        expect(result.response).toEqual(
            expect.objectContaining({
                type: "answer",
                message: "OK",
            })
        );
    });
});
